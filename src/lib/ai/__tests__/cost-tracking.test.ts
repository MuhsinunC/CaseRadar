/**
 * AI Cost Tracking Tests
 * P2-8 Implementation - TDD
 *
 * Tests for tracking and monitoring AI API costs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  trackAICost,
  getAICostSummary,
  checkBudgetThreshold,
  AIBudgetAlert,
  MODEL_PRICING,
  clearCostRecords,
  setMockUsage,
  clearMockUsage,
} from '../cost-tracking';

describe('AI Cost Tracking', () => {
  beforeEach(() => {
    clearCostRecords();
    clearMockUsage();
    vi.clearAllMocks();
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for text-embedding-3-small', () => {
      expect(MODEL_PRICING['text-embedding-3-small']).toBeDefined();
      expect(MODEL_PRICING['text-embedding-3-small'].inputPer1M).toBe(0.02);
    });

    it('should have pricing for claude-3-opus-20240229', () => {
      expect(MODEL_PRICING['claude-3-opus-20240229']).toBeDefined();
      expect(MODEL_PRICING['claude-3-opus-20240229'].inputPer1M).toBe(15.0);
      expect(MODEL_PRICING['claude-3-opus-20240229'].outputPer1M).toBe(75.0);
    });

    it('should have pricing for claude-3-haiku-20240307', () => {
      expect(MODEL_PRICING['claude-3-haiku-20240307']).toBeDefined();
      expect(MODEL_PRICING['claude-3-haiku-20240307'].inputPer1M).toBe(0.25);
      expect(MODEL_PRICING['claude-3-haiku-20240307'].outputPer1M).toBe(1.25);
    });
  });

  describe('trackAICost', () => {
    it('should record cost for embedding generation', async () => {
      const result = await trackAICost({
        operation: 'EMBEDDING',
        model: 'text-embedding-3-small',
        inputTokens: 1000,
        outputTokens: 0,
        organizationId: 'org-123',
      });

      expect(result.costUSD).toBeDefined();
      expect(result.costUSD).toBeGreaterThan(0);
    });

    it('should record cost for completion', async () => {
      const result = await trackAICost({
        operation: 'COMPLETION',
        model: 'claude-3-opus-20240229',
        inputTokens: 2000,
        outputTokens: 500,
        organizationId: 'org-123',
      });

      expect(result.costUSD).toBeDefined();
      // Claude Opus is expensive
      expect(result.costUSD).toBeGreaterThan(0.01);
    });

    it('should calculate correct cost based on model pricing', async () => {
      const result = await trackAICost({
        operation: 'COMPLETION',
        model: 'claude-3-haiku-20240307',
        inputTokens: 1000,
        outputTokens: 1000,
        organizationId: 'org-123',
      });

      // Haiku: $0.25/1M input, $1.25/1M output
      const expectedCost = 1000 * 0.00000025 + 1000 * 0.00000125;
      expect(result.costUSD).toBeCloseTo(expectedCost, 6);
    });

    it('should store cost record', async () => {
      await trackAICost({
        operation: 'EMBEDDING',
        model: 'text-embedding-3-small',
        inputTokens: 1000,
        outputTokens: 0,
        organizationId: 'org-123',
      });

      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'day',
      });

      expect(summary.requestCount).toBe(1);
    });

    it('should include timestamp in result', async () => {
      const result = await trackAICost({
        operation: 'EMBEDDING',
        model: 'text-embedding-3-small',
        inputTokens: 1000,
        outputTokens: 0,
        organizationId: 'org-123',
      });

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle unknown model with default pricing', async () => {
      const result = await trackAICost({
        operation: 'COMPLETION',
        model: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 500,
        organizationId: 'org-123',
      });

      expect(result.costUSD).toBeDefined();
      expect(result.costUSD).toBeGreaterThan(0);
    });
  });

  describe('getAICostSummary', () => {
    beforeEach(async () => {
      // Add some test costs
      await trackAICost({
        operation: 'EMBEDDING',
        model: 'text-embedding-3-small',
        inputTokens: 10000,
        outputTokens: 0,
        organizationId: 'org-123',
      });

      await trackAICost({
        operation: 'COMPLETION',
        model: 'claude-3-opus-20240229',
        inputTokens: 2000,
        outputTokens: 500,
        organizationId: 'org-123',
      });
    });

    it('should return daily cost summary', async () => {
      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'day',
      });

      expect(summary).toMatchObject({
        totalCostUSD: expect.any(Number),
        embeddingCostUSD: expect.any(Number),
        completionCostUSD: expect.any(Number),
        requestCount: expect.any(Number),
      });
    });

    it('should return monthly cost summary', async () => {
      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'month',
      });

      expect(summary.period).toBe('month');
    });

    it('should break down by model', async () => {
      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'month',
        groupBy: 'model',
      });

      expect(summary.byModel).toBeDefined();
      expect(summary.byModel!['claude-3-opus-20240229']).toBeDefined();
    });

    it('should calculate correct totals', async () => {
      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'day',
      });

      expect(summary.totalCostUSD).toBe(
        summary.embeddingCostUSD + summary.completionCostUSD
      );
    });

    it('should filter by organization', async () => {
      await trackAICost({
        operation: 'COMPLETION',
        model: 'claude-3-haiku-20240307',
        inputTokens: 1000,
        outputTokens: 500,
        organizationId: 'org-456',
      });

      const summary = await getAICostSummary({
        organizationId: 'org-123',
        period: 'day',
      });

      // Should only include costs for org-123
      expect(summary.requestCount).toBe(2);
    });
  });

  describe('checkBudgetThreshold', () => {
    it('should return under budget for low usage', async () => {
      const result = await checkBudgetThreshold({
        organizationId: 'org-123',
        monthlyBudgetUSD: 1000,
      });

      expect(result.percentUsed).toBeLessThan(80);
      expect(result.status).toBe('OK');
    });

    it('should warn at 80% threshold', async () => {
      // Setup: Mock org has used $800 of $1000 budget
      setMockUsage('high-usage-org', 800);

      const result = await checkBudgetThreshold({
        organizationId: 'high-usage-org',
        monthlyBudgetUSD: 1000,
      });

      expect(result.status).toBe('WARNING');
      expect(result.percentUsed).toBeGreaterThanOrEqual(80);
    });

    it('should alert at 100% threshold', async () => {
      // Setup: Mock org has used $100 of $100 budget
      setMockUsage('over-budget-org', 100);

      const result = await checkBudgetThreshold({
        organizationId: 'over-budget-org',
        monthlyBudgetUSD: 100,
      });

      expect(result.status).toBe('EXCEEDED');
    });

    it('should return current usage amount', async () => {
      setMockUsage('test-org', 50);

      const result = await checkBudgetThreshold({
        organizationId: 'test-org',
        monthlyBudgetUSD: 100,
      });

      expect(result.currentUsageUSD).toBe(50);
      expect(result.budgetUSD).toBe(100);
    });

    it('should calculate remaining budget', async () => {
      setMockUsage('test-org', 30);

      const result = await checkBudgetThreshold({
        organizationId: 'test-org',
        monthlyBudgetUSD: 100,
      });

      expect(result.remainingUSD).toBe(70);
    });
  });

  describe('AIBudgetAlert', () => {
    it('should create alert at 80% usage', async () => {
      const alertSpy = vi.spyOn(AIBudgetAlert, 'create');
      setMockUsage('high-usage-org', 800);

      await checkBudgetThreshold({
        organizationId: 'high-usage-org',
        monthlyBudgetUSD: 1000,
        alertOnThreshold: true,
      });

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WARNING',
          threshold: 80,
        })
      );
    });

    it('should create critical alert at 100% usage', async () => {
      const alertSpy = vi.spyOn(AIBudgetAlert, 'create');
      setMockUsage('over-budget-org', 100);

      await checkBudgetThreshold({
        organizationId: 'over-budget-org',
        monthlyBudgetUSD: 100,
        alertOnThreshold: true,
      });

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CRITICAL',
          threshold: 100,
        })
      );
    });

    it('should not create alert when under threshold', async () => {
      const alertSpy = vi.spyOn(AIBudgetAlert, 'create');
      setMockUsage('low-usage-org', 50);

      await checkBudgetThreshold({
        organizationId: 'low-usage-org',
        monthlyBudgetUSD: 100,
        alertOnThreshold: true,
      });

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('should not create alert if alertOnThreshold is false', async () => {
      const alertSpy = vi.spyOn(AIBudgetAlert, 'create');
      setMockUsage('high-usage-org', 800);

      await checkBudgetThreshold({
        organizationId: 'high-usage-org',
        monthlyBudgetUSD: 1000,
        alertOnThreshold: false,
      });

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero tokens', async () => {
      const result = await trackAICost({
        operation: 'EMBEDDING',
        model: 'text-embedding-3-small',
        inputTokens: 0,
        outputTokens: 0,
        organizationId: 'org-123',
      });

      expect(result.costUSD).toBe(0);
    });

    it('should handle very large token counts', async () => {
      const result = await trackAICost({
        operation: 'COMPLETION',
        model: 'claude-3-haiku-20240307',
        inputTokens: 1000000,
        outputTokens: 1000000,
        organizationId: 'org-123',
      });

      // 1M tokens each: $0.25 + $1.25 = $1.50
      expect(result.costUSD).toBeCloseTo(1.5, 2);
    });

    it('should handle zero budget', async () => {
      const result = await checkBudgetThreshold({
        organizationId: 'org-123',
        monthlyBudgetUSD: 0,
      });

      expect(result.status).toBe('EXCEEDED');
    });
  });
});
