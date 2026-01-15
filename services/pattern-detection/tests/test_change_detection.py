"""
Tests for Change Detection Module

Tests Ruptures PELT implementation.
"""

import pytest
import numpy as np

from models.change_detection import (
    ChangeDetectionModel,
    ChangePoint,
    ChangeAnalysis,
    get_change_model,
)


class TestChangeDetectionModel:
    """Test suite for ChangeDetectionModel."""

    @pytest.fixture
    def model(self):
        """Create a fresh model instance."""
        return ChangeDetectionModel(model='rbf', min_size=3, default_penalty=10.0)

    @pytest.fixture
    def single_change_series(self):
        """Time series with a single change point."""
        np.random.seed(42)
        # First half around 10, second half around 50
        before = np.random.normal(10, 2, 20)
        after = np.random.normal(50, 2, 20)
        return np.concatenate([before, after])

    @pytest.fixture
    def multiple_change_series(self):
        """Time series with multiple change points."""
        np.random.seed(42)
        # Three segments with different means
        seg1 = np.random.normal(10, 2, 15)
        seg2 = np.random.normal(30, 2, 15)
        seg3 = np.random.normal(10, 2, 15)
        return np.concatenate([seg1, seg2, seg3])

    @pytest.fixture
    def no_change_series(self):
        """Time series with no significant change."""
        np.random.seed(42)
        return np.random.normal(20, 2, 40)

    def test_model_initialization(self, model):
        """Test model initializes with correct parameters."""
        assert model.model == 'rbf'
        assert model.min_size == 3
        assert model.default_penalty == 10.0

    def test_pelt_detects_single_change(self, model, single_change_series):
        """Test PELT detects a single change point."""
        change_points = model.detect_change_points(single_change_series, penalty=5)

        # Should detect roughly at index 20 (where the change happens)
        assert len(change_points) >= 1
        # The change point should be near 20
        assert any(15 <= cp <= 25 for cp in change_points)

    def test_pelt_detects_multiple_changes(self, model, multiple_change_series):
        """Test PELT detects multiple change points."""
        change_points = model.detect_change_points(multiple_change_series, penalty=5)

        # Should detect around indices 15 and 30
        assert len(change_points) >= 2

    def test_no_changes_detected(self, model, no_change_series):
        """Test no changes detected in constant series."""
        change_points = model.detect_change_points(no_change_series, penalty=50)

        # With high penalty, should find no change points
        assert len(change_points) == 0

    def test_penalty_controls_sensitivity(self, model, single_change_series):
        """Test higher penalty means fewer change points."""
        low_penalty = model.detect_change_points(single_change_series, penalty=1)
        high_penalty = model.detect_change_points(single_change_series, penalty=100)

        # Higher penalty should result in fewer or equal change points
        assert len(high_penalty) <= len(low_penalty)

    def test_analyze_time_series_structure(self, model, single_change_series):
        """Test analyze_time_series returns correct structure."""
        timestamps = [f"2024-{i+1:02d}" for i in range(len(single_change_series))]
        analysis = model.analyze_time_series(single_change_series, timestamps)

        assert isinstance(analysis, ChangeAnalysis)
        assert analysis.model_used == 'rbf'
        assert analysis.total_observations == len(single_change_series)

    def test_change_point_structure(self, model, single_change_series):
        """Test ChangePoint has correct structure."""
        timestamps = [f"2024-{i+1:02d}" for i in range(len(single_change_series))]
        analysis = model.analyze_time_series(single_change_series, timestamps, penalty=5)

        if len(analysis.change_points) > 0:
            cp = analysis.change_points[0]
            assert isinstance(cp, ChangePoint)
            assert isinstance(cp.index, int)
            assert isinstance(cp.before_mean, float)
            assert isinstance(cp.after_mean, float)
            assert isinstance(cp.magnitude, float)

    def test_magnitude_calculation(self, model, single_change_series):
        """Test magnitude is calculated correctly."""
        analysis = model.analyze_time_series(single_change_series, penalty=5)

        if len(analysis.change_points) > 0:
            cp = analysis.change_points[0]
            expected_magnitude = abs(cp.after_mean - cp.before_mean)
            assert abs(cp.magnitude - expected_magnitude) < 0.01

    def test_analyze_topic_changes(self, model):
        """Test topic change analysis."""
        frequencies = [10, 12, 11, 50, 52, 48, 51]
        timestamps = [f"2024-{i+1:02d}" for i in range(len(frequencies))]

        analysis = model.analyze_topic_changes(
            frequencies=frequencies,
            timestamps=timestamps,
            topic_id=1,
            topic_name="Brakes",
            penalty=5,
        )

        assert analysis.topic_id == 1
        assert analysis.topic_name == "Brakes"

    def test_find_significant_changes(self, model, single_change_series):
        """Test finding only significant changes."""
        # Set minimum magnitude to filter small changes
        significant = model.find_significant_changes(
            single_change_series,
            min_magnitude=20.0,  # Significant change
            penalty=5,
        )

        # The change from 10 to 50 should be significant
        assert len(significant) >= 1
        assert all(cp.magnitude >= 20.0 for cp in significant)

    def test_multi_penalty_analysis(self, model, single_change_series):
        """Test multi-penalty analysis."""
        results = model.detect_with_multiple_penalties(
            single_change_series,
            penalties=[5, 10, 20, 50],
        )

        assert len(results) == 4
        assert 5 in results
        assert 50 in results

        # Higher penalty should have fewer or equal change points
        assert len(results[50]) <= len(results[5])


class TestChangeDetectionEdgeCases:
    """Test edge cases."""

    def test_short_series(self):
        """Test handling of very short series."""
        model = ChangeDetectionModel(min_size=3)
        series = np.array([1, 2, 3, 4, 5])

        # Should not raise error
        change_points = model.detect_change_points(series, penalty=10)
        assert isinstance(change_points, list)

    def test_1d_vs_2d_input(self):
        """Test handling of 1D and 2D input."""
        model = ChangeDetectionModel()
        series_1d = np.array([1, 2, 3, 10, 11, 12])
        series_2d = series_1d.reshape(-1, 1)

        cp_1d = model.detect_change_points(series_1d, penalty=5)
        cp_2d = model.detect_change_points(series_2d, penalty=5)

        assert cp_1d == cp_2d

    def test_timestamps_mapping(self):
        """Test timestamps are correctly mapped to change points."""
        model = ChangeDetectionModel()
        series = np.array([10, 10, 10, 50, 50, 50])
        timestamps = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]

        analysis = model.analyze_time_series(series, timestamps, penalty=5)

        # Change point timestamp should be in the list
        for cp in analysis.change_points:
            assert cp.timestamp in timestamps


class TestSingleton:
    """Test singleton pattern."""

    def test_get_change_model_returns_same_instance(self):
        """Test singleton returns same instance."""
        model1 = get_change_model()
        model2 = get_change_model()
        assert model1 is model2
