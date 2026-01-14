# CaseRadar Deployment Documentation

## Overview

This document details the deployment architecture, build process, and infrastructure requirements for CaseRadar.

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Users["Users"]
        Browser["Web Browser"]
    end

    subgraph CDN["Vercel Edge Network"]
        Edge["Edge Functions"]
        Static["Static Assets"]
    end

    subgraph App["Vercel Application"]
        NextJS["Next.js App"]
        ServerFuncs["Server Functions"]
        API["API Routes"]
    end

    subgraph External["External Services"]
        Clerk["Clerk Auth"]
        Stripe["Stripe"]
        OpenAI["OpenAI"]
        Anthropic["Anthropic"]
        Sentry["Sentry"]
    end

    subgraph Data["Data Layer"]
        Supabase["Supabase"]
        PostgreSQL["PostgreSQL + pgvector"]
    end

    Browser --> Edge
    Edge --> Static
    Edge --> NextJS

    NextJS --> ServerFuncs
    NextJS --> API

    API --> Clerk
    API --> Stripe
    API --> OpenAI
    API --> Anthropic
    API --> Sentry
    API --> Supabase

    Supabase --> PostgreSQL
```

---

## Hosting Platform: Vercel

### Why Vercel

| Feature | Benefit |
|---------|---------|
| Native Next.js Support | Optimized deployments |
| Edge Network | Global CDN with 30+ regions |
| Serverless Functions | Auto-scaling API routes |
| Preview Deployments | PR previews for testing |
| Cron Jobs | Built-in scheduled tasks |

### Region Configuration

```json
{
  "regions": ["iad1"]
}
```

**Selected Region:** `iad1` (US East - Washington, D.C.)
- Closest to Supabase database
- Low latency for US users
- Compliant with data residency requirements

---

## Build Process

### Build Pipeline

```mermaid
flowchart TD
    subgraph Trigger["Build Trigger"]
        Push["Git Push"]
        PR["Pull Request"]
    end

    subgraph Build["Build Steps"]
        Install["bun install"]
        Generate["prisma generate"]
        TypeCheck["tsc --noEmit"]
        Lint["eslint ."]
        Test["vitest run"]
        NextBuild["next build"]
    end

    subgraph Deploy["Deployment"]
        Preview["Preview Deploy"]
        Production["Production Deploy"]
    end

    Push --> Build
    PR --> Build

    Install --> Generate
    Generate --> TypeCheck
    TypeCheck --> Lint
    Lint --> Test
    Test --> NextBuild

    NextBuild -->|PR| Preview
    NextBuild -->|main| Production
```

### npm Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "typecheck": "tsc --noEmit"
  }
}
```

### Build Command

```bash
# Full build pipeline
bun install && prisma generate && next build
```

---

## Environment Configuration

### Vercel Environment Variables

```mermaid
graph LR
    subgraph Environments
        Dev["Development"]
        Preview["Preview"]
        Prod["Production"]
    end

    subgraph Variables
        Shared["Shared Variables"]
        EnvSpecific["Env-Specific Variables"]
    end

    Dev --> Shared
    Preview --> Shared
    Prod --> Shared

    Dev --> EnvSpecific
    Preview --> EnvSpecific
    Prod --> EnvSpecific
```

### Required Variables

| Variable | Environment | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | All | PostgreSQL connection string |
| `DIRECT_URL` | All | Direct DB connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | All | Clerk public key |
| `CLERK_SECRET_KEY` | All | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | All | Clerk webhook verification |
| `OPENAI_API_KEY` | All | OpenAI API key |
| `ANTHROPIC_API_KEY` | All | Anthropic API key |
| `STRIPE_SECRET_KEY` | All | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | All | Stripe webhook verification |
| `CRON_SECRET` | All | Cron job authentication |
| `SENTRY_DSN` | Production | Sentry error tracking |

### Environment-Specific Values

| Variable | Development | Preview | Production |
|----------|-------------|---------|------------|
| `NEXT_PUBLIC_APP_URL` | localhost:3000 | PR URL | caseradar.com |
| `CLERK_*` | Test keys | Test keys | Live keys |
| `STRIPE_*` | Test keys | Test keys | Live keys |
| Database | Local/Supabase dev | Supabase staging | Supabase production |

---

## Security Headers

