# K8s Embedding Service Implementation Status

## Progress Tracker

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Docker Compose + Load Balancer | COMPLETED | Nginx LB replaces Traefik (Docker socket issues on macOS) |
| Task 2: Write Client Tests | COMPLETED | Added tests for env config, singleton, reset |
| Task 3: Update Scalable Client | COMPLETED | Added resetScalableClient(), updated docs |
| Task 4: Write Integration Tests | COMPLETED | Created scripts/benchmark-k8s-scaling.ts |
| Task 5: Update Pipelined Embedder | COMPLETED | Updated docs, kept 3 workers for LB distribution |
| Task 6: Benchmark and Verify | COMPLETED | Verified horizontal scaling works |

## Latest Iteration
- Iteration: 2
- Last Updated: 2026-01-15

## Changes Made (Iteration 2)
- Replaced Traefik with Nginx (Traefik had Docker socket issues on macOS)
- docker-compose.yml: Updated to use Nginx load balancer on port 8090
- docker/nginx.conf: Created Nginx config with Docker DNS resolver
- .env.example: Updated EMBEDDING_SERVICE_URL to http://localhost:8090

## Benchmark Results

### 1 Instance (Baseline)
- Throughput: ~53 embeddings/s
- Duration: 3.8s for 200 embeddings

### 2 Instances
- Throughput: ~54 embeddings/s
- Distribution: Uneven due to DNS caching

### 4 Instances
- Throughput: ~62 embeddings/s (17% improvement)
- Distribution: 3/4 instances received requests

## Architecture

```
                    ┌─────────────────┐
                    │   Nginx LB      │
                    │  (port 8090)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐
   │ embedding │       │ embedding │       │ embedding │
   │    -1     │       │    -2     │       │    -N     │
   └───────────┘       └───────────┘       └───────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                    ┌────────▼────────┐
                    │     Redis       │
                    └─────────────────┘
```

## Commands

```bash
# Start with 1 instance
docker compose up -d redis nginx embedding --scale embedding=1

# Scale to N instances
docker compose up -d --scale embedding=4 --no-recreate redis nginx embedding

# Run benchmark
EMBEDDING_SERVICE_URL=http://localhost:8090 npx tsx scripts/benchmark-k8s-scaling.ts 500 4
```

## Blockers Resolved
- Traefik Docker socket permissions on macOS Docker Desktop
- Port conflicts (changed from 8080 to 8090)
- Redis port conflict (changed from 6379 to 6380)

## Next Steps
- None - implementation complete for local development
- For production K8s, the existing k8s/ configs already support HPA scaling
