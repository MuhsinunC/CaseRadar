# Scalable Embedding Service Plan

## Overview

A Kubernetes-based, horizontally scalable embedding generation service that uses local Nomic embed hardware to generate embeddings at maximum throughput. The service auto-scales based on queue depth and handles load balancing across multiple worker pods.

## Problem Statement

Current state:
- 2,183,265 complaints need embeddings
- Only 68,589 have embeddings (3.1% coverage)
- Single-threaded embedding generation is too slow
- No ability to scale based on demand

Target state:
- 100% embedding coverage
- Parallel processing across multiple workers
- Auto-scaling based on queue depth
- Sub-second latency for single embedding requests
- Bulk processing capability for batch jobs

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Cluster                          │
│                                                                     │
│  ┌─────────────┐     ┌─────────────────────────────────────────┐   │
│  │   Ingress   │────▶│           Load Balancer                 │   │
│  │  Controller │     │     (Round-robin / Least-connections)   │   │
│  └─────────────┘     └─────────────────────────────────────────┘   │
│                                      │                              │
│                      ┌───────────────┼───────────────┐              │
│                      ▼               ▼               ▼              │
│               ┌───────────┐   ┌───────────┐   ┌───────────┐        │
│               │  Worker   │   │  Worker   │   │  Worker   │        │
│               │   Pod 1   │   │   Pod 2   │   │   Pod N   │        │
│               │           │   │           │   │           │        │
│               │ ┌───────┐ │   │ ┌───────┐ │   │ ┌───────┐ │        │
│               │ │ Nomic │ │   │ │ Nomic │ │   │ │ Nomic │ │        │
│               │ │ Embed │ │   │ │ Embed │ │   │ │ Embed │ │        │
│               │ └───────┘ │   │ └───────┘ │   │ └───────┘ │        │
│               └───────────┘   └───────────┘   └───────────┘        │
│                      │               │               │              │
│                      └───────────────┼───────────────┘              │
│                                      ▼                              │
│                           ┌─────────────────┐                       │
│                           │   Redis Queue   │                       │
│                           │  (Job Queue +   │                       │
│                           │   Results Cache)│                       │
│                           └─────────────────┘                       │
│                                      │                              │
│  ┌─────────────────┐                 │                              │
│  │  HPA Controller │◀────────────────┘                              │
│  │  (Auto-scaler)  │   (Monitors queue depth)                       │
│  └─────────────────┘                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   PostgreSQL    │
                          │   (Complaints   │
                          │    + pgvector)  │
                          └─────────────────┘
