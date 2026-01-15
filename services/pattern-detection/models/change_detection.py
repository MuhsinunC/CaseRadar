"""
Change Point Detection Module

Ruptures PELT implementation for detecting temporal shifts.
Based on docs/architecture/pattern-detection-system.md Section 7.4

Key Features:
- O(n) complexity with PELT algorithm
- Multiple cost functions (RBF, L2, L1)
- Configurable sensitivity via penalty
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import ruptures as rpt

logger = logging.getLogger(__name__)


@dataclass
class ChangePoint:
    """A detected change point."""
    index: int
    timestamp: Optional[str]
    before_mean: float
    after_mean: float
    magnitude: float  # Absolute difference


@dataclass
class ChangeAnalysis:
    """Complete change point analysis result."""
    topic_id: Optional[int]
    topic_name: Optional[str]
    change_points: List[ChangePoint]
    total_observations: int
    model_used: str
    penalty: float


class ChangeDetectionModel:
    """
    Ruptures-based change point detection for time series analysis.

    Configuration based on architecture document:
    - Algorithm: PELT (Pruned Exact Linear Time)
    - Model: RBF (radial basis function)
    - Min size: 3 observations between change points
    """

    def __init__(
        self,
        model: str = 'rbf',
        min_size: int = 3,
        default_penalty: float = 10.0,
    ):
        """
        Initialize the change detection model.

        Args:
            model: Cost function ('rbf', 'l2', 'l1', 'normal')
            min_size: Minimum segment size
            default_penalty: Higher = fewer change points
        """
        self.model = model
        self.min_size = min_size
        self.default_penalty = default_penalty

    def detect_change_points(
        self,
        time_series: np.ndarray,
        penalty: Optional[float] = None,
    ) -> List[int]:
        """
        Detect change points in a time series.

        Args:
            time_series: 1D or 2D array of values
            penalty: Custom penalty (default: use default_penalty)

        Returns:
            List of change point indices
        """
        pen = penalty if penalty is not None else self.default_penalty

        # Ensure correct shape
        signal = np.asarray(time_series)
        if signal.ndim == 1:
            signal = signal.reshape(-1, 1)

        logger.info(f"Detecting change points in {len(signal)} observations...")

        # PELT algorithm - optimal and fast O(n)
        algo = rpt.Pelt(model=self.model, min_size=self.min_size).fit(signal)
        change_points = algo.predict(pen=pen)

        # Remove last point (always equals len(signal))
        change_points = [cp for cp in change_points if cp < len(signal)]

        logger.info(f"Found {len(change_points)} change points")
        return change_points

    def analyze_time_series(
        self,
        time_series: np.ndarray,
        timestamps: Optional[List[str]] = None,
        penalty: Optional[float] = None,
    ) -> ChangeAnalysis:
        """
        Perform complete change point analysis.

        Args:
            time_series: Values over time
            timestamps: Optional date strings for each observation
            penalty: Custom penalty

        Returns:
            ChangeAnalysis with all change point details
        """
        signal = np.asarray(time_series).flatten()
        change_indices = self.detect_change_points(signal, penalty)

        change_points = []
        for i, cp_idx in enumerate(change_indices):
            # Calculate before/after means
            start_idx = change_indices[i-1] if i > 0 else 0
            end_idx = change_indices[i+1] if i < len(change_indices) - 1 else len(signal)

            before_vals = signal[start_idx:cp_idx]
            after_vals = signal[cp_idx:end_idx]

            before_mean = float(np.mean(before_vals)) if len(before_vals) > 0 else 0.0
            after_mean = float(np.mean(after_vals)) if len(after_vals) > 0 else 0.0
            magnitude = abs(after_mean - before_mean)

            # Get timestamp if available
            ts = timestamps[cp_idx] if timestamps and cp_idx < len(timestamps) else None

            change_points.append(ChangePoint(
                index=cp_idx,
                timestamp=ts,
                before_mean=before_mean,
                after_mean=after_mean,
                magnitude=magnitude,
            ))

        return ChangeAnalysis(
            topic_id=None,
            topic_name=None,
            change_points=change_points,
            total_observations=len(signal),
            model_used=self.model,
            penalty=penalty or self.default_penalty,
        )

    def analyze_topic_changes(
        self,
        frequencies: List[int],
        timestamps: List[str],
        topic_id: int,
        topic_name: str,
        penalty: Optional[float] = None,
    ) -> ChangeAnalysis:
        """
        Analyze when a specific topic's frequency changed significantly.

        Args:
            frequencies: Topic frequency values over time
            timestamps: Date strings for each period
            topic_id: Topic identifier
            topic_name: Topic name for reference
            penalty: Custom penalty

        Returns:
            ChangeAnalysis with topic context
        """
        analysis = self.analyze_time_series(
            np.array(frequencies),
            timestamps,
            penalty,
        )

        # Add topic context
        analysis.topic_id = topic_id
        analysis.topic_name = topic_name

        return analysis

    def find_significant_changes(
        self,
        time_series: np.ndarray,
        timestamps: Optional[List[str]] = None,
        min_magnitude: float = 0.0,
        penalty: Optional[float] = None,
    ) -> List[ChangePoint]:
        """
        Find only significant change points above a magnitude threshold.

        Args:
            time_series: Values over time
            timestamps: Optional date strings
            min_magnitude: Minimum absolute change required
            penalty: Custom penalty

        Returns:
            List of significant ChangePoints
        """
        analysis = self.analyze_time_series(time_series, timestamps, penalty)

        significant = [
            cp for cp in analysis.change_points
            if cp.magnitude >= min_magnitude
        ]

        return significant

    def detect_with_multiple_penalties(
        self,
        time_series: np.ndarray,
        penalties: List[float] = [5, 10, 20, 50],
    ) -> Dict[float, List[int]]:
        """
        Run detection with multiple penalty values for comparison.

        Useful for finding the right sensitivity level.

        Args:
            time_series: Values over time
            penalties: List of penalty values to test

        Returns:
            Dict mapping penalty -> change points
        """
        results = {}
        for pen in penalties:
            results[pen] = self.detect_change_points(time_series, penalty=pen)
        return results


# Singleton instance
_change_model_instance: Optional[ChangeDetectionModel] = None


def get_change_model() -> ChangeDetectionModel:
    """Get or create the singleton change detection model instance."""
    global _change_model_instance
    if _change_model_instance is None:
        _change_model_instance = ChangeDetectionModel()
    return _change_model_instance
