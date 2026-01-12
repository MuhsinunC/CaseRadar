# CaseRadar - Initial Project Plan (v1)

## Executive Summary

CaseRadar is an enterprise SaaS platform for law firms specializing in class action lawsuits. It monitors NHTSA vehicle complaint data, identifies patterns using semantic analysis, and auto-generates formal legal complaints.

---

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CASERADAR ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  DATA SOURCE │     │  DATA INGESTION  │     │   DATA STORAGE   │
│              │     │                  │     │                  │
│  NHTSA API   │────▶│  ETL Pipeline    │────▶│  PostgreSQL DB   │
│  (complaints)│     │  - Fetch         │     │  - Complaints    │
│              │     │  - Transform     │     │  - Patterns      │
│  Future:     │     │  - Dedupe        │     │  - Users/Orgs    │
│  - FDA       │     │  - Store         │     │  - Subscriptions │
│  - CFPB      │     │                  │     │                  │
│  - FTC       │     │  Scheduler       │     │  Vector DB       │
└──────────────┘     │  (real-time)     │     │  (embeddings)    │
                     └──────────────────┘     └────────┬─────────┘
                                                       │
                     ┌─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SEMANTIC ANALYSIS ENGINE                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│  │ Text Embedding │  │   Clustering   │  │ Trend Detection│                 │
│  │                │  │                │  │                │                 │
│  │ - Complaint    │  │ - Group similar│  │ - Time-series  │                 │
│  │   descriptions │  │   complaints   │  │   analysis     │                 │
│  │ - Vehicle info │  │ - Identify     │  │ - Spike        │                 │
│  │                │  │   patterns     │  │   detection    │                 │
│  └────────────────┘  └────────────────┘  └────────────────┘                 │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐                                     │
│  │Anomaly Detect. │  │Severity Scoring│                                     │
│  │                │  │                │                                     │
│  │ - Unusual      │  │ - Deaths       │                                     │
│  │   patterns     │  │ - Injuries     │                                     │
│  │ - Statistical  │  │ - Financial    │                                     │
│  │   outliers     │  │   impact       │                                     │
│  └────────────────┘  └────────────────┘                                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      LEGAL COMPLAINT GENERATOR                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pattern Data ──▶ Template Engine ──▶ LLM Enhancement ──▶ PDF Generator     │
│                                                                              │
│  - Aggregate evidence              - Legal language      - Court-ready      │
│  - Structure arguments             - Citations           - Versioned        │
│  - Format data                     - Proper formatting   - Downloadable     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SAAS PLATFORM                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    Auth     │  │   Billing   │  │    RBAC     │  │  Multi-     │        │
│  │             │  │             │  │             │  │  Tenant     │        │
│  │ - Login     │  │ - Stripe    │  │ - Admin     │  │             │        │
│  │ - Register  │  │ - Plans     │  │ - Analyst   │  │ - Org       │        │
│  │ - SSO       │  │ - Usage     │  │ - Viewer    │  │   isolation │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND DASHBOARD                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pages:                                                                      │
│  - Landing page (marketing)                                                  │
│  - Auth (login/register/forgot password)                                     │
│  - Dashboard (metrics, overview)                                             │
│  - Complaints Explorer (search, filter, browse NHTSA data)                   │
│  - Pattern Detector (clusters, trends, anomalies)                            │
│  - Complaint Generator (select pattern → generate complaint)                 │
│  - Generated Complaints Manager (history, versions, downloads)               │
│  - Settings (profile, org, billing)                                          │
│  - Admin Panel (users, roles, audit logs)                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Preliminary Tech Stack Considerations

### Frontend
- **Framework**: Next.js 14+ (App Router) - SSR, excellent DX, Vercel integration
- **UI**: Tailwind CSS + shadcn/ui - modern, accessible components
- **State**: Zustand or TanStack Query - lightweight, powerful
- **Charts**: Recharts or Tremor - data visualization

