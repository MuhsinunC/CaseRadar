# CaseRadar Testing & Development Documentation

## Overview

This document covers testing strategy, developer experience, local development setup, and code quality standards for CaseRadar. A robust testing strategy is essential for a legal technology platform where bugs can have serious consequences.

---

## Testing Strategy

### Testing Pyramid

```mermaid
graph TB
    subgraph Pyramid["Testing Pyramid"]
        E2E["E2E Tests<br/>~10%<br/>Critical user flows"]
        Integration["Integration Tests<br/>~30%<br/>API routes, database"]
        Unit["Unit Tests<br/>~60%<br/>Business logic, utilities"]
    end

    Unit --> Integration
    Integration --> E2E
```

### Test Coverage Requirements

| Layer | Minimum Coverage | Critical Paths |
|-------|-----------------|----------------|
| Unit Tests | 80% | Business logic, validators |
| Integration Tests | 70% | API routes, database queries |
| E2E Tests | 100% of flows | Auth, complaints, patterns, generator |

---

## Unit Testing

### Framework & Tools

| Tool | Purpose |
|------|---------|
| Vitest | Test runner (Vite-native) |
| Testing Library | React component testing |
| MSW (Mock Service Worker) | API mocking |
| Faker.js | Test data generation |

### Unit Test Structure

```typescript
// src/lib/analysis/__tests__/clustering.test.ts
import { describe, it, expect, vi } from 'vitest';
import { clusterComplaints } from '../clustering';
import { mockComplaints, mockEmbeddings } from '@/test/fixtures';

describe('clusterComplaints', () => {
  it('should group similar complaints together', () => {
    const result = clusterComplaints(mockComplaints, {
      similarityThreshold: 0.85,
      minClusterSize: 3,
    });

    expect(result.clusters).toHaveLength(2);
    expect(result.clusters[0].complaints).toHaveLength(5);
  });

  it('should respect minimum cluster size', () => {
    const result = clusterComplaints(mockComplaints, {
      similarityThreshold: 0.95, // High threshold = fewer matches
      minClusterSize: 10,
    });

    // Complaints that don't meet min size go to noise
    expect(result.noise.length).toBeGreaterThan(0);
  });

  it('should use fixed random seed for reproducibility', () => {
    const result1 = clusterComplaints(mockComplaints, { randomSeed: 42 });
    const result2 = clusterComplaints(mockComplaints, { randomSeed: 42 });

    expect(result1.clusters).toEqual(result2.clusters);
  });
});
```

### Mocking External Services

```mermaid
flowchart TD
    subgraph Tests["Test Environment"]
        TestCode["Test Code"]
        MSW["MSW Server"]
    end

    subgraph Mocks["Mock Handlers"]
        OpenAI["OpenAI Mock<br/>Return fixed embeddings"]
        Anthropic["Anthropic Mock<br/>Return template response"]
        NHTSA["NHTSA Mock<br/>Return fixture data"]
        Stripe["Stripe Mock<br/>Return success"]
    end

    TestCode --> MSW
    MSW --> Mocks
```

### Mock Configuration

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // OpenAI Embeddings
  http.post('https://api.openai.com/v1/embeddings', () => {
    return HttpResponse.json({
      data: [{ embedding: new Array(1536).fill(0.1) }],
      usage: { total_tokens: 10 },
    });
  }),

  // Anthropic Claude
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      content: [{ text: '{"sections": [...]}', type: 'text' }],
      usage: { input_tokens: 100, output_tokens: 500 },
    });
  }),

  // NHTSA API
  http.get('https://api.nhtsa.gov/complaints/*', () => {
    return HttpResponse.json({
      results: mockNHTSAComplaints,
      count: 100,
    });
  }),
];
```

---

## Integration Testing

### Database Testing Strategy

```mermaid
flowchart TD
    subgraph Setup["Test Setup"]
        CreateDB["Create test database"]
        Migrate["Run migrations"]
        Seed["Seed test data"]
    end

    subgraph Tests["Test Execution"]
        Transaction["Wrap in transaction"]
        Execute["Execute test"]
        Assert["Assert results"]
        Rollback["Rollback transaction"]
    end

    subgraph Cleanup["Cleanup"]
        Reset["Reset sequences"]
        Clear["Clear tables"]
    end

    Setup --> Tests
    Tests --> Cleanup
