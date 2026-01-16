# K8s Startup Speedrun - Beat 17 Seconds

## Current Baseline
- **Fast deploy trigger**: 2 seconds
- **Pod ready after trigger**: 15-17 seconds
- **Total iteration time**: ~17-19 seconds

## The Challenge
Every second saved multiplies across hundreds of iterations. Target: **<10 seconds total**.

## Startup Time Breakdown (Current)

| Phase | Time | Bottleneck | Optimization Potential |
|-------|------|------------|------------------------|
| Docker build | 3s | Layer cache | Already optimized |
| kubectl apply | <1s | API latency | Minimal |
| Container create | 2s | Docker overhead | Use containerd |
| Python startup | 3s | Import time | Lazy imports |
| Model load | 8-10s | Disk I/O + RAM | **HIGHEST** |
| Probe pass | 5s | Initial delay | Already optimized |

**Total pod startup: ~15-17s. Model loading is 50%+ of this.**

## Optimization Ideas (Ranked by Impact)

### Tier 1: High Impact (could save 5-10s)

#### 1. Bake Model into Docker Image
**Idea**: Pre-download model during `docker build` instead of runtime.
**Pros**: No model download/load from PVC at startup
**Cons**: Larger image (~1GB), slower first build
**Potential savings**: 5-8 seconds

```dockerfile
# Add to Dockerfile
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('nomic-ai/nomic-embed-text-v1.5')"
```

#### 2. Memory-Mapped Model Loading
**Idea**: Use mmap to load model directly into memory without copying.
**Pros**: Near-instant model "loading" (just mapping, no copy)
**Cons**: May be slower on first inference
**Potential savings**: 3-5 seconds

```python
# sentence-transformers doesn't directly support mmap
# but torch does for model weights
torch.load('model.pt', mmap=True)
```

#### 3. Lazy Model Loading with Immediate Ready
**Idea**: Mark pod as ready immediately, load model in background.
**Pros**: Pod ready in <3s, model loads async
**Cons**: First requests fail or queue, need careful probe design
**Potential savings**: 10+ seconds (but tradeoff)

```python
model = None  # Load lazily on first request

@app.on_event("startup")
async def startup():
    asyncio.create_task(load_model_background())

@app.get("/health")
def health():
    return {"status": "ready"}  # Always ready, even without model
```

### Tier 2: Medium Impact (could save 2-5s)

#### 4. Pre-warmed Spare Pods
**Idea**: Keep 1-2 extra pods always running and swap traffic.
**Pros**: Zero-downtime deploys with pre-warmed model
**Cons**: Uses more resources
**Potential savings**: 15s (pod swap is instant)

#### 5. Reduce Container Image Size
**Idea**: Use slim base, remove unnecessary packages.
**Current**: python:3.11-slim (~150MB)
**Target**: distroless or alpine (~50MB)
**Potential savings**: 1-2 seconds

#### 6. Use containerd Instead of Docker
**Idea**: Minikube with containerd runtime is faster.
**Potential savings**: 1-2 seconds

### Tier 3: Low Impact (<2s)

#### 7. Parallel Python Imports
**Idea**: Import heavy modules in parallel threads.
**Potential savings**: 0.5-1 second

#### 8. Reduce Termination Grace Period
**Current**: 30 seconds
**Target**: 5 seconds
**Potential savings**: Only affects rollout, not pod startup

#### 9. Pre-fetch Dependencies
**Idea**: All pip packages already installed in image (done).
**Status**: Already implemented

## Test Matrix

| Optimization | Baseline | After | Savings | Keep? |
|--------------|----------|-------|---------|-------|
| PVC model (baseline) | - | 11.8s | - | - |
| Model baked in image | 11.8s | 9.9-16s | Variable | YES |
| Lazy loading (pod responding) | 11.8s | **4.9s** | 6.9s | YES |
| Lazy loading (model ready) | 11.8s | 10.0s | 1.8s | YES |

## Best Configuration Found

**Lazy loading + baked model:**
- Pod responds to health checks in **4.9 seconds**
- Model fully loaded and ready for traffic in **10.0 seconds**

**Kubernetes probe configuration:**
- livenessProbe: `/health` (passes immediately when app starts)
- readinessProbe: `/ready` (passes only when model is loaded)

## GPU vs CPU Benchmark (2026-01-15)

| Setup | Throughput | Time for 2M rows |
|-------|------------|------------------|
| K8s pod (CPU, single) | 36.8 texts/sec | 15+ hours |
| K8s pods (CPU, ~14 pods) | ~500 texts/sec | ~67 min |
| Mac GPU (initial) | 655 texts/sec | ~51 min |
| **Mac GPU (optimized)** | **1762-1848 texts/sec** | **~19 min** |

**Key Finding:** Mac GPU (Metal/MPS) provides **48x speedup** over CPU!

### Optimal GPU Configuration
- **Batch size:** 100 (1848/s) - larger batches are slower
- **Precision:** fp32 (fp16 is slower on MPS)
- **Threads:** 1-2 (more threads don't help much)
- **Memory usage:** ~541 MB GPU RAM

### Recommendations

1. **For best performance**: Run embedding service directly on Mac with GPU
   ```bash
   ./scripts/start-gpu-embedding.sh
   ```

2. **For K8s scaling**: Need ~14 CPU pods to match single GPU
   - High pod count = high memory usage (14 × 1GB = 14GB)
   - GPU is more efficient (1 process, same speed)

3. **Code changes made**:
   - Added GPU auto-detection (MPS > CUDA > CPU)
   - Added `PYTORCH_DEVICE` env var override
   - GPU script: `scripts/start-gpu-embedding.sh`

## Implementation Plan

### Phase 1: Measure Precise Baseline
```bash
# Time from deploy to first successful request
time ./scripts/k8s-fast-deploy.sh && \
  until curl -s http://$(minikube ip):30080/health | grep -q ready; do sleep 0.5; done
```

### Phase 2: Try Model-in-Image
1. Modify Dockerfile to download model at build time
2. Rebuild image
3. Measure new startup time

### Phase 3: Try Lazy Loading
1. Modify main.py to load model in background
2. Add a separate /ready endpoint that checks model status
3. Use /health for liveness, /ready for readiness

### Phase 4: Combine Best Approaches
Stack the optimizations that work.

## Progress Log

### Attempt 1: Baseline Measurement
[TO BE FILLED]

### Attempt 2: Model-in-Image
[TO BE FILLED]

### Attempt 3: Lazy Loading
[TO BE FILLED]
