# K8s Embedding Service Optimization Plan

## Performance Baseline to Beat
- **Previous single-server performance**: ~500 requests/second
- **Dataset size**: 2 million rows
- **Target time**: 60 minutes (~33,333 texts/minute = ~556 texts/second)

## Current K8s Configuration Analysis

### Why K8s Pod Startup is Slow

| Factor | Current Value | Impact | Notes |
|--------|--------------|--------|-------|
| Image Pull | ~40-60s | HIGH | Need to pre-pull or use local images |
| Model Download | ~30-120s | VERY HIGH | HuggingFace model needs to download on first pod |
| Startup Probe | 10s + 60 retries | HIGH | Allows up to 10 min for model load |
| Readiness Probe | 60s initial delay | MEDIUM | Waits before marking ready |
| Container Creation | ~2-5s | LOW | Docker overhead |

### Total Potential Startup Time: 2-3 minutes per pod

This is unacceptable for rapid scaling. The biggest bottlenecks:
1. **Model Download** - Each pod downloads the model if not cached
2. **Startup Probe Timeout** - Waiting for model to load

## Optimization Checklist

### Phase 1: Pod Startup Speed

- [ ] **Pre-download model to PVC** - Store model on shared PVC so new pods don't download
- [ ] **Reduce startup probe delays** - Lower `initialDelaySeconds` once model is cached
- [ ] **Image caching** - Ensure image is pre-built in minikube docker
- [ ] **Resource pre-allocation** - Ensure requests match actual usage

### Phase 2: Per-Pod Parallelization

Currently: `EMBEDDING_WORKERS=1` (single worker per pod)

Options:
- [ ] **Increase EMBEDDING_WORKERS** to 2-4 per pod
- [ ] **Test with gunicorn** instead of uvicorn for better multi-process handling
- [ ] **Use torch.set_num_threads()** to control CPU parallelism

Trade-offs:
- More workers = more RAM per pod (each loads model)
- More workers = better CPU utilization per pod
- Fewer pods needed but higher memory usage

### Phase 3: HPA Tuning

- [ ] **Lower scale-up stabilization** to 0s (done)
- [ ] **Set optimal maxReplicas** based on actual resource limits
- [ ] **CPU target** at 90% (done)
- [ ] **Enable custom metrics** for queue depth if using async jobs

### Phase 4: Batch Processing Optimization

- [ ] **Increase MAX_BATCH_SIZE** from 100 to 500 (matches previous optimization)
- [ ] **Dynamic batching** - accumulate requests before processing
- [ ] **Async processing** - use job queue for large batches

## Benchmark Recording Table

| Config | Pods | Workers/Pod | Batch Size | Throughput (texts/sec) | CPU % | RAM % | Notes |
|--------|------|-------------|------------|------------------------|-------|-------|-------|
| Single pod | 1 | 1 | 100 | 21.3 | ~7% | ~1% | Baseline |
| HPA auto-scale | 12 | 1 | 100 | 64.7 | ~25% | ~12% | 120 connections |
| HPA (uneven load) | 12 | 1 | 100 | 56.9 | ~25% | ~12% | 50 connections |
| Multi-worker | 1 | 4 | 100 | FAILED | - | - | Prometheus collision |
| **Target** | - | - | - | **500+** | 90% | - | Original benchmark |

## Key Findings

### Current Performance Gap
- **Single pod throughput**: 21.3 texts/sec
- **12 pods (HPA max)**: 64.7 texts/sec
- **Target**: 500 texts/sec
- **Gap**: ~8x slower than target

### Root Causes
1. **Single-worker bottleneck**: Each pod runs 1 uvicorn worker, processing batches sequentially
2. **model.encode() is CPU-bound**: Takes ~4.7s per 100-text batch
3. **Multi-worker blocked**: Prometheus metrics collision prevents EMBEDDING_WORKERS > 1
4. **Load balancing**: HTTP keep-alive causes uneven pod distribution (fixed with force_close=True)

### Why Original Benchmark Was Faster
The original 500 texts/sec was achieved with multi-process workers (4-8 workers per server).
Each worker loads the model independently and processes requests in parallel.
K8s HPA + single-worker per pod cannot match this without fixing the Prometheus issue.