```

### Integration Test Example

```typescript
// src/app/api/complaints/__tests__/route.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/database/prisma';
import { createTestUser, cleanupTestData } from '@/test/helpers';

describe('GET /api/complaints', () => {
  let testUser: TestUser;

  beforeEach(async () => {
    testUser = await createTestUser({
      role: 'ANALYST',
      organizationId: 'test-org-1',
    });
  });

  afterEach(async () => {
    await cleanupTestData(testUser.id);
  });

  it('should return complaints for the user organization only', async () => {
    // Arrange: Create complaints for multiple orgs
    await prisma.complaint.createMany({
      data: [
        { ...mockComplaint, organizationId: 'test-org-1' },
        { ...mockComplaint, organizationId: 'test-org-2' }, // Different org
      ],
    });

    // Act
    const response = await GET(mockRequest({ userId: testUser.id }));
    const data = await response.json();

    // Assert: Only test-org-1 complaints returned
    expect(data.complaints).toHaveLength(1);
    expect(data.complaints[0].organizationId).toBe('test-org-1');
  });

  it('should enforce rate limiting', async () => {
    // Make 61 requests (limit is 60/min)
    const requests = Array(61).fill(null).map(() =>
      GET(mockRequest({ userId: testUser.id }))
    );

    const responses = await Promise.all(requests);
    const lastResponse = responses[60];

    expect(lastResponse.status).toBe(429);
  });
});
```

### API Route Testing Matrix

| Route | Auth Required | Rate Limit | Tenant Isolation | Tests |
|-------|---------------|------------|------------------|-------|
| `GET /api/complaints` | Yes | 60/min | Yes | 15 |
| `GET /api/complaints/[id]` | Yes | 100/min | Yes | 8 |
| `GET /api/patterns` | Yes | 60/min | Yes | 12 |
| `POST /api/generator/generate` | Yes | 10/min | Yes | 10 |
| `GET /api/dashboard/stats` | Yes | 30/min | Yes | 6 |
| `POST /api/webhooks/clerk` | No (signature) | 1000/min | N/A | 8 |

---

## End-to-End Testing

### E2E Framework

| Tool | Purpose |
|------|---------|
| Playwright | Browser automation |
| Playwright Test | Test runner |
| Docker Compose | Test environment |

### Critical User Flows

```mermaid
flowchart TD
    subgraph Auth["Authentication Flow"]
        A1["Sign up"] --> A2["Email verification"]
        A2 --> A3["First sign in"]
        A3 --> A4["Dashboard redirect"]
    end

    subgraph Complaints["Complaint Search Flow"]
        C1["Navigate to complaints"]
        C1 --> C2["Enter search query"]
        C2 --> C3["View results"]
        C3 --> C4["Open complaint detail"]
        C4 --> C5["View similar complaints"]
    end

    subgraph Patterns["Pattern Analysis Flow"]
        P1["Navigate to patterns"]
        P1 --> P2["Filter by severity"]
        P2 --> P3["Select pattern"]
        P3 --> P4["View complaint list"]
    end

    subgraph Generator["Document Generation Flow"]
        G1["Select pattern"]
        G1 --> G2["Configure sections"]
        G2 --> G3["Generate draft"]
        G3 --> G4["Review content"]
        G4 --> G5["Export PDF"]
    end
