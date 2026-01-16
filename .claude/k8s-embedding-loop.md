ultrathink:

# Kubernetes Horizontal Scaling for Embedding Service

## Mission
Implement Kubernetes-style horizontal scaling for the embedding service so that development performance scales linearly with the number of service instances.

## Context
- The embedding service exists at `services/embedding-service/`
- Kubernetes configs exist at `k8s/embedding-service/`
- The client connects to a single `localhost:8080` instance
- We need to enable horizontal scaling for LOCAL DEVELOPMENT (not production K8s)
- Production will use OpenAI endpoints, so this is DEV-ONLY infrastructure

## Implementation Plan
Read the detailed plan at: `.claude/embedding-service-k8s-plan.md`

## TDD Approach
1. Write tests FIRST before implementation
2. Run tests to see them fail
3. Implement the feature
4. Run tests to see them pass
5. Refactor if needed

## Tasks (in order)

### Task 1: Update Docker Compose with Embedding Service + Traefik
- Add Traefik reverse proxy for load balancing
- Add embedding service with proper labels
- Enable scaling via `docker-compose up --scale embedding=N`
- Test: Service starts and is accessible

### Task 2: Write Client Tests
- Test environment variable configuration
- Test fallback to localhost
- Test connection to load-balanced endpoint
- Location: `src/lib/embeddings/__tests__/scalable-client.test.ts`

### Task 3: Update Scalable Client
- Add EMBEDDING_SERVICE_URL environment variable support
- Default to `http://localhost:8080` for backwards compatibility
- Update client to use configured URL
- Update `.env.example`

### Task 4: Write Integration Tests
- Test load balancing works (requests hit different instances)
- Test throughput scaling with multiple instances
- Location: `scripts/benchmark-k8s-scaling.ts`

### Task 5: Update Pipelined Embedder
- Remove the multi-worker hack (numEmbedWorkers)
- Use single worker per client, let load balancer distribute
- Or: Keep workers but ensure they use load-balanced endpoint

### Task 6: Benchmark and Verify
- Run `docker-compose up --scale embedding=1` - baseline
- Run `docker-compose up --scale embedding=2` - 2x target
- Run `docker-compose up --scale embedding=4` - 4x target
- Verify throughput scales approximately linearly

## Completion Criteria
The loop is complete when:
1. Docker compose starts embedding service with Traefik
2. `docker-compose up --scale embedding=N` works
3. Client uses EMBEDDING_SERVICE_URL environment variable
4. Benchmark shows ~linear scaling with instance count
5. All tests pass

## Current Status
Check `.claude/k8s-embedding-status.md` for implementation status.

## Notes
- This is for DEVELOPMENT ONLY
- Production uses OpenAI/external endpoints
- Focus on local Docker-based scaling
- Do NOT modify production K8s configs unless necessary
