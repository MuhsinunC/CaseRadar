# CaseRadar - Test Strategy

## Overview

CaseRadar follows Test-Driven Development (TDD) principles. Tests are written **before** implementation for all core functionality. This document defines the testing approach, tools, and standards.

---

## Testing Philosophy

### TDD Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TDD CYCLE (Red-Green-Refactor)                     │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────┐     Write      ┌─────────┐     Run       ┌─────────┐
    │  RED    │──────────────▶│  TEST   │─────────────▶│  FAIL   │
    │         │    failing     │         │   test (it   │   ✗     │
    │         │     test       │         │   should)    │         │
    └─────────┘                └─────────┘              └────┬────┘
                                                             │
         ┌───────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────┐     Write      ┌─────────┐     Run       ┌─────────┐
    │ GREEN   │──────────────▶│  CODE   │─────────────▶│  PASS   │
    │         │   minimum      │         │   test (it   │   ✓     │
    │         │    code        │         │   should)    │         │
    └─────────┘                └─────────┘              └────┬────┘
                                                             │
         ┌───────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────┐                ┌─────────┐
    │REFACTOR │──────────────▶│  DONE   │
    │         │   clean up     │         │
    │         │   (tests pass) │         │
    └─────────┘                └─────────┘
```

### When to Write Tests First

| Scenario | Write Tests First? |
|----------|-------------------|
| New model/entity | ✅ Yes |
| New API endpoint | ✅ Yes |
| Business logic | ✅ Yes |
| External API client | ✅ Yes (with mocks) |
| UI component with logic | ✅ Yes |
| Pure presentation component | ⚠️ Optional |
| Configuration | ⚠️ Optional |
| Third-party integrations | ⚠️ Integration test |

---

## Test Pyramid

```
                         ┌─────────────┐
                         │    E2E      │  ~10%
                         │  (Slower)   │  Critical user flows
                         └──────┬──────┘
                     ┌──────────┴──────────┐
                     │    Integration      │  ~30%
                     │   (API + DB)        │  API endpoints, DB queries
                     └──────────┬──────────┘
                ┌───────────────┴───────────────┐
                │           Unit Tests          │  ~60%
                │      (Fast, Isolated)         │  Functions, components
                └───────────────────────────────┘
```

### Test Distribution Goals

| Type | Target Coverage | Execution Time |
|------|-----------------|----------------|
| Unit | 60% of tests | <30 seconds total |
| Integration | 30% of tests | <2 minutes total |
| E2E | 10% of tests | <5 minutes total |

---

## Testing Tools

### Unit & Integration Tests

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
})
```

### E2E Tests

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

---

## Test File Organization

```
caseradar/
├── tests/
│   ├── setup.ts              # Test setup and global mocks
│   ├── helpers/
│   │   ├── db.ts             # Database test utilities
│   │   ├── auth.ts           # Auth test utilities
│   │   └── factories.ts      # Test data factories
│   ├── unit/
│   │   ├── lib/
│   │   │   ├── nhtsa.test.ts
│   │   │   ├── embeddings.test.ts
│   │   │   └── scoring.test.ts
│   │   └── components/
│   │       ├── PatternCard.test.tsx
│   │       └── SeverityBadge.test.tsx
│   ├── integration/
│   │   ├── api/
│   │   │   ├── complaints.test.ts
│   │   │   ├── patterns.test.ts
│   │   │   └── generator.test.ts
│   │   └── db/
│   │       ├── complaints.test.ts
│   │       └── patterns.test.ts
│   └── e2e/
│       ├── auth.spec.ts
│       ├── complaints.spec.ts
│       ├── patterns.spec.ts
│       ├── generator.spec.ts
│       └── billing.spec.ts
```

---

## Testing Patterns

### Unit Test Examples

#### Testing a Pure Function

