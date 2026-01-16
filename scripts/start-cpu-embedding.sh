#!/bin/bash
# Start embedding service on CPU with configurable workers
# Usage: ./scripts/start-cpu-embedding.sh [num_workers]

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

NUM_WORKERS=${1:-4}

# Create venv if it doesn't exist
VENV_DIR="$PROJECT_ROOT/.venv-cpu"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --quiet torch sentence-transformers fastapi uvicorn redis prometheus_client pydantic numpy einops
else
    source "$VENV_DIR/bin/activate"
fi

# Force CPU device
export PYTORCH_DEVICE=cpu
export MODEL_NAME=nomic-ai/nomic-embed-text-v1.5
export MAX_BATCH_SIZE=100
export EMBEDDING_WORKERS=$NUM_WORKERS

echo ""
echo "=== CPU Embedding Service ==="
echo "Device: CPU"
echo "Workers: $NUM_WORKERS"
echo "Model: $MODEL_NAME"
echo "Port: 8080"
echo ""

cd "$PROJECT_ROOT/services/embedding-service"

# Use uvicorn with multiple workers
if [ "$NUM_WORKERS" -gt 1 ]; then
    echo "Starting uvicorn with $NUM_WORKERS workers..."
    # Disable Prometheus for multi-worker mode
    export EMBEDDING_WORKERS=1  # Each uvicorn worker is 1 embedding worker
    uvicorn main:app --host 0.0.0.0 --port 8080 --workers $NUM_WORKERS
else
    echo "Starting single worker..."
    python main.py
fi
