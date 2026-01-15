"""
Signal Detection Router

API endpoints for PRR/EBGM disproportionality analysis.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import pandas as pd

from models.signal_detection import (
    SignalDetectionModel,
    SignalResult,
    SignalStrength,
    PRRResult,
    get_signal_model,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response Models

class ComplaintData(BaseModel):
    """Single complaint data point."""
    component: str
    make: str
    model: Optional[str] = None
    year: int


class SignalAnalyzeRequest(BaseModel):
    """Request for signal analysis."""
    complaints: List[ComplaintData]
    component: str
    make: Optional[str] = None
    model: Optional[str] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None


class SignalAnalyzeResponse(BaseModel):
    """Response from signal analysis."""
    success: bool
    component: str
    prr: Optional[float]
    ci_lower: Optional[float]
    count: int
    signal_strength: str
    recommendation: str


class ScanRequest(BaseModel):
    """Request for scanning all components."""
    complaints: List[ComplaintData]
    make: Optional[str] = None
    model: Optional[str] = None
    min_count: int = 3


class ScanResponse(BaseModel):
    """Response from component scan."""
    success: bool
    total_components: int
    strong_signals: int
    weak_signals: int
    results: List[dict]


class PRRRequest(BaseModel):
    """Request for PRR calculation."""
    complaints: List[ComplaintData]
    component: str
    make: Optional[str] = None
    model: Optional[str] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None


class PRRResponse(BaseModel):
    """Response from PRR calculation."""
    success: bool
    prr: Optional[float]
    ci_lower: Optional[float]
    ci_upper: Optional[float]
    contingency_table: dict


# Helper Functions

def _complaints_to_df(complaints: List[ComplaintData]) -> pd.DataFrame:
    """Convert complaint data to DataFrame."""
    return pd.DataFrame([
        {
            "component": c.component,
            "make": c.make,
            "model": c.model,
            "year": c.year,
        }
        for c in complaints
    ])


# Endpoints

@router.post("/analyze", response_model=SignalAnalyzeResponse)
async def analyze_signal(request: SignalAnalyzeRequest):
    """
    Analyze signal for a specific component.

    Calculates PRR and classifies signal strength using FDA criteria:
    - Strong signal: PRR >= 2, CI_lower >= 1, count >= 3
    - Weak signal: PRR >= 2, CI_lower < 1 or count < 3
    - No signal: PRR < 2
    """
    try:
        model = get_signal_model()
        df = _complaints_to_df(request.complaints)

        year_range = None
        if request.year_start and request.year_end:
            year_range = (request.year_start, request.year_end)

        result: SignalResult = model.analyze_component(
            df,
            request.component,
            request.make,
            request.model,
            year_range,
        )

        return SignalAnalyzeResponse(
            success=True,
            component=result.component,
            prr=result.prr,
            ci_lower=result.ci_lower,
            count=result.count,
            signal_strength=result.signal_strength.value,
            recommendation=result.recommendation,
        )

    except Exception as e:
        logger.error(f"Error analyzing signal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan", response_model=ScanResponse)
async def scan_all_components(request: ScanRequest):
    """
    Scan all components for signals.

    Returns components sorted by PRR, with signal classification.
    """
    try:
        model = get_signal_model()
        df = _complaints_to_df(request.complaints)

        results: List[SignalResult] = model.scan_all_components(
            df,
            request.make,
            request.model,
            request.min_count,
        )

        strong_count = sum(1 for r in results if r.signal_strength == SignalStrength.STRONG)
        weak_count = sum(1 for r in results if r.signal_strength == SignalStrength.WEAK)

        return ScanResponse(
            success=True,
            total_components=len(results),
            strong_signals=strong_count,
            weak_signals=weak_count,
            results=[
                {
                    "component": r.component,
                    "prr": r.prr,
                    "ci_lower": r.ci_lower,
                    "count": r.count,
                    "signal_strength": r.signal_strength.value,
                    "recommendation": r.recommendation,
                }
                for r in results
            ],
        )

    except Exception as e:
        logger.error(f"Error scanning components: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/strong-signals")
async def get_strong_signals(request: ScanRequest):
    """
    Get only strong signals (alert level).
    """
    try:
        model = get_signal_model()
        df = _complaints_to_df(request.complaints)

        results = model.get_strong_signals(df, request.make, request.model)

        return {
            "success": True,
            "count": len(results),
            "signals": [
                {
                    "component": r.component,
                    "prr": r.prr,
                    "ci_lower": r.ci_lower,
                    "count": r.count,
                    "recommendation": r.recommendation,
                }
                for r in results
            ],
        }

    except Exception as e:
        logger.error(f"Error getting strong signals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/watch-list")
async def get_watch_list(request: ScanRequest):
    """
    Get weak signals for watch list monitoring.
    """
    try:
        model = get_signal_model()
        df = _complaints_to_df(request.complaints)

        results = model.get_watch_list(df, request.make, request.model)

        return {
            "success": True,
            "count": len(results),
            "signals": [
                {
                    "component": r.component,
                    "prr": r.prr,
                    "ci_lower": r.ci_lower,
                    "count": r.count,
                    "recommendation": r.recommendation,
                }
                for r in results
            ],
        }

    except Exception as e:
        logger.error(f"Error getting watch list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prr", response_model=PRRResponse)
async def calculate_prr(request: PRRRequest):
    """
    Calculate PRR (Proportional Reporting Ratio) directly.

    Returns the raw PRR value with confidence intervals and contingency table.
    """
    try:
        model = get_signal_model()
        df = _complaints_to_df(request.complaints)

        year_range = None
        if request.year_start and request.year_end:
            year_range = (request.year_start, request.year_end)

        result: PRRResult = model.calculate_prr(
            df,
            request.component,
            request.make,
            request.model,
            year_range,
        )

        return PRRResponse(
            success=True,
            prr=result.prr,
            ci_lower=result.ci_lower,
            ci_upper=result.ci_upper,
            contingency_table={
                "a": result.count_a,
                "b": result.count_b,
                "c": result.count_c,
                "d": result.count_d,
            },
        )

    except Exception as e:
        logger.error(f"Error calculating PRR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
