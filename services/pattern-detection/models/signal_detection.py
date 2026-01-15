"""
Signal Detection Module

PRR/EBGM implementation for disproportionality analysis.
Based on docs/architecture/pattern-detection-system.md Section 7.5

Key Features:
- PRR (Proportional Reporting Ratio) calculation
- Confidence interval estimation
- Signal classification (strong/weak/no signal)
- FDA-standard thresholds
"""

import logging
import math
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class SignalStrength(Enum):
    """Signal classification based on FDA criteria."""
    STRONG = "strong_signal"
    WEAK = "weak_signal"
    NO_SIGNAL = "no_signal"
    INSUFFICIENT_DATA = "insufficient_data"


@dataclass
class PRRResult:
    """Result of PRR calculation."""
    prr: Optional[float]
    ci_lower: Optional[float]
    ci_upper: Optional[float]
    count_a: int  # complaints for component X with this vehicle
    count_b: int  # complaints for other components with this vehicle
    count_c: int  # complaints for component X with other vehicles
    count_d: int  # complaints for other components with other vehicles


@dataclass
class SignalResult:
    """Complete signal analysis result."""
    component: str
    make: Optional[str]
    model: Optional[str]
    year_start: Optional[int]
    year_end: Optional[int]
    prr: Optional[float]
    ci_lower: Optional[float]
    count: int
    signal_strength: SignalStrength
    recommendation: str


