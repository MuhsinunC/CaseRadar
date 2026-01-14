/**
 * Embedding Drift Detection Tests
 * P2-7 Implementation - TDD
 *
 * Tests for detecting changes in embedding model behavior over time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeBaselineEmbedding,
  checkDrift,
  DriftAlert,
  DRIFT_THRESHOLD,
  getStoredBaseline,
  storeBaseline,
  clearStoredBaseline,
  REFERENCE_TEXT,
} from '../drift-detection';

describe('Embedding Drift Detection', () => {
  beforeEach(() => {
    clearStoredBaseline();
    vi.clearAllMocks();
  });

  describe('DRIFT_THRESHOLD', () => {
    it('should export drift threshold constant', () => {
      expect(DRIFT_THRESHOLD).toBe(0.95);
    });
  });

  describe('REFERENCE_TEXT', () => {
    it('should export reference text constant', () => {
      expect(REFERENCE_TEXT).toBeDefined();
      expect(typeof REFERENCE_TEXT).toBe('string');
      expect(REFERENCE_TEXT.length).toBeGreaterThan(0);
    });
  });

  describe('computeBaselineEmbedding', () => {
    it('should compute embedding for reference text', async () => {
      const baseline = await computeBaselineEmbedding();

      expect(baseline.embedding).toHaveLength(1536);
      expect(baseline.referenceText).toBeDefined();
      expect(baseline.computedAt).toBeInstanceOf(Date);
    });

    it('should use consistent reference text', async () => {
      const baseline1 = await computeBaselineEmbedding();
      const baseline2 = await computeBaselineEmbedding();

      expect(baseline1.referenceText).toBe(baseline2.referenceText);
    });

    it('should return normalized embedding', async () => {
      const baseline = await computeBaselineEmbedding();

      // Check L2 norm is approximately 1
      const sumOfSquares = baseline.embedding.reduce((sum, val) => sum + val * val, 0);
      const l2Norm = Math.sqrt(sumOfSquares);

      expect(l2Norm).toBeCloseTo(1, 1);
    });
  });

  describe('checkDrift', () => {
    it('should return no drift for identical embeddings', async () => {
      const embedding = new Array(1536).fill(1 / Math.sqrt(1536));

      const result = await checkDrift(embedding, embedding);

      expect(result.driftDetected).toBe(false);
      expect(result.cosineSimilarity).toBeCloseTo(1, 4);
    });

    it('should detect drift when similarity below threshold', async () => {
      const baseline = new Array(1536).fill(0.1);
      const drifted = new Array(1536).fill(-0.1); // Very different

      const result = await checkDrift(baseline, drifted);

      expect(result.driftDetected).toBe(true);
      expect(result.cosineSimilarity).toBeLessThan(DRIFT_THRESHOLD);
    });

    it('should return drift magnitude', async () => {
      const baseline = new Array(1536).fill(0.1);
      const current = new Array(1536).fill(0.08);

      const result = await checkDrift(baseline, current);

      expect(result.driftMagnitude).toBeDefined();
      expect(typeof result.driftMagnitude).toBe('number');
    });

    it('should calculate correct cosine similarity', async () => {
      // Two identical vectors should have similarity 1
      const vec = new Array(1536).fill(0.1);
      const result = await checkDrift(vec, vec);
      expect(result.cosineSimilarity).toBeCloseTo(1, 4);
    });

    it('should handle orthogonal vectors', async () => {
      // Create two orthogonal vectors
      const vec1 = new Array(1536).fill(0);
      const vec2 = new Array(1536).fill(0);
      vec1[0] = 1;
      vec2[1] = 1;

      const result = await checkDrift(vec1, vec2);
      expect(result.cosineSimilarity).toBeCloseTo(0, 4);
      expect(result.driftDetected).toBe(true);
    });

    it('should not trigger alert by default', async () => {
      const alertSpy = vi.spyOn(DriftAlert, 'create');

      await checkDrift(
        new Array(1536).fill(0.1),
        new Array(1536).fill(-0.1)
      );

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('DriftAlert', () => {
    it('should create alert when drift detected and alertOnDrift is true', async () => {
      const alertSpy = vi.spyOn(DriftAlert, 'create');

      await checkDrift(
        new Array(1536).fill(0.1),
        new Array(1536).fill(-0.1),
        { alertOnDrift: true }
      );

      expect(alertSpy).toHaveBeenCalled();
    });

    it('should include drift details in alert', async () => {
      const alertSpy = vi.spyOn(DriftAlert, 'create');

      await checkDrift(
        new Array(1536).fill(0.1),
        new Array(1536).fill(-0.1),
        { alertOnDrift: true }
      );

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cosineSimilarity: expect.any(Number),
          driftMagnitude: expect.any(Number),
          threshold: DRIFT_THRESHOLD,
        })
      );
    });

    it('should not create alert when no drift detected', async () => {
      const alertSpy = vi.spyOn(DriftAlert, 'create');
      const vec = new Array(1536).fill(0.1);

      await checkDrift(vec, vec, { alertOnDrift: true });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('Baseline Storage', () => {
    it('should store baseline for later comparison', async () => {
      const baseline = await computeBaselineEmbedding();
      await storeBaseline(baseline);

      const stored = await getStoredBaseline();
      expect(stored).not.toBeNull();
      expect(stored?.embedding).toEqual(baseline.embedding);
    });

    it('should return null when no baseline stored', async () => {
      const stored = await getStoredBaseline();
      expect(stored).toBeNull();
    });

    it('should clear stored baseline', async () => {
      const baseline = await computeBaselineEmbedding();
      await storeBaseline(baseline);

      clearStoredBaseline();

      const stored = await getStoredBaseline();
      expect(stored).toBeNull();
    });
  });

  describe('Scheduled Drift Check', () => {
    it('should compare against stored baseline', async () => {
      const baseline = await computeBaselineEmbedding();
      await storeBaseline(baseline);

      const storedBaseline = await getStoredBaseline();
      const currentEmbedding = await computeBaselineEmbedding();

      const result = await checkDrift(
        storedBaseline!.embedding,
        currentEmbedding.embedding
      );

      expect(result).toBeDefined();
      expect(result.driftDetected).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero vectors gracefully', async () => {
      const zero = new Array(1536).fill(0);
      const nonZero = new Array(1536).fill(0.1);

      const result = await checkDrift(zero, nonZero);

      // Cosine similarity with zero vector is undefined, but we handle it
      expect(result.driftDetected).toBe(true);
    });

    it('should handle negative values', async () => {
      const vec1 = new Array(1536).fill(0.1);
      const vec2 = new Array(1536).fill(-0.1);

      const result = await checkDrift(vec1, vec2);

      expect(result.cosineSimilarity).toBeLessThan(0);
      expect(result.driftDetected).toBe(true);
    });
  });
});
