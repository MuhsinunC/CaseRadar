"""
Tests for Anomaly Detection Module

Tests PyOD ensemble implementation.
"""

import pytest
import numpy as np

from models.anomaly_detection import (
    AnomalyDetectionModel,
    AnomalyResult,
    AnomalyStats,
    get_anomaly_model,
)


class TestAnomalyDetectionModel:
    """Test suite for AnomalyDetectionModel."""

    @pytest.fixture
    def model(self):
        """Create a fresh model instance."""
        return AnomalyDetectionModel(
            contamination=0.1,  # 10% for testing
            n_estimators=50,
            n_neighbors=5,
            n_bins=20,
        )

    @pytest.fixture
    def normal_embeddings(self):
        """Generate normal embeddings (clustered together)."""
        np.random.seed(42)
        # 90 normal points clustered around origin
        return np.random.randn(90, 50) * 0.5

    @pytest.fixture
    def anomaly_embeddings(self):
        """Generate anomaly embeddings (far from cluster)."""
        np.random.seed(42)
        # 10 anomalies far from origin
        return np.random.randn(10, 50) * 0.5 + 5

    @pytest.fixture
    def mixed_embeddings(self, normal_embeddings, anomaly_embeddings):
        """Mix normal and anomaly embeddings."""
        return np.vstack([normal_embeddings, anomaly_embeddings])

    def test_model_initialization(self, model):
        """Test model initializes with correct parameters."""
        assert model.contamination == 0.1
        assert model.n_estimators == 50
        assert model.n_neighbors == 5
        assert model.n_bins == 20
        assert not model.is_fitted

    def test_fit_returns_stats(self, model, mixed_embeddings):
        """Test fitting returns statistics."""
        stats = model.fit(mixed_embeddings)

        assert isinstance(stats, AnomalyStats)
        assert stats.total_documents == 100
        assert 0 <= stats.anomaly_rate <= 1
        assert stats.threshold > 0

    def test_isolation_forest_scores_outliers_high(self, model, mixed_embeddings):
        """Test Isolation Forest gives higher scores to outliers."""
        model.fit(mixed_embeddings)

        # Get scores for normal vs anomaly embeddings
        normal_scores = model._get_ensemble_scores(mixed_embeddings[:90])
        anomaly_scores = model._get_ensemble_scores(mixed_embeddings[90:])

        # Anomalies should have higher average score
        assert np.mean(anomaly_scores) > np.mean(normal_scores)

    def test_lof_detects_local_anomalies(self, model, mixed_embeddings):
        """Test LOF contributes to detection."""
        model.fit(mixed_embeddings)

        individual_scores = model._get_individual_scores(mixed_embeddings)
        assert 'local_outlier_factor' in individual_scores
        assert len(individual_scores['local_outlier_factor']) == 100

    def test_ensemble_combines_scores(self, model, mixed_embeddings):
        """Test ensemble combines detector scores."""
        model.fit(mixed_embeddings)

        individual = model._get_individual_scores(mixed_embeddings)
        ensemble = model._get_ensemble_scores(mixed_embeddings)

        # Ensemble should be average of individual scores
        expected = np.mean([
            individual['isolation_forest'],
            individual['local_outlier_factor'],
            individual['histogram_based'],
        ], axis=0)

        np.testing.assert_array_almost_equal(ensemble, expected)

    def test_scores_normalized_to_0_1(self, model, mixed_embeddings):
        """Test all scores are normalized to [0, 1] range."""
        model.fit(mixed_embeddings)

        ensemble = model._get_ensemble_scores(mixed_embeddings)
        individual = model._get_individual_scores(mixed_embeddings)

        # Check ensemble scores
        assert ensemble.min() >= 0
        assert ensemble.max() <= 1

        # Check individual scores
        for name, scores in individual.items():
            assert scores.min() >= 0, f"{name} has negative scores"
            assert scores.max() <= 1, f"{name} has scores > 1"

    def test_detect_returns_results(self, model, mixed_embeddings):
        """Test detect returns AnomalyResult objects."""
        model.fit(mixed_embeddings)
        results = model.detect(mixed_embeddings)

        assert len(results) == 100
        assert all(isinstance(r, AnomalyResult) for r in results)

    def test_detect_identifies_anomalies(self, model, mixed_embeddings):
        """Test detect correctly identifies anomalies."""
        model.fit(mixed_embeddings)
        results = model.detect(mixed_embeddings)

        # Count how many of the last 10 (actual anomalies) are flagged
        anomaly_flags = [r.is_anomaly for r in results[90:]]
        # At least half should be detected
        assert sum(anomaly_flags) >= 5

    def test_anomaly_type_classification(self, model, mixed_embeddings):
        """Test anomaly type classification."""
        model.fit(mixed_embeddings)
        results = model.detect(mixed_embeddings)

        # Check anomaly types are valid
        valid_types = {'point', 'contextual', 'collective', 'normal'}
        for r in results:
            assert r.anomaly_type in valid_types

    def test_score_single(self, model, mixed_embeddings):
        """Test scoring a single document."""
        model.fit(mixed_embeddings)

        # Score a normal point
        score, detectors = model.score_single(mixed_embeddings[0])
        assert 0 <= score <= 1
        assert len(detectors) == 3

        # Score an anomaly
        score_anomaly, _ = model.score_single(mixed_embeddings[95])
        assert score_anomaly > score  # Anomaly should score higher

    def test_threshold_property(self, model, mixed_embeddings):
        """Test threshold property."""
        # Before fitting
        assert model.threshold == 0.5  # Default

        # After fitting
        model.fit(mixed_embeddings)
        assert model.threshold > 0

    def test_custom_threshold(self, model, mixed_embeddings):
        """Test using custom threshold for detection."""
        model.fit(mixed_embeddings)

        # With default threshold
        results_default = model.detect(mixed_embeddings)
        anomalies_default = sum(1 for r in results_default if r.is_anomaly)

        # With higher threshold (fewer anomalies)
        results_high = model.detect(mixed_embeddings, threshold=0.9)
        anomalies_high = sum(1 for r in results_high if r.is_anomaly)

        assert anomalies_high <= anomalies_default


class TestAnomalyDetectionEdgeCases:
    """Test edge cases and error handling."""

    def test_fit_required_before_detect(self):
        """Test detection fails if model not fitted."""
        model = AnomalyDetectionModel()
        embeddings = np.random.rand(10, 50)

        with pytest.raises(ValueError, match="fitted"):
            model.detect(embeddings)

    def test_fit_required_before_score_single(self):
        """Test single scoring fails if model not fitted."""
        model = AnomalyDetectionModel()
        embedding = np.random.rand(50)

        with pytest.raises(ValueError, match="fitted"):
            model.score_single(embedding)

    def test_single_embedding_1d(self):
        """Test score_single handles 1D input."""
        model = AnomalyDetectionModel()
        embeddings = np.random.rand(100, 50)
        model.fit(embeddings)

        # 1D embedding should work
        score, _ = model.score_single(embeddings[0])
        assert 0 <= score <= 1


class TestSingleton:
    """Test singleton pattern."""

    def test_get_anomaly_model_returns_same_instance(self):
        """Test singleton returns same instance."""
        model1 = get_anomaly_model()
        model2 = get_anomaly_model()
        assert model1 is model2
