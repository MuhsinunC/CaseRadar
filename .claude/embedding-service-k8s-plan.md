# Embedding Service Kubernetes Horizontal Scaling Plan

## Current State Analysis

### What Exists:
1. **Embedding Service** (`services/embedding-service/`)
   - FastAPI service with sentence-transformers
   - Single-process uvicorn server (can run multi-worker)
   - Prometheus metrics, Redis job queue, DLQ support
   - Dockerfile for containerization

2. **Kubernetes Config** (`k8s/embedding-service/`)
   - Deployment with 2 replicas
   - HPA (Horizontal Pod Autoscaler) scaling 2-40 pods
   - ClusterIP Service for internal load balancing
   - Prometheus metrics service

3. **Client** (`src/lib/embeddings/scalable-client.ts`)
   - Connects to `localhost:8080` by default
   - Supports batch embedding, async jobs
   - No connection pooling or load balancing awareness

4. **Docker Compose** (`docker-compose.yml`)
   - PostgreSQL, Redis, pgAdmin
   - **Missing**: Embedding service (runs manually)

### Problems:
1. Client hardcoded to `localhost:8080` - no K8s service awareness
2. No local K8s environment for development
3. Pipelined embedder runs multiple workers against single service
4. No connection pooling or retry at HTTP layer

## Architecture Design

### Target Architecture:
```
┌─────────────────────────────────────────────────────────┐
│                    Client Application                    │
│  (pipelined-embedder.ts / resilient-client.ts)          │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (1 connection per worker)
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 Load Balancer / Proxy                   │
│  (Traefik / nginx / K8s Service)                        │
└─────────────────────┬───────────────────────────────────┘
                      │ Round-robin distribution
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Pod 1   │  │ Pod 2   │  │ Pod 3   │  │ Pod N   │
   │ embed   │  │ embed   │  │ embed   │  │ embed   │
   │ worker  │  │ worker  │  │ worker  │  │ worker  │
   └─────────┘  └─────────┘  └─────────┘  └─────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
                      ▼
                ┌───────────┐
                │   Redis   │
                │  (queue)  │
                └───────────┘
```

### Key Changes:
1. **Docker Compose for Local Development**
   - Add embedding service with replicas
   - Traefik as reverse proxy/load balancer
   - Scale via `docker-compose up --scale embedding=N`

2. **Client Configuration**
   - Environment variable for embedding service URL
   - Default to load balancer endpoint (not localhost:8080)
   - Connection pooling with keepalive

3. **Service Discovery**
   - Development: Traefik (Docker Compose)
   - Production: K8s Service (already configured)

## Implementation Plan (TDD)

### Phase 1: Docker Compose with Scaling
**Tests First:**
```typescript
// services/embedding-service/tests/test_load_balancing.ts
describe('Load Balancing', () => {
  it('should distribute requests across multiple instances')
  it('should handle instance failure gracefully')
  it('should report health from all instances')
});
```

**Implementation:**
1. Add Traefik reverse proxy to docker-compose
2. Add embedding service with labels for Traefik routing
3. Configure health checks and load balancing

### Phase 2: Client Environment Configuration
**Tests First:**
```typescript
// src/lib/embeddings/__tests__/scalable-client.test.ts
describe('Scalable Client', () => {
  it('should use EMBEDDING_SERVICE_URL environment variable')
  it('should default to localhost:8080 in development')
  it('should handle connection failures with retry')
  it('should work with load-balanced endpoints')
});
```

**Implementation:**
1. Add `EMBEDDING_SERVICE_URL` to scalable-client.ts
2. Update environment configuration
3. Add connection pooling configuration

### Phase 3: Pipelined Embedder Integration
**Tests First:**
```typescript
// src/lib/embeddings/__tests__/pipelined-embedder.test.ts
describe('Pipelined Embedder with Scaling', () => {
  it('should achieve higher throughput with more service instances')
  it('should handle partial failures gracefully')
  it('should report metrics from distributed processing')
});
```

**Implementation:**
1. Update pipelined embedder to use load-balanced client
2. Configure number of workers based on available service instances
3. Add distributed metrics collection

### Phase 4: Benchmarking & Verification
**Tests:**
```typescript
// scripts/benchmark-k8s-scaling.ts
describe('Scaling Benchmarks', () => {
  it('should achieve linear throughput scaling up to N instances')
  it('should show 2x throughput with 2 instances vs 1')
  it('should show 4x throughput with 4 instances vs 1')
});
```

**Metrics to Verify:**
- 1 instance: ~550 embeddings/s (baseline)
- 2 instances: ~1000 embeddings/s (1.8x)
- 4 instances: ~1800 embeddings/s (3.3x)
- 8 instances: ~3000 embeddings/s (5.5x)

## File Changes Required

### New Files:
- `docker-compose.dev.yml` - Development compose with scaling
- `src/lib/embeddings/__tests__/scalable-client.test.ts`
- `src/lib/embeddings/__tests__/pipelined-embedder.test.ts`
- `scripts/benchmark-k8s-scaling.ts`

### Modified Files:
- `docker-compose.yml` - Add embedding service + Traefik
- `src/lib/embeddings/scalable-client.ts` - Environment config
- `src/lib/embeddings/pipelined-embedder.ts` - Remove multi-worker hack
- `.env.example` - Add EMBEDDING_SERVICE_URL

## Success Criteria

1. **Scaling Works**: `docker-compose up --scale embedding=4` creates 4 instances
2. **Load Balancing Works**: Requests distributed across instances
3. **Linear Throughput**: N instances ~= N * single instance throughput
4. **Tests Pass**: All TDD tests green
5. **Benchmarks Pass**: 2x instances = ~2x throughput

## Commands to Verify

```bash
# Start with scaling
docker-compose up --scale embedding=4

# Check instances are running
docker ps | grep embedding

# Run benchmark
npx tsx scripts/benchmark-k8s-scaling.ts

# Verify throughput improvement
# Expected: 4 instances should show ~3-4x throughput vs 1 instance
```
