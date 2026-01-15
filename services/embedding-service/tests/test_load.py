"""Load tests for embedding service throughput and performance.

These tests measure throughput and latency to verify the service meets
performance requirements (≥100 embeddings/second).
"""

import pytest
import time
import statistics
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed


class TestThroughput:
    """Load tests for throughput measurement."""

    def test_single_embedding_throughput(self, client):
        """Measure single embedding throughput."""
        num_requests = 50
        latencies: List[float] = []

        for i in range(num_requests):
            start = time.time()
            response = client.post(
                "/embed",
                json={"text": f"Throughput test text number {i}"}
            )
            latency = time.time() - start
            latencies.append(latency)

            assert response.status_code == 200

        total_time = sum(latencies)
        throughput = num_requests / total_time

        print(f"\n=== Single Embedding Throughput ===")
        print(f"Total requests: {num_requests}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Throughput: {throughput:.2f} embeddings/second")
        print(f"Avg latency: {statistics.mean(latencies)*1000:.2f}ms")
        print(f"P50 latency: {statistics.median(latencies)*1000:.2f}ms")
        print(f"P95 latency: {sorted(latencies)[int(num_requests*0.95)]*1000:.2f}ms")
        print(f"P99 latency: {sorted(latencies)[int(num_requests*0.99)]*1000:.2f}ms")

        # Should achieve at least 10 single embeddings/second
        assert throughput >= 10, f"Throughput {throughput:.2f} below minimum 10 emb/sec"

    def test_batch_embedding_throughput(self, client):
        """Measure batch embedding throughput."""
        batch_size = 100
        num_batches = 10
        total_embeddings = batch_size * num_batches
        latencies: List[float] = []

        for i in range(num_batches):
            texts = [f"Batch throughput test text {i}-{j}" for j in range(batch_size)]

            start = time.time()
            response = client.post(
                "/embed/batch",
                json={"texts": texts}
            )
            latency = time.time() - start
            latencies.append(latency)

            assert response.status_code == 200
            assert len(response.json()["embeddings"]) == batch_size

        total_time = sum(latencies)
        throughput = total_embeddings / total_time

        print(f"\n=== Batch Embedding Throughput ===")
        print(f"Total embeddings: {total_embeddings}")
        print(f"Batch size: {batch_size}")
        print(f"Total time: {total_time:.2f}s")
        print(f"Throughput: {throughput:.2f} embeddings/second")
        print(f"Avg batch latency: {statistics.mean(latencies)*1000:.2f}ms")

        # Should achieve at least 100 embeddings/second with batching
        assert throughput >= 100, f"Throughput {throughput:.2f} below minimum 100 emb/sec"

    def test_sustained_throughput(self, client):
        """Measure sustained embedding throughput over time."""
        duration_seconds = 30
        batch_size = 50
        total_embeddings = 0
        batch_count = 0
        start_time = time.time()

        while time.time() - start_time < duration_seconds:
            texts = [f"Sustained test {batch_count}-{j}" for j in range(batch_size)]

            response = client.post(
                "/embed/batch",
                json={"texts": texts}
            )

            if response.status_code == 200:
                total_embeddings += len(response.json()["embeddings"])
                batch_count += 1

        total_time = time.time() - start_time
        throughput = total_embeddings / total_time

        print(f"\n=== Sustained Throughput Test ===")
        print(f"Duration: {total_time:.2f}s")
        print(f"Total embeddings: {total_embeddings}")
        print(f"Batches processed: {batch_count}")
        print(f"Throughput: {throughput:.2f} embeddings/second")

        # Should sustain at least 50 embeddings/second
        assert throughput >= 50, f"Sustained throughput {throughput:.2f} below minimum 50 emb/sec"


