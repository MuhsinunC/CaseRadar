"""
Anomaly Detection Router

API endpoints for PyOD ensemble anomaly detection.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import numpy as np

from models.anomaly_detection import (
    AnomalyDetectionModel,
    AnomalyResult,
    AnomalyStats,
    get_anomaly_model,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response Models

class AnomalyFitRequest(BaseModel):
    """Request for fitting anomaly model."""
    embeddings: List[List[float]] = Field(
        ..., description="Document embeddings (n_samples, n_features)"
    )
    contamination: Optional[float] = Field(
        0.05, description="Expected proportion of anomalies"
    )


class AnomalyFitResponse(BaseModel):
    """Response from anomaly fitting."""
    success: bool
    stats: dict


class AnomalyDetectRequest(BaseModel):
    """Request for detecting anomalies."""
    embeddings: List[List[float]]
    document_ids: Optional[List[str]] = None
    threshold: Optional[float] = None


class AnomalyDetectResponse(BaseModel):
    """Response from anomaly detection."""
    success: bool
    total: int
    anomaly_count: int
    results: List[dict]


class AnomalyScoreRequest(BaseModel):
    """Request for scoring a single document."""
    embedding: List[float]


class AnomalyScoreResponse(BaseModel):
    """Response from single document scoring."""
    success: bool
    anomaly_score: float
    is_anomaly: bool
    detector_scores: dict


# Endpoints

@router.post("/fit", response_model=AnomalyFitResponse)
async def fit_anomaly_model(request: AnomalyFitRequest):
    """
    Fit the anomaly detection ensemble.

    This endpoint:
    1. Trains Isolation Forest, LOF, and HBOS detectors
    2. Calculates baseline anomaly statistics
    3. Sets the anomaly threshold
    """
    try:
        model = get_anomaly_model()

        # Update contamination if provided
        if request.contamination:
            model.contamination = request.contamination

        embeddings = np.array(request.embeddings)
        stats: AnomalyStats = model.fit(embeddings)

        return AnomalyFitResponse(
            success=True,
            stats={
                "total_documents": stats.total_documents,
                "anomaly_count": stats.anomaly_count,
                "anomaly_rate": stats.anomaly_rate,
                "score_mean": stats.score_mean,
                "score_std": stats.score_std,
                "threshold": stats.threshold,
            },
        )

    except Exception as e:
        logger.error(f"Error fitting anomaly model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect", response_model=AnomalyDetectResponse)
async def detect_anomalies(request: AnomalyDetectRequest):
    """
    Detect anomalies in documents.

    Returns anomaly scores and classifications for each document.
    """
    try:
        model = get_anomaly_model()

        if not model.is_fitted:
            raise HTTPException(
                status_code=400,
                detail="Model not fitted. Call /fit first."
            )

        embeddings = np.array(request.embeddings)
        results: List[AnomalyResult] = model.detect(
            embeddings,
            request.document_ids,
            request.threshold,
        )

        anomaly_count = sum(1 for r in results if r.is_anomaly)

        return AnomalyDetectResponse(
            success=True,
            total=len(results),
            anomaly_count=anomaly_count,
            results=[
                {
                    "document_id": r.document_id,
                    "anomaly_score": r.anomaly_score,
                    "is_anomaly": r.is_anomaly,
                    "detector_scores": r.detector_scores,
                    "anomaly_type": r.anomaly_type,
                }
                for r in results
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detecting anomalies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/score", response_model=AnomalyScoreResponse)
async def score_single(request: AnomalyScoreRequest):
    """
    Score a single document for anomaly.

    Returns ensemble score and individual detector scores.
    """
    try:
        model = get_anomaly_model()

        if not model.is_fitted:
            raise HTTPException(
                status_code=400,
                detail="Model not fitted. Call /fit first."
            )

        embedding = np.array(request.embedding)
        score, detector_scores = model.score_single(embedding)

        return AnomalyScoreResponse(
            success=True,
            anomaly_score=score,
            is_anomaly=score >= model.threshold,
            detector_scores=detector_scores,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scoring document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/threshold")
async def get_threshold():
    """
    Get the current anomaly threshold.
    """
    try:
        model = get_anomaly_model()

        return {
            "success": True,
            "threshold": model.threshold if model.is_fitted else None,
            "is_fitted": model.is_fitted,
        }

    except Exception as e:
        logger.error(f"Error getting threshold: {e}")
        raise HTTPException(status_code=500, detail=str(e))
