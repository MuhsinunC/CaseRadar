"""
Scalable Embedding Service

A FastAPI service that generates text embeddings using Nomic embed model.
Supports single text, batch processing, and async job queue with:
- Retry logic with exponential backoff
- Dead-letter queue for failed jobs
- Persistent job tracking
"""

import os
import time
import uuid
import json
import asyncio
from typing import Optional
from contextlib import asynccontextmanager
from datetime import datetime

import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, field_validator
from sentence_transformers import SentenceTransformer
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "nomic-ai/nomic-embed-text-v1.5")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "100"))
EMBEDDING_DIM = 768

# Retry configuration
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
INITIAL_RETRY_DELAY = float(os.getenv("INITIAL_RETRY_DELAY", "1.0"))
MAX_RETRY_DELAY = float(os.getenv("MAX_RETRY_DELAY", "30.0"))
RETRY_BACKOFF_MULTIPLIER = float(os.getenv("RETRY_BACKOFF_MULTIPLIER", "2.0"))

# DLQ configuration
DLQ_ENABLED = os.getenv("DLQ_ENABLED", "true").lower() == "true"
DLQ_TTL_HOURS = int(os.getenv("DLQ_TTL_HOURS", "168"))  # 7 days default

# Prometheus metrics
REQUEST_COUNT = Counter(
    "embedding_requests_total",
    "Total embedding requests",
    ["endpoint", "status"]
)
REQUEST_LATENCY = Histogram(
    "embedding_latency_seconds",
    "Request latency in seconds",
    ["endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)
QUEUE_DEPTH = Gauge(
    "embedding_queue_depth",
    "Current queue depth",
    ["queue"]
)
MODEL_LOADED = Gauge(
    "embedding_model_loaded",
    "Whether the model is loaded"
)
RETRY_COUNT = Counter(
    "embedding_retries_total",
    "Total retry attempts",
    ["status"]
)
DLQ_COUNT = Counter(
    "embedding_dlq_total",
    "Jobs sent to dead-letter queue"
)

# Global state
model: Optional[SentenceTransformer] = None
redis_client: Optional[redis.Redis] = None


# Request/Response models
class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to embed")
    model: str = Field(default="nomic-embed-text-v1.5", description="Model name")

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Text cannot be empty or whitespace only")
        return v


class EmbedResponse(BaseModel):
    embedding: list[float]
    model: str
    latency_ms: float


class BatchEmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)
    model: str = Field(default="nomic-embed-text-v1.5")

    @field_validator("texts")
    @classmethod
    def texts_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Texts list cannot be empty")
        for i, text in enumerate(v):
            if not text.strip():
                raise ValueError(f"Text at index {i} cannot be empty")
        return v


class BatchEmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    count: int
    latency_ms: float


class AsyncJobRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)
    callback_url: Optional[str] = None
    priority: int = Field(default=0, ge=0, le=10, description="Job priority (0=low, 10=high)")


class AsyncJobResponse(BaseModel):
    job_id: str
    status: str
    queue_position: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued, processing, completed, failed, dlq
    progress: int
    embeddings: Optional[list[list[float]]] = None
    error: Optional[str] = None
    retry_count: int = 0
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    redis_connected: bool
    dlq_enabled: bool = DLQ_ENABLED


class QueueStatusResponse(BaseModel):
    pending: int
    processing: int
    completed: int
    failed: int
    dlq: int = 0