```

### E2E Test Example

```typescript
// e2e/generator.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Document Generator', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/sign-in');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'test-password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should generate complaint document from pattern', async ({ page }) => {
    // Navigate to patterns
    await page.click('[data-testid="nav-patterns"]');
    await expect(page).toHaveURL('/patterns');

    // Select first pattern
    await page.click('[data-testid="pattern-card"]:first-child');

    // Click generate button
    await page.click('[data-testid="generate-complaint"]');
    await expect(page).toHaveURL(/\/generator/);

    // Wait for generation
    await expect(page.locator('[data-testid="generation-status"]'))
      .toContainText('Complete', { timeout: 60000 });

    // Verify content sections
    await expect(page.locator('[data-testid="section-introduction"]'))
      .toBeVisible();
    await expect(page.locator('[data-testid="section-factual-background"]'))
      .toBeVisible();

    // Export PDF
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-pdf"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/complaint.*\.pdf$/);
  });

  test('should show validation errors for incomplete input', async ({ page }) => {
    await page.goto('/generator');

    // Try to generate without selecting pattern
    await page.click('[data-testid="generate-btn"]');

    await expect(page.locator('[data-testid="error-message"]'))
      .toContainText('Please select a pattern');
  });
});
```

---

## Local Development Setup

### Prerequisites

```mermaid
graph LR
    subgraph Required["Required"]
        Node["Node.js 20+"]
        Bun["Bun 1.0+"]
        Docker["Docker Desktop"]
        Git["Git"]
    end

    subgraph Accounts["Accounts Needed"]
        Clerk["Clerk (dev)"]
        Supabase["Supabase (local)"]
        OpenAI["OpenAI API"]
        Anthropic["Anthropic API"]
    end
```

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/your-org/caseradar.git
cd caseradar

# 2. Install dependencies
bun install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Start local database
docker-compose up -d postgres

# 5. Run migrations
bun run db:migrate

# 6. Seed development data
bun run db:seed

# 7. Start development server
bun run dev
```

### Environment Configuration

```bash
# .env.example
# Database (local development)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/caseradar_dev"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/caseradar_dev"

# Authentication (Clerk development instance)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# AI Services (use development keys with low limits)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Billing (Stripe test mode)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Monitoring (optional for local)
SENTRY_DSN=""

# Local development
CRON_SECRET="local-dev-secret"
```

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: caseradar_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Optional: Local email testing
  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_data:
```

### Development Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Production build |
| `bun run test` | Run all tests |
| `bun run test:unit` | Run unit tests |
| `bun run test:integration` | Run integration tests |
| `bun run test:e2e` | Run E2E tests |
| `bun run db:migrate` | Run database migrations |
| `bun run db:seed` | Seed database |
| `bun run db:reset` | Reset database |
| `bun run lint` | Run ESLint |
| `bun run typecheck` | Run TypeScript check |

---

## Code Quality Standards

### TypeScript Configuration

```mermaid
graph TB
    subgraph Strict["Strict Mode Enabled"]
        NoAny["noImplicitAny: true"]
        StrictNull["strictNullChecks: true"]
        StrictBind["strictBindCallApply: true"]
        NoUnused["noUnusedLocals: true"]
    end

    subgraph Additional["Additional Checks"]
        ExactOptional["exactOptionalPropertyTypes: true"]
        NoUnchecked["noUncheckedIndexedAccess: true"]
    end
```

### ESLint Rules

| Rule | Severity | Rationale |
|------|----------|-----------|
| `@typescript-eslint/no-explicit-any` | Error | Type safety |
| `@typescript-eslint/no-unused-vars` | Error | Code cleanliness |
| `react-hooks/rules-of-hooks` | Error | Hook correctness |
| `react-hooks/exhaustive-deps` | Warn | Effect dependencies |
| `no-console` | Warn | Use structured logging |
| `security/detect-object-injection` | Error | Security |

### Pre-Commit Hooks

```yaml
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Type check
bun run typecheck

# Lint
bun run lint

# Unit tests for changed files
bun run test --changed

# Prevent secrets
git secrets --pre_commit_hook -- "$@"
```

### Pull Request Checklist

```markdown
## PR Checklist

### Code Quality
- [ ] TypeScript compiles without errors
- [ ] ESLint passes with no warnings
- [ ] All tests pass
- [ ] New code has adequate test coverage (>80%)

### Security
- [ ] No secrets in code
- [ ] Input validation for all user input
- [ ] Tenant isolation verified

### Documentation
- [ ] JSDoc for public functions
- [ ] README updated if needed
- [ ] Architecture docs updated if needed

