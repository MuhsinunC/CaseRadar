/**
 * Pipeline Integration Tests
 * Tests the integration between pipeline stages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineStatus, TrendDirection } from '@prisma/client';

// Mock the database
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
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

// Mock external services
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

describe('Pipeline Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Stage Sequencing', () => {
    it('should run stages in correct order: ingest -> embed -> patterns -> leads', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      const callOrder: string[] = [];

      // Setup mocks to track call order
      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_1',
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockImplementation(async () => {
        callOrder.push('ingest');
        return { totalComplaints: 100, newComplaints: 10, errors: [] };
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockImplementation(async () => {
        callOrder.push('embed');
        return { processed: 10, errors: [] };
      });

      vi.mocked(patternGenerationService.generatePatterns).mockImplementation(async () => {
        callOrder.push('patterns');
        return {
          success: true,
          patternsCreated: 5,
          patternsUpdated: 0,
          complaintsProcessed: 100,
          noiseCount: 10,
          error: null,
        };
      });

      vi.mocked(prisma.pattern.findMany).mockImplementation(async () => {
        callOrder.push('leads');
        return [];
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental' });

      // Verify call order
      expect(callOrder).toEqual(['ingest', 'embed', 'patterns', 'leads']);
    });

    it('should pass data between stages correctly', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_2',
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

      // Ingest produces 50 new complaints
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 100,
        newComplaints: 50,
        errors: [],
      });

      // 50 complaints need embedding
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: BigInt(50) }]);

      // Embed processes all 50
      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 50,
        errors: [],
      });

      // Pattern service processes embedded complaints
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: BigInt(0) }]);
      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 10,
        patternsUpdated: 5,
        complaintsProcessed: 50,
        noiseCount: 5,
        error: null,
      });

      // Lead generation finds patterns
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'p1',
          name: 'Test Pattern',
          make: 'TEST',
          model: 'MODEL',
          component: 'COMP',
          description: 'Test',
          yearStart: 2020,
          yearEnd: 2023,
          severityScore: 100,
          complaintCount: 20,
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

      const result = await processPipeline({ mode: 'incremental' });

      // Verify data flow
      expect(result.stages.ingest.recordsCreated).toBe(50); // 50 new complaints ingested
      expect(result.stages.embed.recordsProcessed).toBe(50); // 50 embedded
      expect(result.stages.patterns.recordsCreated).toBe(10); // 10 patterns created
      expect(result.stages.leads.recordsCreated).toBe(1); // 1 lead created
    });
  });

  describe('Error Propagation', () => {
    it('should stop pipeline when stage fails and continueOnError is false', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_err',
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

      // Ingest fails
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: ['Network error'],
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', continueOnError: false });

      // Embed should not be called due to error
      expect(complaintEmbedder.embedMissingComplaints).not.toHaveBeenCalled();
      expect(patternGenerationService.generatePatterns).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('should continue pipeline when stage fails and continueOnError is true', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_cont',
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

      // Ingest fails
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: ['Network error'],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      // But embed continues
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
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', continueOnError: true });

      // All stages should be called despite error
      expect(complaintEmbedder.embedMissingComplaints).toHaveBeenCalled();
      expect(patternGenerationService.generatePatterns).toHaveBeenCalled();
      expect(result.success).toBe(false); // But overall still fails
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should aggregate errors from multiple stages', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_multi_err',
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

      // Multiple stages have errors
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 50,
        newComplaints: 10,
        errors: ['Partial sync failure'],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(10) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 8,
        errors: ['Rate limit hit on 2 records'],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 1,
        patternsUpdated: 0,
        complaintsProcessed: 8,
        noiseCount: 2,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental', continueOnError: true });

      // Verify errors from multiple stages were collected
      expect(result.errors.length).toBe(2);
      expect(result.errors.some(e => e.stage === 'ingest')).toBe(true);
      expect(result.errors.some(e => e.stage === 'embed')).toBe(true);
    });
  });

  describe('Database Recording', () => {
    it('should create pipeline run record at start', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_record',
        mode: 'full',
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
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'full', triggeredBy: 'cron' });

      expect(prisma.pipelineRun.create).toHaveBeenCalledWith({
        data: {
          mode: 'full',
          triggeredBy: 'cron',
          status: PipelineStatus.RUNNING,
        },
      });
    });

    it('should update pipeline run with results at end', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_final',
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 100,
        newComplaints: 20,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 20,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 3,
        patternsUpdated: 2,
        complaintsProcessed: 100,
        noiseCount: 10,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental', triggeredBy: 'api' });

      // Verify final update was called
      expect(prisma.pipelineRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run_final' },
          data: expect.objectContaining({
            status: PipelineStatus.COMPLETED,
            ingestResult: expect.any(Object),
            embedResult: expect.any(Object),
            patternResult: expect.any(Object),
            leadResult: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('Event Emission', () => {
    it('should emit events for all stages', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');
      const { emitPipelineEvent } = await import('../events');

      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_events',
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
        totalComplaints: 10,
        newComplaints: 2,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 2,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 1,
        patternsUpdated: 0,
        complaintsProcessed: 10,
        noiseCount: 2,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental' });

      // Verify key events were emitted
      expect(emitPipelineEvent).toHaveBeenCalledWith('pipeline:started', expect.any(Object));
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:started', expect.objectContaining({ stage: 'ingest' }));
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:complete', expect.objectContaining({ stage: 'ingest' }));
      expect(emitPipelineEvent).toHaveBeenCalledWith('complaints:ingested', expect.any(Object));
      expect(emitPipelineEvent).toHaveBeenCalledWith('embeddings:generated', expect.any(Object));
      expect(emitPipelineEvent).toHaveBeenCalledWith('patterns:detected', expect.any(Object));
      expect(emitPipelineEvent).toHaveBeenCalledWith('leads:generated', expect.any(Object));
      expect(emitPipelineEvent).toHaveBeenCalledWith('pipeline:complete', expect.any(Object));
    });
  });
});
