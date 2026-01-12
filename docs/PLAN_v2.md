# CaseRadar - Comprehensive Implementation Plan (v2)

## Executive Summary

CaseRadar is an enterprise SaaS platform for law firms specializing in class action lawsuits. It monitors NHTSA vehicle complaint data, identifies patterns using semantic analysis, and auto-generates formal legal complaints.

This document provides the detailed implementation plan based on Phase 2 research findings.

---

## 1. Final Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CASERADAR                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────┐
                                    │   USERS     │
                                    │  (Law Firms)│
                                    └──────┬──────┘
                                           │
                                    ┌──────▼──────┐
                                    │  CLOUDFLARE │
                                    │  DNS + WAF  │
                                    └──────┬──────┘
                                           │
┌──────────────────────────────────────────┼──────────────────────────────────────────┐
│                                   VERCEL │                                          │
│  ┌───────────────────────────────────────┼───────────────────────────────────────┐ │
│  │                              NEXT.JS 15                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │ │
│  │  │  Marketing  │  │  Dashboard  │  │    API      │  │   Edge      │          │ │
│  │  │   Pages     │  │   App       │  │   Routes    │  │  Middleware │          │ │
│  │  │  (SSG)      │  │  (SSR+RSC)  │  │ (Serverless)│  │  (Auth)     │          │ │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘  └─────────────┘          │ │
│  └───────────────────────────────────────────┼───────────────────────────────────┘ │
└──────────────────────────────────────────────┼──────────────────────────────────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         │                                     │                                     │
         ▼                                     ▼                                     ▼
┌─────────────────┐              ┌─────────────────────┐              ┌─────────────────┐
│     CLERK       │              │      SUPABASE       │              │    RAILWAY      │
│                 │              │                     │              │                 │
│  - Auth         │              │  ┌───────────────┐  │              │  Background     │
│  - Orgs         │              │  │  PostgreSQL   │  │              │  Workers:       │
│  - RBAC         │              │  │  + pgvector   │  │              │                 │
│  - Sessions     │              │  └───────────────┘  │              │  - NHTSA Sync   │
│                 │              │  ┌───────────────┐  │              │  - Clustering   │
└─────────────────┘              │  │  Realtime     │  │              │  - Trends       │
                                 │  │  Subscriptions│  │              │  - PDF Gen      │
                                 │  └───────────────┘  │              │                 │
                                 │  ┌───────────────┐  │              └─────────────────┘
                                 │  │  Storage      │  │
                                 │  │  (PDFs)       │  │
                                 │  └───────────────┘  │
                                 └─────────────────────┘

         ┌─────────────────────────────────────┬─────────────────────────────────────┐
         │                                     │                                     │
         ▼                                     ▼                                     ▼
┌─────────────────┐              ┌─────────────────────┐              ┌─────────────────┐
│     STRIPE      │              │      OPENAI         │              │   ANTHROPIC     │
│                 │              │                     │              │                 │
│  - Billing      │              │  - Embeddings       │              │  - Claude API   │
│  - Subscriptions│              │  - text-embedding-  │              │  - Complaint    │
│  - Webhooks     │              │    3-small          │              │    Generation   │
│                 │              │                     │              │                 │
└─────────────────┘              └─────────────────────┘              └─────────────────┘

         ┌─────────────────────────────────────┬─────────────────────────────────────┐
         │                                     │                                     │
         ▼                                     ▼                                     ▼