class SignalDetectionModel:
    """
    Disproportionality analysis for safety signal detection.

    Uses PRR (Proportional Reporting Ratio) as primary method.
    Based on FDA FAERS methodology.

    Signal Classification (from architecture document):
    - Strong signal: PRR >= 2, CI_lower >= 1, count >= 3
    - Weak signal: PRR >= 2, CI_lower < 1 or count < 3
    - No signal: PRR < 2
    """

    def __init__(
        self,
        prr_threshold: float = 2.0,
        ci_threshold: float = 1.0,
        min_count: int = 3,
    ):
        """
        Initialize signal detection model.

        Args:
            prr_threshold: Minimum PRR for signal (default: 2.0)
            ci_threshold: Minimum CI lower bound for strong signal
            min_count: Minimum complaint count for strong signal
        """
        self.prr_threshold = prr_threshold
        self.ci_threshold = ci_threshold
        self.min_count = min_count

    def calculate_prr(
        self,
        df: pd.DataFrame,
        component: str,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year_range: Optional[Tuple[int, int]] = None,
    ) -> PRRResult:
        """
        Calculate PRR for a component.

        PRR = (a / (a + b)) / (c / (c + d))

        Where:
            a = complaints for component X with this vehicle
            b = complaints for other components with this vehicle
            c = complaints for component X with other vehicles
            d = complaints for other components with other vehicles

        Args:
            df: DataFrame with columns: component, make, model, year
            component: Component to analyze
            make: Optional make filter
            model: Optional model filter
            year_range: Optional (start, end) year range

        Returns:
            PRRResult with calculated values
        """
        # Build vehicle filter
        if make is not None:
            vehicle_filter = df['make'] == make
            if model is not None:
                vehicle_filter = vehicle_filter & (df['model'] == model)
            if year_range is not None:
                vehicle_filter = vehicle_filter & df['year'].between(*year_range)
        else:
            vehicle_filter = pd.Series([True] * len(df), index=df.index)

        # Calculate contingency table values
        a = int(len(df[vehicle_filter & (df['component'] == component)]))
        b = int(len(df[vehicle_filter & (df['component'] != component)]))
        c = int(len(df[~vehicle_filter & (df['component'] == component)]))
        d = int(len(df[~vehicle_filter & (df['component'] != component)]))

        # Avoid division by zero
        if (a + b) == 0 or (c + d) == 0 or c == 0:
            return PRRResult(
                prr=None,
                ci_lower=None,
                ci_upper=None,
                count_a=a,
                count_b=b,
                count_c=c,
                count_d=d,
            )

        # Calculate PRR
        p1 = a / (a + b)
        p2 = c / (c + d)
        prr = p1 / p2 if p2 > 0 else None

        if prr is None or prr <= 0:
            return PRRResult(
                prr=prr,
                ci_lower=None,
                ci_upper=None,
                count_a=a,
                count_b=b,
                count_c=c,
                count_d=d,
            )

        # Calculate 95% CI using Wilson score interval approximation
        try:
            se = math.sqrt(
                p1 * (1 - p1) / (a + b) + p2 * (1 - p2) / (c + d)
            )
            log_prr = math.log(prr)
            ci_lower = math.exp(log_prr - 1.96 * se / prr) if prr > 0 else 0
            ci_upper = math.exp(log_prr + 1.96 * se / prr) if prr > 0 else float('inf')
        except (ValueError, ZeroDivisionError):
            ci_lower = None
            ci_upper = None

        return PRRResult(
            prr=float(prr),
            ci_lower=float(ci_lower) if ci_lower is not None else None,
            ci_upper=float(ci_upper) if ci_upper is not None else None,
            count_a=a,
            count_b=b,
            count_c=c,
            count_d=d,
        )

    def classify_signal(
        self,
        prr: Optional[float],
        ci_lower: Optional[float],
        count: int,
    ) -> SignalStrength:
        """
        Classify signal strength based on FDA criteria.

        Strong signal: PRR >= 2, CI_lower >= 1, count >= 3
        Weak signal: PRR >= 2, CI_lower < 1 or count < 3
        No signal: PRR < 2

        Args:
            prr: Calculated PRR value
            ci_lower: Lower bound of 95% CI
            count: Number of complaints (count_a from contingency table)

        Returns:
            SignalStrength enum value
        """
        if prr is None:
            return SignalStrength.INSUFFICIENT_DATA

        if prr < self.prr_threshold:
            return SignalStrength.NO_SIGNAL

        if ci_lower is not None and ci_lower >= self.ci_threshold and count >= self.min_count:
            return SignalStrength.STRONG

        return SignalStrength.WEAK

    def analyze_component(
        self,
        df: pd.DataFrame,
        component: str,
        make: Optional[str] = None,
        model: Optional[str] = None,
        year_range: Optional[Tuple[int, int]] = None,
    ) -> SignalResult:
        """
        Complete signal analysis for a component.

        Args:
            df: DataFrame with complaint data
            component: Component to analyze
            make: Optional make filter
            model: Optional model filter
            year_range: Optional year range

        Returns:
            SignalResult with full analysis
        """
        prr_result = self.calculate_prr(df, component, make, model, year_range)

        signal_strength = self.classify_signal(
            prr_result.prr,
            prr_result.ci_lower,
            prr_result.count_a,
        )

        # Generate recommendation
        if signal_strength == SignalStrength.STRONG:
            recommendation = "ALERT: Strong signal detected. Recommend immediate investigation."
        elif signal_strength == SignalStrength.WEAK:
            recommendation = "WATCH: Weak signal detected. Add to watch list for monitoring."
        elif signal_strength == SignalStrength.INSUFFICIENT_DATA:
            recommendation = "INSUFFICIENT DATA: Not enough complaints for analysis."
        else:
            recommendation = "NO ACTION: No significant signal detected."

        return SignalResult(
            component=component,
            make=make,
            model=model,
            year_start=year_range[0] if year_range else None,
            year_end=year_range[1] if year_range else None,
            prr=prr_result.prr,
            ci_lower=prr_result.ci_lower,
            count=prr_result.count_a,
            signal_strength=signal_strength,
            recommendation=recommendation,
        )

    def scan_all_components(
        self,
        df: pd.DataFrame,
        make: Optional[str] = None,
        model: Optional[str] = None,
        min_count: int = 3,
    ) -> List[SignalResult]:
        """
        Scan all components for signals.

        Args:
            df: DataFrame with complaint data
            make: Optional make filter
            model: Optional model filter
            min_count: Minimum complaints to analyze

        Returns:
            List of SignalResults, sorted by PRR descending
        """
        # Get unique components
        components = df['component'].unique()

        results = []
        for component in components:
            result = self.analyze_component(df, component, make, model)
            if result.count >= min_count:
                results.append(result)

        # Sort by PRR descending (None values at end)
        results.sort(
            key=lambda x: (x.prr is None, -(x.prr or 0)),
        )

        return results

    def get_strong_signals(
        self,
        df: pd.DataFrame,
        make: Optional[str] = None,
        model: Optional[str] = None,
    ) -> List[SignalResult]:
        """Get only strong signals."""
        all_results = self.scan_all_components(df, make, model)
        return [r for r in all_results if r.signal_strength == SignalStrength.STRONG]

    def get_watch_list(
        self,
        df: pd.DataFrame,
        make: Optional[str] = None,
        model: Optional[str] = None,
    ) -> List[SignalResult]:
        """Get weak signals for watch list."""
        all_results = self.scan_all_components(df, make, model)
        return [r for r in all_results if r.signal_strength == SignalStrength.WEAK]


# Singleton instance
_signal_model_instance: Optional[SignalDetectionModel] = None


def get_signal_model() -> SignalDetectionModel:
    """Get or create the singleton signal detection model instance."""
    global _signal_model_instance
    if _signal_model_instance is None:
        _signal_model_instance = SignalDetectionModel()
    return _signal_model_instance
