"""
Tests for Topic Clustering Module

Tests BERTopic + HDBSCAN implementation.
"""

import pytest
import numpy as np

from models.topic_clustering import (
    TopicClusteringModel,
    TopicResult,
    TopicTrend,
    TemporalTopic,
    get_topic_model,
)


class TestTopicClusteringModel:
    """Test suite for TopicClusteringModel."""

    @pytest.fixture
    def model(self):
        """Create a fresh model instance."""
        return TopicClusteringModel(
            min_cluster_size=5,  # Lower for testing
            min_samples=2,
            n_neighbors=5,
            n_components=3,
        )

    @pytest.fixture
    def sample_documents(self):
        """Sample documents for testing."""
        return [
            "The brakes on my car failed suddenly while driving",
            "Brake failure caused an accident",
            "My brakes stopped working on the highway",
            "The brake pedal went to the floor",
            "Sudden brake failure is dangerous",
            "My engine overheated and caught fire",
            "Engine fire started while parked",
            "The engine caught fire unexpectedly",
            "Car engine overheated and smoked",
            "Engine fire is a safety hazard",
            "Airbag deployed without a crash",
            "Airbag went off randomly",
            "The airbag deployed for no reason",
            "Unexpected airbag deployment",
            "Airbag malfunctioned and deployed",
        ]

    @pytest.fixture
    def sample_embeddings(self):
        """Generate sample embeddings for testing."""
        np.random.seed(42)
        # Create 15 embeddings with 768 dimensions
        return np.random.rand(15, 768)

    def test_model_initialization(self, model):
        """Test model initializes with correct parameters."""
        assert model.min_cluster_size == 5
        assert model.min_samples == 2
        assert model.n_neighbors == 5
        assert model.n_components == 3
        assert not model.is_fitted

    def test_hdbscan_config(self, model):
        """Test HDBSCAN is configured correctly."""
        hdbscan = model._create_hdbscan()
        assert hdbscan.min_cluster_size == 5
        assert hdbscan.min_samples == 2
        assert hdbscan.metric == 'euclidean'
        assert hdbscan.cluster_selection_method == 'eom'

    def test_umap_config(self, model):
        """Test UMAP is configured correctly."""
        umap = model._create_umap()
        assert umap.n_neighbors == 5
        assert umap.n_components == 3
        assert umap.min_dist == 0.0
        assert umap.metric == 'cosine'

    def test_fit_with_embeddings(self, model, sample_documents, sample_embeddings):
        """Test fitting with pre-computed embeddings."""
        results = model.fit(sample_documents, sample_embeddings)

        assert model.is_fitted
        assert isinstance(results, list)
        # Should find at least one topic (may vary due to randomness)

    def test_fit_without_embeddings(self, model, sample_documents):
        """Test fitting generates embeddings if not provided."""
        # This would actually call sentence-transformers
        # Skip in unit tests, use integration tests
        pytest.skip("Requires sentence-transformers model")

    def test_topic_result_structure(self, model, sample_documents, sample_embeddings):
        """Test TopicResult has correct structure."""
        results = model.fit(sample_documents, sample_embeddings)

        if len(results) > 0:
            topic = results[0]
            assert isinstance(topic, TopicResult)
            assert isinstance(topic.topic_id, int)
            assert isinstance(topic.name, str)
            assert isinstance(topic.count, int)
            assert isinstance(topic.words, list)
            assert isinstance(topic.scores, list)

    def test_get_topic_info(self, model, sample_documents, sample_embeddings):
        """Test getting topic information."""
        model.fit(sample_documents, sample_embeddings)

        info = model.get_topic_info()
        assert isinstance(info, dict)

    def test_is_fitted_property(self, model, sample_documents, sample_embeddings):
        """Test is_fitted property updates correctly."""
        assert not model.is_fitted
        model.fit(sample_documents, sample_embeddings)
        assert model.is_fitted


class TestTopicTrends:
    """Test trend identification functionality."""

    @pytest.fixture
    def temporal_topics(self):
        """Sample temporal topics for trend testing."""
        return [
            TemporalTopic(topic_id=1, name="Brakes", frequency=10, timestamp="2024-01"),
            TemporalTopic(topic_id=1, name="Brakes", frequency=15, timestamp="2024-02"),
            TemporalTopic(topic_id=1, name="Brakes", frequency=20, timestamp="2024-03"),
            TemporalTopic(topic_id=1, name="Brakes", frequency=25, timestamp="2024-04"),
            TemporalTopic(topic_id=1, name="Brakes", frequency=30, timestamp="2024-05"),
            TemporalTopic(topic_id=2, name="Engine", frequency=20, timestamp="2024-01"),
            TemporalTopic(topic_id=2, name="Engine", frequency=19, timestamp="2024-02"),
            TemporalTopic(topic_id=2, name="Engine", frequency=21, timestamp="2024-03"),
            TemporalTopic(topic_id=2, name="Engine", frequency=20, timestamp="2024-04"),
            TemporalTopic(topic_id=2, name="Engine", frequency=20, timestamp="2024-05"),
        ]

    def test_identify_trends_detects_growth(self, temporal_topics):
        """Test that growing topics are identified."""
        model = TopicClusteringModel()
        trends = model.identify_trends(temporal_topics, threshold=0.5)

        # Topic 1 (Brakes) should be identified as trending
        assert len(trends) > 0
        assert trends[0].topic_id == 1
        assert trends[0].growth_rate > 0

    def test_trends_sorted_by_growth(self, temporal_topics):
        """Test trends are sorted by growth rate descending."""
        model = TopicClusteringModel()
        trends = model.identify_trends(temporal_topics, threshold=0.0)

        for i in range(len(trends) - 1):
            assert trends[i].growth_rate >= trends[i + 1].growth_rate

    def test_trend_confidence(self, temporal_topics):
        """Test trend confidence calculation."""
        model = TopicClusteringModel()
        trends = model.identify_trends(temporal_topics, threshold=0.5)

        if len(trends) > 0:
            assert 0 <= trends[0].confidence <= 1


class TestSingleton:
    """Test singleton pattern."""

    def test_get_topic_model_returns_same_instance(self):
        """Test singleton returns same instance."""
        model1 = get_topic_model()
        model2 = get_topic_model()
        assert model1 is model2
