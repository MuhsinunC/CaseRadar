/**
 * Clustering Service Tests
 * Tests for grouping similar complaints into patterns
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findSimilarComplaints,
  groupIntoClusters,
  assignToExistingCluster,
  getClusterCentroid,
  calculateClusterStats,
  type ClusterResult,
  type ClusterStats,
} from '../clustering';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    complaint: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    pattern: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock embeddings to avoid OpenAI API key requirement
vi.mock('@/lib/embeddings', () => ({
  cosineSimilarity: (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },
}));

describe('Clustering Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findSimilarComplaints', () => {
    it('should find complaints similar to a given embedding', async () => {
      const { prisma } = await import('@/lib/db');
      const mockResults = [
        { id: 'c1', distance: 0.1 },
        { id: 'c2', distance: 0.2 },
        { id: 'c3', distance: 0.3 },
      ];
      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockResults);

      const embedding = new Array(1536).fill(0.1);
      const results = await findSimilarComplaints(embedding, { limit: 10 });

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ id: 'c1', similarity: 0.9 });
      expect(results[1]).toEqual({ id: 'c2', similarity: 0.8 });
    });

    it('should filter by minimum similarity threshold', async () => {
      const { prisma } = await import('@/lib/db');
      const mockResults = [
        { id: 'c1', distance: 0.1 },
        { id: 'c2', distance: 0.5 },
        { id: 'c3', distance: 0.8 },
      ];
      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockResults);

      const embedding = new Array(1536).fill(0.1);
      const results = await findSimilarComplaints(embedding, {
        limit: 10,
        minSimilarity: 0.6,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by vehicle criteria', async () => {
      const { prisma } = await import('@/lib/db');
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      const embedding = new Array(1536).fill(0.1);
      await findSimilarComplaints(embedding, {
        limit: 10,
        make: 'Toyota',
        yearRange: [2018, 2022],
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('groupIntoClusters', () => {
    it('should group similar complaints into clusters', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock complaints with embeddings
      const mockComplaints = [
        { id: 'c1', embedding: '[0.1,0.2,0.3]' },
        { id: 'c2', embedding: '[0.11,0.21,0.31]' },
        { id: 'c3', embedding: '[0.9,0.8,0.7]' },
        { id: 'c4', embedding: '[0.91,0.81,0.71]' },
      ];

      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockComplaints);
      vi.mocked(prisma.pattern.create).mockResolvedValue({
        id: 'pattern1',
        name: 'Cluster 1',
        description: '',
        make: 'MULTIPLE',
        model: null,
        component: 'MULTIPLE',
        yearStart: null,
        yearEnd: null,
        severityScore: 0,
        complaintCount: 2,
        crashCount: 0,
        fireCount: 0,
        injuryCount: 0,
        deathCount: 0,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await groupIntoClusters({
        minClusterSize: 2,
        similarityThreshold: 0.8,
      });

      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.noiseCount).toBeGreaterThanOrEqual(0);
    });

    it('should respect minimum cluster size', async () => {
      const { prisma } = await import('@/lib/db');

      // Only 1 complaint - should not form a cluster with minClusterSize=2
      const mockComplaints = [{ id: 'c1', embedding: '[0.1,0.2,0.3]' }];

      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockComplaints);

      const result = await groupIntoClusters({
        minClusterSize: 2,
        similarityThreshold: 0.8,
      });

      expect(result.clusters).toHaveLength(0);
      expect(result.noiseCount).toBe(1);
    });
  });

  describe('assignToExistingCluster', () => {
    it('should assign complaint to best matching cluster', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock existing patterns - only id and name are used by the function
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Airbag Issues' },
        { id: 'p2', name: 'Brake Problems' },
      ] as any);

      // Mock complaint embeddings for each pattern
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]) // For p1
        .mockResolvedValueOnce([{ embedding: '[0.9,0.8,0.7]' }]); // For p2

      const embedding = [0.11, 0.21, 0.31]; // Similar to p1
      const result = await assignToExistingCluster(embedding);

      expect(result).not.toBeNull();
      expect(result?.patternId).toBe('p1');
      expect(result?.similarity).toBeGreaterThan(0.9);
    });

    it('should return null if no cluster meets threshold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Airbag Issues' },
      ] as any);

      // Mock complaint embeddings with opposite direction (low cosine similarity)
      // [1, 0, 0] and [0, 1, 0] have 0 cosine similarity (orthogonal)
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ embedding: '[1,0,0]' }]);

      const embedding = [0, 1, 0]; // Orthogonal to cluster centroid
      const result = await assignToExistingCluster(embedding, { minSimilarity: 0.8 });

      expect(result).toBeNull();
    });
  });

  describe('getClusterCentroid', () => {
    it('should calculate centroid from complaint embeddings', () => {
      const embeddings = [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
      ];

      const centroid = getClusterCentroid(embeddings);

      expect(centroid).toEqual([2, 3, 4]); // Average
    });

    it('should handle single embedding', () => {
      const embeddings = [[1, 2, 3]];
      const centroid = getClusterCentroid(embeddings);
      expect(centroid).toEqual([1, 2, 3]);
    });

    it('should throw error for empty array', () => {
      expect(() => getClusterCentroid([])).toThrow('No embeddings provided');
    });
  });

  describe('calculateClusterStats', () => {
    it('should calculate comprehensive cluster statistics', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([
        {
          id: 'c1',
          deaths: 1,
          injuries: 2,
          crash: true,
          fire: false,
          dateAdded: new Date('2024-01-01'),
        },
        {
          id: 'c2',
          deaths: 0,
          injuries: 1,
          crash: true,
          fire: true,
          dateAdded: new Date('2024-01-15'),
        },
        {
          id: 'c3',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date('2024-02-01'),
        },
      ] as any);

      const stats = await calculateClusterStats('pattern1');

      expect(stats.totalComplaints).toBe(3);
      expect(stats.totalDeaths).toBe(1);
      expect(stats.totalInjuries).toBe(3);
      expect(stats.crashCount).toBe(2);
      expect(stats.fireCount).toBe(1);
      expect(stats.dateRange.start).toEqual(new Date('2024-01-01'));
      expect(stats.dateRange.end).toEqual(new Date('2024-02-01'));
    });
  });
});