## Implementation Steps

### Step 1: Pre-download Model to PVC
```bash
# Create init container that downloads model to shared PVC
# This way all pods use cached model instantly
```

### Step 2: Enable Multi-Worker Processing
Change in `k8s/embedding-service/deployment.yaml`:
```yaml
env:
- name: EMBEDDING_WORKERS
  value: "4"  # Was "1"
```

### Step 3: Increase Batch Size
```yaml
env:
- name: MAX_BATCH_SIZE
  value: "500"  # Was "100"
```

### Step 4: Reduce Probe Timeouts (after model is cached)
```yaml
startupProbe:
  initialDelaySeconds: 5  # Was 10
  failureThreshold: 30    # Was 60
```

### Step 5: Adjust Resource Limits
```yaml
resources:
  requests:
    memory: "2Gi"    # Higher for multi-worker
    cpu: "500m"
  limits:
    memory: "4Gi"    # Allow for load spikes
    cpu: "4000m"     # 4 cores for 4 workers
```

## Achieved Results (2026-01-15)

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Fast deploy trigger** | N/A | **2s** | NEW |
| Single pod startup | 60-120s | **11s** | 5-10x faster |
| Full redeploy (waiting) | 3-5 min | **48s** | 4-6x faster |
| Image rebuild | ~40s | **3s** | 13x faster |
| Config apply | ~5s | **<1s** | 5x faster |
| Pod ready (after trigger) | 60-120s | **15-20s** | 4-6x faster |

## Fast Deploy Script
Location: `scripts/k8s-fast-deploy.sh`

```bash
./scripts/k8s-fast-deploy.sh  # 2 seconds, then wait ~15s for pods
```

This triggers the deploy without waiting for pods. Total iteration cycle: ~17s.

## Key Optimizations Applied

1. **Optimized Probes:**
   - startupProbe: 5s initial, 5s period (was 10s/10s)
   - readinessProbe: 10s initial, 5s period (was 60s/10s)
   - livenessProbe: 30s initial (was 120s)

2. **Rolling Update Strategy:**
   - maxSurge: 3 (create new pods in parallel)
   - maxUnavailable: 0 (maintain capacity)

3. **Warm Pods:**
   - minReplicas: 2 (keep pods ready)
   - maxReplicas: 20 (scale fast when needed)

4. **Single Worker per Pod:**
   - Faster startup (~10s vs ~30s for 4 workers)
   - Scale with HPA instead of per-pod workers

## Comparison: K8s vs Single Server vs GPU

| Setup | Throughput | Time for 2M rows |
|-------|------------|------------------|
| K8s pod (CPU, single) | 36.8 texts/sec | 15+ hours |
| K8s pods (CPU, 14 pods) | ~500 texts/sec | ~67 min |
| Mac GPU (initial test) | 655 texts/sec | ~51 min |
| **Mac GPU (optimized)** | **1762-1848 texts/sec** | **~19 min** |

**Key Finding (2026-01-15):**
GPU (Metal/MPS) on Mac provides **48x speedup** over CPU! Optimized configuration achieves **3x faster than the 60-minute target**.

### GPU Optimization Results

| Setting | Throughput | Notes |
|---------|------------|-------|
| Batch size 50 | 1137/s | Too small |
| **Batch size 100** | **1848/s** | **Optimal** |
| Batch size 200 | 1762/s | Good |
| Batch size 500+ | 1100-1500/s | GPU memory pressure |
| fp16 precision | 1440/s | Slower on MPS |
| 2-4 threads | 1690-1797/s | Marginal benefit |
| Sustained (100k) | 1762/s | Consistent |

## Recommendations

1. **For maximum performance**: Run embedding service directly on Mac with GPU (not in K8s)
2. **For scalability**: Use K8s with CPU pods, but need ~18 pods to match single GPU
3. **Hybrid**: Run primary GPU workload on Mac, use K8s for failover/burst

**Conclusion**: GPU acceleration is the key to meeting performance targets. K8s + CPU alone cannot efficiently match GPU performance.
