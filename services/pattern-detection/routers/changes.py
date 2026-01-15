"""
Change Detection Router

API endpoints for Ruptures PELT change point detection.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import numpy as np

from models.change_detection import (
    ChangeDetectionModel,
    ChangePoint,
    ChangeAnalysis,
    get_change_model,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response Models

class ChangeDetectRequest(BaseModel):
    """Request for detecting change points."""
    time_series: List[float] = Field(
        ..., description="Time series values (e.g., complaint counts by period)"
    )
    timestamps: Optional[List[str]] = Field(
        None, description="ISO date strings for each observation"
    )
    penalty: Optional[float] = Field(
        10.0, description="Higher = fewer change points"
    )


class ChangeDetectResponse(BaseModel):
    """Response from change detection."""
    success: bool
    change_point_count: int
    change_points: List[dict]
    model_used: str
    penalty: float


class TopicChangeRequest(BaseModel):
    """Request for analyzing topic changes."""
    frequencies: List[int]
    timestamps: List[str]
    topic_id: int
    topic_name: str
    penalty: Optional[float] = 10.0


class TopicChangeResponse(BaseModel):
    """Response from topic change analysis."""
    success: bool
    topic_id: int
    topic_name: str
    change_points: List[dict]


class MultiPenaltyRequest(BaseModel):
    """Request for multi-penalty analysis."""
    time_series: List[float]
    penalties: List[float] = Field(
        [5, 10, 20, 50], description="Penalty values to test"
    )


class MultiPenaltyResponse(BaseModel):
    """Response from multi-penalty analysis."""
    success: bool
    results: dict


# Endpoints

@router.post("/detect", response_model=ChangeDetectResponse)
async def detect_changes(request: ChangeDetectRequest):
    """
    Detect change points in a time series.

    Uses PELT algorithm (Pruned Exact Linear Time) for O(n) detection.
    """
    try:
        model = get_change_model()

        analysis: ChangeAnalysis = model.analyze_time_series(
            np.array(request.time_series),
            request.timestamps,
            request.penalty,
        )

        return ChangeDetectResponse(
            success=True,
            change_point_count=len(analysis.change_points),
            change_points=[
                {
                    "index": cp.index,
                    "timestamp": cp.timestamp,
                    "before_mean": cp.before_mean,
                    "after_mean": cp.after_mean,
                    "magnitude": cp.magnitude,
                }
                for cp in analysis.change_points
            ],
            model_used=analysis.model_used,
            penalty=analysis.penalty,
        )

    except Exception as e:
        logger.error(f"Error detecting changes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topic", response_model=TopicChangeResponse)
async def analyze_topic_changes(request: TopicChangeRequest):
    """
    Analyze change points for a specific topic's frequency over time.
    """
    try:
        model = get_change_model()

        analysis: ChangeAnalysis = model.analyze_topic_changes(
            request.frequencies,
            request.timestamps,
            request.topic_id,
            request.topic_name,
            request.penalty,
        )

        return TopicChangeResponse(
            success=True,
            topic_id=analysis.topic_id,
            topic_name=analysis.topic_name,
            change_points=[
                {
                    "index": cp.index,
                    "timestamp": cp.timestamp,
                    "before_mean": cp.before_mean,
                    "after_mean": cp.after_mean,
                    "magnitude": cp.magnitude,
                }
                for cp in analysis.change_points
            ],
        )

    except Exception as e:
        logger.error(f"Error analyzing topic changes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/multi-penalty", response_model=MultiPenaltyResponse)
async def multi_penalty_analysis(request: MultiPenaltyRequest):
    """
    Run detection with multiple penalty values for comparison.

    Useful for finding the right sensitivity level.
    """
    try:
        model = get_change_model()

        results = model.detect_with_multiple_penalties(
            np.array(request.time_series),
            request.penalties,
        )

        return MultiPenaltyResponse(
            success=True,
            results={
                str(penalty): indices
                for penalty, indices in results.items()
            },
        )

    except Exception as e:
        logger.error(f"Error in multi-penalty analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/significant")
async def find_significant_changes(
    time_series: List[float],
    min_magnitude: float = 5.0,
    timestamps: Optional[List[str]] = None,
    penalty: Optional[float] = 10.0,
):
    """
    Find only significant change points above a magnitude threshold.
    """
    try:
        model = get_change_model()

        significant = model.find_significant_changes(
            np.array(time_series),
            timestamps,
            min_magnitude,
            penalty,
        )

        return {
            "success": True,
            "count": len(significant),
            "change_points": [
                {
                    "index": cp.index,
                    "timestamp": cp.timestamp,
                    "before_mean": cp.before_mean,
                    "after_mean": cp.after_mean,
                    "magnitude": cp.magnitude,
                }
                for cp in significant
            ],
        }

    except Exception as e:
        logger.error(f"Error finding significant changes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