### Testing
- [ ] Unit tests for business logic
- [ ] Integration tests for API routes
- [ ] E2E tests for new user flows
```

---

## Database Migrations

### Migration Strategy

```mermaid
flowchart TD
    subgraph Development["Development"]
        Dev1["Create migration"]
        Dev2["Test locally"]
        Dev3["PR review"]
    end

    subgraph Staging["Staging"]
        Stage1["Deploy to staging"]
        Stage2["Run migration"]
        Stage3["Verify data"]
    end

    subgraph Production["Production"]
        Prod1["Maintenance window"]
        Prod2["Backup database"]
        Prod3["Run migration"]
        Prod4["Verify & rollback ready"]
    end

    Development --> Staging
    Staging --> Production
```

### Migration Commands

```bash
# Create new migration
bun run prisma migrate dev --name add_user_preferences

# Apply migrations (development)
bun run prisma migrate dev

# Apply migrations (production)
bun run prisma migrate deploy

# Reset database (development only!)
bun run prisma migrate reset

# Generate Prisma client
bun run prisma generate
```

### Migration Best Practices

| Practice | Description |
|----------|-------------|
| **Small, focused migrations** | One logical change per migration |
| **Backward compatible** | Old code should work during deployment |
| **No data loss** | Always preserve existing data |
| **Rollback ready** | Document rollback procedure |
| **Test with production data** | Clone prod data to staging |

### Migration Example

```sql
-- prisma/migrations/20240115_add_legal_hold/migration.sql

-- Add legal hold columns to Pattern and GeneratedComplaint
ALTER TABLE "Pattern"
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legalHoldBy" TEXT,
  ADD COLUMN "legalHoldAt" TIMESTAMP(3);

ALTER TABLE "GeneratedComplaint"
  ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legalHoldBy" TEXT,
  ADD COLUMN "legalHoldAt" TIMESTAMP(3);

-- Create index for legal hold queries
CREATE INDEX "Pattern_legalHold_idx" ON "Pattern"("legalHold");
CREATE INDEX "GeneratedComplaint_legalHold_idx" ON "GeneratedComplaint"("legalHold");

-- Rollback:
-- ALTER TABLE "Pattern" DROP COLUMN "legalHold", DROP COLUMN "legalHoldBy", DROP COLUMN "legalHoldAt";
-- ALTER TABLE "GeneratedComplaint" DROP COLUMN "legalHold", DROP COLUMN "legalHoldBy", DROP COLUMN "legalHoldAt";
```

---

## Feature Flags

### Feature Flag Strategy

```mermaid
graph TB
    subgraph Flags["Flag Types"]
        Release["Release Flags<br/>Enable/disable features"]
        Experiment["Experiment Flags<br/>A/B testing"]
        Ops["Ops Flags<br/>Kill switches"]
        Permission["Permission Flags<br/>Entitlements"]
    end

    subgraph Lifecycle["Flag Lifecycle"]
        Create["Create flag"] --> Rollout["Gradual rollout"]
        Rollout --> Monitor["Monitor metrics"]
        Monitor --> Decision{"Success?"}
        Decision -->|"Yes"| Remove["Remove flag"]
        Decision -->|"No"| Rollback["Rollback"]
    end
```

### Feature Flag Configuration

```typescript
// src/lib/feature-flags/config.ts
export const FEATURE_FLAGS = {
  // Release flags
  NEW_PATTERN_UI: {
    key: 'new-pattern-ui',
    type: 'release',
    defaultValue: false,
    description: 'New pattern analysis UI',
  },
  AI_ASSISTED_REVIEW: {
    key: 'ai-assisted-review',
    type: 'release',
    defaultValue: false,
    description: 'AI suggestions during document review',
  },

  // Ops flags (kill switches)
  AI_GENERATION_ENABLED: {
    key: 'ai-generation-enabled',
    type: 'ops',
    defaultValue: true,
    description: 'Kill switch for AI generation',
  },
  NHTSA_SYNC_ENABLED: {
    key: 'nhtsa-sync-enabled',
    type: 'ops',
    defaultValue: true,
    description: 'Kill switch for NHTSA sync',
  },

  // Plan-based flags
  ADVANCED_ANALYTICS: {
    key: 'advanced-analytics',
    type: 'permission',
    defaultValue: false,
    requiredPlans: ['PRO', 'ENTERPRISE'],
  },
} as const;
```

### Feature Flag Usage

```typescript
// Using feature flags in components
import { useFeatureFlag } from '@/lib/feature-flags';

