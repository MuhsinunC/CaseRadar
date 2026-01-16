# K8s Embedding Service - Current State (2026-01-15)

## What We're Trying to Achieve
- Target: 500+ texts/sec embedding throughput (matching original multi-process server)
- Current: ~65 texts/sec with 12 single-worker pods

## Current Status
1. Multi-worker (4 workers/pod) just configured but not yet tested
2. Image was rebuilt with Prometheus disabled for multi-worker mode
3. Need to redeploy and test

## Key Files Modified
- `services/embedding-service/main.py` - Added PROMETHEUS_ENABLED check for multi-worker
- `k8s/embedding-service/deployment.yaml` - Set EMBEDDING_WORKERS=4, increased memory to 4Gi
- `k8s/embedding-service/hpa.yaml` - Set maxReplicas=8 (fewer pods with more workers each)

## Benchmark Results So Far
| Config | Throughput |
|--------|------------|
| 1 pod, 1 worker | 21.3 texts/sec |
| 12 pods, 1 worker | 64.7 texts/sec |
| Multi-worker | Not yet tested |

## Next Steps (After Fixing Startup Speed)
1. Redeploy with multi-worker configuration
2. Run benchmark
3. Compare to 500 texts/sec target

---

# CRITICAL ISSUE: SLOW K8S STARTUP

## Problem
Pod startup takes 60-120+ seconds due to:
1. Model download (~30-60s on first run)
2. Startup probe delay (10s initial + up to 60 retries)
3. Readiness probe delay (60s initial)
4. Image pull if not cached (~40s)

## Root Causes to Fix
1. Model not cached on PVC effectively
2. Probes configured too conservatively
3. Image needs to be pre-built
4. HPA takes time to detect load and scale

## Research Needed
- How to pre-load model into PVC before pods start
- Init containers for model caching
- Faster probe configurations
- Pre-warming strategies
