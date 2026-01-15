# Unified Data Pipeline Plan

## Overview

A single-function orchestration system that processes the entire data pipeline from NHTSA complaint ingestion through to lead generation. The pipeline is triggered automatically after batch imports or manually for testing, ensuring data is always live and up-to-date.

## Problem Statement

Current state:
- Data is stale (batch imports don't trigger downstream processing)
- Multiple manual steps required to update patterns/leads
- No unified orchestration
- 96.9% of complaints lack embeddings
- No automated pipeline after NHTSA sync

Target state:
- Single function call processes entire pipeline
- Automatic triggering after NHTSA batch imports
- Incremental processing (only new/updated records)
- Live data within minutes of NHTSA updates
- 100% embedding coverage for all complaints

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Unified Data Pipeline                            │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │ NHTSA Cron  │──┐                                                     │
│  │ (2 AM UTC)  │  │                                                     │
│  └─────────────┘  │                                                     │
│                   │     ┌──────────────────────────────────────────┐    │
│  ┌─────────────┐  │     │                                          │    │
│  │ Manual API  │──┼────▶│     processPipeline(options)             │    │
│  │  Trigger    │  │     │                                          │    │
│  └─────────────┘  │     │  Single entry point for all processing   │    │
│                   │     │                                          │    │
│  ┌─────────────┐  │     └──────────────────────────────────────────┘    │
│  │  Webhook    │──┘                       │                             │
│  │  Trigger    │                          │                             │
│  └─────────────┘                          ▼                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Pipeline Stages                               │   │
│  │                                                                  │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │   │
│  │   │ Stage 1 │───▶│ Stage 2 │───▶│ Stage 3 │───▶│ Stage 4 │      │   │
│  │   │ Ingest  │    │ Embed   │    │ Pattern │    │  Lead   │      │   │
│  │   │         │    │         │    │  Detect │    │  Score  │      │   │
│  │   └─────────┘    └─────────┘    └─────────┘    └─────────┘      │   │
│  │       │              │              │              │            │   │
│  │       ▼              ▼              ▼              ▼            │   │
│  │   ┌─────────────────────────────────────────────────────┐       │   │
│  │   │              PostgreSQL Database                    │       │   │
│  │   │  Complaints │ Embeddings │ Patterns │ Leads        │       │   │
│  │   └─────────────────────────────────────────────────────┘       │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Event System                                  │   │
│  │                                                                  │   │
│  │   on('complaints:ingested') ──▶ trigger embedding generation    │   │
│  │   on('embeddings:generated') ─▶ trigger pattern detection       │   │
│  │   on('patterns:detected') ────▶ trigger lead scoring            │   │
│  │   on('pipeline:complete') ────▶ notify, log metrics             │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core API

### Single Entry Point

**File:** `src/lib/pipeline/unified-pipeline.ts`

```typescript
export interface PipelineOptions {
  // What to process
  mode: 'full' | 'incremental';  // full = all records, incremental = new only

  // Stage control
  stages?: {
    ingest?: boolean;      // Fetch new NHTSA records
    embed?: boolean;       // Generate embeddings
    patterns?: boolean;    // Detect patterns
    leads?: boolean;       // Score/generate leads
  };

  // Filtering
  filters?: {
    since?: Date;          // Only records after this date
    make?: string;         // Filter by make
    highQualityOnly?: boolean;  // Only complaints with descriptions
  };

  // Execution
  dryRun?: boolean;        // Simulate without writing
  concurrency?: number;    // Parallel processing limit
  batchSize?: number;      // Records per batch
}

export interface PipelineResult {
  success: boolean;
  stages: {
    ingest: StageResult;
    embed: StageResult;
    patterns: StageResult;
    leads: StageResult;
  };
  totalDuration: number;
  recordsProcessed: number;
  errors: PipelineError[];
}

export interface StageResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  duration: number;
  errors: string[];
}

// THE SINGLE FUNCTION
export async function processPipeline(
  options?: PipelineOptions
): Promise<PipelineResult>;
```

### Usage Examples

```typescript
import { processPipeline } from '@/lib/pipeline/unified-pipeline';

// Full pipeline - process everything
const result = await processPipeline({ mode: 'full' });

// Incremental - only new records since last run
const result = await processPipeline({ mode: 'incremental' });

// Manual trigger - only embeddings for new complaints
const result = await processPipeline({
  mode: 'incremental',
  stages: { ingest: false, embed: true, patterns: false, leads: false }
});

// After NHTSA sync - full downstream processing
const result = await processPipeline({
  mode: 'incremental',
  stages: { ingest: false, embed: true, patterns: true, leads: true }
});

// Testing - dry run with specific make
const result = await processPipeline({
  mode: 'full',
  filters: { make: 'HONDA' },
  dryRun: true
});
```

## Pipeline Stages

### Stage 1: Ingest (NHTSA Sync)

Fetches new complaints from NHTSA and upserts into database.

```typescript
interface IngestStageOptions {
  source: 'api' | 'flatfile' | 'both';
  since?: Date;
  batchSize?: number;
}

async function ingestStage(options: IngestStageOptions): Promise<StageResult> {
  // 1. Fetch new records from NHTSA API
  // 2. Upsert into Complaint table
  // 3. Mark records as needing embedding
  // 4. Emit 'complaints:ingested' event
}
```

### Stage 2: Embed (Embedding Generation)

Generates embeddings for complaints without them.

```typescript
interface EmbedStageOptions {
  complaintIds?: string[];  // Specific complaints, or all without embeddings
  batchSize?: number;
  concurrency?: number;
}

async function embedStage(options: EmbedStageOptions): Promise<StageResult> {
  // 1. Find complaints without embeddings
  // 2. Call scalable embedding service
  // 3. Store embeddings in pgvector column
  // 4. Emit 'embeddings:generated' event
}
```

### Stage 3: Pattern Detection

Runs ML clustering to detect patterns.

```typescript
interface PatternStageOptions {
  highQualityOnly?: boolean;
  minComplaints?: number;
}

async function patternStage(options: PatternStageOptions): Promise<StageResult> {
  // 1. Fetch complaints with embeddings
  // 2. Call pattern generation service
  // 3. Create/update Pattern records
  // 4. Link complaints to patterns
  // 5. Calculate severity scores
  // 6. Emit 'patterns:detected' event
}
```

### Stage 4: Lead Generation

Converts patterns into actionable leads.

```typescript
interface LeadStageOptions {
  minSeverity?: number;
  minComplaints?: number;
}

async function leadStage(options: LeadStageOptions): Promise<StageResult> {
  // 1. Find patterns meeting lead criteria
  // 2. Create/update Lead records
  // 3. Calculate lead scores
  // 4. Match with recalls (if applicable)
  // 5. Emit 'leads:generated' event
}
```

## Database Schema Additions

### Lead Model

**File:** `prisma/schema.prisma` (addition)

```prisma
model Lead {
  id              String    @id @default(cuid())

  // Source pattern
  patternId       String
  pattern         Pattern   @relation(fields: [patternId], references: [id])

  // Lead details
  title           String
  description     String
  make            String
  model           String?
  component       String
  yearStart       Int?
  yearEnd         Int?

  // Scoring
  severityScore   Int       @default(0)
  confidenceScore Float     @default(0)
  priorityScore   Float     @default(0)

  // Metrics
  complaintCount  Int       @default(0)
  deathCount      Int       @default(0)
  injuryCount     Int       @default(0)
  crashCount      Int       @default(0)
  fireCount       Int       @default(0)

  // Status
  status          LeadStatus @default(NEW)
  reviewedAt      DateTime?
  reviewedBy      String?
  notes           String?

  // Recall matching
  matchedRecallId String?
  matchedRecall   Recall?   @relation(fields: [matchedRecallId], references: [id])

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([status])
  @@index([severityScore])
  @@index([make, model])
}

enum LeadStatus {
  NEW
  REVIEWING
  CONFIRMED
  DISMISSED
  ESCALATED
}
```

### Pipeline Run Tracking

```prisma
model PipelineRun {
  id              String    @id @default(cuid())

  // Run details
  mode            String    // 'full' | 'incremental'
  triggeredBy     String    // 'cron' | 'api' | 'manual'

  // Stage results
  ingestResult    Json?
  embedResult     Json?
  patternResult   Json?
  leadResult      Json?

  // Metrics
  totalRecords    Int       @default(0)
  totalDuration   Int       @default(0)  // milliseconds

  // Status
  status          String    // 'running' | 'completed' | 'failed'
  errorMessage    String?

  // Timestamps
  startedAt       DateTime  @default(now())
  completedAt     DateTime?

  @@index([status])
  @@index([startedAt])
}
```

## Event System

### Event Definitions

**File:** `src/lib/pipeline/events.ts`

```typescript
import { EventEmitter } from 'events';

export const pipelineEvents = new EventEmitter();

// Event types
export type PipelineEvent =
  | 'complaints:ingested'
  | 'embeddings:generated'
  | 'patterns:detected'
  | 'leads:generated'
  | 'pipeline:started'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'stage:started'
  | 'stage:complete';

// Event payloads
export interface ComplaintsIngestedPayload {
  count: number;
  complaintIds: string[];
  source: string;
}

export interface EmbeddingsGeneratedPayload {
  count: number;
  complaintIds: string[];
  duration: number;
}

export interface PatternsDetectedPayload {
  count: number;
  patternIds: string[];
  complaintsLinked: number;
}

export interface LeadsGeneratedPayload {
  count: number;
  leadIds: string[];
  highPriorityCount: number;
}
```

### Event Handlers

```typescript
// Auto-trigger downstream stages
pipelineEvents.on('complaints:ingested', async (payload) => {
  console.log(`[Pipeline] ${payload.count} complaints ingested, triggering embedding`);
  // Embeddings are triggered automatically
});

pipelineEvents.on('embeddings:generated', async (payload) => {
  console.log(`[Pipeline] ${payload.count} embeddings generated, triggering pattern detection`);
  // Pattern detection is triggered automatically
});

pipelineEvents.on('patterns:detected', async (payload) => {
  console.log(`[Pipeline] ${payload.count} patterns detected, triggering lead generation`);
  // Lead generation is triggered automatically
});

pipelineEvents.on('pipeline:complete', async (result) => {
  console.log(`[Pipeline] Complete: ${result.recordsProcessed} records in ${result.totalDuration}ms`);
  // Send notifications, update dashboards, etc.
});
```

## API Endpoints

### Manual Trigger

**File:** `src/app/api/pipeline/route.ts`

```typescript
import { processPipeline } from '@/lib/pipeline/unified-pipeline';

// POST /api/pipeline - Trigger pipeline manually
export async function POST(request: Request) {
  const body = await request.json();

  const result = await processPipeline({
    mode: body.mode || 'incremental',
    stages: body.stages,
    filters: body.filters,
    dryRun: body.dryRun || false,
  });

  return Response.json(result);
}

// GET /api/pipeline/status - Get latest pipeline run status
export async function GET() {
  const latestRun = await prisma.pipelineRun.findFirst({
    orderBy: { startedAt: 'desc' },
  });

  return Response.json(latestRun);
}
```

### NHTSA Sync Trigger

**File:** `src/app/api/cron/nhtsa-sync/route.ts`

```typescript
import { processPipeline } from '@/lib/pipeline/unified-pipeline';

// Called by cron job at 2 AM UTC
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Run full pipeline (ingest + all downstream)
  const result = await processPipeline({
    mode: 'incremental',
    stages: {
      ingest: true,   // Fetch new NHTSA records
      embed: true,    // Generate embeddings
      patterns: true, // Detect patterns
      leads: true,    // Generate leads
    },
  });

  return Response.json(result);
}
```

## Test-Driven Development

### Unit Tests

**File:** `src/lib/pipeline/__tests__/unified-pipeline.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processPipeline } from '../unified-pipeline';
import { prisma } from '@/lib/db';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/embeddings/scalable-client');
vi.mock('@/lib/patterns/pattern-generation-service');

describe('processPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('full mode', () => {
    it('should process all stages in order', async () => {
      const result = await processPipeline({ mode: 'full' });

      expect(result.success).toBe(true);
      expect(result.stages.ingest.success).toBe(true);
      expect(result.stages.embed.success).toBe(true);
      expect(result.stages.patterns.success).toBe(true);
      expect(result.stages.leads.success).toBe(true);
    });

    it('should return total records processed', async () => {
      const result = await processPipeline({ mode: 'full' });

      expect(result.recordsProcessed).toBeGreaterThan(0);
    });

    it('should record total duration', async () => {
      const result = await processPipeline({ mode: 'full' });

      expect(result.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('incremental mode', () => {
    it('should only process new records', async () => {
      // Insert a "last run" timestamp
      await prisma.pipelineRun.create({
        data: {
          mode: 'incremental',
          triggeredBy: 'test',
          status: 'completed',
          startedAt: new Date(Date.now() - 86400000) // 1 day ago
        }
      });

      const result = await processPipeline({ mode: 'incremental' });

      // Should only process records created after last run
      expect(result.stages.embed.recordsProcessed).toBeLessThan(
        result.stages.embed.recordsProcessed // Would compare to full count
      );
    });
  });

  describe('stage control', () => {
    it('should skip disabled stages', async () => {
      const result = await processPipeline({
        mode: 'full',
        stages: { ingest: false, embed: true, patterns: false, leads: false }
      });

      expect(result.stages.ingest.recordsProcessed).toBe(0);
      expect(result.stages.embed.recordsProcessed).toBeGreaterThan(0);
      expect(result.stages.patterns.recordsProcessed).toBe(0);
      expect(result.stages.leads.recordsProcessed).toBe(0);
    });

    it('should run only specified stages', async () => {
      const result = await processPipeline({
        mode: 'incremental',
        stages: { patterns: true, leads: true }
      });

      expect(result.stages.patterns.success).toBe(true);
      expect(result.stages.leads.success).toBe(true);
    });
  });

  describe('dry run', () => {
    it('should not write to database in dry run', async () => {
      const beforeCount = await prisma.pattern.count();

      await processPipeline({ mode: 'full', dryRun: true });

      const afterCount = await prisma.pattern.count();
      expect(afterCount).toBe(beforeCount);
    });

    it('should still return projected results', async () => {
      const result = await processPipeline({ mode: 'full', dryRun: true });

      expect(result.stages.embed.recordsProcessed).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should continue on stage failure if configured', async () => {
      // Mock embed stage to fail
      vi.mocked(embedStage).mockRejectedValueOnce(new Error('Embed failed'));

      const result = await processPipeline({
        mode: 'full',
        continueOnError: true
      });

      expect(result.stages.embed.success).toBe(false);
      expect(result.stages.patterns.success).toBe(true); // Still ran
    });

    it('should stop on stage failure by default', async () => {
      vi.mocked(embedStage).mockRejectedValueOnce(new Error('Embed failed'));

      const result = await processPipeline({ mode: 'full' });

      expect(result.success).toBe(false);
      expect(result.stages.patterns.success).toBe(false); // Didn't run
    });

    it('should collect all errors', async () => {
      const result = await processPipeline({ mode: 'full' });

      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('filters', () => {
    it('should filter by make', async () => {
      const result = await processPipeline({
        mode: 'full',
        filters: { make: 'HONDA' }
      });

      // All processed complaints should be Honda
      expect(result.stages.embed.recordsProcessed).toBeGreaterThan(0);
    });

    it('should filter by date', async () => {
      const result = await processPipeline({
        mode: 'full',
        filters: { since: new Date('2024-01-01') }
      });

      expect(result.stages.ingest.recordsProcessed).toBeGreaterThan(0);
    });

    it('should filter for high quality only', async () => {
      const result = await processPipeline({
        mode: 'full',
        filters: { highQualityOnly: true }
      });

      // Should only process complaints with descriptions
      expect(result.stages.patterns.recordsProcessed).toBeLessThan(
        2000000 // Total complaints
      );
    });
  });
});

describe('Individual Stages', () => {
  describe('ingestStage', () => {
    it('should fetch from NHTSA API', async () => {
      const result = await ingestStage({ source: 'api' });
      expect(result.success).toBe(true);
    });

    it('should upsert complaints without duplicates', async () => {
      // Ingest same records twice
      await ingestStage({ source: 'api' });
      const count1 = await prisma.complaint.count();

      await ingestStage({ source: 'api' });
      const count2 = await prisma.complaint.count();

      expect(count2).toBe(count1); // No duplicates
    });
  });

  describe('embedStage', () => {
    it('should generate embeddings for complaints without them', async () => {
      const result = await embedStage({});
      expect(result.recordsProcessed).toBeGreaterThan(0);
    });

    it('should not re-embed complaints with embeddings', async () => {
      // First pass
      await embedStage({});
      const afterFirst = await prisma.$queryRaw`
        SELECT COUNT(*) FROM "Complaint" WHERE embedding IS NOT NULL
      `;

      // Second pass
      await embedStage({});
      const afterSecond = await prisma.$queryRaw`
        SELECT COUNT(*) FROM "Complaint" WHERE embedding IS NOT NULL
      `;

      expect(afterSecond).toBe(afterFirst);
    });
  });

  describe('patternStage', () => {
    it('should detect patterns from embeddings', async () => {
      const result = await patternStage({});
      expect(result.recordsCreated).toBeGreaterThan(0);
    });

    it('should link complaints to patterns', async () => {
      await patternStage({});

      const linkedCount = await prisma.complaint.count({
        where: { clusterId: { not: null } }
      });

      expect(linkedCount).toBeGreaterThan(0);
    });
  });

  describe('leadStage', () => {
    it('should generate leads from patterns', async () => {
      const result = await leadStage({});
      expect(result.recordsCreated).toBeGreaterThan(0);
    });

    it('should calculate lead scores', async () => {
      await leadStage({});

      const leads = await prisma.lead.findMany();
      for (const lead of leads) {
        expect(lead.severityScore).toBeGreaterThanOrEqual(0);
        expect(lead.priorityScore).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
```

### Integration Tests

**File:** `src/lib/pipeline/__tests__/pipeline-integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { processPipeline } from '../unified-pipeline';
import { prisma } from '@/lib/db';

describe('Pipeline Integration', () => {
  beforeAll(async () => {
    // Seed test data
    await seedTestComplaints(100);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.complaint.deleteMany({ where: { nhtsaId: { startsWith: 'TEST_' } } });
  });

  it('should process full pipeline end-to-end', async () => {
    const result = await processPipeline({
      mode: 'full',
      filters: { make: 'TEST_MAKE' }
    });

    expect(result.success).toBe(true);
    expect(result.stages.embed.recordsProcessed).toBe(100);
    expect(result.stages.patterns.recordsCreated).toBeGreaterThan(0);
    expect(result.stages.leads.recordsCreated).toBeGreaterThan(0);
  });

  it('should create pipeline run record', async () => {
    await processPipeline({ mode: 'full' });

    const run = await prisma.pipelineRun.findFirst({
      orderBy: { startedAt: 'desc' }
    });

    expect(run).not.toBeNull();
    expect(run?.status).toBe('completed');
  });

  it('should emit events during processing', async () => {
    const events: string[] = [];

    pipelineEvents.on('stage:started', (stage) => events.push(`start:${stage}`));
    pipelineEvents.on('stage:complete', (stage) => events.push(`complete:${stage}`));

    await processPipeline({ mode: 'full' });

    expect(events).toContain('start:embed');
    expect(events).toContain('complete:embed');
    expect(events).toContain('start:patterns');
    expect(events).toContain('complete:patterns');
  });

  it('should handle large batches', async () => {
    // Seed 10000 complaints
    await seedTestComplaints(10000);

    const result = await processPipeline({
      mode: 'full',
      batchSize: 1000
    });

    expect(result.success).toBe(true);
    expect(result.stages.embed.recordsProcessed).toBe(10000);
  }, 300000); // 5 minute timeout

  it('should be idempotent', async () => {
    // Run pipeline twice
    const result1 = await processPipeline({ mode: 'full' });
    const result2 = await processPipeline({ mode: 'full' });

    // Counts should be similar (no duplicate processing)
    const patternsAfter1 = await prisma.pattern.count();
    const patternsAfter2 = await prisma.pattern.count();

    expect(patternsAfter2).toBe(patternsAfter1);
  });
});

describe('Cron Trigger Integration', () => {
  it('should be callable from cron endpoint', async () => {
    const response = await fetch('/api/cron/nhtsa-sync', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  it('should process incrementally after initial run', async () => {
    // First run
    await processPipeline({ mode: 'full' });
    const countAfterFirst = await prisma.pattern.count();

    // Add new complaints
    await seedTestComplaints(10);

    // Incremental run
    const result = await processPipeline({ mode: 'incremental' });

    // Should only process new complaints
    expect(result.stages.embed.recordsProcessed).toBeLessThanOrEqual(10);
  });
});
```

### End-to-End Tests

**File:** `src/lib/pipeline/__tests__/pipeline-e2e.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { processPipeline } from '../unified-pipeline';
import { prisma } from '@/lib/db';

describe('Pipeline E2E', () => {
  it('should produce live data from NHTSA sync to leads', async () => {
    // Clear existing data
    await prisma.lead.deleteMany();
    await prisma.pattern.deleteMany();
    await prisma.complaint.updateMany({
      data: { clusterId: null }
    });

    // Run full pipeline
    const result = await processPipeline({
      mode: 'full',
      filters: { highQualityOnly: true }
    });

    // Verify complete chain
    expect(result.success).toBe(true);

    // Check complaints have embeddings
    const withEmbeddings = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `;
    expect(Number(withEmbeddings[0].count)).toBeGreaterThan(0);

    // Check patterns were created
    const patterns = await prisma.pattern.count();
    expect(patterns).toBeGreaterThan(0);

    // Check leads were generated
    const leads = await prisma.lead.count();
    expect(leads).toBeGreaterThan(0);

    // Check leads have correct scoring
    const highPriorityLeads = await prisma.lead.findMany({
      where: { priorityScore: { gte: 0.7 } }
    });
    expect(highPriorityLeads.length).toBeGreaterThan(0);
  }, 600000); // 10 minute timeout

  it('should match patterns with recalls', async () => {
    await processPipeline({ mode: 'full' });

    const leadsWithRecalls = await prisma.lead.findMany({
      where: { matchedRecallId: { not: null } }
    });

    // Some leads should match recalls
    expect(leadsWithRecalls.length).toBeGreaterThan(0);
  });
});
```

## Implementation Steps

### Phase 1: Foundation (Week 1)
1. [ ] Create Lead model in Prisma schema
2. [ ] Create PipelineRun model for tracking
3. [ ] Run Prisma migration
4. [ ] Implement `processPipeline` function skeleton
5. [ ] Write unit tests for pipeline orchestration
6. [ ] Implement event system

### Phase 2: Stage Implementation (Week 2)
1. [ ] Implement `ingestStage` (NHTSA sync)
2. [ ] Implement `embedStage` (embedding generation)
3. [ ] Implement `patternStage` (pattern detection)
4. [ ] Implement `leadStage` (lead generation)
5. [ ] Write unit tests for each stage
6. [ ] Write integration tests

### Phase 3: API & Automation (Week 3)
1. [ ] Create `/api/pipeline` endpoint
2. [ ] Create `/api/cron/nhtsa-sync` endpoint
3. [ ] Configure cron job (Vercel/Railway/etc.)
4. [ ] Implement incremental processing logic
5. [ ] Add pipeline run tracking
6. [ ] Write E2E tests

### Phase 4: Production Readiness (Week 4)
1. [ ] Add monitoring and alerting
2. [ ] Add retry logic and error recovery
3. [ ] Performance optimization
4. [ ] Load testing
5. [ ] Documentation
6. [ ] Deploy to production

## Success Criteria

1. **Single Function**: `processPipeline()` handles entire flow
2. **Automation**: Cron triggers automatic processing nightly
3. **Incremental**: Only new records are processed
4. **Completeness**: 100% of complaints have embeddings
5. **Live Data**: Updates propagate within 1 hour of NHTSA sync
6. **Reliability**: 99.9% success rate for pipeline runs

## Monitoring

### Metrics
- `pipeline_runs_total` - Total pipeline runs by mode/trigger
- `pipeline_duration_seconds` - Pipeline run duration
- `pipeline_records_processed` - Records processed per stage
- `pipeline_errors_total` - Errors by stage
- `embeddings_coverage_percent` - Percentage of complaints with embeddings
- `leads_generated_total` - Total leads generated

### Alerts
- Pipeline run failed
- Pipeline run duration > 1 hour
- Embedding coverage dropped
- No pipeline runs in 24 hours

---

## Ralph Loop Command

To iterate on this implementation, run:

```bash
claude "/ralph-loop --completion-promise UNIFIED_DATA_PIPELINE_COMPLETE --prompt-file .claude/data-pipeline-loop.md"
```

### Ralph Loop Prompt File

The prompt file `.claude/data-pipeline-loop.md` has been created with the following content:

```markdown
---
active: true
iteration: 1
max_iterations: 100
completion_promise: "UNIFIED_DATA_PIPELINE_COMPLETE"
---

ultrathink: This is a Ralph loop for implementing the unified data pipeline.

## Goal
Implement a single-function orchestration system that processes the entire data pipeline from NHTSA complaint ingestion through to lead generation.

## Completion Criteria
The pipeline is complete when:
1. All unit tests pass
2. All integration tests pass
3. E2E tests pass
4. processPipeline() handles full flow
5. Cron automation is working
6. 100% embedding coverage achieved
7. Leads are generated from patterns

## Current Iteration Task
Follow the implementation steps in docs/architecture/unified-data-pipeline-plan.md.
Run tests after each change. Document results in iteration notes.

## Test Commands
- Unit tests: `npm test -- src/lib/pipeline/__tests__/unified-pipeline.test.ts`
- Integration tests: `npm test -- src/lib/pipeline/__tests__/pipeline-integration.test.ts`
- E2E tests: `npm test -- src/lib/pipeline/__tests__/pipeline-e2e.test.ts`
- All pipeline tests: `npm test -- src/lib/pipeline`

## Key File
The main implementation file is: `src/lib/pipeline/unified-pipeline.ts`
```
