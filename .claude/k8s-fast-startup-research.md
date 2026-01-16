# K8s Fast Startup Research

## Current Bottlenecks (in order of impact)

### 1. Model Loading (~30-60s)
The ML model needs to download and load into memory. Each new pod does this.

**Solutions:**
- ✅ Use PVC for model cache (already done) - but pods still load model into RAM
- Pre-download model in init container
- Use a sidecar that keeps model warm
- **Best:** Keep pods running, use HPA to scale down slowly (already configured)

### 2. Startup Probe (up to 600s worst case)
Current: initialDelaySeconds=10, periodSeconds=10, failureThreshold=60

**Solutions:**
- Reduce initialDelaySeconds once model is cached
- Reduce failureThreshold
- Use exec probe instead of HTTP (faster)
- **Best:** Set initialDelaySeconds=5, failureThreshold=30 for cached model

### 3. Readiness Probe (60s initial delay)
Current: initialDelaySeconds=60

**Solutions:**
- Reduce to 10-15s once model is cached
- The model loads in ~30s, so 60s is too conservative

### 4. Image Pull (~40s if not cached)
Current: imagePullPolicy=IfNotPresent

**Solutions:**
- ✅ Already using IfNotPresent
- Pre-pull images with daemonset
- Build directly into minikube (we're doing this)

### 5. HPA Reaction Time
Default: 15s polling + stabilization window

**Solutions:**
- ✅ Already set stabilizationWindowSeconds=0 for scale-up
- Metrics collection delay (~15s) is inherent

## Implementation Plan

### Phase 1: Reduce Probe Timeouts (Immediate)
```yaml
startupProbe:
  initialDelaySeconds: 5   # Was 10
  periodSeconds: 5         # Was 10
  failureThreshold: 36     # Was 60 (3 minutes total)
readinessProbe:
  initialDelaySeconds: 10  # Was 60
  periodSeconds: 5         # Was 10
livenessProbe:
  initialDelaySeconds: 30  # Was 120 (model should be loaded by then)
  periodSeconds: 10        # Was 30
```

### Phase 2: Pre-warm Model Cache
Create a one-time job to download the model to PVC:
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: model-cache-warmup
spec:
  template:
    spec:
      containers:
      - name: warmup
        image: python:3.11-slim
        command: ["python", "-c", "from sentence_transformers import SentenceTransformer; SentenceTransformer('nomic-ai/nomic-embed-text-v1.5')"]
        volumeMounts:
        - name: model-cache
          mountPath: /root/.cache
      volumes:
      - name: model-cache
        persistentVolumeClaim:
          claimName: model-cache
      restartPolicy: Never
```

### Phase 3: Optimize Deployment Rolling Updates
```yaml
spec:
  strategy:
    rollingUpdate:
      maxSurge: 2        # Create 2 new pods at once
      maxUnavailable: 1  # Keep capacity during rollout
```

## Expected Improvements

| Metric | Current | Target |
|--------|---------|--------|
| First pod ready | 60-120s | 30-45s |
| Subsequent pods | 45-90s | 15-30s |
| Full scale (12 pods) | 3-5 min | 1-2 min |

## Quick Wins to Apply Now

1. Reduce startup probe delays
2. Reduce readiness probe delays
3. Reduce liveness probe delays
4. Keep more pods warm (minReplicas=2 instead of 1)