```

## Components

### 1. Embedding Worker Service

A FastAPI service that wraps Nomic embed for generating embeddings.

**File:** `services/embedding-service/main.py`

```python
# Service endpoints:
# POST /embed          - Single text embedding
# POST /embed/batch    - Batch embedding (up to 100 texts)
# GET  /health         - Health check
# GET  /metrics        - Prometheus metrics
```

### 2. Job Queue (Redis)

Redis-based queue for managing embedding jobs.

**Queues:**
- `embedding:pending` - Jobs waiting to be processed
- `embedding:processing` - Jobs currently being processed
- `embedding:completed` - Completed job results (TTL: 1 hour)
- `embedding:failed` - Failed jobs for retry

### 3. Horizontal Pod Autoscaler (HPA)

Kubernetes HPA that scales workers based on:
- Queue depth (primary metric)
- CPU utilization (secondary metric)
- Memory utilization (secondary metric)

**Scaling rules:**
- Min replicas: 1
- Max replicas: 10 (configurable based on hardware)
- Scale up: Queue depth > 100 jobs per worker
- Scale down: Queue depth < 10 jobs per worker for 5 minutes

### 4. Embedding Client Library

TypeScript client for the CaseRadar application.

**File:** `src/lib/embeddings/scalable-client.ts`

```typescript
// Client methods:
// embedSingle(text: string): Promise<number[]>
// embedBatch(texts: string[]): Promise<number[][]>
// getQueueStatus(): Promise<QueueStatus>
// waitForCompletion(jobId: string): Promise<number[]>
```

## API Specification

### POST /embed

Generate embedding for a single text.

**Request:**
```json
{
  "text": "string",
  "model": "nomic-embed-text-v1.5"  // optional, default
}
```

**Response:**
```json
{
  "embedding": [0.123, -0.456, ...],  // 768 dimensions
  "model": "nomic-embed-text-v1.5",
  "latency_ms": 45
}
```

### POST /embed/batch

Generate embeddings for multiple texts.

**Request:**
```json
{
  "texts": ["string1", "string2", ...],  // max 100
  "model": "nomic-embed-text-v1.5"
}
```

**Response:**
```json
{
  "embeddings": [[0.123, ...], [0.456, ...], ...],
  "model": "nomic-embed-text-v1.5",
  "count": 100,
  "latency_ms": 1250
}
```

### POST /embed/async

Submit batch job for async processing.

**Request:**
```json
{
  "texts": ["string1", "string2", ...],
  "callback_url": "https://..."  // optional webhook
}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "queue_position": 42
}
```

### GET /embed/job/{job_id}

Check status of async job.

**Response:**
```json
{
  "job_id": "uuid",
  "status": "completed",  // queued, processing, completed, failed
  "progress": 100,
  "embeddings": [[...], [...], ...]  // if completed
}
```

## Kubernetes Manifests

### Deployment

**File:** `k8s/embedding-service/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: embedding-service
  labels:
    app: embedding-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: embedding-service
  template:
    metadata:
      labels:
        app: embedding-service
    spec:
      containers:
      - name: embedding-worker
        image: caseradar/embedding-service:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        env:
        - name: MODEL_NAME
          value: "nomic-ai/nomic-embed-text-v1.5"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: embedding-service-secrets
              key: redis-url
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Horizontal Pod Autoscaler

**File:** `k8s/embedding-service/hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: embedding-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: embedding-service
  minReplicas: 1
  maxReplicas: 10
  metrics:
  - type: External
    external:
      metric:
        name: redis_queue_depth
        selector:
          matchLabels:
            queue: embedding:pending
      target:
        type: AverageValue
        averageValue: "100"
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 2
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

### Service

**File:** `k8s/embedding-service/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: embedding-service
spec:
  selector:
    app: embedding-service
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
```

## Test-Driven Development

### Unit Tests

**File:** `services/embedding-service/tests/test_embedding.py`

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

class TestEmbeddingEndpoint:
    """Tests for single embedding generation."""

    def test_embed_single_text_returns_768_dimensions(self):
        """Embedding should return exactly 768 dimensions."""
        response = client.post("/embed", json={"text": "test text"})
        assert response.status_code == 200
        assert len(response.json()["embedding"]) == 768

    def test_embed_empty_text_returns_error(self):
        """Empty text should return 400 error."""
        response = client.post("/embed", json={"text": ""})
        assert response.status_code == 400

    def test_embed_returns_normalized_vector(self):
        """Embedding should be L2 normalized (magnitude ~1.0)."""
        response = client.post("/embed", json={"text": "test text"})
        embedding = response.json()["embedding"]
        magnitude = sum(x**2 for x in embedding) ** 0.5
        assert 0.99 < magnitude < 1.01

class TestBatchEmbedding:
    """Tests for batch embedding generation."""

    def test_batch_embed_multiple_texts(self):
        """Batch endpoint should handle multiple texts."""
        texts = ["text1", "text2", "text3"]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200
        assert len(response.json()["embeddings"]) == 3

    def test_batch_embed_max_100_texts(self):
        """Batch endpoint should reject >100 texts."""
        texts = ["text"] * 101
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 400

    def test_batch_embed_preserves_order(self):
        """Embeddings should be in same order as input texts."""
        texts = ["unique1", "unique2", "unique3"]
        response = client.post("/embed/batch", json={"texts": texts})
        embeddings = response.json()["embeddings"]
        # Each text should produce a unique embedding
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]

class TestHealthCheck:
    """Tests for health and readiness probes."""

    def test_health_endpoint_returns_healthy(self):
        """Health endpoint should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_health_includes_model_loaded(self):
        """Health should indicate if model is loaded."""
        response = client.get("/health")
        assert "model_loaded" in response.json()
```