┌─────────────────┐              ┌─────────────────────┐              ┌─────────────────┐
│     RESEND      │              │      SENTRY         │              │     NHTSA       │
│                 │              │                     │              │                 │
│  - Transactional│              │  - Error Tracking   │              │  - Complaints   │
│    Emails       │              │  - Performance      │              │    API          │
│                 │              │                     │              │  - SODA API     │
└─────────────────┘              └─────────────────────┘              └─────────────────┘
```

---

## 2. Technology Stack (Finalized)

### Core Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 15.x |
| **Language** | TypeScript | 5.x |
| **Runtime** | Node.js | 20.x |
| **UI Library** | shadcn/ui | Latest |
| **Styling** | Tailwind CSS | 3.4.x |
| **Database** | PostgreSQL (Supabase) | 15.x |
| **ORM** | Prisma | 6.x |
| **Auth** | Clerk | 5.x |
| **Payments** | Stripe | 14.x |

### Supporting Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Hosting (Frontend) | Vercel | SSR, Edge, CDN |
| Hosting (Workers) | Railway | Background jobs |
| Database | Supabase | PostgreSQL + pgvector |
| Vector Storage | pgvector | Embeddings |
| File Storage | Supabase Storage | PDF documents |
| Auth | Clerk | Authentication, RBAC |
| Payments | Stripe | Subscriptions |
| Email | Resend | Transactional |
| Monitoring | Sentry | Errors, Performance |
| Analytics | Vercel Analytics | Usage metrics |

### AI/ML Services

| Service | Provider | Purpose |
|---------|----------|---------|
| Embeddings | OpenAI | text-embedding-3-small |
| LLM | Anthropic | Claude for generation |
| Clustering | Self-hosted | HDBSCAN + UMAP |

---

## 3. Database Schema Design

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Organization   │       │      User       │       │  Subscription   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │◄──┐   │ id              │       │ id              │
│ name            │   │   │ clerkUserId     │       │ organizationId  │──┐
│ clerkOrgId      │   │   │ email           │       │ stripeCustomerId│  │
│ plan            │   └───│ organizationId  │       │ status          │  │
│ createdAt       │       │ role            │       │ currentPeriod   │  │
└────────┬────────┘       │ createdAt       │       └─────────────────┘  │
         │                └─────────────────┘                            │
         │                                                               │
         │    ┌──────────────────────────────────────────────────────────┘
         │    │
         ▼    ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    Pattern      │       │   Complaint     │       │ GeneratedCompl. │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id              │◄──────│ clusterId       │       │ id              │
│ name            │       │ id              │       │ patternId       │──┐
│ description     │       │ nhtsaId         │       │ organizationId  │  │
│ make            │       │ make/model/year │       │ content (JSON)  │  │
│ model           │       │ component       │       │ pdfUrl          │  │
│ component       │       │ description     │       │ status          │  │
│ severityScore   │       │ crash/fire/etc  │       │ version         │  │
│ trendScore      │       │ embedding       │       │ createdBy       │  │
│ complaintCount  │       │ dateAdded       │       └────────┬────────┘  │
│ organizationId  │       └─────────────────┘                │           │
└─────────────────┘                                          │           │
         │                                                   │           │
         └───────────────────────────────────────────────────┴───────────┘

┌─────────────────┐
│   AuditLog      │
├─────────────────┤
│ id              │
│ organizationId  │
│ userId          │
│ action          │
│ resource        │
│ metadata        │
│ createdAt       │
└─────────────────┘
```

### Key Indexes

```sql
-- Complaints table
CREATE INDEX idx_complaints_make_model_year ON complaints(make, model, year);
CREATE INDEX idx_complaints_component ON complaints(component);
CREATE INDEX idx_complaints_date_added ON complaints(date_added);
CREATE INDEX idx_complaints_cluster ON complaints(cluster_id);

-- Vector similarity search
CREATE INDEX idx_complaints_embedding ON complaints
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Patterns table
CREATE INDEX idx_patterns_severity ON patterns(severity_score DESC);
CREATE INDEX idx_patterns_make_model ON patterns(make, model);
CREATE INDEX idx_patterns_org ON patterns(organization_id);

-- Audit logs
CREATE INDEX idx_audit_org_date ON audit_logs(organization_id, created_at DESC);
```

---

## 4. API Design

### REST API Endpoints

#### Authentication (handled by Clerk)
- `GET /api/auth/session` - Get current session
- Middleware handles auth verification

#### Complaints
```
GET    /api/complaints                    # List complaints (paginated, filtered)
GET    /api/complaints/:id                # Get single complaint
GET    /api/complaints/search             # Full-text search
GET    /api/complaints/stats              # Aggregated statistics
```

#### Patterns
```
GET    /api/patterns                      # List patterns (sorted by severity)
GET    /api/patterns/:id                  # Get pattern details
GET    /api/patterns/:id/complaints       # Get complaints in pattern
GET    /api/patterns/:id/trends           # Get trend data
POST   /api/patterns/:id/generate         # Generate complaint draft
```

#### Generated Complaints
```
GET    /api/generated                     # List generated complaints
GET    /api/generated/:id                 # Get generated complaint
POST   /api/generated                     # Create new generation
PATCH  /api/generated/:id                 # Update status
DELETE /api/generated/:id                 # Delete
GET    /api/generated/:id/pdf             # Download PDF
```

#### Organization
```
GET    /api/org                           # Get current org
PATCH  /api/org                           # Update org settings
GET    /api/org/users                     # List org users
POST   /api/org/users/invite              # Invite user
PATCH  /api/org/users/:id/role            # Update user role
DELETE /api/org/users/:id                 # Remove user
```

#### Billing
```
GET    /api/billing/subscription          # Get subscription status
POST   /api/billing/checkout              # Create checkout session
POST   /api/billing/portal                # Create portal session
POST   /api/webhooks/stripe               # Stripe webhooks
```

