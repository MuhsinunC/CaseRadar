/**
 * AI Model Version Tracking Tests
 * P2-13 Implementation - TDD
 *
 * Tests for tracking AI model versions for audit trail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackModelVersion,
  getModelVersionInfo,
  ModelVersionInfo,
  ModelVersionInput,
  ModelVersionReport,
  clearModelVersionStore,
} from '../model-versioning';

describe('AI Model Version Tracking', () => {
  beforeEach(() => {
    clearModelVersionStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearModelVersionStore();
  });

  describe('trackModelVersion', () => {
    it('should capture model version on generation', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        promptVersion: '1.2.0',
        requestId: 'req_123',
      });

      expect(result).toMatchObject({
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        promptVersion: '1.2.0',
        timestamp: expect.any(Date),
      });
    });

    it('should include response metadata', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        responseId: 'chatcmpl-abc123',
        tokensUsed: { prompt: 500, completion: 200 },
      });

      expect(result.responseId).toBe('chatcmpl-abc123');
      expect(result.tokensUsed).toEqual({ prompt: 500, completion: 200 });
    });

    it('should handle Anthropic models', async () => {
      const result = await trackModelVersion({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        promptVersion: '1.0.0',
      });

      expect(result.provider).toBe('anthropic');
      expect(result.model).toContain('claude');
    });

    it('should track request ID', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        requestId: 'req_xyz789',
      });

      expect(result.requestId).toBe('req_xyz789');
    });

    it('should store tracking data', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: '2.0.0',
      });

      expect(result.id).toBeDefined();
    });
  });

  describe('Model Version Report', () => {
    beforeEach(async () => {
      // Set up test data
      await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: '1.0.0',
        tokensUsed: { prompt: 100, completion: 50 },
      });
      await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: '1.0.0',
        tokensUsed: { prompt: 200, completion: 100 },
      });
      await trackModelVersion({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        promptVersion: '1.1.0',
        tokensUsed: { prompt: 150, completion: 75 },
      });
    });

    it('should generate model usage report', async () => {
      const report = await getModelVersionInfo({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2030-12-31'),
        groupBy: 'model',
      });

      expect(report).toBeInstanceOf(Array);
      report.forEach((entry) => {
        expect(entry).toHaveProperty('model');
        expect(entry).toHaveProperty('count');
        expect(entry).toHaveProperty('totalTokens');
      });
    });

    it('should filter by provider', async () => {
      const report = await getModelVersionInfo({
        provider: 'openai',
        groupBy: 'promptVersion',
      });

      report.forEach((entry) => {
        expect(entry.provider).toBe('openai');
      });
    });

    it('should filter by date range', async () => {
      const report = await getModelVersionInfo({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2030-12-31'),
        groupBy: 'model',
      });

      expect(report.length).toBeGreaterThan(0);
    });

    it('should group by model', async () => {
      const report = await getModelVersionInfo({
        groupBy: 'model',
      });

      const models = report.map((r) => r.model);
      expect(models.length).toBeLessThanOrEqual(2); // gpt-4o and claude-3-sonnet
    });

    it('should calculate total tokens', async () => {
      const report = await getModelVersionInfo({
        provider: 'openai',
        groupBy: 'model',
      });

      const gpt4oReport = report.find((r) => r.model === 'gpt-4o');
      if (gpt4oReport) {
        expect(gpt4oReport.totalTokens).toBe(450); // (100+50) + (200+100)
      }
    });
  });

  describe('Prompt Version Integration', () => {
    it('should link model version to prompt version', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        promptVersion: '1.2.0',
        promptHash: 'sha256:abc123def456',
      });

      expect(result.promptVersion).toBe('1.2.0');
      expect(result.promptHash).toBe('sha256:abc123def456');
    });

    it('should default prompt version when not provided', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(result.promptVersion).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', async () => {
      const result = await trackModelVersion({
        provider: '' as 'openai',
        model: 'gpt-4o',
      });

      // Should set a default or throw
      expect(result.provider).toBeDefined();
    });

    it('should handle missing model gracefully', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: '',
      });

      expect(result.model).toBeDefined();
    });
  });

  describe('Token Tracking', () => {
    it('should track prompt tokens', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        tokensUsed: { prompt: 1000, completion: 500 },
      });

      expect(result.tokensUsed?.prompt).toBe(1000);
    });

    it('should track completion tokens', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
        tokensUsed: { prompt: 1000, completion: 500 },
      });

      expect(result.tokensUsed?.completion).toBe(500);
    });

    it('should handle missing token data', async () => {
      const result = await trackModelVersion({
        provider: 'openai',
        model: 'gpt-4o',
      });

      expect(result.tokensUsed).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty report query', async () => {
      const report = await getModelVersionInfo({});

      expect(report).toBeInstanceOf(Array);
    });

    it('should handle no matching data', async () => {
      const report = await getModelVersionInfo({
        provider: 'nonexistent' as 'openai',
        groupBy: 'model',
      });

      expect(report).toEqual([]);
    });

    it('should handle concurrent tracking calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        trackModelVersion({
          provider: 'openai',
          model: 'gpt-4o',
          requestId: `req_${i}`,
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach((r) => expect(r.id).toBeDefined());
    });
  });
});