### Integration Tests

**File:** `services/embedding-service/tests/test_integration.py`

```python
import pytest
import asyncio
from redis import Redis
from embedding_client import EmbeddingClient

@pytest.fixture
def redis_client():
    return Redis.from_url("redis://localhost:6379")

@pytest.fixture
def embedding_client():
    return EmbeddingClient("http://localhost:8080")

class TestQueueIntegration:
    """Tests for queue-based async processing."""

    @pytest.mark.asyncio
    async def test_async_job_completes(self, embedding_client):
        """Async job should complete and return embeddings."""
        texts = ["test1", "test2"]
        job_id = await embedding_client.submit_async(texts)
        result = await embedding_client.wait_for_completion(job_id, timeout=30)
        assert len(result["embeddings"]) == 2

    @pytest.mark.asyncio
    async def test_queue_depth_increases_with_jobs(self, embedding_client, redis_client):
        """Queue depth should increase when jobs are submitted."""
        initial_depth = redis_client.llen("embedding:pending")
        await embedding_client.submit_async(["text"] * 10)
        new_depth = redis_client.llen("embedding:pending")
        assert new_depth >= initial_depth

class TestScalingBehavior:
    """Tests for auto-scaling behavior."""

    @pytest.mark.asyncio
    async def test_high_load_triggers_scale_up(self, embedding_client):
        """High queue depth should trigger pod scale-up."""
        # Submit many jobs to increase queue depth
        for _ in range(20):
            await embedding_client.submit_async(["text"] * 100)

        # Wait for HPA to react
        await asyncio.sleep(120)

        # Check pod count increased (requires k8s API access)
        # This would be implemented with kubernetes client
        pass
```

### Load Tests

**File:** `services/embedding-service/tests/test_load.py`

```python
import pytest
import asyncio
import time
from embedding_client import EmbeddingClient

class TestThroughput:
    """Load tests for throughput measurement."""

    @pytest.mark.asyncio
    async def test_sustained_throughput(self):
        """Measure sustained embedding throughput."""
        client = EmbeddingClient("http://localhost:8080")

        texts = ["Sample text for embedding"] * 1000
        start = time.time()

        # Process in batches of 100
        for i in range(0, len(texts), 100):
            batch = texts[i:i+100]
            await client.embed_batch(batch)

        duration = time.time() - start
        throughput = len(texts) / duration

        # Should achieve at least 50 embeddings/second
        assert throughput >= 50

    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test handling of concurrent requests."""
        client = EmbeddingClient("http://localhost:8080")

        async def make_request():
            return await client.embed_single("test text")

        # Send 50 concurrent requests
        tasks = [make_request() for _ in range(50)]
        start = time.time()
        results = await asyncio.gather(*tasks)
        duration = time.time() - start

        # All requests should succeed
        assert len(results) == 50
        # Should complete within 5 seconds
        assert duration < 5
```

### TypeScript Client Tests

**File:** `src/lib/embeddings/__tests__/scalable-client.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScalableEmbeddingClient } from '../scalable-client';

describe('ScalableEmbeddingClient', () => {
  let client: ScalableEmbeddingClient;

  beforeEach(() => {
    client = new ScalableEmbeddingClient('http://localhost:8080');
  });

  describe('embedSingle', () => {
    it('should return 768-dimensional embedding', async () => {
      const embedding = await client.embedSingle('test text');
      expect(embedding).toHaveLength(768);
    });

    it('should throw on empty text', async () => {
      await expect(client.embedSingle('')).rejects.toThrow();
    });
  });

  describe('embedBatch', () => {
    it('should return embeddings for all texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const embeddings = await client.embedBatch(texts);
      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toHaveLength(768);
    });

    it('should handle max batch size of 100', async () => {
      const texts = Array(100).fill('text');
      const embeddings = await client.embedBatch(texts);
      expect(embeddings).toHaveLength(100);
    });

    it('should reject batch size over 100', async () => {
      const texts = Array(101).fill('text');
      await expect(client.embedBatch(texts)).rejects.toThrow();
    });
  });

  describe('embedAsync', () => {
    it('should return job ID for async processing', async () => {
      const texts = ['text1', 'text2'];
      const jobId = await client.submitAsync(texts);
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('should poll for completion', async () => {
      const texts = ['text1', 'text2'];
      const jobId = await client.submitAsync(texts);
      const result = await client.waitForCompletion(jobId, 30000);
      expect(result.embeddings).toHaveLength(2);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue metrics', async () => {
      const status = await client.getQueueStatus();
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('workers');
    });
  });
});
```

