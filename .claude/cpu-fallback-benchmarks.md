# CPU Fallback Benchmark Results

## Test Environment
- Machine: Mac (Apple Silicon)
- Minikube: Docker driver, 12 CPUs, 60GB RAM
- Model: nomic-ai/nomic-embed-text-v1.5
- Precision: fp32 (full precision)

## Baseline (Already Measured)

| Setup | Throughput | Notes |
|-------|------------|-------|
| GPU (MPS) | 1848 texts/sec | Primary path, optimal |
| K8s 1 pod (Docker) | 36.8 texts/sec | Docker overhead significant |

## K8s Multi-Pod Benchmarks

**NOTE:** Docker not running. K8s benchmarks pending.

| Pods | Workers/Pod | Total Workers | Throughput | Memory | Notes |
|------|-------------|---------------|------------|--------|-------|
| 1 | 1 | 1 | 36.8/s | 1GB | Baseline (measured earlier) |
| 2 | 1 | 2 | TBD | 2GB | Docker required |
| 4 | 1 | 4 | TBD | 4GB | Docker required |
| 8 | 1 | 8 | TBD | 8GB | Docker required |

## Single Server Multi-Process Benchmarks (NATIVE - No Docker)

**Batch size optimization (2000 texts):**
| Batch Size | Throughput |
|------------|------------|
| 32 | 377/s |
| 64 | 474/s |
| 100 | 509/s |
| 128 | 541/s |
| **256** | **560/s** |

**Worker scaling (10k texts, batch_size=256):**
| Workers/Threads | Throughput | Notes |
|-----------------|------------|-------|
| 1 thread | 625/s | Baseline |
| 2 threads | 724/s | +16% |
| **4 threads** | **812/s** | **+30% optimal** |
| 8 threads | 787/s | Diminishing returns |

**Sustained load (50k texts):**
| Config | Throughput | 2M Rows Time |
|--------|------------|--------------|
| Single process, batch 256 | **1129/s** | **29.5 min** |

## Comparison Summary

| Architecture | Best Config | Throughput | 2M Rows | Memory | Complexity |
|--------------|-------------|------------|---------|--------|------------|
| K8s Multi-Pod (Docker) | 1 pod | 36.8/s | 15+ hrs | 1GB | Higher |
| **Single Server (Native)** | **batch=256** | **1129/s** | **29.5 min** | **~1GB** | **Lower** |

## Winner

**Single Server (Native Python)** is the clear winner for CPU fallback.

## Rationale

1. **30x faster**: Native runs at 1129/s vs K8s/Docker at 36.8/s
2. **Simpler**: No Docker, no K8s orchestration overhead
3. **Same memory**: Both use ~1GB per model instance
4. **Easier deployment**: Just run Python directly

The Docker/Kubernetes overhead is significant (~30x slower). For development and CPU fallback, native Python is superior.

## Optimal CPU Configuration

```python
# Best CPU settings
device = "cpu"
batch_size = 256
normalize_embeddings = True  # If needed for downstream

# For maximum throughput
model.encode(texts, batch_size=256, show_progress_bar=False)
```

## Final Performance Summary

| Mode | Throughput | 2M Rows Time | Use Case |
|------|------------|--------------|----------|
| **GPU (MPS)** | **1848/s** | **18 min** | Primary (when GPU available) |
| **CPU (Native)** | **1129/s** | **29.5 min** | Fallback (no GPU) |
| K8s (Docker) | 36.8/s | 15+ hrs | Not recommended |
