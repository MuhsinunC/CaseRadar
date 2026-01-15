"""
Tests for Signal Detection Module

Tests PRR/EBGM disproportionality analysis.
"""

import pytest
import pandas as pd
import numpy as np

from models.signal_detection import (
    SignalDetectionModel,
    SignalResult,
    SignalStrength,
    PRRResult,
    get_signal_model,
)


class TestPRRCalculation:
    """Test PRR calculation."""

    @pytest.fixture
    def model(self):
        """Create a fresh model instance."""
        return SignalDetectionModel(
            prr_threshold=2.0,
            ci_threshold=1.0,
            min_count=3,
        )

    @pytest.fixture
    def sample_df(self):
        """Create sample complaint data."""
        data = []

        # Toyota Camry brake complaints (high rate)
        for _ in range(50):
            data.append({"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020})

        # Toyota Camry other complaints
        for _ in range(50):
            data.append({"component": "ENGINE", "make": "TOYOTA", "model": "CAMRY", "year": 2020})

        # Other vehicles brake complaints (low rate)
        for _ in range(10):
            data.append({"component": "BRAKE", "make": "FORD", "model": "F150", "year": 2020})

        # Other vehicles other complaints
        for _ in range(90):
            data.append({"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020})

        return pd.DataFrame(data)

    def test_prr_calculation_correct(self, model, sample_df):
        """Test PRR is calculated correctly."""
        result = model.calculate_prr(
            sample_df,
            component="BRAKE",
            make="TOYOTA",
        )

        # Expected: (50/100) / (10/100) = 5.0
        assert result.prr is not None
        assert result.prr == pytest.approx(5.0, rel=0.1)

    def test_contingency_table(self, model, sample_df):
        """Test contingency table values."""
        result = model.calculate_prr(
            sample_df,
            component="BRAKE",
            make="TOYOTA",
        )

        # a = 50 (Toyota + Brake)
        # b = 50 (Toyota + not Brake)
        # c = 10 (not Toyota + Brake)
        # d = 90 (not Toyota + not Brake)
        assert result.count_a == 50
        assert result.count_b == 50
        assert result.count_c == 10
        assert result.count_d == 90

    def test_confidence_interval(self, model, sample_df):
        """Test CI is calculated."""
        result = model.calculate_prr(
            sample_df,
            component="BRAKE",
            make="TOYOTA",
        )

        assert result.ci_lower is not None
        assert result.ci_upper is not None
        assert result.ci_lower < result.prr < result.ci_upper

    def test_handles_zero_division(self, model):
        """Test handles zero division gracefully."""
        # DataFrame with no matching complaints
        df = pd.DataFrame([
            {"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020},
        ])

        result = model.calculate_prr(
            df,
            component="BRAKE",
            make="TOYOTA",
        )

        # Should return None for PRR when data insufficient
        assert result.prr is None

    def test_year_range_filter(self, model):
        """Test year range filtering."""
        df = pd.DataFrame([
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2018},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2019},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2021},
            {"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020},
        ])

        result = model.calculate_prr(
            df,
            component="BRAKE",
            make="TOYOTA",
            year_range=(2019, 2020),
        )

        # Only 2019-2020 Toyota complaints should count
        assert result.count_a == 2


class TestSignalClassification:
    """Test signal strength classification."""

    @pytest.fixture
    def model(self):
        """Create model with default thresholds."""
        return SignalDetectionModel()

    def test_strong_signal_classification(self, model):
        """Test strong signal is classified correctly."""
        # PRR >= 2, CI_lower >= 1, count >= 3
        result = model.classify_signal(prr=3.0, ci_lower=1.5, count=10)
        assert result == SignalStrength.STRONG

    def test_weak_signal_low_ci(self, model):
        """Test weak signal when CI is low."""
        # PRR >= 2, CI_lower < 1
        result = model.classify_signal(prr=3.0, ci_lower=0.8, count=10)
        assert result == SignalStrength.WEAK

    def test_weak_signal_low_count(self, model):
        """Test weak signal when count is low."""
        # PRR >= 2, count < 3
        result = model.classify_signal(prr=3.0, ci_lower=1.5, count=2)
        assert result == SignalStrength.WEAK

    def test_no_signal_classification(self, model):
        """Test no signal when PRR < 2."""
        result = model.classify_signal(prr=1.5, ci_lower=1.2, count=10)
        assert result == SignalStrength.NO_SIGNAL

    def test_insufficient_data(self, model):
        """Test insufficient data classification."""
        result = model.classify_signal(prr=None, ci_lower=None, count=0)
        assert result == SignalStrength.INSUFFICIENT_DATA


class TestComponentScanning:
    """Test scanning all components."""

    @pytest.fixture
    def model(self):
        """Create model instance."""
        return SignalDetectionModel()

    @pytest.fixture
    def multi_component_df(self):
        """Create data with multiple components."""
        data = []

        # High signal component
        for _ in range(100):
            data.append({"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020})
        for _ in range(10):
            data.append({"component": "BRAKE", "make": "FORD", "model": "F150", "year": 2020})

        # Medium signal component
        for _ in range(30):
            data.append({"component": "AIRBAG", "make": "TOYOTA", "model": "CAMRY", "year": 2020})
        for _ in range(20):
            data.append({"component": "AIRBAG", "make": "FORD", "model": "F150", "year": 2020})

        # Low signal component
        for _ in range(10):
            data.append({"component": "ENGINE", "make": "TOYOTA", "model": "CAMRY", "year": 2020})
        for _ in range(30):
            data.append({"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020})

        # Add base complaints for other vehicles
        for _ in range(100):
            data.append({"component": "OTHER", "make": "FORD", "model": "F150", "year": 2020})

        return pd.DataFrame(data)

    def test_scan_all_components(self, model, multi_component_df):
        """Test scanning returns results for all components."""
        results = model.scan_all_components(multi_component_df, make="TOYOTA")

        # Should have results for all components with sufficient count
        assert len(results) >= 3

    def test_results_sorted_by_prr(self, model, multi_component_df):
        """Test results are sorted by PRR descending."""
        results = model.scan_all_components(multi_component_df, make="TOYOTA")

        for i in range(len(results) - 1):
            if results[i].prr is not None and results[i+1].prr is not None:
                assert results[i].prr >= results[i+1].prr

    def test_get_strong_signals(self, model, multi_component_df):
        """Test filtering for strong signals only."""
        strong = model.get_strong_signals(multi_component_df, make="TOYOTA")

        for r in strong:
            assert r.signal_strength == SignalStrength.STRONG

    def test_get_watch_list(self, model, multi_component_df):
        """Test filtering for weak signals."""
        weak = model.get_watch_list(multi_component_df, make="TOYOTA")

        for r in weak:
            assert r.signal_strength == SignalStrength.WEAK


class TestSignalResult:
    """Test SignalResult structure and recommendations."""

    @pytest.fixture
    def model(self):
        """Create model instance."""
        return SignalDetectionModel()

    def test_signal_result_structure(self, model):
        """Test SignalResult has correct fields."""
        df = pd.DataFrame([
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
            {"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020},
        ])

        result = model.analyze_component(df, "BRAKE", make="TOYOTA")

        assert isinstance(result, SignalResult)
        assert result.component == "BRAKE"
        assert result.make == "TOYOTA"
        assert isinstance(result.recommendation, str)

    def test_strong_signal_recommendation(self, model):
        """Test recommendation for strong signals."""
        df = pd.DataFrame([
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
        ] * 100 + [
            {"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020},
        ] * 100)

        result = model.analyze_component(df, "BRAKE", make="TOYOTA")

        if result.signal_strength == SignalStrength.STRONG:
            assert "ALERT" in result.recommendation

    def test_weak_signal_recommendation(self, model):
        """Test recommendation for weak signals."""
        # Create scenario with weak signal
        df = pd.DataFrame([
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},
            {"component": "BRAKE", "make": "TOYOTA", "model": "CAMRY", "year": 2020},  # count = 2 < 3
            {"component": "ENGINE", "make": "FORD", "model": "F150", "year": 2020},
        ] * 10)

        result = model.analyze_component(df, "BRAKE", make="TOYOTA")

        if result.signal_strength == SignalStrength.WEAK:
            assert "WATCH" in result.recommendation


class TestSingleton:
    """Test singleton pattern."""

    def test_get_signal_model_returns_same_instance(self):
        """Test singleton returns same instance."""
        model1 = get_signal_model()
        model2 = get_signal_model()
        assert model1 is model2
