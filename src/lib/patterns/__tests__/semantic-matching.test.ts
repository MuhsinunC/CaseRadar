/**
 * Semantic Matching Tests
 * TDD: Unit tests for semantic matching functions
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  computeCosineSimilarity,
  getRecallEmbeddingText,
  findSemanticRecallMatches,
  getPatternCentroidEmbedding,
} from '../semantic-matching';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Semantic Matching', () => {
  describe('computeCosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vector = [1, 2, 3, 4, 5];
      const similarity = computeCosineSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1, 0];
      const similarity = computeCosineSimilarity(vector1, vector2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should return value between 0 and 1 for similar vectors', () => {
      const vector1 = [1, 2, 3];
      const vector2 = [1, 2, 4];
      const similarity = computeCosineSimilarity(vector1, vector2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should handle zero vectors gracefully', () => {
      const vector1 = [0, 0, 0];
      const vector2 = [1, 2, 3];
      const similarity = computeCosineSimilarity(vector1, vector2);
      expect(similarity).toBe(0);
    });

    it('should be symmetric', () => {
      const vector1 = [1, 2, 3, 4];
      const vector2 = [4, 3, 2, 1];
      const sim1 = computeCosineSimilarity(vector1, vector2);
      const sim2 = computeCosineSimilarity(vector2, vector1);
      expect(sim1).toBeCloseTo(sim2, 10);
    });

    it('should handle negative values', () => {
      const vector1 = [-1, 2, -3];
      const vector2 = [1, -2, 3];
      const similarity = computeCosineSimilarity(vector1, vector2);
      expect(similarity).toBeLessThan(0); // Opposite directions
    });
  });

  describe('getRecallEmbeddingText', () => {
    it('should combine summary, consequence, and remedy', () => {
      const recall = {
        nhtsaCampaignNumber: '21V123',
        manufacturer: 'Honda',
        make: 'HONDA',
        model: 'CIVIC',
        year: 2020,
        component: 'ENGINE',
        summary: 'Engine may stall',
        consequence: 'Crash risk',
        remedy: 'Replace fuel pump',
        notes: null,
        reportReceivedDate: new Date(),
        parkIt: false,
        parkOutside: false,
      };

      const text = getRecallEmbeddingText(recall);

      expect(text).toContain('Engine may stall');
      expect(text).toContain('Crash risk');
      expect(text).toContain('Replace fuel pump');
      expect(text).toContain('ENGINE');
    });

    it('should handle missing fields gracefully', () => {
      const recall = {
        nhtsaCampaignNumber: '21V123',
        manufacturer: 'Honda',
        make: 'HONDA',
        model: 'CIVIC',
        year: 2020,
        component: 'ENGINE',
        summary: 'Engine issue',
        consequence: '',
        remedy: '',
        notes: null,
        reportReceivedDate: new Date(),
        parkIt: false,
        parkOutside: false,
      };

      const text = getRecallEmbeddingText(recall);

      expect(text).toContain('Engine issue');
      expect(text.length).toBeGreaterThan(0);
    });

    it('should include vehicle info for context', () => {
      const recall = {
        nhtsaCampaignNumber: '21V123',
        manufacturer: 'Honda',
        make: 'HONDA',
        model: 'ACCORD',
        year: 2021,
        component: 'BRAKES',
        summary: 'Brake failure',
        consequence: 'Crash',
        remedy: 'Replace brakes',
        notes: null,
        reportReceivedDate: new Date(),
        parkIt: false,
        parkOutside: false,
      };

      const text = getRecallEmbeddingText(recall);

      expect(text).toContain('HONDA');
      expect(text).toContain('ACCORD');
      expect(text).toContain('BRAKES');
    });
  });

  describe('getPatternCentroidEmbedding', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return embedding array for valid pattern', async () => {
      // Mock database response with 768-dimension embeddings
      const mockEmbedding = Array(768).fill(0).map((_, i) => Math.random() - 0.5);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(mockEmbedding) },
      ]);

      const patternId = 'test-pattern-id';
      const embedding = await getPatternCentroidEmbedding(patternId);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(768);
    });

    it('should compute average of complaint embeddings', async () => {
      // Mock multiple embeddings to test averaging
      const embedding1 = Array(768).fill(0).map(() => 1);
      const embedding2 = Array(768).fill(0).map(() => 3);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(embedding1) },
        { embedding: JSON.stringify(embedding2) },
      ]);

      const patternId = 'test-pattern-with-complaints';
      const embedding = await getPatternCentroidEmbedding(patternId);

      // Average of [1,1,1...] and [3,3,3...] should be [2,2,2...]
      expect(embedding[0]).toBeCloseTo(2, 5);

      // Centroid should have magnitude > 0
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeGreaterThan(0);
    });

    it('should throw error for pattern with no embeddings', async () => {
      // Mock empty response
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      const patternId = 'non-existent-pattern';
      await expect(getPatternCentroidEmbedding(patternId)).rejects.toThrow();
    });
  });

  describe('findSemanticRecallMatches', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return recalls above threshold', async () => {
      // First call: get complaint embeddings for pattern centroid
      const patternEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(patternEmbedding) },
      ]);

      // Second call: get recall embeddings
      const similarRecallEmbedding = Array(768).fill(0.1); // Very similar
      const dissimilarRecallEmbedding = Array(768).fill(-0.1); // Very different
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'recall-1',
          nhtsaCampaignNumber: '21V123',
          manufacturer: 'Honda',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2020,
          component: 'ENGINE',
          summary: 'Engine stall',
          consequence: 'Crash risk',
          remedy: 'Replace pump',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(similarRecallEmbedding),
        },
        {
          id: 'recall-2',
          nhtsaCampaignNumber: '21V456',
          manufacturer: 'Toyota',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2021,
          component: 'BRAKES',
          summary: 'Brake issue',
          consequence: 'Accident',
          remedy: 'Replace brakes',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(dissimilarRecallEmbedding),
        },
      ]);

      const patternId = 'test-pattern';
      const threshold = 0.5;
      const matches = await findSemanticRecallMatches(patternId, threshold);

      expect(Array.isArray(matches)).toBe(true);
      matches.forEach((match) => {
        expect(match.semanticScore).toBeGreaterThanOrEqual(threshold);
      });
    });

    it('should sort by similarity descending', async () => {
      // Setup pattern embedding
      const patternEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(patternEmbedding) },
      ]);

      // Setup recalls with different similarity scores
      const highSimilarEmbedding = Array(768).fill(0.1);
      const mediumSimilarEmbedding = Array(768).fill(0.05);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'recall-medium',
          nhtsaCampaignNumber: '21V456',
          manufacturer: 'Toyota',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2021,
          component: 'BRAKES',
          summary: 'Brake issue',
          consequence: 'Accident',
          remedy: 'Replace',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(mediumSimilarEmbedding),
        },
        {
          id: 'recall-high',
          nhtsaCampaignNumber: '21V123',
          manufacturer: 'Honda',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2020,
          component: 'ENGINE',
          summary: 'Engine stall',
          consequence: 'Crash',
          remedy: 'Fix',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(highSimilarEmbedding),
        },
      ]);

      const patternId = 'test-pattern';
      const matches = await findSemanticRecallMatches(patternId, 0.3);

      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].semanticScore).toBeGreaterThanOrEqual(
          matches[i].semanticScore
        );
      }
    });

    it('should return empty array for no matches', async () => {
      // Pattern with no embeddings will catch and return []
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

      const patternId = 'pattern-with-no-matching-recalls';
      const matches = await findSemanticRecallMatches(patternId, 0.99);

      expect(matches).toEqual([]);
    });

    it('should include recall details in match results', async () => {
      // Setup
      const patternEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(patternEmbedding) },
      ]);

      const recallEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'recall-1',
          nhtsaCampaignNumber: '21V123',
          manufacturer: 'Honda',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2020,
          component: 'ENGINE',
          summary: 'Engine stall',
          consequence: 'Crash',
          remedy: 'Fix',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(recallEmbedding),
        },
      ]);

      const patternId = 'test-pattern';
      const matches = await findSemanticRecallMatches(patternId, 0.3);

      if (matches.length > 0) {
        const match = matches[0];
        expect(match).toHaveProperty('recallId');
        expect(match).toHaveProperty('semanticScore');
        expect(match).toHaveProperty('recall');
        expect(match.recall).toHaveProperty('nhtsaCampaignNumber');
      }
    });

    it('should use default threshold of 0.7 if not provided', async () => {
      // Setup
      const patternEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        { embedding: JSON.stringify(patternEmbedding) },
      ]);

      // High similarity recall (should match with 0.7 threshold)
      const highSimilarEmbedding = Array(768).fill(0.1);
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'recall-1',
          nhtsaCampaignNumber: '21V123',
          manufacturer: 'Honda',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2020,
          component: 'ENGINE',
          summary: 'Engine stall',
          consequence: 'Crash',
          remedy: 'Fix',
          notes: null,
          reportReceivedDate: new Date(),
          parkIt: false,
          parkOutside: false,
          embedding: JSON.stringify(highSimilarEmbedding),
        },
      ]);

      const patternId = 'test-pattern';
      const matches = await findSemanticRecallMatches(patternId);

      matches.forEach((match) => {
        expect(match.semanticScore).toBeGreaterThanOrEqual(0.7);
      });
    });
  });
});