class DLQJobResponse(BaseModel):
    job_id: str
    original_error: str
    retry_count: int
    texts_count: int
    created_at: str
    failed_at: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for loading model and connecting to Redis."""
    global model, redis_client

    # Load embedding model
    print(f"Loading model: {MODEL_NAME}")
    try:
        model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)
        MODEL_LOADED.set(1)
        print(f"Model loaded successfully: {MODEL_NAME}")
    except Exception as e:
        print(f"Failed to load model: {e}")
        MODEL_LOADED.set(0)
        raise

    # Connect to Redis
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=False)
        await redis_client.ping()
        print(f"Connected to Redis: {REDIS_URL}")
    except Exception as e:
        print(f"Redis connection failed (non-fatal): {e}")
        redis_client = None

    yield

    # Cleanup
    if redis_client:
        await redis_client.aclose()


app = FastAPI(
    title="Scalable Embedding Service",
    description="High-throughput embedding generation service with retry and DLQ support",
    version="2.0.0",
    lifespan=lifespan
)


def normalize_embedding(embedding: np.ndarray) -> list[float]:
    """L2 normalize an embedding vector."""
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding.tolist()


def calculate_retry_delay(retry_count: int) -> float:
    """Calculate exponential backoff delay."""
    delay = INITIAL_RETRY_DELAY * (RETRY_BACKOFF_MULTIPLIER ** retry_count)
    return min(delay, MAX_RETRY_DELAY)


async def store_job(job_id: str, job_data: dict) -> None:
    """Store job data in Redis with proper encoding."""
    if redis_client:
        await redis_client.set(f"job:{job_id}", json.dumps(job_data).encode())


async def get_job(job_id: str) -> Optional[dict]:
    """Get job data from Redis."""
    if redis_client:
        job_data_bytes = await redis_client.get(f"job:{job_id}")
        if job_data_bytes:
            return json.loads(job_data_bytes.decode())
    return None


async def move_to_dlq(job_id: str, job_data: dict, error: str) -> None:
    """Move a failed job to the dead-letter queue."""
    if not redis_client or not DLQ_ENABLED:
        return

    dlq_data = {
        **job_data,
        "status": "dlq",
        "original_error": error,
        "moved_to_dlq_at": datetime.utcnow().isoformat(),
    }

    await redis_client.set(f"dlq:{job_id}", json.dumps(dlq_data).encode())
    await redis_client.lpush("embedding:dlq", job_id.encode())
    await redis_client.expire(f"dlq:{job_id}", DLQ_TTL_HOURS * 3600)

    # Remove from failed queue
    await redis_client.lrem("embedding:failed", 0, job_id.encode())
    await redis_client.delete(f"job:{job_id}")

    DLQ_COUNT.inc()
    print(f"Job {job_id} moved to DLQ after {job_data.get('retry_count', 0)} retries: {error}")


@app.post("/embed", response_model=EmbedResponse)
async def embed_single(request: EmbedRequest):
    """Generate embedding for a single text."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time = time.time()

    try:
        # Nomic models require "search_document: " prefix for documents
        prefixed_text = f"search_document: {request.text}"
        embedding = model.encode(prefixed_text, convert_to_numpy=True)
        normalized = normalize_embedding(embedding)

        latency_ms = (time.time() - start_time) * 1000

        REQUEST_COUNT.labels(endpoint="/embed", status="success").inc()
        REQUEST_LATENCY.labels(endpoint="/embed").observe(latency_ms / 1000)

        return EmbedResponse(
            embedding=normalized,
            model=MODEL_NAME,
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        REQUEST_COUNT.labels(endpoint="/embed", status="error").inc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/batch", response_model=BatchEmbedResponse)
async def embed_batch(request: BatchEmbedRequest):
    """Generate embeddings for multiple texts (up to 100)."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(request.texts) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum of {MAX_BATCH_SIZE}"
        )

    start_time = time.time()

    try:
        # Add prefix for Nomic models
        prefixed_texts = [f"search_document: {text}" for text in request.texts]
        embeddings = model.encode(prefixed_texts, convert_to_numpy=True)
        normalized = [normalize_embedding(emb) for emb in embeddings]

        latency_ms = (time.time() - start_time) * 1000

        REQUEST_COUNT.labels(endpoint="/embed/batch", status="success").inc()
        REQUEST_LATENCY.labels(endpoint="/embed/batch").observe(latency_ms / 1000)

        return BatchEmbedResponse(
            embeddings=normalized,
            model=MODEL_NAME,
            count=len(normalized),
            latency_ms=round(latency_ms, 2)
        )
    except Exception as e:
        REQUEST_COUNT.labels(endpoint="/embed/batch", status="error").inc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/embed/async", response_model=AsyncJobResponse)
async def submit_async_job(request: AsyncJobRequest, background_tasks: BackgroundTasks):
    """Submit a batch job for async processing with retry support."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not available")

    job_id = str(uuid.uuid4())

    job_data = {
        "id": job_id,
        "texts": request.texts,
        "callback_url": request.callback_url,
        "priority": request.priority,
        "status": "queued",
        "progress": 0,
        "retry_count": 0,
        "created_at": datetime.utcnow().isoformat()
    }

    await store_job(job_id, job_data)
    await redis_client.lpush("embedding:pending", job_id.encode())

    queue_position = await redis_client.llen("embedding:pending")

    # Start processing in background
    background_tasks.add_task(process_job_with_retry, job_id)

    REQUEST_COUNT.labels(endpoint="/embed/async", status="success").inc()

    return AsyncJobResponse(
        job_id=job_id,
        status="queued",
        queue_position=queue_position
    )