```typescript
// lib/scoring.ts
export function calculateSeverityScore(pattern: PatternData): number {
  return (
    pattern.deaths * 100 +
    pattern.injuries * 20 +
    pattern.crashes * 10 +
    pattern.fires * 15 +
    pattern.complaintCount * 1
  );
}

// tests/unit/lib/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { calculateSeverityScore } from '@/lib/scoring';

describe('calculateSeverityScore', () => {
  it('should return 0 for pattern with no incidents', () => {
    const pattern = {
      deaths: 0,
      injuries: 0,
      crashes: 0,
      fires: 0,
      complaintCount: 0,
    };
    expect(calculateSeverityScore(pattern)).toBe(0);
  });

  it('should weight deaths highest', () => {
    const pattern = { deaths: 1, injuries: 0, crashes: 0, fires: 0, complaintCount: 0 };
    expect(calculateSeverityScore(pattern)).toBe(100);
  });

  it('should calculate combined score correctly', () => {
    const pattern = {
      deaths: 1,      // 100
      injuries: 5,    // 100
      crashes: 10,    // 100
      fires: 2,       // 30
      complaintCount: 50, // 50
    };
    expect(calculateSeverityScore(pattern)).toBe(380);
  });
});
```

#### Testing with Mocks

```typescript
// lib/embeddings.ts
import OpenAI from 'openai';

export class EmbeddingService {
  private client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client || new OpenAI();
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }
}

// tests/unit/lib/embeddings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '@/lib/embeddings';

describe('EmbeddingService', () => {
  const mockClient = {
    embeddings: {
      create: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return embedding vector', async () => {
    const mockEmbedding = Array(1536).fill(0.1);
    mockClient.embeddings.create.mockResolvedValue({
      data: [{ embedding: mockEmbedding }],
    });

    const service = new EmbeddingService(mockClient as any);
    const result = await service.embed('test text');

    expect(result).toEqual(mockEmbedding);
    expect(mockClient.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'test text',
    });
  });

  it('should throw on API error', async () => {
    mockClient.embeddings.create.mockRejectedValue(new Error('API Error'));

    const service = new EmbeddingService(mockClient as any);

    await expect(service.embed('test')).rejects.toThrow('API Error');
  });
});
```

### Integration Test Examples

#### Testing API Endpoints

```typescript
// tests/integration/api/patterns.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import request from 'supertest';
import { prisma } from '@/lib/db';
import handler from '@/app/api/patterns/route';

describe('GET /api/patterns', () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // Seed test data
    await prisma.pattern.createMany({
      data: [
        {
          name: 'Test Pattern 1',
          make: 'Toyota',
          model: 'Camry',
          component: 'AIRBAGS',
          severityScore: 100,
        },
        {
          name: 'Test Pattern 2',
          make: 'Honda',
          model: 'Accord',
          component: 'BRAKES',
          severityScore: 50,
        },
      ],
    });

    // Create test server
    server = createServer((req, res) => {
      return apiResolver(req, res, undefined, handler, {}, false);
    });
  });

  afterAll(async () => {
    await prisma.pattern.deleteMany();
  });

  it('should return patterns sorted by severity', async () => {
    const response = await request(server)
      .get('/api/patterns')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].severityScore).toBe(100);
    expect(response.body.data[1].severityScore).toBe(50);
  });

  it('should filter by make', async () => {
    const response = await request(server)
      .get('/api/patterns?make=Toyota')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].make).toBe('Toyota');
  });

  it('should return 401 without auth', async () => {
    const response = await request(server).get('/api/patterns');

    expect(response.status).toBe(401);
  });
});
```

#### Testing Database Queries

