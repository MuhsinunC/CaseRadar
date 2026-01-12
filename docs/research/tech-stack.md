# Tech Stack Research

## Summary

This document finalizes the technology decisions for CaseRadar based on research findings from other documents.

---

## Final Stack Decision

```
┌─────────────────────────────────────────────────────────────────┐
│                      CASERADAR TECH STACK                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND                                                        │
│  ├── Framework:     Next.js 15 (App Router)                     │
│  ├── Language:      TypeScript                                   │
│  ├── UI:            shadcn/ui + Tailwind CSS                    │
│  ├── State:         TanStack Query + Zustand                    │
│  ├── Forms:         React Hook Form + Zod                       │
│  └── Charts:        Recharts                                     │
│                                                                  │
│  BACKEND                                                         │
│  ├── Runtime:       Next.js API Routes (serverless)             │
│  ├── Language:      TypeScript                                   │
│  ├── ORM:           Prisma                                       │
│  ├── Validation:    Zod                                          │
│  └── Background:    Railway (Node.js workers)                   │
│                                                                  │
│  DATA                                                            │
│  ├── Database:      Supabase (PostgreSQL)                       │
│  ├── Vectors:       pgvector (Supabase extension)               │
│  ├── Cache:         Vercel KV (Redis) or Upstash                │
│  └── File Storage:  Supabase Storage (for PDFs)                 │
│                                                                  │
│  INFRASTRUCTURE                                                  │
│  ├── Hosting:       Vercel (frontend + API)                     │
│  ├── Workers:       Railway (background jobs)                   │
│  ├── CDN:           Vercel Edge Network                         │
│  └── DNS:           Vercel or Cloudflare                        │
│                                                                  │
│  SERVICES                                                        │
│  ├── Auth:          Clerk                                        │
│  ├── Billing:       Stripe                                       │
│  ├── Email:         Resend                                       │
│  ├── Monitoring:    Sentry + Vercel Analytics                   │
│  └── LLM:           Anthropic Claude API                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Frontend Framework

### Decision: Next.js 15 (App Router)

**Rationale**:
- Server Components reduce client bundle size
- Built-in API routes (unified codebase)
- Excellent Vercel integration
- Strong TypeScript support
- Active community and ecosystem
- Server Actions for mutations

**App Router Benefits**:
- Streaming and Suspense built-in
- Nested layouts
- Parallel routes for complex UIs
- Intercepting routes for modals
- Built-in loading states

### Project Structure

```
caseradar/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Dashboard home
│   │   ├── complaints/
│   │   │   ├── page.tsx             # Complaints list
│   │   │   └── [id]/page.tsx        # Complaint detail
│   │   ├── patterns/
│   │   │   ├── page.tsx             # Patterns list
│   │   │   └── [id]/page.tsx        # Pattern detail
│   │   ├── generator/
│   │   │   └── page.tsx             # Complaint generator
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   ├── billing/
│   │   │   └── organization/
│   │   └── admin/
│   │       ├── users/
│   │       └── audit/
│   ├── (marketing)/
│   │   ├── page.tsx                 # Landing page
│   │   ├── pricing/
│   │   └── layout.tsx
│   ├── api/
│   │   ├── complaints/
│   │   ├── patterns/
│   │   ├── generator/
│   │   └── webhooks/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                          # shadcn components
│   ├── charts/
│   ├── tables/
│   └── forms/
├── lib/
│   ├── db.ts                        # Prisma client
│   ├── auth.ts                      # Clerk helpers
│   ├── stripe.ts                    # Stripe helpers
│   └── nhtsa.ts                     # NHTSA API client
├── hooks/
├── types/
├── prisma/
│   └── schema.prisma
└── public/
```

---

## 2. UI Components

### Decision: shadcn/ui + Tailwind CSS

**Rationale**:
- Copy-paste components (own your code)
- Highly customizable
- Accessible (Radix UI primitives)
- Active development
- Excellent documentation
- Perfect for dashboards

### Core Components Needed

| Component | Use Case |
|-----------|----------|
| **DataTable** | Complaints list, patterns list |
| **Card** | Dashboard metrics, pattern cards |
| **Dialog/Sheet** | Complaint detail, forms |
| **Tabs** | Pattern analysis views |
| **Select/Combobox** | Filters, vehicle selection |
| **Form** | Complaint generator, settings |
| **Toast** | Notifications |
| **Badge** | Status indicators |
| **Chart** | Trend visualization |
| **Skeleton** | Loading states |

### Theme Configuration

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        // CaseRadar brand colors
        primary: {
          DEFAULT: '#2563eb', // Blue
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#dc2626', // Red for severity
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#f59e0b', // Amber for medium severity
          foreground: '#000000',
        },
      },
    },
  },
}
```