#### Admin (internal)
```
GET    /api/admin/audit-logs              # View audit logs
POST   /api/admin/sync                    # Trigger NHTSA sync
POST   /api/admin/cluster                 # Trigger clustering job
```

### Response Format

```typescript
// Success response
{
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 20
  }
}

// Error response
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "details": { ... }
  }
}
```

---

## 5. Data Pipeline Architecture

### NHTSA Ingestion Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NHTSA INGESTION PIPELINE                              │
│                          (Railway Worker)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────┐
│   Scheduler   │     │   Fetcher     │     │  Transformer  │     │   Loader  │
│   (Cron)      │────▶│               │────▶│               │────▶│           │
│               │     │  SODA API     │     │  Normalize    │     │  Upsert   │
│  Daily @2am   │     │  Pagination   │     │  Validate     │     │  Dedupe   │
└───────────────┘     └───────────────┘     └───────────────┘     └───────────┘
                                                                        │
                                                                        ▼
                                                                 ┌───────────┐
                                                                 │  Embedder │
                                                                 │           │
                                                                 │  OpenAI   │
                                                                 │  Batched  │
                                                                 └───────────┘
```

### Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ANALYSIS PIPELINE                                   │
│                          (Railway Worker)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Daily @ 4am (after ingestion):

┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────┐
│  Fetch All    │     │     UMAP      │     │   HDBSCAN     │     │   Save    │
│  Embeddings   │────▶│   Reduction   │────▶│  Clustering   │────▶│  Clusters │
│               │     │  1536D → 50D  │     │               │     │           │
└───────────────┘     └───────────────┘     └───────────────┘     └───────────┘
                                                                        │
                                                                        ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────┐
│   Calculate   │◄────│    Trend      │◄────│   Aggregate   │◄────│  Extract  │
│   Severity    │     │   Detection   │     │   Statistics  │     │   Topics  │
│    Scores     │     │               │     │               │     │  (TF-IDF) │
└───────────────┘     └───────────────┘     └───────────────┘     └───────────┘
```

### Severity Scoring Formula

```python
severity_score = (
    deaths * 100 +           # Highest weight
    injuries * 20 +          # High weight
    crashes * 10 +           # Medium weight
    fires * 15 +             # Medium-high weight
    complaint_count * 1 +    # Base count
    trend_score * 50         # Rate of increase
)
```

---

## 6. Frontend Component Hierarchy

### Page Structure

```
app/
├── (marketing)/                 # Public pages
│   ├── page.tsx                 # Landing page
│   ├── pricing/page.tsx         # Pricing
│   ├── about/page.tsx           # About
│   └── layout.tsx               # Marketing layout
│
├── (auth)/                      # Auth pages (Clerk)
│   ├── sign-in/[[...sign-in]]/
│   ├── sign-up/[[...sign-up]]/
│   └── layout.tsx
│
├── (dashboard)/                 # Protected app
│   ├── layout.tsx               # Dashboard shell
│   ├── page.tsx                 # Dashboard home
│   │
│   ├── complaints/
│   │   ├── page.tsx             # Complaints list
│   │   └── [id]/page.tsx        # Complaint detail
│   │
│   ├── patterns/
│   │   ├── page.tsx             # Patterns list
│   │   └── [id]/
│   │       ├── page.tsx         # Pattern detail
│   │       └── generate/page.tsx # Generate complaint
│   │
│   ├── generated/
│   │   ├── page.tsx             # Generated list
│   │   └── [id]/page.tsx        # View generated
│   │
│   ├── settings/
│   │   ├── page.tsx             # General settings
│   │   ├── organization/page.tsx
│   │   ├── billing/page.tsx
│   │   └── team/page.tsx
│   │
│   └── admin/                   # Admin only
│       ├── users/page.tsx
│       └── audit/page.tsx
│
└── api/                         # API routes
```

### Key Components

```
components/
├── ui/                          # shadcn components
│   ├── button.tsx
│   ├── card.tsx
│   ├── data-table.tsx
│   ├── dialog.tsx
│   └── ...
│
├── layout/
│   ├── sidebar.tsx
│   ├── header.tsx
│   ├── nav.tsx
│   └── user-menu.tsx
│
├── complaints/
│   ├── complaints-table.tsx
│   ├── complaint-card.tsx
│   ├── complaint-filters.tsx
│   └── complaint-detail.tsx
│
├── patterns/
│   ├── patterns-table.tsx
│   ├── pattern-card.tsx
│   ├── severity-badge.tsx
│   ├── trend-chart.tsx
│   └── pattern-detail.tsx
│
├── generator/
│   ├── complaint-preview.tsx
│   ├── complaint-editor.tsx
│   └── pdf-download.tsx
│
├── charts/
│   ├── trend-line-chart.tsx
│   ├── severity-bar-chart.tsx
│   └── complaints-timeline.tsx
│
└── forms/
    ├── settings-form.tsx
    ├── invite-form.tsx
    └── billing-form.tsx
```