```typescript
// tests/integration/db/complaints.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/db';
import { createComplaint, findSimilarComplaints } from '@/lib/complaints';

describe('Complaints Database', () => {
  beforeEach(async () => {
    await prisma.complaint.deleteMany();
  });

  afterEach(async () => {
    await prisma.complaint.deleteMany();
  });

  it('should create complaint with all fields', async () => {
    const complaint = await createComplaint({
      nhtsaId: '12345',
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      component: 'AIRBAGS',
      description: 'Airbag did not deploy',
      crash: true,
      injuries: 1,
    });

    expect(complaint.id).toBeDefined();
    expect(complaint.nhtsaId).toBe('12345');
    expect(complaint.crash).toBe(true);
  });

  it('should dedupe on nhtsaId', async () => {
    await createComplaint({ nhtsaId: '12345', make: 'Toyota', model: 'Camry', year: 2020, component: 'A', description: 'Test' });

    await expect(
      createComplaint({ nhtsaId: '12345', make: 'Toyota', model: 'Camry', year: 2020, component: 'A', description: 'Test' })
    ).rejects.toThrow();
  });

  it('should find similar complaints by embedding', async () => {
    // Create complaints with embeddings
    const embedding1 = Array(1536).fill(0.1);
    const embedding2 = Array(1536).fill(0.9);

    await prisma.complaint.create({
      data: {
        nhtsaId: '1',
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        component: 'AIRBAGS',
        description: 'Test 1',
        embedding: embedding1,
      },
    });

    await prisma.complaint.create({
      data: {
        nhtsaId: '2',
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        component: 'AIRBAGS',
        description: 'Test 2',
        embedding: embedding2,
      },
    });

    const queryEmbedding = Array(1536).fill(0.1);
    const similar = await findSimilarComplaints(queryEmbedding, 1);

    expect(similar).toHaveLength(1);
    expect(similar[0].nhtsaId).toBe('1');
  });
});
```

### E2E Test Examples

```typescript
// tests/e2e/patterns.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Patterns Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/sign-in');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should display patterns list', async ({ page }) => {
    await page.goto('/patterns');

    // Check page title
    await expect(page.locator('h1')).toContainText('Patterns');

    // Check patterns table exists
    await expect(page.locator('table')).toBeVisible();

    // Check at least one pattern row
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('should filter patterns by make', async ({ page }) => {
    await page.goto('/patterns');

    // Select Toyota from make filter
    await page.click('[data-testid="make-filter"]');
    await page.click('text=Toyota');

    // Verify filtered results
    await expect(page.locator('tbody tr')).toHaveCount(await page.locator('tbody tr:has-text("Toyota")').count());
  });

  test('should navigate to pattern detail', async ({ page }) => {
    await page.goto('/patterns');

    // Click first pattern
    await page.click('tbody tr:first-child');

    // Verify detail page
    await expect(page).toHaveURL(/\/patterns\/\w+/);
    await expect(page.locator('[data-testid="pattern-detail"]')).toBeVisible();
  });

  test('should generate complaint from pattern', async ({ page }) => {
    await page.goto('/patterns');

    // Click first pattern
    await page.click('tbody tr:first-child');

    // Click generate button
    await page.click('button:has-text("Generate Complaint")');

    // Verify generator page
    await expect(page).toHaveURL(/\/patterns\/\w+\/generate/);

    // Fill form
    await page.fill('[name="plaintiffName"]', 'John Doe');
    await page.fill('[name="plaintiffState"]', 'California');

    // Click generate
    await page.click('button:has-text("Generate")');

    // Wait for generation
    await expect(page.locator('[data-testid="complaint-preview"]')).toBeVisible({ timeout: 30000 });

    // Verify PDF download button appears
    await expect(page.locator('button:has-text("Download PDF")')).toBeVisible();
  });
});
```

---

## Test Data Management

### Factories

```typescript
// tests/helpers/factories.ts
import { faker } from '@faker-js/faker';

export function createComplaintData(overrides = {}) {
  return {
    nhtsaId: faker.string.alphanumeric(9),
    make: faker.vehicle.manufacturer(),
    model: faker.vehicle.model(),
    year: faker.number.int({ min: 2000, max: 2024 }),
    component: faker.helpers.arrayElement(['AIRBAGS', 'BRAKES', 'FUEL SYSTEM', 'STEERING']),
    description: faker.lorem.paragraph(),
    crash: faker.datatype.boolean(),
    fire: faker.datatype.boolean(),
    injuries: faker.number.int({ min: 0, max: 5 }),
    deaths: faker.number.int({ min: 0, max: 2 }),
    dateAdded: faker.date.past(),
    ...overrides,
  };
}

export function createPatternData(overrides = {}) {
  return {
    name: faker.lorem.words(3),
    make: faker.vehicle.manufacturer(),
    model: faker.vehicle.model(),
    component: faker.helpers.arrayElement(['AIRBAGS', 'BRAKES', 'FUEL SYSTEM', 'STEERING']),
    complaintCount: faker.number.int({ min: 10, max: 1000 }),
    crashCount: faker.number.int({ min: 0, max: 100 }),
    fireCount: faker.number.int({ min: 0, max: 50 }),
    injuryCount: faker.number.int({ min: 0, max: 200 }),
    deathCount: faker.number.int({ min: 0, max: 10 }),
    severityScore: faker.number.float({ min: 0, max: 1000 }),
    ...overrides,
  };
}

export function createUserData(overrides = {}) {
  return {
    email: faker.internet.email(),
    clerkUserId: faker.string.uuid(),
    role: faker.helpers.arrayElement(['ADMIN', 'ANALYST', 'VIEWER']),
    ...overrides,
  };
}
```