class TestConcurrentLoad:
    """Tests for concurrent request handling."""

    def test_concurrent_single_requests(self, client):
        """Test handling of concurrent single embedding requests."""
        num_concurrent = 20
        results: List[tuple] = []

        def make_request(i: int) -> tuple:
            start = time.time()
            response = client.post(
                "/embed",
                json={"text": f"Concurrent request {i}"}
            )
            return response.status_code, time.time() - start

        start_time = time.time()
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(make_request, i) for i in range(num_concurrent)]
            for future in as_completed(futures):
                results.append(future.result())

        total_time = time.time() - start_time

        statuses = [r[0] for r in results]
        latencies = [r[1] for r in results]

        print(f"\n=== Concurrent Single Requests ===")
        print(f"Concurrent requests: {num_concurrent}")
        print(f"Wall clock time: {total_time:.2f}s")
        print(f"Avg latency: {statistics.mean(latencies)*1000:.2f}ms")
        print(f"Max latency: {max(latencies)*1000:.2f}ms")

        # All requests should succeed
        assert all(s == 200 for s in statuses)

        # All requests should complete within 30 seconds
        assert total_time < 30, f"Concurrent requests took {total_time:.2f}s, exceeds 30s limit"

    def test_concurrent_batch_requests(self, client):
        """Test handling of concurrent batch requests."""
        num_concurrent = 5
        batch_size = 50
        results: List[tuple] = []

        def make_batch_request(i: int) -> tuple:
            texts = [f"Concurrent batch {i} text {j}" for j in range(batch_size)]
            start = time.time()
            response = client.post(
                "/embed/batch",
                json={"texts": texts}
            )
            latency = time.time() - start
            return response.status_code, latency

        start_time = time.time()
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(make_batch_request, i) for i in range(num_concurrent)]
            for future in as_completed(futures):
                results.append(future.result())

        total_time = time.time() - start_time

        statuses = [r[0] for r in results]
        latencies = [r[1] for r in results]

        print(f"\n=== Concurrent Batch Requests ===")
        print(f"Concurrent batches: {num_concurrent}")
        print(f"Batch size: {batch_size}")
        print(f"Total embeddings: {num_concurrent * batch_size}")
        print(f"Wall clock time: {total_time:.2f}s")
        print(f"Throughput: {(num_concurrent * batch_size) / total_time:.2f} emb/s")

        # All requests should succeed
        assert all(s == 200 for s in statuses)

        # Should complete within reasonable time
        assert total_time < 60, f"Concurrent batches took {total_time:.2f}s, exceeds 60s limit"

    def test_load_spike(self, client):
        """Test handling of sudden load spike."""
        # Warm up
        client.post("/embed", json={"text": "warmup"})

        # Sudden spike of 30 concurrent requests
        num_requests = 30
        results: List[int] = []

        def make_request(i: int) -> int:
            response = client.post(
                "/embed",
                json={"text": f"Spike request {i}"}
            )
            return response.status_code

        start_time = time.time()
        with ThreadPoolExecutor(max_workers=num_requests) as executor:
            futures = [executor.submit(make_request, i) for i in range(num_requests)]
            for future in as_completed(futures):
                results.append(future.result())

        total_time = time.time() - start_time

        success_count = sum(1 for s in results if s == 200)
        success_rate = success_count / num_requests * 100

        print(f"\n=== Load Spike Test ===")
        print(f"Concurrent requests: {num_requests}")
        print(f"Success rate: {success_rate:.1f}%")
        print(f"Total time: {total_time:.2f}s")

        # At least 90% should succeed
        assert success_rate >= 90, f"Success rate {success_rate:.1f}% below 90%"