### Backend
- **Runtime**: Node.js with TypeScript OR Python FastAPI
- **API**: REST with OpenAPI spec OR GraphQL
- **ORM**: Prisma (Node) or SQLAlchemy (Python)
- **Queue**: BullMQ or Celery for background jobs

### Database
- **Primary**: PostgreSQL (relational data, JSONB support)
- **Vector**: pgvector extension OR dedicated Pinecone/Weaviate
- **Cache**: Redis (sessions, caching, rate limiting)

### Infrastructure
- **Hosting**: Vercel (frontend) + Railway/Render/AWS (backend)
- **Auth**: Clerk or Auth0 (managed) OR NextAuth (self-hosted)
- **Billing**: Stripe
- **Monitoring**: Sentry, Datadog, or self-hosted

### ML/Analysis
- **Embeddings**: OpenAI embeddings OR sentence-transformers
- **Clustering**: scikit-learn, HDBSCAN
- **LLM**: Claude API for complaint generation

---

## Major Milestones

| # | Milestone | Description | Phases |
|---|-----------|-------------|--------|
| 1 | Research Complete | All unknowns investigated, decisions documented | 1-2 |
| 2 | Architecture Finalized | Detailed tech spec, DB schema, API design | 3 |
| 3 | Project Scaffolded | Tooling, CI/CD, Docker, tests framework | 4 |
| 4 | Data Layer Complete | Models, migrations, NHTSA ingestion working | 5-6 |
| 5 | Analysis Engine Complete | Embeddings, clustering, trends, scoring | 7 |
| 6 | Complaint Gen Complete | Templates, LLM integration, PDF output | 8 |
| 7 | Auth & Billing Complete | Users, orgs, RBAC, Stripe subscriptions | 9-10 |
| 8 | API Complete | All endpoints, validation, rate limiting | 11 |
| 9 | Frontend Complete | All pages, responsive, real-time updates | 12 |
| 10 | Testing Complete | E2E, browser automation, visual regression | 13 |
| 11 | Security Hardened | Audit, penetration testing, compliance | 14 |
| 12 | Production Ready | Deployed, monitored, documented | 15-16 |

---

## Known Unknowns (Requiring Research)

### Critical
1. **NHTSA API specifics**: Rate limits? Authentication? Data freshness? Historical data availability?
2. **Legal complaint format**: What does a federal class action complaint actually look like? Required sections?
3. **Embedding model choice**: OpenAI vs open-source? Cost implications at scale?

### Important
4. **Auth solution**: Clerk vs Auth0 vs NextAuth? Pricing? Features needed?
5. **Billing complexity**: How to structure plans? Usage-based or flat rate?
6. **Hosting architecture**: Monorepo or separate services? Serverless or containers?

### Nice to Know
7. **ML pipeline tools**: Weights & Biases worth it? Other MLOps tools?
8. **Compliance requirements**: GDPR? CCPA? Legal tech specific regulations?
9. **Competitor analysis**: What similar tools exist?

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NHTSA API unavailable/rate limited | Medium | High | Build robust caching, consider data dumps |
| Legal complaint format complex | Medium | Medium | Consult actual complaints, start simple |
| Embedding costs at scale | Low | Medium | Use open-source models, batch processing |
| Auth/billing integration complexity | Medium | Medium | Use proven managed solutions |
| Scope creep | High | High | Stick to phases, MVP first |
| Security vulnerabilities | Medium | Critical | Security-first design, audits |

---

## Success Criteria

The project is successful when:
1. Law firms can sign up, subscribe, and access the platform
2. NHTSA data is ingested and updated regularly
3. Patterns are automatically detected and scored
4. Legal complaints can be generated with one click
5. System is secure, performant, and production-ready
6. All tests pass with >80% coverage

---

## Next Steps

1. Complete RESEARCH_AGENDA.md with specific questions
2. Execute research phase (Phase 2)
3. Refine this plan based on research findings (Phase 3 - PLAN_v2.md)
