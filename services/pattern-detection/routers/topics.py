"""
Topic Clustering Router

API endpoints for BERTopic + HDBSCAN topic modeling.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import numpy as np

from models.topic_clustering import (
    TopicClusteringModel,
    TopicResult,
    TopicTrend,
    TemporalTopic,
    get_topic_model,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response Models

class TopicFitRequest(BaseModel):
    """Request for fitting topic model."""
    documents: List[str] = Field(..., description="List of complaint texts")
    embeddings: Optional[List[List[float]]] = Field(
        None, description="Pre-computed embeddings (768-dim)"
    )


class TopicFitResponse(BaseModel):
    """Response from topic fitting."""
    success: bool
    topic_count: int
    topics: List[dict]
    document_topics: Optional[List[int]] = Field(
        None, description="Topic assignment for each input document (same order as input)"
    )


class TopicsOverTimeRequest(BaseModel):
    """Request for temporal topic analysis."""
    documents: List[str]
    timestamps: List[str] = Field(..., description="ISO date strings")
    nr_bins: int = Field(24, description="Number of time bins")
    embeddings: Optional[List[List[float]]] = None


class TopicsOverTimeResponse(BaseModel):
    """Response from temporal analysis."""
    success: bool
    topics: List[dict]


class TrendsResponse(BaseModel):
    """Response from trend identification."""
    success: bool
    trends: List[dict]


class PredictRequest(BaseModel):
    """Request for predicting topic of a document."""
    document: str
    embedding: Optional[List[float]] = None


class PredictResponse(BaseModel):
    """Response from topic prediction."""
    topic_id: int
    probability: float


# Endpoints

@router.post("/fit", response_model=TopicFitResponse)
async def fit_topics(request: TopicFitRequest):
    """
    Fit the topic model on documents.

    This endpoint:
    1. Clusters documents using BERTopic + HDBSCAN
    2. Generates interpretable topic labels via c-TF-IDF
    3. Returns topic information
    """
    try:
        model = get_topic_model()

        # Convert embeddings if provided
        embeddings = None
        if request.embeddings:
            embeddings = np.array(request.embeddings)

        # Fit the model
        results, document_topics = model.fit(request.documents, embeddings)

        return TopicFitResponse(
            success=True,
            topic_count=len(results),
            topics=[
                {
                    "topic_id": r.topic_id,
                    "name": r.name,
                    "count": r.count,
                    "words": r.words,
                    "scores": r.scores,
                    "representative_docs": r.representative_docs[:2],  # Limit for response size
                }
                for r in results
            ],
            document_topics=document_topics,
        )

    except Exception as e:
        logger.error(f"Error fitting topics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/over-time", response_model=TopicsOverTimeResponse)
async def topics_over_time(request: TopicsOverTimeRequest):
    """
    Analyze topics over time.

    Returns topic frequency by time period for temporal tracking.
    """
    try:
        model = get_topic_model()

        embeddings = None
        if request.embeddings:
            embeddings = np.array(request.embeddings)

        results: List[TemporalTopic] = model.topics_over_time(
            request.documents,
            request.timestamps,
            request.nr_bins,
            embeddings,
        )

        return TopicsOverTimeResponse(
            success=True,
            topics=[
                {
                    "topic_id": t.topic_id,
                    "name": t.name,
                    "frequency": t.frequency,
                    "timestamp": t.timestamp,
                }
                for t in results
            ],
        )

    except Exception as e:
        logger.error(f"Error analyzing topics over time: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trends", response_model=TrendsResponse)
async def identify_trends(
    threshold: float = 0.5,
):
    """
    Identify topics with significant growth trends.

    Requires topics_over_time to have been called first.
    """
    try:
        model = get_topic_model()

        if not model.is_fitted:
            raise HTTPException(
                status_code=400,
                detail="Model not fitted. Call /fit first."
            )

        # Note: In practice, you'd store topics_over_time results
        # For now, return empty if not available
        return TrendsResponse(
            success=True,
            trends=[],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error identifying trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict", response_model=PredictResponse)
async def predict_topic(request: PredictRequest):
    """
    Predict topic for a single document.

    Requires model to be fitted first.
    """
    try:
        model = get_topic_model()

        if not model.is_fitted:
            raise HTTPException(
                status_code=400,
                detail="Model not fitted. Call /fit first."
            )

        embedding = None
        if request.embedding:
            embedding = np.array(request.embedding)

        topic_id, prob = model.get_document_topics(request.document, embedding)

        return PredictResponse(
            topic_id=int(topic_id),
            probability=float(prob),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error predicting topic: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_topic_info():
    """
    Get information about all fitted topics.
    """
    try:
        model = get_topic_model()

        if not model.is_fitted:
            return {"success": True, "topics": {}, "message": "Model not fitted yet"}

        info = model.get_topic_info()

        return {
            "success": True,
            "topics": info,
        }

    except Exception as e:
        logger.error(f"Error getting topic info: {e}")
        raise HTTPException(status_code=500, detail=str(e))
