/**
 * Embedding Quality Assurance Tests
 * P2-6 Implementation - TDD
 *
 * Tests for validating embedding quality and consistency.
 */

import { describe, it, expect } from 'vitest';
import {
  validateEmbedding,
  checkEmbeddingDimensions,
  checkEmbeddingNorm,
  EmbeddingQAError,
  EXPECTED_DIMENSIONS,
} from '../embedding-qa';

describe('Embedding Quality Assurance', () => {
  describe('EXPECTED_DIMENSIONS', () => {
    it('should export expected dimensions constant', () => {
      expect(EXPECTED_DIMENSIONS).toBe(1536);
    });
  });

  describe('checkEmbeddingDimensions', () => {
    it('should pass for correct dimensions (1536)', () => {
      const embedding = new Array(1536).fill(0.1);
      expect(() => checkEmbeddingDimensions(embedding)).not.toThrow();
    });

    it('should fail for wrong dimensions', () => {
      const embedding = new Array(1000).fill(0.1);
      expect(() => checkEmbeddingDimensions(embedding)).toThrow(
        EmbeddingQAError
      );
    });

    it('should return dimension count', () => {
      const embedding = new Array(1536).fill(0.1);
      const result = checkEmbeddingDimensions(embedding);
      expect(result.dimensions).toBe(1536);
    });

    it('should include expected dimensions in result', () => {
      const embedding = new Array(1536).fill(0.1);
      const result = checkEmbeddingDimensions(embedding);
      expect(result.expected).toBe(1536);
    });

    it('should handle empty array', () => {
      const embedding: number[] = [];
      expect(() => checkEmbeddingDimensions(embedding)).toThrow(
        EmbeddingQAError
      );
    });
  });

  describe('checkEmbeddingNorm', () => {
    it('should pass for normalized embeddings (L2 norm ≈ 1)', () => {
      // Create a normalized vector
      const magnitude = Math.sqrt(1536);
      const embedding = new Array(1536).fill(1 / magnitude);

      const result = checkEmbeddingNorm(embedding);
      expect(result.isNormalized).toBe(true);
    });

    it('should warn for significantly non-normalized embeddings', () => {
      const embedding = new Array(1536).fill(1); // L2 norm ≈ 39

      const result = checkEmbeddingNorm(embedding);
      expect(result.isNormalized).toBe(false);
      expect(result.l2Norm).toBeGreaterThan(1.1);
    });

    it('should return L2 norm value', () => {
      const embedding = new Array(1536).fill(0.1);
      const result = checkEmbeddingNorm(embedding);

      // L2 norm = sqrt(sum of squares) = sqrt(1536 * 0.01) = sqrt(15.36)
      expect(result.l2Norm).toBeCloseTo(Math.sqrt(1536 * 0.01), 2);
    });

    it('should accept tolerance for normalized check', () => {
      // Create slightly off normalized vector
      const magnitude = Math.sqrt(1536);
      const embedding = new Array(1536).fill(1.05 / magnitude);

      const result = checkEmbeddingNorm(embedding, { tolerance: 0.1 });
      expect(result.isNormalized).toBe(true);
    });

    it('should handle zero vector', () => {
      const embedding = new Array(1536).fill(0);
      const result = checkEmbeddingNorm(embedding);

      expect(result.l2Norm).toBe(0);
      expect(result.isNormalized).toBe(false);
    });
  });

  describe('validateEmbedding', () => {
    it('should pass all checks for valid embedding', () => {
      const magnitude = Math.sqrt(1536);
      const embedding = new Array(1536).fill(1 / magnitude);

      const result = validateEmbedding(embedding);

      expect(result.valid).toBe(true);
      expect(result.checks.dimensions).toBe('pass');
      expect(result.checks.norm).toBe('pass');
    });

    it('should aggregate all check results', () => {
      const embedding = new Array(1000).fill(1); // Wrong dimensions AND not normalized

      const result = validateEmbedding(embedding);

      expect(result.valid).toBe(false);
      expect(result.checks.dimensions).toBe('fail');
      expect(result.checks.norm).toBe('warn');
    });

    it('should detect zero vectors', () => {
      const embedding = new Array(1536).fill(0);

      const result = validateEmbedding(embedding);

      expect(result.checks.zeroVector).toBe('fail');
    });

    it('should detect NaN values', () => {
      const embedding = new Array(1536).fill(0.1);
      embedding[500] = NaN;

      const result = validateEmbedding(embedding);

      expect(result.checks.hasNaN).toBe('fail');
    });

    it('should detect Infinity values', () => {
      const embedding = new Array(1536).fill(0.1);
      embedding[100] = Infinity;

      const result = validateEmbedding(embedding);

      expect(result.checks.hasInfinity).toBe('fail');
    });

    it('should pass with valid normalized vector', () => {
      // Create a properly normalized vector
      const n = 1536;
      const value = 1 / Math.sqrt(n);
      const embedding = new Array(n).fill(value);

      const result = validateEmbedding(embedding);

      expect(result.valid).toBe(true);
      expect(result.checks.dimensions).toBe('pass');
      expect(result.checks.norm).toBe('pass');
      expect(result.checks.zeroVector).toBe('pass');
      expect(result.checks.hasNaN).toBe('pass');
    });

    it('should include metadata in result', () => {
      const embedding = new Array(1536).fill(0.1);
      const result = validateEmbedding(embedding);

      expect(result.metadata.dimensions).toBe(1536);
      expect(result.metadata.l2Norm).toBeDefined();
    });
  });

  describe('EmbeddingQAError', () => {
    it('should have correct error name', () => {
      const error = new EmbeddingQAError('Test message');
      expect(error.name).toBe('EmbeddingQAError');
    });

    it('should include check type', () => {
      const error = new EmbeddingQAError('Test', { checkType: 'dimensions' });
      expect(error.checkType).toBe('dimensions');
    });

    it('should be instance of Error', () => {
      const error = new EmbeddingQAError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small values', () => {
      const embedding = new Array(1536).fill(1e-10);
      const result = validateEmbedding(embedding);

      expect(result.checks.dimensions).toBe('pass');
    });

    it('should handle negative values', () => {
      const n = 1536;
      const value = -1 / Math.sqrt(n);
      const embedding = new Array(n).fill(value);

      const result = validateEmbedding(embedding);

      expect(result.checks.dimensions).toBe('pass');
      expect(result.checks.norm).toBe('pass');
    });
  });
});
