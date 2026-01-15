"""
CaseRadar Pattern Detection Service

FastAPI microservice for ML-based pattern detection including:
- Topic clustering (BERTopic + HDBSCAN)
- Anomaly detection (PyOD ensemble)
- Change point detection (Ruptures PELT)
- Signal detection (PRR/EBGM)

Based on docs/architecture/pattern-detection-system.md
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from routers import topics, anomalies, changes, signals

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    logger.info("Starting Pattern Detection Service...")
    # Initialize models on startup
    yield
    logger.info("Shutting down Pattern Detection Service...")


# Create FastAPI application
app = FastAPI(
    title="CaseRadar Pattern Detection Service",
    description="""
    ML-powered pattern detection for NHTSA complaint analysis.

    ## Features

    - **Topic Clustering**: BERTopic + HDBSCAN for automatic pattern discovery
    - **Anomaly Detection**: PyOD ensemble (Isolation Forest + LOF + HBOS)
    - **Change Detection**: Ruptures PELT for temporal analysis
    - **Signal Detection**: PRR/EBGM for disproportionality analysis
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:6001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(topics.router, prefix="/api/v1/topics", tags=["Topic Clustering"])
app.include_router(anomalies.router, prefix="/api/v1/anomalies", tags=["Anomaly Detection"])
app.include_router(changes.router, prefix="/api/v1/changes", tags=["Change Detection"])
app.include_router(signals.router, prefix="/api/v1/signals", tags=["Signal Detection"])


# Health check models
class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    service: str
    version: str
    models_loaded: bool


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    detail: Optional[str] = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.

    Returns service status and model availability.
    """
    return HealthResponse(
        status="healthy",
        service="pattern-detection",
        version="1.0.0",
        models_loaded=True,
    )


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "service": "CaseRadar Pattern Detection Service",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "topics": "/api/v1/topics",
            "anomalies": "/api/v1/anomalies",
            "changes": "/api/v1/changes",
            "signals": "/api/v1/signals",
        }
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PATTERN_DETECTION_PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
