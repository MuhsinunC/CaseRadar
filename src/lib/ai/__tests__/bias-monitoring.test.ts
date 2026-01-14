/**
 * AI Bias Monitoring Tests
 * P3-8 Implementation - TDD
 *
 * Tests for AI bias detection in clustering, generation consistency, and severity scoring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkClusteringBias,
  checkGenerationConsistency,
  checkSeverityScoringBias,
  generateBiasReport,
  clearBiasMonitoringStore,
  ClusteringBiasParams,
  ClusteringBiasResult,
  GenerationConsistencyParams,
  GenerationConsistencyResult,
  SeverityScoringBiasParams,
  SeverityScoringBiasResult,
  BiasReport,
} from '../bias-monitoring';

describe('AI Bias Monitoring', () => {
  beforeEach(() => {
    clearBiasMonitoringStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearBiasMonitoringStore();
  });

  describe('checkClusteringBias', () => {
    it('should check for statistical parity in clusters', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'run-123',
      });

      expect(result).toMatchObject({
        statisticalParity: expect.any(Number),
        biasDetected: expect.any(Boolean),
        affectedMakes: expect.any(Array),
      });
    });

    it('should detect over-representation of certain makes', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'biased-run',
      });

      if (result.biasDetected) {
        expect(result.affectedMakes.length).toBeGreaterThan(0);
      }
    });

    it('should return statistical parity between 0 and 1', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'run-456',
      });

      expect(result.statisticalParity).toBeGreaterThanOrEqual(0);
      expect(result.statisticalParity).toBeLessThanOrEqual(1);
    });

    it('should handle missing clustering run', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'non-existent-run',
      });

      expect(result).toBeDefined();
      expect(result.biasDetected).toBe(false);
    });

    it('should include cluster distribution in result', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'run-789',
      });

      expect(result.clusterDistribution).toBeDefined();
    });
  });

  describe('checkGenerationConsistency', () => {
    const sampleInput = {
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      complaint: 'Engine stalls intermittently',
    };

    it('should check same input produces similar outputs', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 5,
      });

      expect(result).toMatchObject({
        similarity: expect.any(Number),
        consistent: expect.any(Boolean),
      });
    });

    it('should flag inconsistent generations', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 5,
        threshold: 0.95,
      });

      expect(result.consistent).toBe(result.similarity >= 0.95);
    });

    it('should return similarity between 0 and 1', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 3,
      });

      expect(result.similarity).toBeGreaterThanOrEqual(0);
      expect(result.similarity).toBeLessThanOrEqual(1);
    });

    it('should use default threshold of 0.8', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 3,
      });

      // Default threshold is 0.8
      if (result.similarity >= 0.8) {
        expect(result.consistent).toBe(true);
      } else {
        expect(result.consistent).toBe(false);
      }
    });

    it('should include outputs in result', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 3,
      });

      expect(result.outputs).toBeDefined();
      expect(result.outputs.length).toBe(3);
    });

    it('should handle single iteration', async () => {
      const result = await checkGenerationConsistency({
        input: sampleInput,
        iterations: 1,
      });

      expect(result.similarity).toBe(1);
      expect(result.consistent).toBe(true);
    });
  });

  describe('checkSeverityScoringBias', () => {
    it('should check severity scores are calibrated', async () => {
      const result = await checkSeverityScoringBias({
        period: 'month',
      });

      expect(result).toMatchObject({
        meanByMake: expect.any(Object),
        standardDeviation: expect.any(Number),
        calibrated: expect.any(Boolean),
      });
    });

    it('should detect if certain makes consistently get higher scores', async () => {
      const result = await checkSeverityScoringBias({
        period: 'month',
      });

      const means = Object.values(result.meanByMake) as number[];
      if (means.length > 0) {
        const variance = calculateVariance(means);

        // High variance might indicate bias
        if (variance > 2) {
          expect(result.calibrated).toBe(false);
        }
      }
    });

    it('should return standard deviation', async () => {
      const result = await checkSeverityScoringBias({
        period: 'week',
      });

      expect(result.standardDeviation).toBeGreaterThanOrEqual(0);
    });

    it('should support different periods', async () => {
      const weekResult = await checkSeverityScoringBias({ period: 'week' });
      const monthResult = await checkSeverityScoringBias({ period: 'month' });
      const yearResult = await checkSeverityScoringBias({ period: 'year' });

      expect(weekResult).toBeDefined();
      expect(monthResult).toBeDefined();
      expect(yearResult).toBeDefined();
    });

    it('should include sample size in result', async () => {
      const result = await checkSeverityScoringBias({
        period: 'month',
      });

      expect(result.sampleSize).toBeDefined();
      expect(result.sampleSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateBiasReport', () => {
    it('should generate comprehensive bias report', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-123',
        period: 'month',
      });

      expect(report).toMatchObject({
        clustering: expect.any(Object),
        generation: expect.any(Object),
        severity: expect.any(Object),
        overallScore: expect.any(Number),
        recommendations: expect.any(Array),
      });
    });

    it('should include organization ID in report', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-456',
        period: 'month',
      });

      expect(report.organizationId).toBe('org-456');
    });

    it('should calculate overall score between 0 and 100', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-789',
        period: 'month',
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('should include timestamp in report', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-test',
        period: 'month',
      });

      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should provide recommendations when bias detected', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-biased',
        period: 'month',
      });

      if (report.overallScore < 80) {
        expect(report.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should include period in report', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-period',
        period: 'week',
      });

      expect(report.period).toBe('week');
    });
  });

  describe('BiasReport type', () => {
    it('should have required properties', async () => {
      const report = await generateBiasReport({
        organizationId: 'org-type-test',
        period: 'month',
      });

      expect(report).toHaveProperty('organizationId');
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('clustering');
      expect(report).toHaveProperty('generation');
      expect(report).toHaveProperty('severity');
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('generatedAt');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty clustering data', async () => {
      const result = await checkClusteringBias({
        clusteringRunId: 'empty-run',
      });

      expect(result).toBeDefined();
    });

    it('should handle no severity scores', async () => {
      const result = await checkSeverityScoringBias({
        period: 'month',
        organizationId: 'empty-org',
      });

      expect(result).toBeDefined();
    });

    it('should handle concurrent bias checks', async () => {
      const results = await Promise.all([
        checkClusteringBias({ clusteringRunId: 'run-1' }),
        checkClusteringBias({ clusteringRunId: 'run-2' }),
        checkSeverityScoringBias({ period: 'month' }),
      ]);

      expect(results.length).toBe(3);
      results.forEach((result) => expect(result).toBeDefined());
    });
  });
});

/**
 * Helper function to calculate variance
 */
function calculateVariance(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const squaredDiffs = numbers.map((n) => Math.pow(n - mean, 2));
  return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
}