---

## 7. Security Architecture

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │────▶│  Clerk   │────▶│  Vercel  │────▶│   API    │
│  Browser │     │  Widget  │     │  Edge    │     │  Route   │
└──────────┘     └──────────┘     │  Middle- │     └──────────┘
                      │           │  ware    │           │
                      │           └────┬─────┘           │
                      │                │                 │
                      ▼                ▼                 ▼
                 ┌─────────────────────────────────────────┐
                 │              JWT Token                   │
                 │  - userId                                │
                 │  - orgId                                 │
                 │  - role                                  │
                 │  - permissions                           │
                 └─────────────────────────────────────────┘
```

### Authorization Layers

1. **Edge Middleware** - Verify JWT, redirect unauthenticated
2. **API Route** - Check organization membership
3. **Database RLS** - Enforce tenant isolation
4. **RBAC** - Check role permissions

### Row-Level Security (RLS)

```sql
-- Enable RLS on all tenant tables
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users see only their org's data
CREATE POLICY org_isolation ON patterns
  FOR ALL
  USING (organization_id = current_setting('app.org_id')::uuid);

-- Set org context from API
SET app.org_id = 'user-org-id';
```

---

## 8. Deployment Architecture

### Environment Strategy

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local dev | localhost:3000 |
| Preview | PR previews | pr-123.caseradar.dev |
| Staging | Pre-production | staging.caseradar.com |
| Production | Live | app.caseradar.com |

### CI/CD Pipeline

```yaml
# GitHub Actions Workflow

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-test:
    - Checkout
    - Install dependencies
    - Run ESLint
    - Run TypeScript check
    - Run unit tests
    - Run integration tests

  e2e:
    - Checkout
    - Install Playwright
    - Run E2E tests

  deploy-preview:
    if: pull_request
    - Deploy to Vercel preview
    - Comment PR with preview URL

  deploy-production:
    if: push to main
    - Deploy to Vercel production
    - Deploy workers to Railway
    - Run database migrations
    - Notify Slack
```

### Infrastructure Costs (Monthly)

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Pro | $20 |
| Railway | Usage | $10-30 |
| Supabase | Pro | $25 |
| Clerk | Free (10K MAU) | $0 |
| OpenAI | Usage | $5-20 |
| Anthropic | Usage | $10-30 |
| Resend | Free (3K/mo) | $0 |
| Sentry | Free tier | $0 |
| **Total** | | **$70-125** |

---

## 9. Monitoring & Observability

### Metrics to Track

| Category | Metrics |
|----------|---------|
| **Business** | MAU, complaint generations, patterns detected |
| **Performance** | Page load time, API latency, DB query time |
| **Reliability** | Error rate, uptime, job success rate |
| **Infrastructure** | CPU, memory, DB connections |

### Alerting Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| High error rate | >5% requests failing | P1 |
| API latency | p95 > 2s | P2 |
| Job failure | NHTSA sync fails | P2 |
| Database | Connections > 80% | P3 |

### Logging Strategy

```typescript
// Structured logging
logger.info('Complaint generated', {
  userId,
  orgId,
  patternId,
  duration: ms,
});

// Log levels
- ERROR: Unexpected failures
- WARN: Degraded performance, retries
- INFO: Business events, job completion
- DEBUG: Development only
```

---

## 10. Success Metrics

### MVP Launch Criteria

- [ ] User can sign up and create organization
- [ ] User can view NHTSA complaints
- [ ] User can view detected patterns
- [ ] User can generate complaint draft
- [ ] User can download PDF
- [ ] Billing works (trial + paid)
- [ ] All tests passing (>80% coverage)

### 90-Day Goals

| Metric | Target |
|--------|--------|
| Uptime | 99.5% |
| API p95 latency | <500ms |
| Error rate | <1% |
| Test coverage | >80% |
| Customer NPS | >40 |

---

## Summary

This plan provides the complete technical blueprint for CaseRadar. Key decisions:

1. **Monorepo with Next.js** - Unified codebase for frontend and API
2. **Supabase** - PostgreSQL + pgvector + realtime in one
3. **Clerk** - Authentication with multi-tenancy built-in
4. **Railway Workers** - Background jobs separate from Vercel
5. **Hybrid AI** - OpenAI embeddings + Claude generation

Next: Create IMPLEMENTATION_ROADMAP.md with ordered tasks.