---

## 3. State Management

### Decision: TanStack Query + Zustand

**TanStack Query** (React Query):
- Server state management
- Caching, refetching, polling
- Optimistic updates
- Infinite scroll support

**Zustand**:
- Client-only state
- Filters, UI state
- Simple API

### Example Usage

```typescript
// TanStack Query for server state
const { data: patterns, isLoading } = useQuery({
  queryKey: ['patterns', filters],
  queryFn: () => fetchPatterns(filters),
});

// Zustand for UI state
const useFilterStore = create((set) => ({
  filters: { severity: 'all', dateRange: '30d' },
  setFilters: (filters) => set({ filters }),
}));
```

---

## 4. Backend Architecture

### Decision: Next.js API Routes + Railway Workers

**API Routes** (Vercel):
- CRUD operations
- Short-lived requests (<10s)
- Edge-compatible

**Railway Workers**:
- NHTSA data ingestion
- Clustering jobs
- PDF generation
- Scheduled tasks

### API Route Example

```typescript
// app/api/patterns/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const { userId, orgId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const patterns = await prisma.pattern.findMany({
    where: { organizationId: orgId },
    orderBy: { severityScore: 'desc' },
  });

  return NextResponse.json(patterns);
}
```

---

## 5. Database Schema

### Decision: Prisma + Supabase (PostgreSQL)

**Prisma Benefits**:
- Type-safe queries
- Auto-generated types
- Migrations
- Relation handling

### Core Models

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [vector]
}

// Multi-tenancy
model Organization {
  id        String   @id @default(cuid())
  name      String
  clerkOrgId String  @unique
  plan      Plan     @default(FREE)
  createdAt DateTime @default(now())

  users         User[]
  patterns      Pattern[]
  complaints    GeneratedComplaint[]
  subscription  Subscription?
}

model User {
  id             String   @id @default(cuid())
  clerkUserId    String   @unique
  email          String
  role           Role     @default(VIEWER)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdAt      DateTime @default(now())
}

// NHTSA Data
model Complaint {
  id           String   @id @default(cuid())
  nhtsaId      String   @unique  // CMPLID
  odiNumber    String            // ODINO
  manufacturer String
  make         String
  model        String
  year         Int
  component    String
  description  String   @db.Text
  crash        Boolean  @default(false)
  fire         Boolean  @default(false)
  injuries     Int      @default(0)
  deaths       Int      @default(0)
  failDate     DateTime?
  dateAdded    DateTime

  // Vector embedding
  embedding    Unsupported("vector(1536)")?

  // Cluster assignment
  clusterId    String?
  cluster      Pattern? @relation(fields: [clusterId], references: [id])

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([make, model, year])
  @@index([component])
  @@index([dateAdded])
}