### Vercel Configuration

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    }
  ]
}
```

### Header Explanations

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | 2 years + preload | Force HTTPS |
| `X-Frame-Options` | DENY | Prevent clickjacking |
| `X-Content-Type-Options` | nosniff | Prevent MIME sniffing |
| `Referrer-Policy` | strict-origin-when-cross-origin | Control referrer info |
| `Permissions-Policy` | Disabled features | Block sensitive APIs |

---

## Cron Jobs

### Vercel Cron Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-nhtsa",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/analyze-patterns",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### Cron Job Details

| Job | Schedule | Description |
|-----|----------|-------------|
| `sync-nhtsa` | Every 6 hours | Fetch new NHTSA complaints |
| `analyze-patterns` | Daily at 2 AM | Run pattern analysis |

### Cron Security

```mermaid
sequenceDiagram
    participant Vercel as Vercel Cron
    participant Route as /api/cron/*
    participant Verify as Auth Check

    Vercel->>Route: GET with Authorization header
    Route->>Verify: Check CRON_SECRET

    alt Valid secret
        Verify-->>Route: Proceed
        Route-->>Vercel: Success response
    else Invalid secret
        Verify-->>Route: Unauthorized
        Route-->>Vercel: 401 response
    end
```

---

## Database Deployment

### Supabase Configuration

```mermaid
graph TB
    subgraph Supabase["Supabase Project"]
        Auth["Supabase Auth<br/>(disabled - using Clerk)"]
        Storage["Supabase Storage<br/>(for PDFs)"]
        PostgreSQL["PostgreSQL 15+"]
        PGBouncer["PgBouncer"]
    end

    subgraph Extensions
        PGVector["pgvector"]
    end

    PostgreSQL --> Extensions
    PostgreSQL --> PGBouncer
```

### Connection Strings

```bash
# With connection pooling (API routes)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"

# Direct connection (migrations)
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

### pgvector Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create index for similarity search
CREATE INDEX ON "Complaint" USING ivfflat (embedding vector_cosine_ops);
```

---

## Local Development

### Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: caseradar-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: caseradar
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: caseradar-redis
    ports:
      - '6379:6379'

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: caseradar-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@caseradar.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - '5050:80'
```

### Local Development Flow

```mermaid
flowchart TD
    Start["Start Development"] --> Docker["docker-compose up -d"]
    Docker --> Prisma["prisma migrate dev"]
    Prisma --> Seed["prisma db seed"]
    Seed --> Dev["bun run dev"]
    Dev --> Browser["Open localhost:3000"]
```

### Development Commands

```bash
# Start local services
docker-compose up -d

# Run database migrations
bun run db:migrate

# Seed database with test data
bun run db:seed

# Start development server
bun run dev

# Open Prisma Studio
bun run db:studio
```

---

## CI/CD Pipeline

### GitHub Actions (Recommended)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Generate Prisma client
        run: bun run db:generate

      - name: Type check
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Run tests
        run: bun run test

  e2e:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Install Playwright
        run: bunx playwright install --with-deps

      - name: Run E2E tests
        run: bun run test:e2e
```

### Vercel Deployment Pipeline

```mermaid
flowchart TD
    subgraph GitHub
        Push["Git Push"]
        PR["Pull Request"]
    end

    subgraph Vercel
        Build["Build"]
        Test["Run Tests"]
        Deploy["Deploy"]
    end

    subgraph Outputs
        Preview["Preview URL"]
        Production["Production"]
    end

    Push --> Build
    PR --> Build
    Build --> Test
    Test --> Deploy

    PR --> Preview
    Push -->|main| Production
```

---

## Scaling Considerations

### Serverless Scaling

```mermaid
graph LR
    subgraph Load["Incoming Requests"]
        R1["Request 1"]
        R2["Request 2"]
        RN["Request N"]
    end

    subgraph Functions["Serverless Functions"]
        F1["Function Instance 1"]
        F2["Function Instance 2"]
        FN["Function Instance N"]
    end

    R1 --> F1
    R2 --> F2
    RN --> FN
```

### Database Connection Pooling

| Setting | Value | Reason |
|---------|-------|--------|
| `connection_limit` | 1 | Per serverless function |
| `pgbouncer` | true | Connection pooling |
| Pool mode | Transaction | Serverless-friendly |

### Performance Optimizations

1. **Static Generation**
   - Landing page statically generated
   - Dashboard pages use ISR where possible

2. **Edge Functions**
   - Middleware runs at edge
   - Low-latency auth checks

3. **Caching**
   - Static assets cached 1 year
   - API responses with `no-store`

---

## Monitoring & Observability

### Sentry Integration

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### Monitored Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Error Rate | Sentry | > 1% |
| Response Time | Vercel | > 2s p99 |
| Function Duration | Vercel | > 10s |
| Database Connections | Supabase | > 80% |

### Logging

```typescript
// Structured logging format
console.log(`[CRON] NHTSA sync completed`, {
  duration: Date.now() - startTime,
  newComplaints: result.newComplaints,
  errors: result.errors.length,
});
```

---

## Disaster Recovery

### Backup Strategy

| Component | Backup Method | Frequency | Retention |
|-----------|---------------|-----------|-----------|
| Database | Supabase automatic | Daily | 7 days |
| Code | Git history | Per commit | Indefinite |
| Secrets | Vercel env vars | Manual | N/A |

### Recovery Procedures

1. **Database Restore**
   ```bash
   # Restore from Supabase backup
   supabase db restore --project-ref [PROJECT] --backup-id [ID]
   ```

2. **Code Rollback**
   ```bash
   # Rollback to previous deployment
   vercel rollback
   ```

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/api/health` | Basic health | `{ status: 'ok' }` |
| `/api/health/db` | Database connection | `{ status: 'ok', latency: ms }` |
| `/api/health/services` | External services | Service status |

### Health Check Flow

```mermaid
sequenceDiagram
    participant Monitor as Uptime Monitor
    participant App as CaseRadar
    participant DB as PostgreSQL
    participant Services as External Services

    loop Every 1 minute
        Monitor->>App: GET /api/health
        App-->>Monitor: 200 OK

        Monitor->>App: GET /api/health/db
        App->>DB: SELECT 1
        DB-->>App: Result
        App-->>Monitor: 200 OK with latency

        Monitor->>App: GET /api/health/services
        App->>Services: Check connectivity
        Services-->>App: Status
        App-->>Monitor: 200 OK with statuses
    end
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Environment variables set
- [ ] Database migrations applied
- [ ] Webhook endpoints configured (Clerk, Stripe)

### Post-Deployment

- [ ] Health checks passing
- [ ] Cron jobs executing
- [ ] Error monitoring active
- [ ] Performance baseline established
- [ ] Smoke tests completed

---

## Infrastructure Costs

### Estimated Monthly Costs

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Pro | $20/month |
| Supabase | Pro | $25/month |
| Clerk | Pro | $25/month |
| OpenAI | Usage | ~$10-50/month |
| Anthropic | Usage | ~$20-100/month |
| Sentry | Team | $26/month |
| **Total** | | **~$126-246/month** |

---

**Previous:** [07-dependencies.md](./07-dependencies.md) - Dependencies
**Index:** [00-overview.md](./00-overview.md) - System Overview
