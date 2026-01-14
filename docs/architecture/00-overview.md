# CaseRadar System Overview

## Purpose

CaseRadar is a multi-tenant SaaS platform designed for law firms to:
1. **Monitor NHTSA vehicle complaints** - Import and analyze complaint data from the National Highway Traffic Safety Administration
2. **Detect patterns** - Use AI/ML clustering to identify patterns in vehicle defect complaints
3. **Generate legal complaints** - AI-assisted drafting of class action lawsuit documents
4. **Track severity trends** - Prioritize high-impact patterns with injury/death statistics

## Tech Stack Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 16.1.1, React 19, TypeScript | App router, server components, client components |
| **Styling** | Tailwind CSS 4, Radix UI, Lucide Icons | Design system with accessible primitives |
| **Authentication** | Clerk | Multi-tenant auth with organizations |
| **Database** | PostgreSQL + Prisma ORM | Data persistence with vector extensions |
| **AI/ML** | OpenAI Embeddings, Anthropic Claude | Semantic search & complaint generation |
| **Billing** | Stripe | Subscription management |
| **PDF Export** | jsPDF | Legal document generation |
| **Monitoring** | Sentry | Error tracking |

## High-Level System Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["Browser"]
    end

    subgraph NextJS["Next.js Application"]
        subgraph Pages["Page Routes"]
            Landing["/"]
            SignIn["/sign-in"]
            Dashboard["/dashboard"]
            Complaints["/complaints"]
            Patterns["/patterns"]
            Generator["/generator"]
            Settings["/settings"]
        end

        subgraph API["API Layer"]
            ComplaintsAPI["/api/complaints"]
            PatternsAPI["/api/patterns"]
            GeneratorAPI["/api/generator"]
            DashboardAPI["/api/dashboard/*"]
            WebhooksAPI["/api/webhooks/*"]
            CronAPI["/api/cron/*"]
        end

        Middleware["Clerk Middleware"]
    end

    subgraph External["External Services"]
        Clerk["Clerk Auth"]
        Stripe["Stripe Billing"]
        OpenAI["OpenAI API"]
        Anthropic["Anthropic API"]
        NHTSA["NHTSA API"]
    end

    subgraph Database["Data Layer"]
        PostgreSQL[(PostgreSQL)]
        VectorDB["pgvector Extension"]
    end

    Browser --> Middleware
    Middleware --> Pages
    Pages --> API
    API --> PostgreSQL
    API --> VectorDB

    API --> Clerk
    API --> Stripe
    API --> OpenAI
    API --> Anthropic
    API --> NHTSA

    WebhooksAPI --> Clerk
    WebhooksAPI --> Stripe
```

## Multi-Tenant Architecture

```mermaid
graph TB
    subgraph Tenancy["Multi-Tenant Structure"]
        Org1["Organization A"]
        Org2["Organization B"]
    end

    subgraph Org1Data["Org A Resources"]
        U1A["User 1 (Admin)"]
        U1B["User 2 (Analyst)"]
        P1["Patterns"]
        G1["Generated Complaints"]
        S1["Subscription"]
    end

    subgraph Org2Data["Org B Resources"]
        U2A["User 1 (Admin)"]
        U2B["User 2 (Viewer)"]
        P2["Patterns"]
        G2["Generated Complaints"]
        S2["Subscription"]
    end

    subgraph Shared["Shared Resources"]
        Complaints["NHTSA Complaints"]
        GlobalPatterns["Global Patterns"]
    end

    Org1 --> U1A
    Org1 --> U1B
    Org1 --> P1
    Org1 --> G1
    Org1 --> S1

    Org2 --> U2A
    Org2 --> U2B
    Org2 --> P2
    Org2 --> G2
    Org2 --> S2

    P1 -.->|"references"| Complaints
    P2 -.->|"references"| Complaints
    GlobalPatterns -.->|"visible to all"| Org1
    GlobalPatterns -.->|"visible to all"| Org2
```

## Role-Based Access Control

```mermaid
graph LR
    subgraph Roles["User Roles"]
        Admin["ADMIN"]
        Analyst["ANALYST"]
        Viewer["VIEWER"]
    end

    subgraph Permissions["Permissions"]
        View["View Data"]
        Create["Create/Edit"]
        Delete["Delete"]
        Manage["Manage Org"]
    end

    Admin --> View
    Admin --> Create
    Admin --> Delete
    Admin --> Manage

    Analyst --> View
    Analyst --> Create

    Viewer --> View
