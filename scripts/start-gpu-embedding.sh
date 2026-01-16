#!/bin/bash
# Start embedding service with Mac GPU (Metal/MPS)
# This runs OUTSIDE of Kubernetes for maximum performance

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Create venv if it doesn't exist
VENV_DIR="$PROJECT_ROOT/.venv-gpu"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install dependencies
source "$VENV_DIR/bin/activate"
pip install --quiet torch sentence-transformers fastapi uvicorn redis prometheus_client pydantic numpy einops

# Set GPU device
export PYTORCH_DEVICE=mps
export MODEL_NAME=nomic-ai/nomic-embed-text-v1.5
export MAX_BATCH_SIZE=500
export EMBEDDING_WORKERS=1

echo ""
echo "=== GPU Embedding Service ==="
echo "Device: MPS (Mac Metal)"
echo "Model: $MODEL_NAME"
echo "Port: 8080"
echo ""

cd "$PROJECT_ROOT/services/embedding-service"
python main.py
