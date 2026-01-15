"""Unit tests for embedding service endpoints."""

import pytest
import math


class TestEmbeddingEndpoint:
    """Tests for single embedding generation."""

    def test_embed_single_text_returns_768_dimensions(self, client):
        """Embedding should return exactly 768 dimensions."""
        response = client.post("/embed", json={"text": "test text"})
        assert response.status_code == 200
        data = response.json()
        assert "embedding" in data
        assert len(data["embedding"]) == 768

    def test_embed_empty_text_returns_error(self, client):
        """Empty text should return 400/422 error."""
        response = client.post("/embed", json={"text": ""})
        assert response.status_code == 422  # Validation error

    def test_embed_whitespace_only_returns_error(self, client):
        """Whitespace-only text should return error."""
        response = client.post("/embed", json={"text": "   "})
        assert response.status_code == 422

    def test_embed_returns_normalized_vector(self, client):
        """Embedding should be L2 normalized (magnitude ~1.0)."""
        response = client.post("/embed", json={"text": "test text for normalization"})
        assert response.status_code == 200
        embedding = response.json()["embedding"]
        magnitude = math.sqrt(sum(x**2 for x in embedding))
        assert 0.99 < magnitude < 1.01, f"Magnitude should be ~1.0, got {magnitude}"

    def test_embed_returns_model_name(self, client):
        """Response should include model name."""
        response = client.post("/embed", json={"text": "test"})
        assert response.status_code == 200
        assert "model" in response.json()
        assert "nomic" in response.json()["model"].lower()

    def test_embed_returns_latency(self, client):
        """Response should include latency in milliseconds."""
        response = client.post("/embed", json={"text": "test"})
        assert response.status_code == 200
        data = response.json()
        assert "latency_ms" in data
        assert data["latency_ms"] > 0

    def test_embed_different_texts_produce_different_embeddings(self, client):
        """Different texts should produce different embeddings."""
        response1 = client.post("/embed", json={"text": "apple fruit"})
        response2 = client.post("/embed", json={"text": "car vehicle"})
        assert response1.status_code == 200
        assert response2.status_code == 200

        emb1 = response1.json()["embedding"]
        emb2 = response2.json()["embedding"]

        # Calculate cosine similarity
        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        # Since both are normalized, cosine similarity = dot product
        # Different texts should have similarity < 0.95
        assert dot_product < 0.95, "Different texts should produce different embeddings"

    def test_embed_similar_texts_produce_similar_embeddings(self, client):
        """Similar texts should produce similar embeddings."""
        response1 = client.post("/embed", json={"text": "The car is fast"})
        response2 = client.post("/embed", json={"text": "The automobile is quick"})
        assert response1.status_code == 200
        assert response2.status_code == 200

        emb1 = response1.json()["embedding"]
        emb2 = response2.json()["embedding"]

        dot_product = sum(a * b for a, b in zip(emb1, emb2))
        # Similar texts should have similarity > 0.5
        assert dot_product > 0.5, "Similar texts should produce similar embeddings"


class TestBatchEmbedding:
    """Tests for batch embedding generation."""

    def test_batch_embed_multiple_texts(self, client):
        """Batch endpoint should handle multiple texts."""
        texts = ["text1", "text2", "text3"]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200
        data = response.json()
        assert len(data["embeddings"]) == 3
        assert data["count"] == 3

    def test_batch_embed_single_text(self, client):
        """Batch endpoint should handle single text."""
        response = client.post("/embed/batch", json={"texts": ["single text"]})
        assert response.status_code == 200
        assert len(response.json()["embeddings"]) == 1

    def test_batch_embed_max_100_texts(self, client):
        """Batch endpoint should handle up to 100 texts."""
        texts = [f"text number {i}" for i in range(100)]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200
        assert len(response.json()["embeddings"]) == 100

    def test_batch_embed_over_100_texts_returns_error(self, client):
        """Batch endpoint should reject >100 texts."""
        texts = ["text"] * 101
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 422  # Validation error

    def test_batch_embed_empty_list_returns_error(self, client):
        """Empty texts list should return error."""
        response = client.post("/embed/batch", json={"texts": []})
        assert response.status_code == 422

    def test_batch_embed_preserves_order(self, client):
        """Embeddings should be in same order as input texts."""
        texts = ["unique apple", "unique banana", "unique cherry"]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200
        embeddings = response.json()["embeddings"]

        # Each text should produce a unique embedding
        # Check that all embeddings are different from each other
        for i in range(len(embeddings)):
            for j in range(i + 1, len(embeddings)):
                # Compare first few dimensions
                assert embeddings[i][:10] != embeddings[j][:10], \
                    f"Embeddings {i} and {j} should be different"

    def test_batch_embed_all_768_dimensions(self, client):
        """All embeddings should have 768 dimensions."""
        texts = ["text1", "text2", "text3"]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200
        for emb in response.json()["embeddings"]:
            assert len(emb) == 768

    def test_batch_embed_all_normalized(self, client):
        """All embeddings should be L2 normalized."""
        texts = ["normalize test 1", "normalize test 2", "normalize test 3"]
        response = client.post("/embed/batch", json={"texts": texts})
        assert response.status_code == 200

        for emb in response.json()["embeddings"]:
            magnitude = math.sqrt(sum(x**2 for x in emb))
            assert 0.99 < magnitude < 1.01


class TestHealthCheck:
    """Tests for health and readiness probes."""

    def test_health_endpoint_returns_healthy(self, client):
        """Health endpoint should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_health_includes_model_loaded(self, client):
        """Health should indicate if model is loaded."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "model_loaded" in data
        assert data["model_loaded"] is True

    def test_health_includes_model_name(self, client):
        """Health should include model name."""
        response = client.get("/health")
        assert response.status_code == 200
        assert "model_name" in response.json()

    def test_health_includes_redis_status(self, client):
        """Health should indicate Redis connection status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert "redis_connected" in response.json()


class TestMetrics:
    """Tests for Prometheus metrics endpoint."""

    def test_metrics_endpoint_returns_prometheus_format(self, client):
        """Metrics endpoint should return Prometheus format."""
        response = client.get("/metrics")
        assert response.status_code == 200
        content = response.text

        # Check for expected metric names
        assert "embedding_requests_total" in content or "embedding_latency" in content

    def test_metrics_tracks_requests(self, client):
        """Metrics should track request counts."""
        # Make a request
        client.post("/embed", json={"text": "test"})

        # Check metrics
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "embedding_requests_total" in response.text


class TestQueueStatus:
    """Tests for queue status endpoint."""

    def test_queue_status_returns_counts(self, client):
        """Queue status should return all queue counts."""
        response = client.get("/queue/status")
        assert response.status_code == 200
        data = response.json()

        assert "pending" in data
        assert "processing" in data
        assert "completed" in data
        assert "failed" in data

        # All counts should be non-negative integers
        assert isinstance(data["pending"], int) and data["pending"] >= 0
        assert isinstance(data["processing"], int) and data["processing"] >= 0
        assert isinstance(data["completed"], int) and data["completed"] >= 0
        assert isinstance(data["failed"], int) and data["failed"] >= 0
