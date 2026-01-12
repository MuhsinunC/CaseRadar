/**
 * Trend Detection Tests
 * Tests for identifying increasing complaint frequencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateRollingStats,
  calculateZScore,
  detectSpike,
  calculateTrendDirection,
  calculateTrendScore,
  analyzePatternTrend,
  type TimeSeries,
  type TrendResult,
  type RollingStats,
} from '../trend-detection';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    complaint: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    pattern: {
      update: vi.fn(),
    },
  },
}));

describe('Trend Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateRollingStats', () => {
    it('should calculate rolling mean and standard deviation', () => {
      const values = [10, 12, 11, 15, 20, 18, 25, 30];
      const windowSize = 4;

      const stats = calculateRollingStats(values, windowSize);

      // First 3 values should have null stats (not enough data)
      expect(stats[0]).toBeNull();
      expect(stats[1]).toBeNull();
      expect(stats[2]).toBeNull();

      // From index 3 onwards, should have stats
      expect(stats[3]).not.toBeNull();
      expect(stats[3]?.mean).toBe(12); // avg(10, 12, 11, 15)
      expect(stats[3]?.stdDev).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const stats = calculateRollingStats([], 4);
      expect(stats).toEqual([]);
    });

    it('should handle array smaller than window', () => {
      const stats = calculateRollingStats([1, 2], 4);
      expect(stats).toEqual([null, null]);
    });
  });

  describe('calculateZScore', () => {
    it('should calculate z-score correctly', () => {
      const value = 15;
      const mean = 10;
      const stdDev = 2;

      const zScore = calculateZScore(value, mean, stdDev);

      expect(zScore).toBe(2.5); // (15 - 10) / 2
    });

    it('should return 0 when stdDev is 0', () => {
      const zScore = calculateZScore(15, 10, 0);
      expect(zScore).toBe(0);
    });

    it('should handle negative z-scores', () => {
      const zScore = calculateZScore(5, 10, 2);
      expect(zScore).toBe(-2.5);
    });
  });

  describe('detectSpike', () => {
    it('should detect spike when z-score exceeds threshold', () => {
      const timeSeries: TimeSeries = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 12 },
        { date: new Date('2024-01-15'), value: 11 },
        { date: new Date('2024-01-22'), value: 10 },
        { date: new Date('2024-01-29'), value: 50 }, // Spike!
      ];

      const spikes = detectSpike(timeSeries, { windowSize: 4, threshold: 3 });

      expect(spikes.length).toBeGreaterThan(0);
      expect(spikes[0].date).toEqual(new Date('2024-01-29'));
      expect(spikes[0].zScore).toBeGreaterThan(3);
    });

    it('should not detect spike in stable data', () => {
      const timeSeries: TimeSeries = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 11 },
        { date: new Date('2024-01-15'), value: 10 },
        { date: new Date('2024-01-22'), value: 12 },
        { date: new Date('2024-01-29'), value: 11 },
      ];

      const spikes = detectSpike(timeSeries, { windowSize: 4, threshold: 3 });

      expect(spikes).toHaveLength(0);
    });
  });

  describe('calculateTrendDirection', () => {
    it('should detect INCREASING trend', () => {
      const values = [10, 12, 15, 18, 22, 25, 30];

      const result = calculateTrendDirection(values);

      expect(result.direction).toBe('INCREASING');
      expect(result.slope).toBeGreaterThan(0);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('should detect DECREASING trend', () => {
      const values = [30, 25, 22, 18, 15, 12, 10];

      const result = calculateTrendDirection(values);

      expect(result.direction).toBe('DECREASING');
      expect(result.slope).toBeLessThan(0);
    });

    it('should detect STABLE trend for flat data', () => {
      const values = [10, 11, 10, 11, 10, 11, 10];

      const result = calculateTrendDirection(values);

      expect(result.direction).toBe('STABLE');
    });

    it('should handle insufficient data', () => {
      const values = [10, 11];

      const result = calculateTrendDirection(values);

      expect(result.direction).toBe('STABLE');
      expect(result.confidence).toBe('LOW');
    });
  });

  describe('calculateTrendScore', () => {
    it('should calculate positive score for increasing trend', () => {
      const slope = 2.5;
      const rSquared = 0.85;

      const score = calculateTrendScore(slope, rSquared);

      expect(score).toBeGreaterThan(0);
    });

    it('should calculate negative score for decreasing trend', () => {
      const slope = -2.5;
      const rSquared = 0.85;

      const score = calculateTrendScore(slope, rSquared);

      expect(score).toBeLessThan(0);
    });

    it('should weight by r-squared confidence', () => {
      const slope = 2.0;
      const highConfidence = calculateTrendScore(slope, 0.9);
      const lowConfidence = calculateTrendScore(slope, 0.3);

      expect(Math.abs(highConfidence)).toBeGreaterThan(Math.abs(lowConfidence));
    });
  });

  describe('analyzePatternTrend', () => {
    it('should analyze trend for a pattern over time', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock weekly complaint counts
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { _count: { id: 10 }, dateAdded: new Date('2024-01-01') },
        { _count: { id: 12 }, dateAdded: new Date('2024-01-08') },
        { _count: { id: 15 }, dateAdded: new Date('2024-01-15') },
        { _count: { id: 20 }, dateAdded: new Date('2024-01-22') },
        { _count: { id: 25 }, dateAdded: new Date('2024-01-29') },
      ] as any);

      const result = await analyzePatternTrend('pattern1', {
        windowWeeks: 12,
      });

      expect(result.patternId).toBe('pattern1');
      expect(result.direction).toBe('INCREASING');
      expect(result.trendScore).toBeGreaterThan(0);
      expect(result.recentSpikes).toBeDefined();
    });

    it('should handle pattern with no complaints', async () => {
      const { prisma } = await import('@/lib/db');
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);

      const result = await analyzePatternTrend('pattern1');

      expect(result.direction).toBe('STABLE');
      expect(result.trendScore).toBe(0);
    });

    it('should update pattern with trend results', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { _count: { id: 10 }, dateAdded: new Date('2024-01-01') },
        { _count: { id: 15 }, dateAdded: new Date('2024-01-08') },
        { _count: { id: 20 }, dateAdded: new Date('2024-01-15') },
      ] as any);

      vi.mocked(prisma.pattern.update).mockResolvedValue({} as any);

      await analyzePatternTrend('pattern1', { updatePattern: true });

      expect(prisma.pattern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pattern1' },
          data: expect.objectContaining({
            trendDirection: expect.any(String),
            trendScore: expect.any(Number),
          }),
        })
      );
    });
  });
});
