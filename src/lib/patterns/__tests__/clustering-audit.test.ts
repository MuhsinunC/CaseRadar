/**
 * Clustering Audit Tests
 * P1-6 Implementation - TDD
 *
 * Tests for clustering run audit trail and reproducibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordClusteringRun,
  getClusteringRun,
  replayClusteringRun,
  ClusteringRunData,
} from '../clustering-audit';
import { prisma } from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    clusteringRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    pattern: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('Clustering Audit', () => {
  const mockClusteringRunData: ClusteringRunData = {
    algorithmVersion: '1.0.0',
    randomSeed: 42,
    minClusterSize: 5,
    similarityThreshold: 0.85,
    inputComplaintCount: 1000,
    inputComplaintIds: ['c1', 'c2', 'c3'],
    outputPatternCount: 15,
    outputPatternIds: ['p1', 'p2'],
    durationMs: 5000,
    organizationId: 'org_1',
    createdBy: 'user_1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordClusteringRun', () => {
    it('should record clustering parameters', async () => {
      const mockRun = {
        id: 'run_1',
        ...mockClusteringRunData,
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.create).mockResolvedValue(mockRun as any);

      const run = await recordClusteringRun(mockClusteringRunData);

      expect(run.id).toBe('run_1');
      expect(prisma.clusteringRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            algorithmVersion: '1.0.0',
            randomSeed: 42,
            minClusterSize: 5,
            similarityThreshold: 0.85,
            inputComplaintCount: 1000,
            outputPatternCount: 15,
          }),
        })
      );
    });

    it('should store input complaint IDs', async () => {
      const mockRun = {
        id: 'run_2',
        ...mockClusteringRunData,
        inputComplaintIds: ['c1', 'c2', 'c3'],
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.create).mockResolvedValue(mockRun as any);

      const run = await recordClusteringRun(mockClusteringRunData);

      expect(run.inputComplaintIds).toEqual(['c1', 'c2', 'c3']);
      expect(prisma.clusteringRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inputComplaintIds: ['c1', 'c2', 'c3'],
          }),
        })
      );
    });

    it('should store output pattern IDs', async () => {
      const mockRun = {
        id: 'run_3',
        ...mockClusteringRunData,
        outputPatternIds: ['p1', 'p2'],
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.create).mockResolvedValue(mockRun as any);

      const run = await recordClusteringRun(mockClusteringRunData);

      expect(run.outputPatternIds).toEqual(['p1', 'p2']);
    });

    it('should record duration', async () => {
      const mockRun = {
        id: 'run_4',
        ...mockClusteringRunData,
        durationMs: 5000,
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.create).mockResolvedValue(mockRun as any);

      const run = await recordClusteringRun(mockClusteringRunData);

      expect(run.durationMs).toBe(5000);
    });

    it('should associate with organization', async () => {
      const mockRun = {
        id: 'run_5',
        ...mockClusteringRunData,
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.create).mockResolvedValue(mockRun as any);

      await recordClusteringRun(mockClusteringRunData);

      expect(prisma.clusteringRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org_1',
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      vi.mocked(prisma.clusteringRun.create).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        recordClusteringRun(mockClusteringRunData)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getClusteringRun', () => {
    it('should retrieve clustering run by ID', async () => {
      const mockRun = {
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
        minClusterSize: 5,
        similarityThreshold: 0.85,
        inputComplaintCount: 1000,
        inputComplaintIds: ['c1', 'c2'],
        outputPatternCount: 15,
        outputPatternIds: ['p1'],
        durationMs: 5000,
        organizationId: 'org_1',
        createdBy: 'user_1',
        createdAt: new Date(),
        patterns: [{ id: 'p1', name: 'Test Pattern' }],
      };

      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(
        mockRun as any
      );

      const run = await getClusteringRun('run_1');

      expect(run).toMatchObject({
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
      });
    });

    it('should return null if run not found', async () => {
      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(null);

      const run = await getClusteringRun('non_existent');

      expect(run).toBeNull();
    });

    it('should include patterns in result', async () => {
      const mockRun = {
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
        minClusterSize: 5,
        similarityThreshold: 0.85,
        inputComplaintCount: 1000,
        inputComplaintIds: ['c1'],
        outputPatternCount: 2,
        outputPatternIds: ['p1', 'p2'],
        durationMs: 3000,
        organizationId: 'org_1',
        createdBy: 'user_1',
        createdAt: new Date(),
        patterns: [{ id: 'p1' }, { id: 'p2' }],
      };

      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(
        mockRun as any
      );

      const run = await getClusteringRun('run_1');

      expect(prisma.clusteringRun.findUnique).toHaveBeenCalledWith({
        where: { id: 'run_1' },
        include: { patterns: true },
      });
    });
  });

  describe('replayClusteringRun', () => {
    it('should return replay metadata without actual execution', async () => {
      const mockRun = {
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
        minClusterSize: 5,
        similarityThreshold: 0.85,
        inputComplaintCount: 100,
        inputComplaintIds: ['c1', 'c2'],
        outputPatternCount: 5,
        outputPatternIds: ['p1', 'p2'],
        durationMs: 2000,
        organizationId: 'org_1',
        createdBy: 'user_1',
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(
        mockRun as any
      );

      const result = await replayClusteringRun('run_1');

      expect(result).toMatchObject({
        originalRunId: 'run_1',
        canReplay: expect.any(Boolean),
        parameters: expect.objectContaining({
          algorithmVersion: '1.0.0',
          randomSeed: 42,
        }),
      });
    });

    it('should indicate if run can be replayed', async () => {
      const mockRun = {
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
        minClusterSize: 5,
        similarityThreshold: 0.85,
        inputComplaintCount: 100,
        inputComplaintIds: ['c1', 'c2'],
        outputPatternCount: 5,
        outputPatternIds: ['p1'],
        durationMs: 2000,
        organizationId: 'org_1',
        createdBy: 'user_1',
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(
        mockRun as any
      );

      const result = await replayClusteringRun('run_1');

      expect(result.canReplay).toBe(true);
    });

    it('should return null if run not found', async () => {
      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(null);

      const result = await replayClusteringRun('non_existent');

      expect(result).toBeNull();
    });

    it('should indicate not replayable if input complaints missing', async () => {
      const mockRun = {
        id: 'run_1',
        algorithmVersion: '1.0.0',
        randomSeed: 42,
        minClusterSize: 5,
        similarityThreshold: 0.85,
        inputComplaintCount: 100,
        inputComplaintIds: [], // Empty - can't replay
        outputPatternCount: 5,
        outputPatternIds: [],
        durationMs: 2000,
        organizationId: 'org_1',
        createdBy: 'user_1',
        createdAt: new Date(),
      };

      vi.mocked(prisma.clusteringRun.findUnique).mockResolvedValue(
        mockRun as any
      );

      const result = await replayClusteringRun('run_1');

      expect(result?.canReplay).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database error in getClusteringRun', async () => {
      vi.mocked(prisma.clusteringRun.findUnique).mockRejectedValue(
        new Error('Database error')
      );

      await expect(getClusteringRun('run_1')).rejects.toThrow('Database error');
    });

    it('should handle database error in replayClusteringRun', async () => {
      vi.mocked(prisma.clusteringRun.findUnique).mockRejectedValue(
        new Error('Database error')
      );

      await expect(replayClusteringRun('run_1')).rejects.toThrow(
        'Database error'
      );
    });
  });
});