## Implementation Steps

### Phase 1: Core Service (Week 1)
1. [ ] Create FastAPI embedding service with Nomic embed
2. [ ] Implement `/embed` endpoint for single text
3. [ ] Implement `/embed/batch` endpoint for batch processing
4. [ ] Add health check and metrics endpoints
5. [ ] Write unit tests for all endpoints
6. [ ] Dockerize the service

### Phase 2: Queue System (Week 2)
1. [ ] Set up Redis for job queue
2. [ ] Implement async job submission
3. [ ] Implement job status polling
4. [ ] Add callback webhook support
5. [ ] Write integration tests for queue

### Phase 3: Kubernetes Deployment (Week 3)
1. [ ] Create Kubernetes manifests (Deployment, Service, HPA)
2. [ ] Configure Redis metrics exporter
3. [ ] Set up HPA with custom metrics
4. [ ] Test auto-scaling behavior
5. [ ] Write load tests

### Phase 4: Client Integration (Week 4)
1. [ ] Create TypeScript client library
2. [ ] Integrate with CaseRadar application
3. [ ] Migrate from OpenAI to local embedding service
4. [ ] Performance benchmarking
5. [ ] Documentation

## Success Criteria

1. **Throughput**: ≥100 embeddings/second sustained
2. **Latency**: <100ms p99 for single embedding
3. **Availability**: 99.9% uptime
4. **Scaling**: Auto-scale from 1 to 10 pods within 2 minutes
5. **Coverage**: Process 2M+ complaints within 6 hours

## Monitoring & Observability

### Metrics (Prometheus)
- `embedding_requests_total` - Total requests by endpoint
- `embedding_latency_seconds` - Request latency histogram
- `embedding_queue_depth` - Current queue depth
- `embedding_workers_active` - Number of active workers
- `embedding_batch_size` - Batch size distribution

### Alerts
- Queue depth > 1000 for 5 minutes
- Error rate > 1% for 5 minutes
- P99 latency > 500ms for 5 minutes
- Pod restart count > 3 in 10 minutes

---

## Ralph Loop Command

To iterate on this implementation, run:

```bash
claude "/ralph-loop --completion-promise SCALABLE_EMBEDDING_SERVICE_COMPLETE --prompt-file docs/architecture/scalable-embedding-service-plan.md"
```

### Ralph Loop Prompt File Content

Create `.claude/embedding-service-loop.md`:

```markdown
---
active: true
iteration: 1
max_iterations: 100
completion_promise: "SCALABLE_EMBEDDING_SERVICE_COMPLETE"
---

ultrathink: This is a Ralph loop for implementing the scalable embedding service.

## Goal
Implement a Kubernetes-based, horizontally scalable embedding generation service using Nomic embed.

## Completion Criteria
The service is complete when:
1. All unit tests pass
2. All integration tests pass
3. Load tests achieve ≥100 embeddings/second
4. Auto-scaling works correctly (verified)
5. TypeScript client integrated and working
6. 100% of complaints have embeddings generated

## Current Iteration Task
Follow the implementation steps in docs/architecture/scalable-embedding-service-plan.md.
Run tests after each change. Document results in iteration notes.

## Test Commands
- Unit tests: `cd services/embedding-service && pytest tests/test_embedding.py -v`
- Integration tests: `cd services/embedding-service && pytest tests/test_integration.py -v`
- Load tests: `cd services/embedding-service && pytest tests/test_load.py -v`
- Client tests: `npm test -- src/lib/embeddings/__tests__/scalable-client.test.ts`
```
