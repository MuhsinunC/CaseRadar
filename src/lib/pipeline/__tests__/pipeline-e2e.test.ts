/**
 * Pipeline E2E Tests
 * End-to-end tests simulating complete pipeline runs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineStatus, TrendDirection } from '@prisma/client';

// Mock all external dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    pipelineRun: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    complaint: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    pattern: {
      count: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    lead: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    recall: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock('@/lib/nhtsa/sync', () => ({
  nhtsaSyncService: {
    syncNewComplaints: vi.fn(),
    syncHighSeverityComplaints: vi.fn(),
    getLastSyncDate: vi.fn(),
  },
}));

vi.mock('@/lib/embeddings/complaint-embedder', () => ({
  complaintEmbedder: {
    embedMissingComplaints: vi.fn(),
  },
}));

vi.mock('@/lib/patterns/pattern-generation-service', () => ({
  patternGenerationService: {
    generatePatterns: vi.fn(),
  },
}));

vi.mock('../events', () => ({
  emitPipelineEvent: vi.fn(),
  pipelineEvents: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe('Pipeline E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Full Pipeline Scenarios', () => {
    it('E2E: should complete full incremental pipeline successfully', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup complete mock scenario
      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_run_1',
        mode: 'incremental',
        triggeredBy: 'cron',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      // Ingest: fetch 100 complaints, 25 new
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 100,
        newComplaints: 25,
        errors: [],
      });

      // Embed: 25 complaints need embedding
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ count: BigInt(25) }]) // before embed
        .mockResolvedValueOnce([{ count: BigInt(0) }]); // after embed

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 25,
        errors: [],
      });

      // Patterns: detect 5 patterns from 100 complaints
      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 5,
        patternsUpdated: 3,
        complaintsProcessed: 100,
        noiseCount: 15,
        error: null,
      });

      // Leads: generate from 3 high-severity patterns
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'p1',
          name: 'TOYOTA CAMRY BRAKE Issues',
          make: 'TOYOTA',
          model: 'CAMRY',
          component: 'BRAKE',
          description: 'Brake failure pattern',
          yearStart: 2018,
          yearEnd: 2022,
          severityScore: 150,
          complaintCount: 50,
          trendDirection: TrendDirection.INCREASING,
          trendScore: 75,
          deathCount: 1,
          injuryCount: 10,
          crashCount: 15,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
        {
          id: 'p2',
          name: 'HONDA CIVIC STEERING Issues',
          make: 'HONDA',
          model: 'CIVIC',
          component: 'STEERING',
          description: 'Steering failure pattern',
          yearStart: 2019,
          yearEnd: 2023,
          severityScore: 80,
          complaintCount: 30,
          trendDirection: TrendDirection.STABLE,
          trendScore: 0,
          deathCount: 0,
          injuryCount: 5,
          crashCount: 8,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
        {
          id: 'p3',
          name: 'FORD F150 ENGINE Issues',
          make: 'FORD',
          model: 'F150',
          component: 'ENGINE',
          description: 'Engine fire pattern',
          yearStart: 2020,
          yearEnd: 2024,
          severityScore: 200,
          complaintCount: 20,
          trendDirection: TrendDirection.INCREASING,
          trendScore: 90,
          deathCount: 2,
          injuryCount: 8,
          crashCount: 5,
          fireCount: 10,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
      ]);

      // Mock recall matching
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: 'lead_new',
        patternId: 'p1',
        title: 'Test Lead',
        description: 'Test',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        yearStart: 2018,
        yearEnd: 2022,
        severityScore: 150,
        confidenceScore: 0.5,
        priorityScore: 0.8,
        complaintCount: 50,
        deathCount: 1,
        injuryCount: 10,
        crashCount: 15,
        fireCount: 0,
        status: 'NEW',
        reviewedAt: null,
        reviewedBy: null,
        notes: null,
        matchedRecallId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', triggeredBy: 'cron' });

      // Verify E2E success
      expect(result.success).toBe(true);
      expect(result.stages.ingest.recordsCreated).toBe(25);
      expect(result.stages.embed.recordsProcessed).toBe(25);
      expect(result.stages.patterns.recordsCreated).toBe(5);
      expect(result.stages.leads.recordsCreated).toBe(3); // 3 patterns = 3 leads
      expect(result.errors).toHaveLength(0);
    });

    it('E2E: should handle empty database scenario', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_empty',
        mode: 'full',
        triggeredBy: 'manual',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      // Empty database - no complaints
      vi.mocked(nhtsaSyncService.syncHighSeverityComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 0,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 0,
        patternsUpdated: 0,
        complaintsProcessed: 0,
        noiseCount: 0,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'full' });

      // Should complete successfully even with no data
      expect(result.success).toBe(true);
      expect(result.stages.ingest.recordsProcessed).toBe(0);
      expect(result.stages.patterns.recordsCreated).toBe(0);
      expect(result.stages.leads.recordsCreated).toBe(0);
    });

    it('E2E: should recover from partial failure with continueOnError', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_partial',
        mode: 'incremental',
        triggeredBy: 'api',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      // Ingest succeeds
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 50,
        newComplaints: 10,
        errors: [],
      });

      // Embed fails partially
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(10) }]);
      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 7,
        errors: ['Rate limit exceeded for 3 complaints'],
      });

      // Patterns succeeds with what we have
      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 2,
        patternsUpdated: 1,
        complaintsProcessed: 47, // 50 - 3 that failed embedding
        noiseCount: 10,
        error: null,
      });

      // Leads generation works
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'p_recover',
          name: 'Recovery Pattern',
          make: 'TEST',
          model: 'MODEL',
          component: 'COMP',
          description: 'Test',
          yearStart: 2020,
          yearEnd: 2024,
          severityScore: 75,
          complaintCount: 15,
          trendDirection: TrendDirection.STABLE,
          trendScore: 0,
          deathCount: 0,
          injuryCount: 2,
          crashCount: 0,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
      ]);

      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.lead.create).mockResolvedValue({} as never);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', continueOnError: true });

      // Pipeline should complete but report errors
      expect(result.success).toBe(false); // Has errors
      expect(result.stages.ingest.success).toBe(true);
      expect(result.stages.embed.success).toBe(false); // Had errors
      expect(result.stages.patterns.success).toBe(true);
      expect(result.stages.leads.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Rate limit');
    });

    it('E2E: should process large batch in full mode', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_large',
        mode: 'full',
        triggeredBy: 'manual',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      // Large batch
      vi.mocked(nhtsaSyncService.syncHighSeverityComplaints).mockResolvedValue({
        totalComplaints: 10000,
        newComplaints: 5000,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ count: BigInt(5000) }])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 5000,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 50,
        patternsUpdated: 25,
        complaintsProcessed: 10000,
        noiseCount: 500,
        error: null,
      });

      // 50 eligible patterns for leads
      const eligiblePatterns = Array.from({ length: 50 }, (_, i) => ({
        id: `p${i}`,
        name: `Pattern ${i}`,
        make: 'TEST',
        model: 'MODEL',
        component: 'COMP',
        description: 'Test',
        yearStart: 2020,
        yearEnd: 2024,
        severityScore: 100 + i,
        complaintCount: 20 + i,
        trendDirection: TrendDirection.INCREASING,
        trendScore: 50,
        deathCount: i % 5 === 0 ? 1 : 0,
        injuryCount: 2,
        crashCount: 3,
        fireCount: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        clusteringRunId: null,
        leads: [],
      }));

      vi.mocked(prisma.pattern.findMany).mockResolvedValue(eligiblePatterns);
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.lead.create).mockResolvedValue({} as never);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'full' });

      // Verify large batch processing
      expect(result.success).toBe(true);
      expect(result.stages.ingest.recordsCreated).toBe(5000);
      expect(result.stages.embed.recordsProcessed).toBe(5000);
      expect(result.stages.patterns.recordsCreated).toBe(50);
      expect(result.stages.leads.recordsCreated).toBe(50);
    });
  });

  describe('Pipeline Stats', () => {
    it('E2E: should return accurate statistics', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.count).mockResolvedValue(10000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(9500) }]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(100);
      vi.mocked(prisma.lead.count)
        .mockResolvedValueOnce(75)
        .mockResolvedValueOnce(25);
      vi.mocked(prisma.pipelineRun.findFirst).mockResolvedValue({
        id: 'last_run',
        mode: 'incremental',
        triggeredBy: 'cron',
        status: PipelineStatus.COMPLETED,
        startedAt: new Date('2024-01-15T10:00:00Z'),
        completedAt: new Date('2024-01-15T10:05:00Z'),
        totalRecords: 1000,
        totalDuration: 300000,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      const { getPipelineStats } = await import('../unified-pipeline');

      const stats = await getPipelineStats();

      expect(stats.complaints.total).toBe(10000);
      expect(stats.complaints.withEmbeddings).toBe(9500);
      expect(stats.complaints.coverage).toBe(95);
      expect(stats.patterns.total).toBe(100);
      expect(stats.leads.total).toBe(75);
      expect(stats.leads.highPriority).toBe(25);
      expect(stats.lastRun).not.toBeNull();
      expect(stats.lastRun?.status).toBe('COMPLETED');
    });

    it('E2E: should handle first run with no history', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.count).mockResolvedValue(0);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(0);
      vi.mocked(prisma.lead.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      vi.mocked(prisma.pipelineRun.findFirst).mockResolvedValue(null);

      const { getPipelineStats } = await import('../unified-pipeline');

      const stats = await getPipelineStats();

      expect(stats.complaints.total).toBe(0);
      expect(stats.complaints.coverage).toBe(0);
      expect(stats.lastRun).toBeNull();
    });
  });

  describe('Cron Automation', () => {
    it('E2E: should handle cron-triggered pipeline correctly', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');
      const { emitPipelineEvent } = await import('../events');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'cron_run',
        mode: 'incremental',
        triggeredBy: 'cron',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 50,
        newComplaints: 5,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 5,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 1,
        patternsUpdated: 0,
        complaintsProcessed: 50,
        noiseCount: 5,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', triggeredBy: 'cron' });

      // Verify cron-specific behavior
      expect(result.success).toBe(true);
      expect(emitPipelineEvent).toHaveBeenCalledWith(
        'pipeline:started',
        expect.objectContaining({ triggeredBy: 'cron' })
      );

      // Verify database record
      expect(prisma.pipelineRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredBy: 'cron',
        }),
      });
    });
  });

  describe('Recall Matching', () => {
    it('E2E: should match leads with recalls when available', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_recall_match',
        mode: 'incremental',
        triggeredBy: 'manual',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      // Skip to leads stage
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 0,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 0,
        patternsUpdated: 0,
        complaintsProcessed: 0,
        noiseCount: 0,
        error: null,
      });

      // One pattern that should match a recall
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'p_recall',
          name: 'TOYOTA CAMRY BRAKE Pattern',
          make: 'TOYOTA',
          model: 'CAMRY',
          component: 'BRAKE',
          description: 'Brake failure pattern matching recall',
          yearStart: 2020,
          yearEnd: 2022,
          severityScore: 150,
          complaintCount: 50,
          trendDirection: TrendDirection.INCREASING,
          trendScore: 75,
          deathCount: 1,
          injuryCount: 10,
          crashCount: 15,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
      ]);

      // Mock recall match - return a matching recall
      vi.mocked(prisma.recall.findFirst).mockResolvedValue({
        id: 'recall_123',
        nhtsaCampaignNumber: '24V001',
        manufacturer: 'TOYOTA',
        make: 'TOYOTA',
        model: 'CAMRY',
        year: 2021,
        component: 'BRAKE SYSTEM',
        summary: 'Brake system issue',
        consequence: 'Loss of braking',
        remedy: 'Replace brake components',
        notes: null,
        reportReceivedDate: new Date('2024-01-01'),
        parkIt: false,
        parkOutside: false,
        embedding: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: 'lead_with_recall',
        patternId: 'p_recall',
        title: 'TOYOTA CAMRY BRAKE Safety Issue',
        description: 'Pattern matching recall',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        yearStart: 2020,
        yearEnd: 2022,
        severityScore: 150,
        confidenceScore: 0.5,
        priorityScore: 0.8,
        complaintCount: 50,
        deathCount: 1,
        injuryCount: 10,
        crashCount: 15,
        fireCount: 0,
        status: 'NEW',
        reviewedAt: null,
        reviewedBy: null,
        notes: null,
        matchedRecallId: 'recall_123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental' });

      // Verify recall matching was attempted
      expect(result.success).toBe(true);
      expect(prisma.recall.findFirst).toHaveBeenCalled();

      // Verify lead was created with matchedRecallId
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchedRecallId: 'recall_123',
        }),
      });
    });

    it('E2E: should handle no matching recall gracefully', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'e2e_no_recall',
        mode: 'incremental',
        triggeredBy: 'manual',
        status: PipelineStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        totalRecords: 0,
        totalDuration: 0,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 0,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 0,
        patternsUpdated: 0,
        complaintsProcessed: 0,
        noiseCount: 0,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'p_no_recall',
          name: 'UNIQUE MAKE COMPONENT Pattern',
          make: 'UNIQUEMAKE',
          model: 'UNIQUEMODEL',
          component: 'UNIQUECOMP',
          description: 'Pattern with no matching recall',
          yearStart: 2020,
          yearEnd: 2024,
          severityScore: 80,
          complaintCount: 10,
          trendDirection: TrendDirection.STABLE,
          trendScore: 0,
          deathCount: 0,
          injuryCount: 2,
          crashCount: 1,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [],
        },
      ]);

      // No matching recall
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: 'lead_no_recall',
        patternId: 'p_no_recall',
        title: 'UNIQUEMAKE UNIQUEMODEL UNIQUECOMP Safety Issue',
        description: 'Pattern with no matching recall',
        make: 'UNIQUEMAKE',
        model: 'UNIQUEMODEL',
        component: 'UNIQUECOMP',
        yearStart: 2020,
        yearEnd: 2024,
        severityScore: 80,
        confidenceScore: 0.1,
        priorityScore: 0.35,
        complaintCount: 10,
        deathCount: 0,
        injuryCount: 2,
        crashCount: 1,
        fireCount: 0,
        status: 'NEW',
        reviewedAt: null,
        reviewedBy: null,
        notes: null,
        matchedRecallId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental' });

      // Should succeed even without matching recall
      expect(result.success).toBe(true);
      expect(result.stages.leads.recordsCreated).toBe(1);

      // Lead was created with null matchedRecallId
      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchedRecallId: null,
        }),
      });
    });
  });
});
