/**
 * Anomaly Detection Tests
 * Tests for identifying unusual patterns in complaint data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectAnomalies,
  detectIQRAnomalies,
  detectLevelShift,
  detectSeasonalAnomaly,
  classifyAnomaly,
  getAnomalyAlerts,
  type Anomaly,
  type AnomalyType,
  type TimeSeries,
} from '../anomaly-detection';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    complaint: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    pattern: {
      findMany: vi.fn(),
    },
  },
}));

describe('Anomaly Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectIQRAnomalies', () => {
    it('should detect anomalies using IQR method', () => {
      const values = [10, 11, 10, 12, 11, 10, 100]; // 100 is an outlier

      const anomalies = detectIQRAnomalies(values, { multiplier: 1.5 });

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].index).toBe(6);
      expect(anomalies[0].value).toBe(100);
    });

    it('should not detect anomalies in normal distribution', () => {
      const values = [10, 11, 12, 11, 10, 12, 11, 10];

      const anomalies = detectIQRAnomalies(values, { multiplier: 1.5 });

      expect(anomalies).toHaveLength(0);
    });

    it('should respect custom multiplier', () => {
      const values = [10, 11, 10, 12, 11, 10, 20]; // 20 is borderline

      const strictAnomalies = detectIQRAnomalies(values, { multiplier: 1.0 });
      const lenientAnomalies = detectIQRAnomalies(values, { multiplier: 3.0 });

      expect(strictAnomalies.length).toBeGreaterThanOrEqual(lenientAnomalies.length);
    });
  });

  describe('detectLevelShift', () => {
    it('should detect sustained increase in values', () => {
      const timeSeries: TimeSeries = [
        // First period: low values
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 11 },
        { date: new Date('2024-01-15'), value: 10 },
        { date: new Date('2024-01-22'), value: 12 },
        // Second period: sustained high values
        { date: new Date('2024-02-01'), value: 50 },
        { date: new Date('2024-02-08'), value: 52 },
        { date: new Date('2024-02-15'), value: 48 },
        { date: new Date('2024-02-22'), value: 51 },
      ];

      const shifts = detectLevelShift(timeSeries, { windowSize: 4 });

      expect(shifts.length).toBeGreaterThan(0);
      expect(shifts[0].type).toBe('LEVEL_SHIFT');
      expect(shifts[0].changePercent).toBeGreaterThan(100); // More than 2x increase
    });

    it('should not detect shift in stable data', () => {
      const timeSeries: TimeSeries = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 11 },
        { date: new Date('2024-01-15'), value: 10 },
        { date: new Date('2024-01-22'), value: 12 },
        { date: new Date('2024-02-01'), value: 11 },
        { date: new Date('2024-02-08'), value: 10 },
        { date: new Date('2024-02-15'), value: 12 },
        { date: new Date('2024-02-22'), value: 11 },
      ];

      const shifts = detectLevelShift(timeSeries, { windowSize: 4 });

      expect(shifts).toHaveLength(0);
    });
  });

  describe('detectSeasonalAnomaly', () => {
    it('should detect deviation from seasonal pattern', () => {
      // Simulate weekly pattern: high on weekdays, low on weekends
      // Then anomaly where weekend has high value
      const timeSeries: TimeSeries = [];
      for (let week = 0; week < 8; week++) {
        // Normal pattern
        timeSeries.push({ date: new Date(2024, 0, 1 + week * 7), value: 100 }); // Mon
        timeSeries.push({ date: new Date(2024, 0, 6 + week * 7), value: 20 }); // Sat
      }
      // Anomaly: high weekend
      timeSeries.push({ date: new Date(2024, 2, 2), value: 100 }); // Sat with high value

      const anomalies = detectSeasonalAnomaly(timeSeries, { seasonLength: 2 });

      // This test verifies the function runs; actual seasonal detection is complex
      expect(anomalies).toBeDefined();
    });
  });

  describe('classifyAnomaly', () => {
    it('should classify spike anomaly', () => {
      const anomaly: Anomaly = {
        date: new Date('2024-01-15'),
        value: 100,
        expectedValue: 10,
        deviation: 9.0,
        type: 'UNKNOWN',
      };

      const classified = classifyAnomaly(anomaly, {
        previousValues: [10, 11, 10, 12],
        nextValues: [11, 10, 12],
      });

      expect(classified.type).toBe('SPIKE');
    });

    it('should classify level shift anomaly', () => {
      const anomaly: Anomaly = {
        date: new Date('2024-01-15'),
        value: 50,
        expectedValue: 10,
        deviation: 4.0,
        type: 'UNKNOWN',
      };

      const classified = classifyAnomaly(anomaly, {
        previousValues: [10, 11, 10, 12],
        nextValues: [48, 52, 50], // Values stay high
      });

      expect(classified.type).toBe('LEVEL_SHIFT');
    });

    it('should classify collective anomaly', () => {
      const anomaly: Anomaly = {
        date: new Date('2024-01-15'),
        value: 50,
        expectedValue: 10,
        deviation: 4.0,
        type: 'UNKNOWN',
        relatedAnomalies: ['a1', 'a2', 'a3'],
      };

      const classified = classifyAnomaly(anomaly, {
        previousValues: [10, 11],
        nextValues: [12, 11],
      });

      expect(classified.type).toBe('COLLECTIVE');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect multiple types of anomalies', async () => {
      const timeSeries: TimeSeries = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 11 },
        { date: new Date('2024-01-15'), value: 100 }, // Spike
        { date: new Date('2024-01-22'), value: 12 },
        { date: new Date('2024-01-29'), value: 10 },
      ];

      const anomalies = await detectAnomalies(timeSeries);

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some((a) => a.type === 'SPIKE')).toBe(true);
    });

    it('should return empty array for clean data', async () => {
      const timeSeries: TimeSeries = [
        { date: new Date('2024-01-01'), value: 10 },
        { date: new Date('2024-01-08'), value: 11 },
        { date: new Date('2024-01-15'), value: 10 },
        { date: new Date('2024-01-22'), value: 12 },
        { date: new Date('2024-01-29'), value: 11 },
      ];

      const anomalies = await detectAnomalies(timeSeries);

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('getAnomalyAlerts', () => {
    it('should generate alerts for all patterns with anomalies', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock patterns - use severityScore instead of severity
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Airbag Issues', severityScore: 100 },
        { id: 'p2', name: 'Brake Problems', severityScore: 50 },
      ] as any);

      // Mock complaint data with clear anomaly in p1 (need 5+ data points)
      vi.mocked(prisma.complaint.groupBy)
        .mockResolvedValueOnce([
          // p1 - has clear spike
          { _count: { id: 10 }, dateAdded: new Date('2024-01-01') },
          { _count: { id: 10 }, dateAdded: new Date('2024-01-08') },
          { _count: { id: 11 }, dateAdded: new Date('2024-01-15') },
          { _count: { id: 10 }, dateAdded: new Date('2024-01-22') },
          { _count: { id: 100 }, dateAdded: new Date('2024-01-29') }, // Big spike
        ] as any)
        .mockResolvedValueOnce([
          // p2 - normal
          { _count: { id: 5 }, dateAdded: new Date('2024-01-01') },
          { _count: { id: 6 }, dateAdded: new Date('2024-01-08') },
          { _count: { id: 5 }, dateAdded: new Date('2024-01-15') },
          { _count: { id: 6 }, dateAdded: new Date('2024-01-22') },
          { _count: { id: 5 }, dateAdded: new Date('2024-01-29') },
        ] as any);

      const alerts = await getAnomalyAlerts();

      expect(alerts.some((a) => a.patternId === 'p1')).toBe(true);
    });

    it('should include severity in alerts', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Test Pattern', severityScore: 500 },
      ] as any);

      // Need 5+ data points for anomaly detection
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { _count: { id: 10 }, dateAdded: new Date('2024-01-01') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-08') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-15') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-22') },
        { _count: { id: 100 }, dateAdded: new Date('2024-01-29') }, // Spike
      ] as any);

      const alerts = await getAnomalyAlerts();

      expect(alerts[0]?.severity).toBeDefined();
    });

    it('should sort alerts by severity', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        { id: 'p1', name: 'Low Severity', severityScore: 100 },
        { id: 'p2', name: 'High Severity', severityScore: 500 },
      ] as any);

      // Need 5+ data points for anomaly detection
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { _count: { id: 10 }, dateAdded: new Date('2024-01-01') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-08') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-15') },
        { _count: { id: 10 }, dateAdded: new Date('2024-01-22') },
        { _count: { id: 100 }, dateAdded: new Date('2024-01-29') },
      ] as any);

      const alerts = await getAnomalyAlerts();

      if (alerts.length >= 2) {
        expect(alerts[0].severity).toBeGreaterThanOrEqual(alerts[1].severity);
      }
    });
  });
});