```

## Data Flow Overview

```mermaid
sequenceDiagram
    participant NHTSA as NHTSA API
    participant Cron as Cron Job
    participant DB as Database
    participant ML as AI/ML Pipeline
    participant UI as User Interface
    participant PDF as PDF Generator

    Note over NHTSA,PDF: Data Ingestion Flow
    Cron->>NHTSA: Fetch latest complaints
    NHTSA-->>Cron: Raw complaint data
    Cron->>DB: Store complaints
    Cron->>ML: Generate embeddings
    ML->>DB: Store embeddings
    Cron->>ML: Run clustering
    ML->>DB: Store patterns

    Note over NHTSA,PDF: User Interaction Flow
    UI->>DB: Query complaints/patterns
    DB-->>UI: Display data
    UI->>ML: Generate complaint draft
    ML-->>UI: AI-generated content
    UI->>PDF: Export as PDF
    PDF-->>UI: Download link
```

## Request Flow

```mermaid
flowchart LR
    subgraph Request["Incoming Request"]
        R1["HTTP Request"]
    end

    subgraph Middleware["Middleware Layer"]
        M1["Clerk Auth Check"]
        M2{"Is Public Route?"}
        M3["Validate Session"]
        M4["Redirect to Sign-In"]
    end

    subgraph Route["Route Handler"]
        R2["getCurrentUser()"]
        R3["Tenant Isolation Check"]
        R4["Business Logic"]
        R5["Database Query"]
    end

    subgraph Response["Response"]
        RES["JSON Response"]
    end

    R1 --> M1
    M1 --> M2
    M2 -->|Yes| R4
    M2 -->|No| M3
    M3 -->|Valid| R2
    M3 -->|Invalid| M4
    R2 --> R3
    R3 --> R4
    R4 --> R5
    R5 --> RES
```

## Key Design Decisions

### 1. Multi-Tenant Isolation
- All organization-specific data includes `organizationId` foreign key
- API routes verify `user.organizationId` matches resource ownership
- Global patterns (NHTSA-derived) have `organizationId = null`

### 2. Vector Search Architecture
- Complaint descriptions are embedded using OpenAI `text-embedding-3-small`
- 1536-dimensional vectors stored in PostgreSQL with pgvector extension
- Enables semantic search for similar complaints

### 3. Demo Data Pattern
- When database is empty, API routes return demo data
- Demo IDs use `demo-` prefix for identification
- Allows product demonstration without real data

### 4. Authentication Strategy
- Clerk handles all auth flows (sign-in, sign-up, organizations)
- User/Org data synced to local DB via webhooks
- Middleware protects routes based on authentication state

### 5. Subscription Tiers

| Plan | Complaint Searches | Pattern Alerts | Generated Complaints | Team Members |
|------|-------------------|----------------|---------------------|--------------|
| FREE | 50/month | 3 | 1/month | 1 |
| BASIC | 500/month | 10 | 10/month | 3 |
| PRO | 5000/month | Unlimited | 50/month | 10 |
| ENTERPRISE | Unlimited | Unlimited | Unlimited | Unlimited |

## Environment Configuration

```
# Database
DATABASE_URL          # PostgreSQL connection string
DIRECT_URL            # Direct database connection (bypasses pooler)

# Authentication (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET

# AI Services
OPENAI_API_KEY        # For embeddings
ANTHROPIC_API_KEY     # For complaint generation

# Billing (Stripe)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Monitoring
SENTRY_DSN
```

## Directory Structure Summary

```
caseradar/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # Protected dashboard routes
│   │   ├── api/                # API route handlers
│   │   ├── sign-in/            # Clerk sign-in
│   │   └── sign-up/            # Clerk sign-up
│   ├── components/             # React components
│   │   ├── ui/                 # Shadcn/ui primitives
│   │   ├── complaints/         # Complaint-specific
│   │   ├── patterns/           # Pattern-specific
│   │   ├── generator/          # Generator-specific
│   │   └── dashboard/          # Dashboard-specific
│   └── lib/                    # Business logic
│       ├── auth/               # Auth utilities
│       ├── billing/            # Stripe integration
│       ├── nhtsa/              # NHTSA API client
│       ├── analysis/           # ML/clustering
│       ├── embeddings/         # OpenAI embeddings
│       ├── complaint/          # Complaint generation
│       ├── security/           # Security utilities
│       └── repositories/       # Data access layer
├── prisma/
│   └── schema.prisma           # Database schema
└── docs/
    └── architecture/           # This documentation
```

---

**Next Documents:**
- [01-database-schema.md](./01-database-schema.md) - Complete database ERD
- [02-api-routes.md](./02-api-routes.md) - API endpoint documentation
