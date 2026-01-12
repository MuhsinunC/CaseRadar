/**
 * Pattern Scoring Tests
 * Tests for severity scoring algorithm
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateSeverityScore,
  calculateWeightedScore,
  rankPatterns,
  updatePatternSeverity,
  getDefaultWeights,
  type SeverityWeights,
  type PatternMetrics,
  type ScoredPattern,
} from '../pattern-scoring';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    pattern: {
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    complaint: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Pattern Scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDefaultWeights', () => {
    it('should return default severity weights', () => {
      const weights = getDefaultWeights();

      expect(weights).toEqual({
        deaths: 100, // Highest weight
        injuries: 20,
        crashes: 10,
        fires: 15,
        complaintCount: 1,
        trendScore: 5,
      });
    });
  });

  describe('calculateWeightedScore', () => {
    it('should calculate weighted score correctly', () => {
      const metrics: PatternMetrics = {
        deaths: 2,
        injuries: 10,
        crashes: 50,
        fires: 5,
        complaintCount: 100,
        trendScore: 3,
      };

      const weights = getDefaultWeights();
      const score = calculateWeightedScore(metrics, weights);

      // 2*100 + 10*20 + 50*10 + 5*15 + 100*1 + 3*5 = 200 + 200 + 500 + 75 + 100 + 15 = 1090
      expect(score).toBe(1090);
    });

    it('should handle zero values', () => {
      const metrics: PatternMetrics = {
        deaths: 0,
        injuries: 0,
        crashes: 0,
        fires: 0,
        complaintCount: 10,
        trendScore: 0,
      };

      const weights = getDefaultWeights();
      const score = calculateWeightedScore(metrics, weights);

      expect(score).toBe(10);
    });

    it('should allow custom weights', () => {
      const metrics: PatternMetrics = {
        deaths: 1,
        injuries: 5,
        crashes: 10,
        fires: 2,
        complaintCount: 50,
        trendScore: 2,
      };

      const customWeights: SeverityWeights = {
        deaths: 200, // Double the default
        injuries: 40,
        crashes: 20,
        fires: 30,
        complaintCount: 2,
        trendScore: 10,
      };

      const score = calculateWeightedScore(metrics, customWeights);

      // 1*200 + 5*40 + 10*20 + 2*30 + 50*2 + 2*10 = 200 + 200 + 200 + 60 + 100 + 20 = 780
      expect(score).toBe(780);
    });
  });

  describe('calculateSeverityScore', () => {
    it('should calculate severity score for a pattern', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.aggregate).mockResolvedValue({
        _sum: {
          deaths: 3,
          injuries: 25,
        },
        _count: {
          id: 150,
        },
      } as any);

      vi.mocked(prisma.complaint.count)
        .mockResolvedValueOnce(45) // crashes
        .mockResolvedValueOnce(8); // fires

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern1',
        trendScore: 4.5,
      } as any);

      const result = await calculateSeverityScore('pattern1');

      expect(result.metrics).toBeDefined();
      expect(result.metrics.deaths).toBe(3);
      expect(result.metrics.injuries).toBe(25);
      expect(result.metrics.crashes).toBe(45);
      expect(result.metrics.fires).toBe(8);
      expect(result.metrics.complaintCount).toBe(150);
      expect(result.metrics.trendScore).toBe(4.5);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle pattern with no complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.aggregate).mockResolvedValue({
        _sum: { deaths: null, injuries: null },
        _count: { id: 0 },
      } as any);

      vi.mocked(prisma.complaint.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern1',
        trendScore: 0,
      } as any);

      const result = await calculateSeverityScore('pattern1');

      expect(result.score).toBe(0);
      expect(result.metrics.complaintCount).toBe(0);
    });
  });

  describe('rankPatterns', () => {
    it('should rank patterns by severity score', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock three patterns with different severities
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Low Severity', trendScore: 1 },
        { id: 'p2', name: 'High Severity', trendScore: 5 },
        { id: 'p3', name: 'Medium Severity', trendScore: 2 },
      ] as any);

      // Mock metrics for each pattern
      vi.mocked(prisma.complaint.aggregate)
        .mockResolvedValueOnce({
          // p1 - low
          _sum: { deaths: 0, injuries: 2 },
          _count: { id: 10 },
        } as any)
        .mockResolvedValueOnce({
          // p2 - high
          _sum: { deaths: 5, injuries: 50 },
          _count: { id: 500 },
        } as any)
        .mockResolvedValueOnce({
          // p3 - medium
          _sum: { deaths: 1, injuries: 10 },
          _count: { id: 50 },
        } as any);

      vi.mocked(prisma.complaint.count).mockResolvedValue(0);
      vi.mocked(prisma.pattern.findUnique)
        .mockResolvedValueOnce({ id: 'p1', trendScore: 1 } as any)
        .mockResolvedValueOnce({ id: 'p2', trendScore: 5 } as any)
        .mockResolvedValueOnce({ id: 'p3', trendScore: 2 } as any);

      const ranked = await rankPatterns({ limit: 10 });

      expect(ranked).toHaveLength(3);
      expect(ranked[0].patternId).toBe('p2'); // Highest severity first
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', trendScore: 1 },
        { id: 'p2', trendScore: 2 },
        { id: 'p3', trendScore: 3 },
      ] as any);

      const ranked = await rankPatterns({ limit: 2 });

      expect(ranked).toHaveLength(2);
    });

    it('should filter by minimum score', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', trendScore: 0 },
        { id: 'p2', trendScore: 0 },
      ] as any);

      vi.mocked(prisma.complaint.aggregate).mockResolvedValue({
        _sum: { deaths: 0, injuries: 1 },
        _count: { id: 5 },
      } as any);

      vi.mocked(prisma.complaint.count).mockResolvedValue(0);
      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        trendScore: 0,
      } as any);

      const ranked = await rankPatterns({ minScore: 100 });

      expect(ranked.length).toBeLessThan(2);
    });
  });

  describe('updatePatternSeverity', () => {
    it('should update pattern severity in database', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.aggregate).mockResolvedValue({
        _sum: { deaths: 2, injuries: 15 },
        _count: { id: 100 },
      } as any);

      vi.mocked(prisma.complaint.count)
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(5);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern1',
        trendScore: 3,
      } as any);

      vi.mocked(prisma.pattern.update).mockResolvedValue({} as any);

      await updatePatternSeverity('pattern1');

      expect(prisma.pattern.update).toHaveBeenCalledWith({
        where: { id: 'pattern1' },
        data: {
          severityScore: expect.any(Number),
          complaintCount: 100,
          lastUpdated: expect.any(Date),
        },
      });
    });

    it('should recalculate all patterns when called with no ID', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
      ] as any);

      vi.mocked(prisma.complaint.aggregate).mockResolvedValue({
        _sum: { deaths: 0, injuries: 0 },
        _count: { id: 0 },
      } as any);

      vi.mocked(prisma.complaint.count).mockResolvedValue(0);
      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        trendScore: 0,
      } as any);
      vi.mocked(prisma.pattern.update).mockResolvedValue({} as any);

      await updatePatternSeverity();

      expect(prisma.pattern.update).toHaveBeenCalledTimes(2);
    });
  });
});
