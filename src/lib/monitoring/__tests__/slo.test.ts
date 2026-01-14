/**
 * SLI/SLO Tracking Tests
 * P2-10 Implementation - TDD
 *
 * Tests for Service Level Indicator (SLI) and Service Level Objective (SLO) tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordLatency,
  recordError,
  calculateSLI,
  calculateErrorBudget,
  SLODefinitions,
  getLatencyMetrics,
  getErrorCount,
  recordRequest,
  clearMetrics,
} from '../slo';

describe('SLI/SLO Tracking', () => {
  beforeEach(() => {
    clearMetrics();
  });

  describe('SLO Definitions', () => {
    it('should define availability SLO', () => {
      expect(SLODefinitions.availability).toMatchObject({
        target: 0.999, // 99.9%
        window: '30d',
      });
    });

    it('should define latency SLOs', () => {
      expect(SLODefinitions.latency).toMatchObject({
        p50Target: 200, // ms
        p95Target: 500,
        p99Target: 1000,
      });
    });

    it('should define error rate SLO', () => {
      expect(SLODefinitions.errorRate).toMatchObject({
        target: 0.001, // 0.1%
        window: '30d',
      });
    });
  });

  describe('recordLatency', () => {
    it('should record request latency', async () => {
      await recordLatency({
        endpoint: '/api/complaints',
        latencyMs: 150,
        timestamp: new Date(),
      });

      const metrics = await getLatencyMetrics('/api/complaints', 'hour');
      expect(metrics.count).toBeGreaterThan(0);
    });

    it('should calculate percentiles', async () => {
      // Record multiple latencies (20+ data points for meaningful percentiles)
      const latencies = [
        100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
        200, 210, 220, 230, 240, 250, 300, 400, 600, 1000,
      ];
      for (const latency of latencies) {
        await recordLatency({
          endpoint: '/api/test',
          latencyMs: latency,
        });
      }

      const metrics = await getLatencyMetrics('/api/test', 'hour');

      expect(metrics.p50).toBeLessThanOrEqual(metrics.p95);
      expect(metrics.p95).toBeLessThanOrEqual(metrics.p99);
      expect(metrics.min).toBe(100);
      expect(metrics.max).toBe(1000);
    });

    it('should handle single latency record', async () => {
      await recordLatency({
        endpoint: '/api/single',
        latencyMs: 100,
      });

      const metrics = await getLatencyMetrics('/api/single', 'hour');
      expect(metrics.p50).toBe(100);
      expect(metrics.p99).toBe(100);
    });

    it('should return zero metrics for unknown endpoint', async () => {
      const metrics = await getLatencyMetrics('/api/unknown', 'hour');
      expect(metrics.count).toBe(0);
    });
  });

  describe('recordError', () => {
    it('should record error occurrence', async () => {
      await recordError({
        endpoint: '/api/complaints',
        errorCode: 500,
        errorType: 'INTERNAL_ERROR',
      });

      const errors = await getErrorCount('/api/complaints', 'hour');
      expect(errors).toBeGreaterThan(0);
    });

    it('should categorize errors by type', async () => {
      await recordError({
        endpoint: '/api/test',
        errorCode: 500,
        errorType: 'INTERNAL_ERROR',
      });

      await recordError({
        endpoint: '/api/test',
        errorCode: 404,
        errorType: 'NOT_FOUND',
      });

      const errors = await getErrorCount('/api/test', 'hour');
      expect(errors).toBe(2);
    });

    it('should return zero for endpoint with no errors', async () => {
      const errors = await getErrorCount('/api/no-errors', 'hour');
      expect(errors).toBe(0);
    });
  });

  describe('recordRequest', () => {
    it('should record successful request', async () => {
      await recordRequest({
        endpoint: '/api/test',
        success: true,
        latencyMs: 100,
      });

      const sli = await calculateSLI('availability', { window: '24h' });
      expect(sli.value).toBe(1); // 100% availability
    });

    it('should record failed request', async () => {
      await recordRequest({
        endpoint: '/api/test',
        success: true,
        latencyMs: 100,
      });

      await recordRequest({
        endpoint: '/api/test',
        success: false,
        latencyMs: 200,
      });

      const sli = await calculateSLI('availability', { window: '24h' });
      expect(sli.value).toBe(0.5); // 50% availability
    });
  });

  describe('calculateSLI', () => {
    beforeEach(async () => {
      // Setup some baseline data
      for (let i = 0; i < 10; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: true,
          latencyMs: 100 + i * 50,
        });
      }
    });

    it('should calculate availability SLI', async () => {
      const sli = await calculateSLI('availability', {
        window: '24h',
      });

      expect(sli).toMatchObject({
        value: expect.any(Number),
        target: SLODefinitions.availability.target,
        met: expect.any(Boolean),
      });
      expect(sli.value).toBeGreaterThanOrEqual(0);
      expect(sli.value).toBeLessThanOrEqual(1);
    });

    it('should calculate latency SLI', async () => {
      const sli = await calculateSLI('latency', {
        window: '24h',
        percentile: 'p95',
      });

      expect(sli.value).toBeGreaterThan(0);
      expect(sli.target).toBe(SLODefinitions.latency.p95Target);
    });

    it('should calculate error rate SLI', async () => {
      const sli = await calculateSLI('errorRate', {
        window: '24h',
      });

      expect(sli.value).toBeGreaterThanOrEqual(0);
      expect(sli.value).toBeLessThanOrEqual(1);
    });

    it('should indicate SLO is met when within target', async () => {
      const sli = await calculateSLI('availability', { window: '24h' });

      if (sli.value >= sli.target) {
        expect(sli.met).toBe(true);
      } else {
        expect(sli.met).toBe(false);
      }
    });

    it('should handle different latency percentiles', async () => {
      const p50Sli = await calculateSLI('latency', { window: '24h', percentile: 'p50' });
      const p95Sli = await calculateSLI('latency', { window: '24h', percentile: 'p95' });
      const p99Sli = await calculateSLI('latency', { window: '24h', percentile: 'p99' });

      expect(p50Sli.target).toBe(SLODefinitions.latency.p50Target);
      expect(p95Sli.target).toBe(SLODefinitions.latency.p95Target);
      expect(p99Sli.target).toBe(SLODefinitions.latency.p99Target);
    });
  });

  describe('calculateErrorBudget', () => {
    beforeEach(async () => {
      // Setup baseline data: 1000 successful requests
      for (let i = 0; i < 1000; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: true,
          latencyMs: 100,
        });
      }
    });

    it('should calculate remaining error budget', async () => {
      const budget = await calculateErrorBudget('availability');

      expect(budget).toMatchObject({
        totalBudget: expect.any(Number),
        consumed: expect.any(Number),
        remaining: expect.any(Number),
        percentRemaining: expect.any(Number),
      });
    });

    it('should have positive remaining budget when SLO met', async () => {
      const budget = await calculateErrorBudget('availability');

      // With 100% success rate, should have full budget remaining
      expect(budget.remaining).toBeGreaterThan(0);
      expect(budget.percentRemaining).toBeGreaterThan(0);
    });

    it('should return negative remaining when budget exceeded', async () => {
      // Add many errors to exceed budget
      for (let i = 0; i < 100; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: false,
          latencyMs: 100,
        });
      }

      const budget = await calculateErrorBudget('availability');

      // With 10% error rate (100/1100), budget should be consumed
      // SLO is 99.9% (0.1% error budget), so 10% errors far exceeds
      expect(budget.remaining).toBeLessThan(0);
    });

    it('should alert when budget below threshold', async () => {
      const alertSpy = vi.fn();

      // Add errors to consume budget
      for (let i = 0; i < 5; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: false,
          latencyMs: 100,
        });
      }

      await calculateErrorBudget('availability', {
        alertThreshold: 100, // Alert when < 100% remaining (always)
        onAlert: alertSpy,
      });

      expect(alertSpy).toHaveBeenCalled();
    });

    it('should not alert when budget above threshold', async () => {
      const alertSpy = vi.fn();

      await calculateErrorBudget('availability', {
        alertThreshold: -100, // Never alert (impossible to be below -100%)
        onAlert: alertSpy,
      });

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('should include budget details in alert', async () => {
      const alertSpy = vi.fn();

      // Add errors to consume budget
      for (let i = 0; i < 10; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: false,
          latencyMs: 100,
        });
      }

      await calculateErrorBudget('availability', {
        alertThreshold: 100,
        onAlert: alertSpy,
      });

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'availability',
          percentRemaining: expect.any(Number),
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle no data', async () => {
      const sli = await calculateSLI('availability', { window: '24h' });

      // With no data, default to 1.0 (no failures observed)
      expect(sli.value).toBe(1);
    });

    it('should handle all failures', async () => {
      for (let i = 0; i < 10; i++) {
        await recordRequest({
          endpoint: '/api/test',
          success: false,
          latencyMs: 100,
        });
      }

      const sli = await calculateSLI('availability', { window: '24h' });
      expect(sli.value).toBe(0);
      expect(sli.met).toBe(false);
    });

    it('should handle very long latencies', async () => {
      await recordLatency({
        endpoint: '/api/slow',
        latencyMs: 60000, // 1 minute
      });

      const metrics = await getLatencyMetrics('/api/slow', 'hour');
      expect(metrics.p99).toBe(60000);
    });
  });
});
