# CPU Fallback Implementation Plan

## Overview
The embedding service should use GPU when available (1848 texts/sec on Mac MPS), but needs a performant CPU fallback. This plan benchmarks and optimizes two CPU approaches:

1. **Kubernetes Multi-Pod**: Multiple pods with load balancing
2. **Single Server Multi-Process**: One server with true multiprocessing

## Current State
- GPU (Mac MPS): **1848 texts/sec** (optimal, already implemented)
- K8s single pod (CPU): 36.8 texts/sec
- Target: Maximize CPU throughput for when GPU is unavailable

## Architecture Options

### Option A: Kubernetes Multi-Pod Architecture
```
[Client] --> [K8s Service (Load Balancer)]
                    |
        +-----------+-----------+
        |           |           |
    [Pod 1]     [Pod 2]     [Pod N]
    (1 worker)  (1 worker)  (1 worker)
```

**Variations to test:**
- A1: Single worker per pod (current)
- A2: Multi-worker per pod (2-4 workers each)
- A3: Aggressive HPA scaling

### Option B: Single Server Multi-Process Architecture
```
[Client] --> [Uvicorn with N workers]
                    |
        +-----------+-----------+
        |           |           |
    [Worker 1]  [Worker 2]  [Worker N]
    (subprocess) (subprocess) (subprocess)
```

**Variations to test:**
- B1: Uvicorn multi-worker mode
- B2: Gunicorn with multiple workers
- B3: Custom multiprocessing pool

## Benchmark Matrix

| Configuration | Workers | Expected Throughput | Memory | Notes |
|---------------|---------|---------------------|--------|-------|
| K8s 1 pod, 1 worker | 1 | 36.8/s | 1GB | Baseline |
| K8s 2 pods, 1 worker each | 2 | ~74/s | 2GB | |
| K8s 4 pods, 1 worker each | 4 | ~148/s | 4GB | |
| K8s 8 pods, 1 worker each | 8 | ~296/s | 8GB | |
| K8s 2 pods, 2 workers each | 4 | ? | 4GB | |
| Single 2 workers | 2 | ? | 2GB | |
| Single 4 workers | 4 | ? | 4GB | |
| Single 8 workers | 8 | ? | 8GB | |

## Implementation Tasks

### Phase 1: Benchmark K8s Multi-Pod (Current Setup)
- [ ] Ensure minikube is running with sufficient resources
- [ ] Benchmark 1 pod baseline
- [ ] Benchmark 2, 4, 8 pods with HPA
- [ ] Test multi-worker per pod (EMBEDDING_WORKERS=2,4)
- [ ] Document results

### Phase 2: Benchmark Single Server Multi-Process
- [ ] Create single-server startup script
- [ ] Test with uvicorn workers (2, 4, 8)
- [ ] Test with gunicorn workers
- [ ] Test custom multiprocessing if needed
- [ ] Document results

### Phase 3: Optimize Best Option
- [ ] Identify winner from benchmarks
- [ ] Tune batch sizes
- [ ] Tune worker count
- [ ] Test sustained load (100k texts)
- [ ] Document final configuration

### Phase 4: Implement Auto-Detection Logic
- [ ] GPU detection (MPS > CUDA > CPU)
- [ ] CPU architecture selection (K8s vs Single based on benchmarks)
- [ ] Environment variable overrides
- [ ] Health check endpoints

### Phase 5: Wire Up to Product
- [ ] Update embedding client to use new service
- [ ] Add configuration for service URL
- [ ] Test with actual product data
- [ ] Integration tests
- [ ] End-to-end validation

### Phase 6: Documentation & Cleanup
- [ ] Document final architecture
- [ ] Update README
- [ ] Clean up temporary files
- [ ] Commit and push all changes

## Success Criteria
1. GPU path works when GPU available (1848+ texts/sec)
2. CPU fallback achieves maximum possible throughput
3. Auto-detection works correctly
4. Product integration complete and tested
5. All documentation updated

## Progress Tracking
See: `.claude/cpu-fallback-progress.md`

## Benchmark Results
Will be updated in: `.claude/cpu-fallback-benchmarks.md`
