"""Integration tests for embedding service queue and async processing.

NOTE: These tests require Redis to be running. Tests that require Redis
will be skipped automatically if Redis is not available.
"""

import pytest
import pytest_asyncio
import asyncio
import uuid


async def check_redis_available(async_client) -> bool:
    """Check if Redis is connected."""
    response = await async_client.get("/health")
    if response.status_code == 200:
        return response.json().get("redis_connected", False)
    return False


@pytest_asyncio.fixture
async def skip_without_redis(async_client):
    """Skip test if Redis is not available."""
    if not await check_redis_available(async_client):
        pytest.skip("Redis not available - skipping integration test")


class TestAsyncJobSubmission:
    """Tests for async job submission and processing."""

    @pytest.mark.asyncio
    async def test_submit_async_job_returns_job_id(self, async_client, skip_without_redis):
        """Async submission should return a job ID."""
        response = await async_client.post(
            "/embed/async",
            json={"texts": ["test text 1", "test text 2"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert data["queue_position"] >= 0

    @pytest.mark.asyncio
    async def test_submit_async_job_with_callback(self, async_client, skip_without_redis):
        """Async submission should accept callback URL."""
        response = await async_client.post(
            "/embed/async",
            json={
                "texts": ["test text"],
                "callback_url": "https://example.com/callback"
            }
        )
        assert response.status_code == 200
        assert "job_id" in response.json()

    @pytest.mark.asyncio
    async def test_submit_async_job_with_priority(self, async_client, skip_without_redis):
        """Async submission should accept priority."""
        response = await async_client.post(
            "/embed/async",
            json={
                "texts": ["test text"],
                "priority": 5
            }
        )
        assert response.status_code == 200
        assert "job_id" in response.json()


class TestJobStatusPolling:
    """Tests for job status polling."""

    @pytest.mark.asyncio
    async def test_get_job_status_queued(self, async_client, skip_without_redis):
        """Should return queued status for new job."""
        # Submit a job
        submit_response = await async_client.post(
            "/embed/async",
            json={"texts": ["test text"]}
        )
        job_id = submit_response.json()["job_id"]

        # Check status immediately
        status_response = await async_client.get(f"/embed/job/{job_id}")
        assert status_response.status_code == 200
        data = status_response.json()
        assert data["job_id"] == job_id
        assert data["status"] in ["queued", "processing", "completed"]

    @pytest.mark.asyncio
    async def test_get_job_status_not_found(self, async_client, skip_without_redis):
        """Should return 404 for non-existent job."""
        fake_job_id = str(uuid.uuid4())
        response = await async_client.get(f"/embed/job/{fake_job_id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_job_completes_with_embeddings(self, async_client, skip_without_redis):
        """Job should eventually complete with embeddings."""
        # Submit a job
        submit_response = await async_client.post(
            "/embed/async",
            json={"texts": ["test text 1", "test text 2"]}
        )
        job_id = submit_response.json()["job_id"]

        # Poll for completion (with timeout)
        for _ in range(30):  # Max 30 seconds
            status_response = await async_client.get(f"/embed/job/{job_id}")
            data = status_response.json()

            if data["status"] == "completed":
                assert data["progress"] == 100
                assert "embeddings" in data
                assert len(data["embeddings"]) == 2
                assert len(data["embeddings"][0]) == 768
                return

            if data["status"] == "failed":
                pytest.fail(f"Job failed: {data.get('error')}")

            await asyncio.sleep(1)

        pytest.fail("Job did not complete within timeout")


class TestQueueStatus:
    """Tests for queue status endpoint."""

    @pytest.mark.asyncio
    async def test_queue_status_returns_all_counts(self, async_client):
        """Queue status should return all queue counts."""
        response = await async_client.get("/queue/status")
        assert response.status_code == 200
        data = response.json()

        assert "pending" in data
        assert "processing" in data
        assert "completed" in data
        assert "failed" in data
        assert "dlq" in data

        # All counts should be non-negative integers
        for key in ["pending", "processing", "completed", "failed", "dlq"]:
            assert isinstance(data[key], int)
            assert data[key] >= 0

    @pytest.mark.asyncio
    async def test_queue_depth_increases_with_jobs(self, async_client, skip_without_redis):
        """Queue should track submitted jobs."""
        # Get initial queue status
        initial_response = await async_client.get("/queue/status")
        initial_pending = initial_response.json()["pending"]
        initial_completed = initial_response.json()["completed"]

        # Submit multiple jobs
        for i in range(3):
            await async_client.post(
                "/embed/async",
                json={"texts": [f"test text {i}"]}
            )

        # Wait briefly for queue to process
        await asyncio.sleep(2)

        # Check queue status again
        final_response = await async_client.get("/queue/status")
        final_data = final_response.json()

        # Either pending increased or completed increased (jobs processed)
        total_initial = initial_pending + initial_completed
        total_final = final_data["pending"] + final_data["completed"]
        assert total_final >= total_initial


class TestRetryMechanism:
    """Tests for retry mechanism and DLQ."""

    @pytest.mark.asyncio
    async def test_job_status_includes_retry_count(self, async_client, skip_without_redis):
        """Job status should include retry count."""
        # Submit a job
        submit_response = await async_client.post(
            "/embed/async",
            json={"texts": ["test"]}
        )
        job_id = submit_response.json()["job_id"]

        # Check status
        status_response = await async_client.get(f"/embed/job/{job_id}")
        data = status_response.json()

        assert "retry_count" in data
        assert isinstance(data["retry_count"], int)
        assert data["retry_count"] >= 0

    @pytest.mark.asyncio
    async def test_dlq_endpoint_returns_list(self, async_client, skip_without_redis):
        """DLQ endpoint should return a list of failed jobs."""
        response = await async_client.get("/dlq")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestHealthWithRedis:
    """Tests for health endpoint with Redis integration."""

    @pytest.mark.asyncio
    async def test_health_includes_redis_status(self, async_client):
        """Health should report Redis connection status."""
        response = await async_client.get("/health")
        assert response.status_code == 200
        data = response.json()

        assert "redis_connected" in data
        assert isinstance(data["redis_connected"], bool)

    @pytest.mark.asyncio
    async def test_health_includes_dlq_status(self, async_client):
        """Health should report DLQ enabled status."""
        response = await async_client.get("/health")
        assert response.status_code == 200
        data = response.json()

        assert "dlq_enabled" in data
        assert isinstance(data["dlq_enabled"], bool)


class TestConcurrentJobProcessing:
    """Tests for concurrent job processing."""

    @pytest.mark.asyncio
    async def test_multiple_concurrent_jobs(self, async_client, skip_without_redis):
        """Should handle multiple concurrent job submissions."""
        # Submit 5 jobs concurrently
        tasks = []
        for i in range(5):
            task = async_client.post(
                "/embed/async",
                json={"texts": [f"concurrent test {i}"]}
            )
            tasks.append(task)

        responses = await asyncio.gather(*tasks)

        # All submissions should succeed
        job_ids = []
        for response in responses:
            assert response.status_code == 200
            job_ids.append(response.json()["job_id"])

        # Wait for completion
        await asyncio.sleep(5)

        # Check all jobs completed or are processing
        for job_id in job_ids:
            status_response = await async_client.get(f"/embed/job/{job_id}")
            assert status_response.status_code == 200
            status = status_response.json()["status"]
            assert status in ["queued", "processing", "completed"]

    @pytest.mark.asyncio
    async def test_large_batch_async_job(self, async_client, skip_without_redis):
        """Should handle large batch async job."""
        # Submit a job with 50 texts
        texts = [f"large batch text {i}" for i in range(50)]
        response = await async_client.post(
            "/embed/async",
            json={"texts": texts}
        )
        assert response.status_code == 200
        job_id = response.json()["job_id"]

        # Poll for completion (with longer timeout for large batch)
        for _ in range(60):  # Max 60 seconds
            status_response = await async_client.get(f"/embed/job/{job_id}")
            data = status_response.json()

            if data["status"] == "completed":
                assert len(data["embeddings"]) == 50
                return

            if data["status"] == "failed":
                pytest.fail(f"Job failed: {data.get('error')}")

            await asyncio.sleep(1)

        pytest.fail("Large batch job did not complete within timeout")