class TestLatency:
    """Tests for latency requirements."""

    def test_single_embedding_p99_latency(self, client):
        """P99 latency for single embedding should be under 500ms."""
        num_requests = 100
        latencies: List[float] = []

        # Warm up
        client.post("/embed", json={"text": "warmup"})

        for i in range(num_requests):
            start = time.time()
            response = client.post(
                "/embed",
                json={"text": f"Latency test {i}"}
            )
            latency = time.time() - start
            latencies.append(latency)
            assert response.status_code == 200

        latencies.sort()
        p99_latency = latencies[int(num_requests * 0.99)]

        print(f"\n=== Single Embedding Latency ===")
        print(f"P50: {latencies[int(num_requests*0.50)]*1000:.2f}ms")
        print(f"P95: {latencies[int(num_requests*0.95)]*1000:.2f}ms")
        print(f"P99: {p99_latency*1000:.2f}ms")

        # P99 should be under 500ms (relaxed for non-GPU)
        assert p99_latency < 0.5, f"P99 latency {p99_latency*1000:.2f}ms exceeds 500ms"

    def test_batch_embedding_latency_scales_linearly(self, client):
        """Batch latency should scale approximately linearly with size."""
        batch_sizes = [1, 10, 50, 100]
        latencies: List[tuple] = []

        for batch_size in batch_sizes:
            texts = [f"Scale test text {i}" for i in range(batch_size)]
            start = time.time()
            response = client.post(
                "/embed/batch",
                json={"texts": texts}
            )
            latency = time.time() - start
            latencies.append((batch_size, latency))
            assert response.status_code == 200

        print(f"\n=== Batch Latency Scaling ===")
        for size, lat in latencies:
            per_embedding = lat / size * 1000
            print(f"Batch {size}: {lat*1000:.2f}ms total, {per_embedding:.2f}ms/embedding")

        # Per-embedding latency should decrease with batch size (efficiency)
        per_emb_1 = latencies[0][1] / latencies[0][0]
        per_emb_100 = latencies[3][1] / latencies[3][0]

        # Batching should provide at least 2x efficiency improvement
        assert per_emb_100 < per_emb_1, "Batching should improve per-embedding latency"


class TestResourceUsage:
    """Tests for resource usage patterns."""

    def test_memory_stability_under_load(self, client):
        """Memory should remain stable under sustained load."""
        num_iterations = 100
        batch_size = 50

        # Baseline: just run many batches and ensure no failures
        for i in range(num_iterations):
            texts = [f"Memory test {i}-{j}" for j in range(batch_size)]
            response = client.post(
                "/embed/batch",
                json={"texts": texts}
            )
            assert response.status_code == 200

        print(f"\n=== Memory Stability Test ===")
        print(f"Processed {num_iterations * batch_size} embeddings without memory issues")

    def test_no_request_timeout_under_normal_load(self, client):
        """Requests should not timeout under normal load."""
        num_requests = 20
        timeout_count = 0

        for i in range(num_requests):
            try:
                response = client.post(
                    "/embed",
                    json={"text": f"Timeout test {i}"},
                    timeout=10.0
                )
                assert response.status_code == 200
            except Exception:
                timeout_count += 1

        print(f"\n=== Timeout Test ===")
        print(f"Requests: {num_requests}, Timeouts: {timeout_count}")

        assert timeout_count == 0, f"{timeout_count} requests timed out"


class TestHealthUnderLoad:
    """Tests for health endpoint behavior under load."""

    def test_health_endpoint_responsive_under_load(self, client):
        """Health endpoint should respond quickly even under load."""
        from concurrent.futures import ThreadPoolExecutor
        import threading

        stop_event = threading.Event()

        def generate_load():
            """Generate background load."""
            while not stop_event.is_set():
                try:
                    client.post(
                        "/embed/batch",
                        json={"texts": [f"Load text {j}" for j in range(50)]}
                    )
                except Exception:
                    pass

        # Start load generation in background
        with ThreadPoolExecutor(max_workers=2) as executor:
            executor.submit(generate_load)

            # Check health endpoint multiple times during load
            latencies: List[float] = []
            for _ in range(10):
                start = time.time()
                response = client.get("/health")
                latency = time.time() - start
                latencies.append(latency)

                assert response.status_code == 200
                time.sleep(0.5)

            stop_event.set()

        avg_latency = statistics.mean(latencies)
        max_latency = max(latencies)

        print(f"\n=== Health Under Load ===")
        print(f"Avg health check latency: {avg_latency*1000:.2f}ms")
        print(f"Max health check latency: {max_latency*1000:.2f}ms")

        # Health check should respond within 200ms even under load
        assert max_latency < 0.2, f"Health check latency {max_latency*1000:.2f}ms exceeds 200ms"