// Pattern/Cluster
model Pattern {
  id              String   @id @default(cuid())
  name            String   // Auto-generated from top terms
  description     String?
  make            String
  model           String?
  yearStart       Int?
  yearEnd         Int?
  component       String

  // Statistics
  complaintCount  Int      @default(0)
  crashCount      Int      @default(0)
  fireCount       Int      @default(0)
  injuryCount     Int      @default(0)
  deathCount      Int      @default(0)

  // Scoring
  severityScore   Float    @default(0)
  trendScore      Float    @default(0)  // Rate of increase

  // Tracking
  firstSeen       DateTime
  lastUpdated     DateTime
  isActive        Boolean  @default(true)

  complaints      Complaint[]
  generatedComplaints GeneratedComplaint[]

  // Tenant visibility (patterns can be global or org-specific)
  organizationId  String?
  organization    Organization? @relation(fields: [organizationId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([severityScore])
  @@index([make, model])
}

// Generated Legal Complaints
model GeneratedComplaint {
  id              String   @id @default(cuid())
  patternId       String
  pattern         Pattern  @relation(fields: [patternId], references: [id])
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // Content
  content         Json     // Structured complaint data
  pdfUrl          String?  // Supabase Storage URL

  // Metadata
  status          ComplaintStatus @default(DRAFT)
  version         Int      @default(1)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       String   // Clerk user ID
}

// Billing
model Subscription {
  id              String   @id @default(cuid())
  organizationId  String   @unique
  organization    Organization @relation(fields: [organizationId], references: [id])

  stripeCustomerId    String   @unique
  stripeSubscriptionId String?  @unique
  stripePriceId       String?

  status          SubscriptionStatus @default(INACTIVE)
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Audit Log
model AuditLog {
  id              String   @id @default(cuid())
  organizationId  String
  userId          String
  action          String
  resource        String
  resourceId      String?
  metadata        Json?
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
}

// Enums
enum Plan {
  FREE
  BASIC
  PRO
  ENTERPRISE
}

enum Role {
  ADMIN
  ANALYST
  VIEWER
}

enum ComplaintStatus {
  DRAFT
  FINALIZED
  FILED
}

enum SubscriptionStatus {
  ACTIVE
  INACTIVE
  PAST_DUE
  CANCELED
}
```

---

## 6. Real-time Features

### Decision: Supabase Realtime + Polling

**Use Supabase Realtime for**:
- Dashboard metrics updates
- Pattern score changes
- New complaint notifications

**Use Polling (TanStack Query) for**:
- Complaint list refresh
- Search results

### Implementation

```typescript
// Supabase Realtime subscription
const supabase = createClient();

useEffect(() => {
  const channel = supabase
    .channel('patterns')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'patterns',
    }, (payload) => {
      queryClient.invalidateQueries(['patterns']);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## 7. External Services

### Embeddings: OpenAI

```typescript
// lib/embeddings.ts
import OpenAI from 'openai';

const openai = new OpenAI();

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
```

### LLM: Claude API

```typescript
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function generateComplaintNarrative(
  patternData: PatternData
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Generate the factual allegations section for a class action complaint based on this pattern data: ${JSON.stringify(patternData)}`
    }],
  });
  return message.content[0].text;
}
```

### PDF Generation: react-pdf

```typescript
// lib/pdf.ts
import { renderToBuffer } from '@react-pdf/renderer';
import { ComplaintDocument } from '@/components/pdf/ComplaintDocument';

export async function generatePDF(complaint: Complaint): Promise<Buffer> {
  return renderToBuffer(
    <ComplaintDocument complaint={complaint} />
  );
}
```

---

## 8. Testing Strategy

### Test Pyramid

```
                    ┌───────────┐
                    │   E2E     │  Playwright
                    │   (10%)   │
                    └─────┬─────┘
               ┌──────────┴──────────┐
               │    Integration      │  Vitest + Testing Library
               │       (30%)         │
               └──────────┬──────────┘
          ┌───────────────┴───────────────┐
          │           Unit Tests          │  Vitest
          │             (60%)             │
          └───────────────────────────────┘
```

### Tools

| Type | Tool |
|------|------|
| Unit | Vitest |
| Component | React Testing Library |
| E2E | Playwright |
| API | Supertest |
| Mocking | MSW (Mock Service Worker) |

---

## 9. Development Workflow

### Local Development

```bash
# Start all services
docker-compose up -d

# Run dev server
npm run dev

# Run tests
npm run test

# Run E2E
npm run test:e2e
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## 10. Package Versions

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "typescript": "^5.3.0",
    "@clerk/nextjs": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0",
    "@prisma/client": "^6.0.0",
    "zod": "^3.22.0",
    "react-hook-form": "^7.50.0",
    "@hookform/resolvers": "^3.3.0",
    "recharts": "^2.12.0",
    "openai": "^4.25.0",
    "@anthropic-ai/sdk": "^0.15.0",
    "@react-pdf/renderer": "^3.3.0",
    "stripe": "^14.0.0",
    "resend": "^3.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^14.0.0",
    "@playwright/test": "^1.41.0",
    "msw": "^2.1.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

---

## Summary

| Category | Technology | Rationale |
|----------|------------|-----------|
| Framework | Next.js 15 | Server components, unified codebase |
| Language | TypeScript | Type safety, better DX |
| UI | shadcn/ui + Tailwind | Customizable, accessible |
| State | TanStack Query + Zustand | Server + client state |
| Database | Supabase (PostgreSQL) | pgvector, realtime, managed |
| ORM | Prisma | Type-safe, migrations |
| Auth | Clerk | Multi-tenant, RBAC built-in |
| Billing | Stripe | Industry standard |
| Hosting | Vercel | Best Next.js platform |
| Workers | Railway | Background jobs |
| LLM | Claude API | Complaint generation |
| Embeddings | OpenAI | Cost-effective, quality |
| Testing | Vitest + Playwright | Fast, reliable |

---

## References

- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TanStack Query](https://tanstack.com/query)
- [Clerk Next.js](https://clerk.com/docs/quickstarts/nextjs)
