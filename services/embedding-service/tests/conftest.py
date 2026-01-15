"""Pytest configuration and fixtures for embedding service tests."""

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="module")
def client():
    """Create a test client for the FastAPI app."""
    from main import app
    with TestClient(app) as c:
        yield c


@pytest_asyncio.fixture
async def async_client():
    """Create an async test client."""
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