export function PatternList() {
  const showNewUI = useFeatureFlag('new-pattern-ui');

  if (showNewUI) {
    return <NewPatternListUI />;
  }

  return <LegacyPatternListUI />;
}

// Using feature flags in API routes
import { isFeatureEnabled } from '@/lib/feature-flags';

export async function POST(req: Request) {
  if (!isFeatureEnabled('ai-generation-enabled')) {
    return NextResponse.json(
      { error: 'AI generation is temporarily disabled' },
      { status: 503 }
    );
  }

  // Continue with generation...
}
```

---

## Accessibility Standards

### WCAG 2.1 Compliance

| Level | Requirement | Status |
|-------|-------------|--------|
| A | Basic accessibility | Required |
| AA | Enhanced accessibility | Required |
| AAA | Highest accessibility | Optional |

### Accessibility Checklist

```mermaid
graph TB
    subgraph Perceivable["Perceivable"]
        P1["Text alternatives for images"]
        P2["Captions for media"]
        P3["Color not sole indicator"]
        P4["Sufficient contrast (4.5:1)"]
    end

    subgraph Operable["Operable"]
        O1["Keyboard accessible"]
        O2["Skip navigation links"]
        O3["Focus indicators"]
        O4["No keyboard traps"]
    end

    subgraph Understandable["Understandable"]
        U1["Clear language"]
        U2["Consistent navigation"]
        U3["Input error identification"]
        U4["Labels for form fields"]
    end

    subgraph Robust["Robust"]
        R1["Valid HTML"]
        R2["ARIA landmarks"]
        R3["Screen reader compatible"]
    end
```

### Accessibility Testing

```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('dashboard should have no WCAG violations', async ({ page }) => {
    await page.goto('/dashboard');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/complaints');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="search-input"]')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="filter-button"]')).toBeFocused();
  });
});
```

---

## CI/CD Pipeline

### Pipeline Stages

```mermaid
flowchart LR
    subgraph Lint["Lint Stage"]
        L1["TypeScript"]
        L2["ESLint"]
        L3["Prettier"]
    end

    subgraph Test["Test Stage"]
        T1["Unit Tests"]
        T2["Integration Tests"]
        T3["E2E Tests"]
    end

    subgraph Build["Build Stage"]
        B1["Next.js Build"]
        B2["Docker Image"]
    end

    subgraph Deploy["Deploy Stage"]
        D1["Preview (PR)"]
        D2["Staging (main)"]
        D3["Production (release)"]
    end

    Lint --> Test
    Test --> Build
    Build --> Deploy
```

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run typecheck
      - run: bun run lint

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test:unit --coverage
      - uses: codecov/codecov-action@v3

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run db:migrate
      - run: bun run test:integration

  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bunx playwright install --with-deps
      - run: bun run build
      - run: bun run test:e2e
```

---

## Troubleshooting

### Common Development Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `prisma generate` fails | Outdated client | `rm -rf node_modules/.prisma && bun install` |
| Database connection refused | Docker not running | `docker-compose up -d postgres` |
| Clerk auth not working | Wrong API keys | Check `.env.local` matches Clerk dashboard |
| E2E tests timeout | Slow generation | Increase Playwright timeout |
| Type errors after pull | New migrations | `bun run db:migrate && bun run prisma generate` |

### Debug Commands

```bash
# Check database connection
bun run prisma db execute --stdin <<< "SELECT 1"

# View Prisma query logs
DEBUG="prisma:query" bun run dev

# Run specific test file
bun run test src/lib/analysis/__tests__/clustering.test.ts

# Run E2E with debug
DEBUG=pw:api bun run test:e2e
```

---

**Previous:** [12-reliability-scalability.md](./12-reliability-scalability.md) - Reliability & Scalability
**Index:** [00-overview.md](./00-overview.md) - System Overview
