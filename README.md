# CaseRadar

AI-powered SaaS platform for law firms to monitor NHTSA vehicle complaints, identify class action patterns, and generate legal complaints.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your API keys (Clerk, Stripe, etc.)

# 3. Start everything
./scripts/start.sh
```

That's it! The platform will be available at:
- **Frontend**: http://localhost:3000
- **Embedding API**: http://localhost:8090
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Platform Commands

```bash
./scripts/start.sh           # Start entire platform (K8s + containerized Next.js)
./scripts/start.sh --dev     # Start K8s services + local Next.js dev server
./scripts/start.sh --no-web  # Start backend services only
./scripts/stop.sh            # Stop platform (preserves data)
./scripts/stop.sh --full     # Stop and delete cluster (removes all data)
./scripts/status.sh          # Check what's running
```

## Prerequisites

- **Node.js 20+** - `brew install node`
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **minikube** - `brew install minikube`
- **kubectl** - `brew install kubectl`

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    CaseRadar Platform (Kubernetes)                         │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  minikube cluster: "caseradar"                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │  namespace: web                    namespace: embedding             │  │
│  │  ┌─────────────────────────┐      ┌─────────────────────────────┐  │  │
│  │  │   Next.js (HPA)         │      │   Embedding Service (HPA)   │  │  │
│  │  │   2-4 pods auto-scale   │─────▶│   1-4 pods auto-scale       │  │  │
│  │  │   :3000 (port-forward)  │      │   nomic-embed-text-v1.5     │  │  │
│  │  └─────────────────────────┘      │   :8090 (port-forward)      │  │  │
│  │           │                        └─────────────────────────────┘  │  │
│  │           │                                                         │  │
│  │           ▼                                                         │  │
│  │  namespace: database               namespace: cache                 │  │
│  │  ┌─────────────────────────┐      ┌─────────────────────────────┐  │  │
│  │  │   PostgreSQL (StatefulSet)     │   Redis (Deployment)        │  │  │
│  │  │   pgvector extension    │      │   Session cache             │  │  │
│  │  │   :5432 (port-forward)  │      │   :6379 (port-forward)      │  │  │
│  │  │   PVC: 10Gi             │      └─────────────────────────────┘  │  │
│  │  └─────────────────────────┘                                       │  │
│  │                                                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  External Services:                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │    Clerk     │ │   Stripe     │ │   Claude     │ │    NHTSA API     │  │
│  │   (Auth)     │ │  (Billing)   │ │ (AI Gen)     │ │  (Complaints)    │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Kubernetes Namespaces

| Namespace | Service | Description |
|-----------|---------|-------------|
| `web` | Next.js | Frontend + API with HPA (2-4 pods) |
| `embedding` | Embedding Service | ML embeddings with HPA (1-4 pods) |
| `database` | PostgreSQL | StatefulSet with pgvector extension |
| `cache` | Redis | Session and data caching |

## Features

- **Real-Time Monitoring**: Continuously monitor NHTSA complaint database for new filings
- **AI Pattern Detection**: Semantic clustering identifies similar complaints across vehicles
- **Auto-Generate Complaints**: Generate court-ready class action complaints
- **Auto-Scaling**: All services scale automatically based on CPU load via Kubernetes HPA
- **Multi-Tenant**: Full RBAC and organization support for law firms

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, TypeScript, shadcn/ui, Tailwind CSS v4 |
| Backend | Next.js API Routes, Prisma ORM |
| Database | PostgreSQL 16 with pgvector |
| ML Embeddings | nomic-embed-text-v1.5 (local, auto-scaling) |
| Auth | Clerk |
| Billing | Stripe |
| AI Generation | Claude (Anthropic) |
| Orchestration | Kubernetes (minikube for local dev) |

## Development

### Running Tests

```bash
npm run test        # Unit tests
npm run test:e2e    # E2E tests with Playwright
npm run lint        # ESLint
npm run format      # Prettier
npm run typecheck   # TypeScript check
```

### Database Operations

```bash
npm run db:push     # Push schema changes
npm run db:studio   # Open Prisma Studio (GUI)
npm run db:seed     # Seed demo data (if available)
```

### Kubernetes Operations

```bash
# View all pods
kubectl get pods -A

# View auto-scaling status
kubectl get hpa -A

# View logs for a service
kubectl logs -n web -l app=caseradar -f
kubectl logs -n embedding -l app=embedding-service -f
kubectl logs -n database -l app=postgres -f

# Manual scaling (temporary)
kubectl scale deployment -n web caseradar --replicas=3
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (auto-set in K8s) |
| `REDIS_URL` | Redis connection (auto-set in K8s) |
| `CLERK_SECRET_KEY` | Clerk authentication |
| `STRIPE_SECRET_KEY` | Stripe billing |
| `ANTHROPIC_API_KEY` | Claude for complaint generation |
| `EMBEDDING_SERVICE_URL` | Default: `http://localhost:8090` |

## Project Structure

```
caseradar/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   └── ui/          # shadcn/ui components
│   └── lib/             # Utilities and services
├── scripts/             # Platform management scripts
│   ├── start.sh         # Start all services
│   ├── stop.sh          # Stop all services
│   └── status.sh        # Check status
├── k8s/                 # Kubernetes manifests
│   ├── postgres/        # PostgreSQL StatefulSet
│   ├── redis/           # Redis Deployment
│   ├── embedding-service/ # ML embedding service
│   └── web/             # Next.js deployment
├── services/            # Microservices source
│   └── embedding-service/
├── prisma/              # Database schema
└── docker/              # Legacy Docker configs
```

## Troubleshooting

**Port already in use**
```bash
./scripts/stop.sh   # Stop everything first
./scripts/start.sh  # Then restart
```

**Database connection issues**
```bash
kubectl logs -n database -l app=postgres  # Check postgres logs
./scripts/status.sh                       # Verify services are running
```

**Embedding service not responding**
```bash
./scripts/status.sh                                    # Check what's running
kubectl logs -n embedding -l app=embedding-service -f  # K8s logs
```

**Pods not starting**
```bash
kubectl describe pod -n <namespace> <pod-name>  # Get detailed error info
kubectl get events -n <namespace>               # View recent events
```

**Reset everything**
```bash
./scripts/stop.sh --full   # Delete cluster (WARNING: removes all data)
./scripts/start.sh         # Fresh start
```

## Production Migration

This local setup is designed to mirror production architecture:

| Local | Production |
|-------|------------|
| minikube | EKS/GKE/AKS |
| StatefulSet PostgreSQL | Cloud SQL / RDS |
| StatefulSet Redis | ElastiCache / Memorystore |
| Local embeddings | Same service (or API gateway) |

Migrate by updating K8s secrets/configmaps to point to managed services.

## Documentation

- [K8s Embedding Service](./k8s/embedding-service/README.md)
- [Architecture Plan](./docs/PLAN_v2.md)
- [Implementation Roadmap](./docs/IMPLEMENTATION_ROADMAP.md)

## License

Proprietary - All rights reserved.