### Database Seeding

```typescript
// tests/helpers/db.ts
import { prisma } from '@/lib/db';
import { createComplaintData, createPatternData, createUserData } from './factories';

export async function seedTestDatabase() {
  // Create test organization
  const org = await prisma.organization.create({
    data: {
      name: 'Test Law Firm',
      clerkOrgId: 'test_org_123',
      plan: 'PRO',
    },
  });

  // Create test user
  const user = await prisma.user.create({
    data: {
      ...createUserData({ role: 'ADMIN' }),
      organizationId: org.id,
    },
  });

  // Create test complaints
  const complaints = await prisma.complaint.createMany({
    data: Array(100).fill(null).map(() => createComplaintData()),
  });

  // Create test patterns
  const patterns = await prisma.pattern.createMany({
    data: Array(10).fill(null).map(() => ({
      ...createPatternData(),
      organizationId: org.id,
    })),
  });

  return { org, user };
}

export async function clearTestDatabase() {
  await prisma.generatedComplaint.deleteMany();
  await prisma.pattern.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
```

---

## Mocking Strategy

### External Services

| Service | Mock Strategy |
|---------|---------------|
| OpenAI | Vi mock, return fixed vectors |
| Anthropic | Vi mock, return template response |
| Stripe | Stripe test mode + vi mock |
| Clerk | MSW for webhooks, vi mock for SDK |
| NHTSA | MSW for API responses |

### MSW Setup

```typescript
// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // NHTSA API mock
  http.get('https://api.nhtsa.gov/complaints/*', () => {
    return HttpResponse.json({
      count: 2,
      results: [
        {
          odiNumber: '12345',
          manufacturer: 'TOYOTA',
          make: 'TOYOTA',
          model: 'CAMRY',
          modelYear: '2020',
          component: 'AIR BAGS',
          summary: 'Test complaint',
          crash: 'No',
          fire: 'No',
          numberOfInjured: 0,
          numberOfDeaths: 0,
        },
      ],
    });
  }),

  // Stripe webhook mock
  http.post('https://api.stripe.com/v1/webhooks', () => {
    return HttpResponse.json({ received: true });
  }),
];

// tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// tests/setup.ts
import { server } from './mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  DATABASE_URL: postgresql://test:test@localhost:5432/test
  DIRECT_URL: postgresql://test:test@localhost:5432/test

jobs:
  unit-integration:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run migrations
        run: npx prisma migrate deploy

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Coverage Requirements

### Minimum Thresholds

| Metric | Minimum | Target |
|--------|---------|--------|
| Statements | 80% | 90% |
| Branches | 80% | 85% |
| Functions | 80% | 90% |
| Lines | 80% | 90% |

### Critical Paths (100% Coverage Required)

- Authentication/authorization logic
- Billing/subscription handling
- RBAC permission checks
- Data privacy (RLS) enforcement
- PDF generation output

### Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage && playwright test"
  }
}
```

---

## Summary

### Key Principles

1. **Tests First**: Write failing tests before implementation
2. **Fast Feedback**: Unit tests run in <30 seconds
3. **Isolation**: Each test is independent
4. **Coverage**: Minimum 80%, target 90%
5. **CI Required**: All tests must pass to merge

### Test Checklist (Per Feature)

- [ ] Unit tests for pure functions
- [ ] Unit tests for business logic
- [ ] Integration tests for API endpoints
- [ ] Integration tests for database queries
- [ ] E2E test for critical user flow
- [ ] Mocks for external services
- [ ] Test data factories used
- [ ] Coverage meets thresholds