async def process_job_with_retry(job_id: str):
    """Process an async embedding job with retry logic."""
    if redis_client is None or model is None:
        return

    job_data = await get_job(job_id)
    if not job_data:
        return

    retry_count = job_data.get("retry_count", 0)

    while retry_count < MAX_RETRIES:
        try:
            # Update status to processing
            job_data["status"] = "processing"
            job_data["retry_count"] = retry_count
            await store_job(job_id, job_data)
            await redis_client.lrem("embedding:pending", 1, job_id.encode())
            await redis_client.lpush("embedding:processing", job_id.encode())

            # Generate embeddings
            texts = job_data["texts"]
            prefixed_texts = [f"search_document: {text}" for text in texts]
            embeddings = model.encode(prefixed_texts, convert_to_numpy=True)
            normalized = [normalize_embedding(emb) for emb in embeddings]

            # Update job with results
            job_data["status"] = "completed"
            job_data["progress"] = 100
            job_data["embeddings"] = normalized
            job_data["completed_at"] = datetime.utcnow().isoformat()

            await store_job(job_id, job_data)
            await redis_client.lrem("embedding:processing", 1, job_id.encode())
            await redis_client.lpush("embedding:completed", job_id.encode())

            # Set TTL for completed job (1 hour)
            await redis_client.expire(f"job:{job_id}", 3600)

            RETRY_COUNT.labels(status="success").inc()
            return  # Success, exit retry loop

        except Exception as e:
            retry_count += 1
            job_data["retry_count"] = retry_count
            job_data["last_error"] = str(e)
            job_data["last_retry_at"] = datetime.utcnow().isoformat()

            RETRY_COUNT.labels(status="retry").inc()

            if retry_count < MAX_RETRIES:
                # Calculate backoff delay and retry
                delay = calculate_retry_delay(retry_count)
                print(f"Job {job_id} failed (attempt {retry_count}/{MAX_RETRIES}), retrying in {delay}s: {e}")

                await store_job(job_id, job_data)
                await asyncio.sleep(delay)
            else:
                # Max retries exceeded, mark as failed or move to DLQ
                RETRY_COUNT.labels(status="exhausted").inc()

                job_data["status"] = "failed"
                job_data["error"] = str(e)
                job_data["failed_at"] = datetime.utcnow().isoformat()

                await store_job(job_id, job_data)
                await redis_client.lrem("embedding:processing", 1, job_id.encode())
                await redis_client.lpush("embedding:failed", job_id.encode())

                # Move to DLQ if enabled
                if DLQ_ENABLED:
                    await move_to_dlq(job_id, job_data, str(e))

                print(f"Job {job_id} failed permanently after {retry_count} retries: {e}")


@app.get("/embed/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get the status of an async job."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not available")

    # Check regular job storage
    job_data = await get_job(job_id)

    # If not found, check DLQ
    if not job_data:
        dlq_data_bytes = await redis_client.get(f"dlq:{job_id}")
        if dlq_data_bytes:
            job_data = json.loads(dlq_data_bytes.decode())

    if not job_data:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        job_id=job_id,
        status=job_data["status"],
        progress=job_data.get("progress", 0),
        embeddings=job_data.get("embeddings"),
        error=job_data.get("error") or job_data.get("original_error"),
        retry_count=job_data.get("retry_count", 0),
        created_at=job_data.get("created_at"),
        completed_at=job_data.get("completed_at") or job_data.get("failed_at")
    )


