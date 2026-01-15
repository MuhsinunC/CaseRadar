/**
 * Pipeline API Tests
 * Tests for the pipeline API endpoints:
 * - GET /api/pipeline - Get pipeline stats
 * - POST /api/pipeline - Trigger pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/pipeline', () => ({
  processPipeline: vi.fn(),
  getPipelineStats: vi.fn(),
  getLastPipelineRun: vi.fn(),
}));

describe('Pipeline API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('GET /api/pipeline', () => {
    it('should return 401 when not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../pipeline/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return pipeline stats when authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { getPipelineStats, getLastPipelineRun } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(getPipelineStats).mockResolvedValue({
        complaints: {
          total: 10000,
          withEmbeddings: 9500,
          coverage: 95,
        },
        patterns: {
          total: 50,
        },
        leads: {
          total: 25,
          highPriority: 10,
        },
        lastRun: null,
      });

      vi.mocked(getLastPipelineRun).mockResolvedValue(null);

      const { GET } = await import('../pipeline/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.stats.complaints.total).toBe(10000);
      expect(data.stats.complaints.coverage).toBe(95);
    });

    it('should include last run info when available', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { getPipelineStats, getLastPipelineRun } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(getPipelineStats).mockResolvedValue({
        complaints: {
          total: 5000,
          withEmbeddings: 5000,
          coverage: 100,
        },
        patterns: {
          total: 30,
        },
        leads: {
          total: 15,
          highPriority: 5,
        },
        lastRun: {
          id: 'run_123',
          mode: 'incremental',
          status: 'COMPLETED',
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T10:05:00Z'),
          duration: 300000,
        },
      });

      vi.mocked(getLastPipelineRun).mockResolvedValue({
        id: 'run_123',
        mode: 'incremental',
        triggeredBy: 'cron',
        status: 'COMPLETED',
        startedAt: new Date('2024-01-15T10:00:00Z'),
        completedAt: new Date('2024-01-15T10:05:00Z'),
        totalRecords: 500,
        totalDuration: 300000,
        errorMessage: null,
        ingestResult: null,
        embedResult: null,
        patternResult: null,
        leadResult: null,
      });

      const { GET } = await import('../pipeline/route');

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.lastRun).not.toBeNull();
      expect(data.lastRun.id).toBe('run_123');
      expect(data.lastRun.status).toBe('COMPLETED');
    });
  });

  describe('POST /api/pipeline', () => {
    it('should return 401 when not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should trigger incremental pipeline by default', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: true,
        runId: 'run_new',
        stages: {
          ingest: { success: true, recordsProcessed: 100, recordsCreated: 10, recordsUpdated: 0, duration: 1000, errors: [] },
          embed: { success: true, recordsProcessed: 10, recordsCreated: 10, recordsUpdated: 0, duration: 2000, errors: [] },
          patterns: { success: true, recordsProcessed: 50, recordsCreated: 5, recordsUpdated: 2, duration: 3000, errors: [] },
          leads: { success: true, recordsProcessed: 7, recordsCreated: 3, recordsUpdated: 4, duration: 500, errors: [] },
        },
        totalDuration: 6500,
        recordsProcessed: 167,
        errors: [],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.runId).toBe('run_new');

      // Verify incremental mode was used by default
      expect(processPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'incremental',
          triggeredBy: 'api',
        })
      );
    });

    it('should trigger full pipeline when mode is specified', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: true,
        runId: 'run_full',
        stages: {
          ingest: { success: true, recordsProcessed: 1000, recordsCreated: 500, recordsUpdated: 0, duration: 10000, errors: [] },
          embed: { success: true, recordsProcessed: 500, recordsCreated: 500, recordsUpdated: 0, duration: 20000, errors: [] },
          patterns: { success: true, recordsProcessed: 500, recordsCreated: 50, recordsUpdated: 20, duration: 30000, errors: [] },
          leads: { success: true, recordsProcessed: 70, recordsCreated: 30, recordsUpdated: 40, duration: 5000, errors: [] },
        },
        totalDuration: 65000,
        recordsProcessed: 2070,
        errors: [],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({ mode: 'full' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(processPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'full',
        })
      );
    });

    it('should support dry run mode', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: true,
        runId: 'run_dry',
        stages: {
          ingest: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 100, errors: [] },
          embed: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 100, errors: [] },
          patterns: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 100, errors: [] },
          leads: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 100, errors: [] },
        },
        totalDuration: 400,
        recordsProcessed: 0,
        errors: [],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({ dryRun: true }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(processPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        })
      );
    });

    it('should support stage selection', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: true,
        runId: 'run_partial',
        stages: {
          ingest: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 0, errors: [] },
          embed: { success: true, recordsProcessed: 100, recordsCreated: 100, recordsUpdated: 0, duration: 5000, errors: [] },
          patterns: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 0, errors: [] },
          leads: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 0, errors: [] },
        },
        totalDuration: 5000,
        recordsProcessed: 100,
        errors: [],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({
          stages: {
            ingest: false,
            embed: true,
            patterns: false,
            leads: false,
          },
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(processPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          stages: {
            ingest: false,
            embed: true,
            patterns: false,
            leads: false,
          },
        })
      );
    });

    it('should support filters', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: true,
        runId: 'run_filtered',
        stages: {
          ingest: { success: true, recordsProcessed: 50, recordsCreated: 50, recordsUpdated: 0, duration: 1000, errors: [] },
          embed: { success: true, recordsProcessed: 50, recordsCreated: 50, recordsUpdated: 0, duration: 2000, errors: [] },
          patterns: { success: true, recordsProcessed: 50, recordsCreated: 5, recordsUpdated: 0, duration: 1000, errors: [] },
          leads: { success: true, recordsProcessed: 5, recordsCreated: 2, recordsUpdated: 3, duration: 500, errors: [] },
        },
        totalDuration: 4500,
        recordsProcessed: 155,
        errors: [],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({
          filters: {
            make: 'TOYOTA',
            highQualityOnly: true,
          },
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(processPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            make: 'TOYOTA',
            highQualityOnly: true,
          }),
        })
      );
    });

    it('should handle pipeline errors gracefully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockRejectedValue(new Error('Database connection failed'));

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Pipeline execution failed');
      expect(data.details).toBe('Database connection failed');
    });

    it('should return errors from failed stages', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { processPipeline } = await import('@/lib/pipeline');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_1',
        organizationId: 'org_1',
        email: 'test@test.com',
        role: 'ADMIN',
      } as never);

      vi.mocked(processPipeline).mockResolvedValue({
        success: false,
        runId: 'run_error',
        stages: {
          ingest: { success: true, recordsProcessed: 100, recordsCreated: 10, recordsUpdated: 0, duration: 1000, errors: [] },
          embed: { success: false, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 5000, errors: ['Rate limit exceeded'] },
          patterns: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 0, errors: [] },
          leads: { success: true, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, duration: 0, errors: [] },
        },
        totalDuration: 6000,
        recordsProcessed: 100,
        errors: [{ stage: 'embed', message: 'Rate limit exceeded', recoverable: true }],
      });

      const { POST } = await import('../pipeline/route');

      const request = new NextRequest('http://localhost/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0].stage).toBe('embed');
    });
  });
});
