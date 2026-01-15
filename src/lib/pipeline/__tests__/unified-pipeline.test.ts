/**
 * Unified Pipeline Tests
 * Tests for the unified data pipeline that orchestrates all stages:
 * Ingest → Embed → Patterns → Leads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineStatus, TrendDirection } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    pipelineRun: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    complaint: {
      count: vi.fn(),
    },
    pattern: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    lead: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    recall: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
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

// Mock events to verify they're emitted
vi.mock('../events', () => ({
  emitPipelineEvent: vi.fn(),
  pipelineEvents: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe('Unified Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('processPipeline', () => {
    it('should create a pipeline run record at start', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 100,
        newComplaints: 10,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 10,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 5,
        patternsUpdated: 2,
        complaintsProcessed: 100,
        noiseCount: 10,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental' });

      // Verify pipeline run was created
      expect(prisma.pipelineRun.create).toHaveBeenCalledWith({
        data: {
          mode: 'incremental',
          triggeredBy: 'manual',
          status: PipelineStatus.RUNNING,
        },
      });
    });

    it('should run all stages by default', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 50,
        newComplaints: 5,
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

      const result = await processPipeline({ mode: 'incremental' });

      // Verify all stages were called
      expect(nhtsaSyncService.syncNewComplaints).toHaveBeenCalled();
      expect(complaintEmbedder.embedMissingComplaints).toHaveBeenCalled();
      expect(patternGenerationService.generatePatterns).toHaveBeenCalled();
      expect(prisma.pattern.findMany).toHaveBeenCalled(); // leads stage
    });

    it('should skip stages when disabled in options', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({
        mode: 'incremental',
        stages: {
          ingest: false,
          embed: false,
          patterns: true,
          leads: true,
        },
      });

      // Verify only enabled stages were called
      expect(nhtsaSyncService.syncNewComplaints).not.toHaveBeenCalled();
      expect(complaintEmbedder.embedMissingComplaints).not.toHaveBeenCalled();
      expect(patternGenerationService.generatePatterns).toHaveBeenCalled();
      expect(prisma.pattern.findMany).toHaveBeenCalled();
    });

    it('should emit pipeline:started event', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');
      const { emitPipelineEvent } = await import('../events');

      // Setup mocks
      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_123',
        mode: 'full',
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

      await processPipeline({ mode: 'full', triggeredBy: 'api' });

      // Verify pipeline:started event was emitted
      expect(emitPipelineEvent).toHaveBeenCalledWith('pipeline:started', {
        runId: 'run_123',
        mode: 'full',
        triggeredBy: 'api',
        stages: {
          ingest: true,
          embed: true,
          patterns: true,
          leads: true,
        },
      });
    });

    it('should emit stage:started and stage:complete events for each stage', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');
      const { emitPipelineEvent } = await import('../events');

      // Setup mocks
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

      // Verify stage events were emitted for all stages
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:started', { runId: 'run_1', stage: 'ingest' });
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:started', { runId: 'run_1', stage: 'embed' });
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:started', { runId: 'run_1', stage: 'patterns' });
      expect(emitPipelineEvent).toHaveBeenCalledWith('stage:started', { runId: 'run_1', stage: 'leads' });

      // Verify stage:complete events with success flags
      expect(emitPipelineEvent).toHaveBeenCalledWith(
        'stage:complete',
        expect.objectContaining({ runId: 'run_1', stage: 'ingest', success: true })
      );
    });

    it('should update pipeline run with COMPLETED status on success', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 10,
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

      const result = await processPipeline({ mode: 'incremental' });

      // Verify pipeline run was updated with COMPLETED
      expect(prisma.pipelineRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run_1' },
          data: expect.objectContaining({
            status: PipelineStatus.COMPLETED,
          }),
        })
      );
      expect(result.success).toBe(true);
    });

    it('should update pipeline run with FAILED status on error', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');

      // Setup mocks
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

      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: ['API connection failed'],
      });

      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental' });

      // Verify pipeline run was updated with FAILED
      expect(prisma.pipelineRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run_1' },
          data: expect.objectContaining({
            status: PipelineStatus.FAILED,
          }),
        })
      );
      expect(result.success).toBe(false);
    });

    it('should continue on error when continueOnError is true', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      // Ingest fails
      vi.mocked(nhtsaSyncService.syncNewComplaints).mockResolvedValue({
        totalComplaints: 0,
        newComplaints: 0,
        errors: ['API error'],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      // But embed should still run
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

      await processPipeline({ mode: 'incremental', continueOnError: true });

      // All stages should have been called despite ingest failing
      expect(complaintEmbedder.embedMissingComplaints).toHaveBeenCalled();
      expect(patternGenerationService.generatePatterns).toHaveBeenCalled();
    });

    it('should handle dry run mode without writing', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');

      // Setup mocks
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

      vi.mocked(nhtsaSyncService.getLastSyncDate).mockResolvedValue(new Date());
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(100) }]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental', dryRun: true });

      // In dry run, actual sync should not be called
      expect(nhtsaSyncService.syncNewComplaints).not.toHaveBeenCalled();
    });

    it('should return correct result structure', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
      vi.mocked(prisma.pipelineRun.create).mockResolvedValue({
        id: 'run_abc',
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
        totalComplaints: 1000,
        newComplaints: 100,
        errors: [],
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(0) }]);

      vi.mocked(complaintEmbedder.embedMissingComplaints).mockResolvedValue({
        processed: 100,
        errors: [],
      });

      vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
        success: true,
        patternsCreated: 10,
        patternsUpdated: 5,
        complaintsProcessed: 500,
        noiseCount: 50,
        error: null,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'full', triggeredBy: 'cron' });

      // Verify result structure
      expect(result.success).toBe(true);
      expect(result.runId).toBe('run_abc');
      expect(result.stages.ingest.recordsProcessed).toBe(1000);
      expect(result.stages.embed.recordsProcessed).toBe(100);
      expect(result.stages.patterns.recordsCreated).toBe(10);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Lead Stage', () => {
    it('should generate leads from high-severity patterns', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      // Return eligible pattern
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'TOYOTA CAMRY BRAKE Issues',
          make: 'TOYOTA',
          model: 'CAMRY',
          component: 'BRAKE',
          description: 'Brake failures',
          yearStart: 2018,
          yearEnd: 2022,
          severityScore: 100,
          complaintCount: 50,
          trendDirection: TrendDirection.INCREASING,
          trendScore: 75,
          deathCount: 2,
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

      // Mock recall matching (no match)
      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.lead.create).mockResolvedValue({
        id: 'lead_1',
        patternId: 'pattern_1',
        title: 'TOYOTA CAMRY BRAKE Safety Issue',
        description: 'Brake failures',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        yearStart: 2018,
        yearEnd: 2022,
        severityScore: 100,
        confidenceScore: 0.5,
        priorityScore: 0.8,
        complaintCount: 50,
        deathCount: 2,
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

      const result = await processPipeline({ mode: 'incremental' });

      // Verify lead was created
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patternId: 'pattern_1',
            make: 'TOYOTA',
            component: 'BRAKE',
          }),
        })
      );
      expect(result.stages.leads.recordsCreated).toBe(1);
    });

    it('should update existing leads instead of creating duplicates', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      // Return pattern with existing lead
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'Test Pattern',
          make: 'HONDA',
          model: 'ACCORD',
          component: 'ENGINE',
          description: 'Engine issues',
          yearStart: 2019,
          yearEnd: 2023,
          severityScore: 75,
          complaintCount: 30,
          trendDirection: TrendDirection.STABLE,
          trendScore: 0,
          deathCount: 0,
          injuryCount: 5,
          crashCount: 3,
          fireCount: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null,
          clusteringRunId: null,
          leads: [{ id: 'existing_lead_1' }], // Existing lead
        },
      ]);

      vi.mocked(prisma.recall.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.lead.update).mockResolvedValue({} as never);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      const result = await processPipeline({ mode: 'incremental' });

      // Should update existing lead, not create new
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing_lead_1' },
        })
      );
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(result.stages.leads.recordsUpdated).toBe(1);
    });

    it('should only process patterns meeting minimum criteria', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

      // Setup mocks
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

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pipelineRun.update).mockResolvedValue({} as never);

      const { processPipeline } = await import('../unified-pipeline');

      await processPipeline({ mode: 'incremental' });

      // Verify filter criteria for lead eligibility
      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            severityScore: { gte: 50 }, // minSeverity
            complaintCount: { gte: 5 }, // minComplaints
          },
        })
      );
    });
  });

  describe('Priority Score Calculation', () => {
    it('should weight deaths highest (0.4)', async () => {
      // Test the calculatePriorityScore function indirectly
      // by checking lead creation with death-heavy patterns
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

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

      // Pattern with deaths
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_death',
          name: 'Pattern with deaths',
          make: 'TEST',
          model: 'MODEL',
          component: 'COMP',
          description: 'Test',
          yearStart: 2020,
          yearEnd: 2020,
          severityScore: 200,
          complaintCount: 10,
          trendDirection: TrendDirection.STABLE,
          trendScore: 0,
          deathCount: 1, // Has deaths
          injuryCount: 0,
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

      await processPipeline({ mode: 'incremental' });

      // Verify lead has high priority score due to deaths
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Deaths get 0.4, plus volume gets ~0.006 for 10 complaints = ~0.4
            priorityScore: expect.any(Number),
          }),
        })
      );

      const createCall = vi.mocked(prisma.lead.create).mock.calls[0][0];
      expect(createCall.data.priorityScore).toBeGreaterThanOrEqual(0.4);
    });

    it('should apply trend bonus for INCREASING patterns', async () => {
      const { prisma } = await import('@/lib/db');
      const { nhtsaSyncService } = await import('@/lib/nhtsa/sync');
      const { complaintEmbedder } = await import('@/lib/embeddings/complaint-embedder');
      const { patternGenerationService } = await import('@/lib/patterns/pattern-generation-service');

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

      // Pattern with INCREASING trend
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_increasing',
          name: 'Increasing Pattern',
          make: 'TEST',
          model: 'MODEL',
          component: 'COMP',
          description: 'Test',
          yearStart: 2020,
          yearEnd: 2023,
          severityScore: 100,
          complaintCount: 100,
          trendDirection: TrendDirection.INCREASING,
          trendScore: 80,
          deathCount: 0,
          injuryCount: 0,
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

      await processPipeline({ mode: 'incremental' });

      // Verify trend bonus was applied
      const createCall = vi.mocked(prisma.lead.create).mock.calls[0][0];
      // Should have trend bonus (0.2-0.3)
      expect(createCall.data.priorityScore).toBeGreaterThan(0.2);
    });
  });

  describe('Utility Functions', () => {
    it('getLastPipelineRun should return most recent run', async () => {
      const { prisma } = await import('@/lib/db');

      const mockRun = {
        id: 'run_latest',
        mode: 'incremental',
        triggeredBy: 'cron',
        status: PipelineStatus.COMPLETED,
        startedAt: new Date(),
        completedAt: new Date(),
        totalRecords: 1000,
        totalDuration: 5000,
        errorMessage: null,
        ingestResult: {},
        embedResult: {},
        patternResult: {},
        leadResult: {},
      };

      vi.mocked(prisma.pipelineRun.findFirst).mockResolvedValue(mockRun);

      const { getLastPipelineRun } = await import('../unified-pipeline');

      const result = await getLastPipelineRun();

      expect(prisma.pipelineRun.findFirst).toHaveBeenCalledWith({
        orderBy: { startedAt: 'desc' },
      });
      expect(result).toEqual(mockRun);
    });

    it('getPipelineHistory should return specified number of runs', async () => {
      const { prisma } = await import('@/lib/db');

      const mockRuns = [
        { id: 'run_1', mode: 'incremental', status: PipelineStatus.COMPLETED },
        { id: 'run_2', mode: 'full', status: PipelineStatus.COMPLETED },
        { id: 'run_3', mode: 'incremental', status: PipelineStatus.FAILED },
      ];

      vi.mocked(prisma.pipelineRun.findMany).mockResolvedValue(mockRuns as never);

      const { getPipelineHistory } = await import('../unified-pipeline');

      const result = await getPipelineHistory(5);

      expect(prisma.pipelineRun.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: 'desc' },
        take: 5,
      });
      expect(result).toHaveLength(3);
    });

    it('getPipelineStats should return coverage statistics', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.count).mockResolvedValue(10000);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: BigInt(8000) }]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(50);
      vi.mocked(prisma.lead.count)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(10);
      vi.mocked(prisma.pipelineRun.findFirst).mockResolvedValue(null);

      const { getPipelineStats } = await import('../unified-pipeline');

      const stats = await getPipelineStats();

      expect(stats.complaints.total).toBe(10000);
      expect(stats.complaints.withEmbeddings).toBe(8000);
      expect(stats.complaints.coverage).toBe(80); // 8000/10000 * 100
      expect(stats.patterns.total).toBe(50);
      expect(stats.leads.total).toBe(30);
      expect(stats.leads.highPriority).toBe(10);
    });
  });
});
