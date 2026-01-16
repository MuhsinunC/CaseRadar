# Embedding Service

High-performance text embedding service using `nomic-ai/nomic-embed-text-v1.5` with automatic GPU/CPU detection and device-optimized batch sizes.

## Performance

| Mode | Throughput | 2M Rows Time | Use Case |
|------|------------|--------------|----------|
| **GPU (MPS)** | 1848/s | 18 min | Primary (Mac Apple Silicon) |
| **GPU (CUDA)** | ~2000/s | ~17 min | Primary (NVIDIA GPU) |
| **CPU (Native)** | 1129/s | 29.5 min | Fallback (no GPU) |

> **Note**: K8s/Docker adds ~30x overhead. Use native Python for CPU workloads.

## Quick Start

```bash
# GPU mode (auto-detects MPS/CUDA)
cd services/embedding-service
python main.py

# CPU mode (force)
PYTORCH_DEVICE=cpu python main.py
```

The service will be available at `http://localhost:8080`.

## Auto-Detection

The service automatically detects the best available device:

1. **MPS** (Mac Apple Silicon) - If `torch.backends.mps.is_available()`
2. **CUDA** (NVIDIA GPU) - If `torch.cuda.is_available()`
3. **CPU** - Fallback

Each device uses optimized batch sizes (benchmarked 2026-01-15):

| Device | Optimal Batch Size | Notes |
|--------|-------------------|-------|
| MPS | 100 | Best for Apple Silicon |
| CUDA | 100 | Best for NVIDIA GPUs |
| CPU | 256 | Larger batches optimal for CPU |

## API Endpoints

### Health Check
```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_name": "nomic-ai/nomic-embed-text-v1.5",
  "device": "mps",
  "batch_size": 100,
  "redis_connected": false,
  "dlq_enabled": true
}
```

### Single Embedding
```bash
curl -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text here"}'
```

### Batch Embedding
```bash
curl -X POST http://localhost:8080/embed/batch \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Text 1", "Text 2", "Text 3"]}'
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTORCH_DEVICE` | auto | Force device: `cpu`, `cuda`, or `mps` |
| `MAX_BATCH_SIZE` | auto | Override batch size (device-optimized if not set) |
| `EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | HuggingFace model |
| `REDIS_URL` | `redis://localhost:6379` | Redis for caching (optional) |
| `DLQ_ENABLED` | `true` | Enable dead letter queue |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Embedding Service                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌────────────────────────────────┐ │
│  │  Device Detector │───▶│  Optimal Batch Size Selector   │ │
│  │  MPS > CUDA > CPU│    │  GPU=100, CPU=256              │ │
│  └──────────────────┘    └────────────────────────────────┘ │
│            │                                                 │
│            ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              nomic-embed-text-v1.5                    │   │
│  │              768-dimensional vectors                   │   │
│  │              Sentence-transformers backend             │   │
│  └──────────────────────────────────────────────────────┘   │
│            │                                                 │
│            ▼                                                 │
│  ┌──────────────────┐    ┌────────────────────────────────┐ │
│  │  Redis Cache     │    │  Dead Letter Queue (DLQ)       │ │
│  │  (Optional)      │    │  Failed embeddings stored      │ │
│  └──────────────────┘    └────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Benchmark Results

### Batch Size Optimization (CPU, 2000 texts)

| Batch Size | Throughput |
|------------|------------|
| 32 | 377/s |
| 64 | 474/s |
| 100 | 509/s |
| 128 | 541/s |
| **256** | **560/s** |

### Sustained Load (CPU, 50k texts)

Single process with batch_size=256 achieves **1129 texts/sec**.

### GPU vs CPU Comparison

| Setup | Throughput | Overhead |
|-------|------------|----------|
| GPU (MPS Native) | 1848/s | Baseline |
| CPU (Native) | 1129/s | 1.6x slower |
| K8s/Docker (CPU) | 36.8/s | 30x slower |

## Development

### Running Tests

```bash
# Integration tests
pytest tests/test_integration.py -v

# Load tests
pytest tests/test_load.py -v
```

### Starting for Development

```bash
# With auto-reload
uvicorn main:app --reload --port 8080

# Production mode
python main.py
```

## Integration with CaseRadar

The main application uses the embedding service via the resilient client chain:

```
Pipeline → complaintEmbedder → resilient-client → scalable-client → Embedding Service
```

Configure via `EMBEDDING_SERVICE_URL` environment variable (default: `http://localhost:8080`).