@app.post("/embed/job/{job_id}/retry", response_model=AsyncJobResponse)
async def retry_job(job_id: str, background_tasks: BackgroundTasks):
    """Retry a failed job from the DLQ."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not available")

    # Check DLQ first
    dlq_data_bytes = await redis_client.get(f"dlq:{job_id}")
    if not dlq_data_bytes:
        # Check regular failed jobs
        job_data = await get_job(job_id)
        if not job_data or job_data.get("status") != "failed":
            raise HTTPException(status_code=404, detail="Failed job not found")
    else:
        job_data = json.loads(dlq_data_bytes.decode())
        # Remove from DLQ
        await redis_client.delete(f"dlq:{job_id}")
        await redis_client.lrem("embedding:dlq", 0, job_id.encode())

    # Reset job for retry
    new_job_id = str(uuid.uuid4())
    job_data["id"] = new_job_id
    job_data["status"] = "queued"
    job_data["progress"] = 0
    job_data["retry_count"] = 0
    job_data["error"] = None
    job_data["original_error"] = None
    job_data["retried_from"] = job_id
    job_data["created_at"] = datetime.utcnow().isoformat()

    await store_job(new_job_id, job_data)
    await redis_client.lpush("embedding:pending", new_job_id.encode())

    queue_position = await redis_client.llen("embedding:pending")

    # Start processing
    background_tasks.add_task(process_job_with_retry, new_job_id)

    return AsyncJobResponse(
        job_id=new_job_id,
        status="queued",
        queue_position=queue_position
    )


@app.get("/dlq", response_model=list[DLQJobResponse])
async def list_dlq_jobs(limit: int = 100):
    """List jobs in the dead-letter queue."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not available")

    if not DLQ_ENABLED:
        return []

    job_ids = await redis_client.lrange("embedding:dlq", 0, limit - 1)
    jobs = []

    for job_id_bytes in job_ids:
        job_id = job_id_bytes.decode()
        dlq_data_bytes = await redis_client.get(f"dlq:{job_id}")
        if dlq_data_bytes:
            job_data = json.loads(dlq_data_bytes.decode())
            jobs.append(DLQJobResponse(
                job_id=job_id,
                original_error=job_data.get("original_error", "Unknown"),
                retry_count=job_data.get("retry_count", 0),
                texts_count=len(job_data.get("texts", [])),
                created_at=job_data.get("created_at", ""),
                failed_at=job_data.get("failed_at", job_data.get("moved_to_dlq_at", ""))
            ))

    return jobs


@app.delete("/dlq/{job_id}")
async def delete_dlq_job(job_id: str):
    """Delete a job from the DLQ."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not available")

    await redis_client.delete(f"dlq:{job_id}")
    await redis_client.lrem("embedding:dlq", 0, job_id.encode())

    return {"status": "deleted", "job_id": job_id}


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for k8s probes."""
    redis_connected = False
    if redis_client:
        try:
            await redis_client.ping()
            redis_connected = True
        except Exception:
            pass

    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        model_name=MODEL_NAME,
        redis_connected=redis_connected,
        dlq_enabled=DLQ_ENABLED
    )


@app.get("/queue/status", response_model=QueueStatusResponse)
async def queue_status():
    """Get queue depth metrics."""
    if redis_client is None:
        return QueueStatusResponse(pending=0, processing=0, completed=0, failed=0, dlq=0)

    pending = await redis_client.llen("embedding:pending")
    processing = await redis_client.llen("embedding:processing")
    completed = await redis_client.llen("embedding:completed")
    failed = await redis_client.llen("embedding:failed")
    dlq = await redis_client.llen("embedding:dlq") if DLQ_ENABLED else 0

    # Update Prometheus metrics
    QUEUE_DEPTH.labels(queue="pending").set(pending)
    QUEUE_DEPTH.labels(queue="processing").set(processing)
    QUEUE_DEPTH.labels(queue="completed").set(completed)
    QUEUE_DEPTH.labels(queue="failed").set(failed)
    if DLQ_ENABLED:
        QUEUE_DEPTH.labels(queue="dlq").set(dlq)

    return QueueStatusResponse(
        pending=pending,
        processing=processing,
        completed=completed,
        failed=failed,
        dlq=dlq
    )


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    # Update queue metrics before returning
    if redis_client:
        try:
            pending = await redis_client.llen("embedding:pending")
            processing = await redis_client.llen("embedding:processing")
            QUEUE_DEPTH.labels(queue="pending").set(pending)
            QUEUE_DEPTH.labels(queue="processing").set(processing)
        except Exception:
            pass

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )


if __name__ == "__main__":
    import uvicorn
    import os

    # Get number of workers from environment (default 1 for single-process)
    # For production: use gunicorn with multiple workers
    # For local testing: uvicorn with workers option
    workers = int(os.getenv("EMBEDDING_WORKERS", "1"))

    if workers > 1:
        # Multi-worker mode - each worker loads model independently
        # This bypasses Python GIL for true parallelism
        print(f"Starting with {workers} workers (bypassing GIL)")
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8080,
            workers=workers,
            log_level="info"
        )
    else:
        # Single worker mode
        uvicorn.run(app, host="0.0.0.0", port=8080)
