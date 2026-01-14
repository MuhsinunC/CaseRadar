/**
 * SLA Management Tests
 * P3-1 Implementation - TDD
 *
 * Tests for SLA definitions, uptime calculation, breach detection,
 * credit calculation, and reporting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SLADefinition,
  calculateUptime,
  checkSLABreach,
  calculateSLACredit,
  getSLAReport,
  clearSLAStore,
  recordUptimeEvent,
  recordLatencyEvent,
} from '../sla-management';

describe('SLA Management', () => {
  beforeEach(() => {
    clearSLAStore();
  });

  afterEach(() => {
    clearSLAStore();
  });

  describe('SLA Definitions', () => {
    it('should define uptime SLAs by plan', () => {
      expect(SLADefinition.FREE.uptimeTarget).toBe(0.99); // 99%
      expect(SLADefinition.PRO.uptimeTarget).toBe(0.999); // 99.9%
      expect(SLADefinition.ENTERPRISE.uptimeTarget).toBe(0.9999); // 99.99%
    });

    it('should define response time SLAs', () => {
      expect(SLADefinition.PRO.responseTimeP95).toBe(500); // ms
      expect(SLADefinition.ENTERPRISE.responseTimeP95).toBe(200);
    });

    it('should define support response SLAs', () => {
      expect(SLADefinition.ENTERPRISE.supportResponseTime).toBe(4); // hours
    });

    it('should define SLAs for FREE plan', () => {
      expect(SLADefinition.FREE.responseTimeP95).toBe(2000);
      expect(SLADefinition.FREE.supportResponseTime).toBeUndefined();
    });

    it('should have all required fields for each plan', () => {
      const plans = ['FREE', 'PRO', 'ENTERPRISE'] as const;

      for (const plan of plans) {
        expect(SLADefinition[plan]).toHaveProperty('uptimeTarget');
        expect(SLADefinition[plan]).toHaveProperty('responseTimeP95');
      }
    });
  });

  describe('calculateUptime', () => {
    it('should calculate uptime percentage', async () => {
      // Record some events for testing
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'up',
        duration: 40000, // 40000 minutes of uptime
      });
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'down',
        duration: 400, // 400 minutes of downtime
      });

      const uptime = await calculateUptime({
        organizationId: 'org-123',
        period: 'month',
      });

      expect(uptime.percentage).toBeGreaterThan(0);
      expect(uptime.percentage).toBeLessThanOrEqual(100);
      expect(uptime.downtimeMinutes).toBeDefined();
    });

    it('should exclude scheduled maintenance', async () => {
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'up',
        duration: 40000,
      });
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'maintenance',
        duration: 60, // 1 hour maintenance
      });

      const uptime = await calculateUptime({
        organizationId: 'org-123',
        period: 'month',
        excludeScheduledMaintenance: true,
      });

      expect(uptime.excludedMinutes).toBe(60);
    });

    it('should return 100% when no downtime', async () => {
      await recordUptimeEvent({
        organizationId: 'org-perfect',
        status: 'up',
        duration: 43200, // Full month
      });

      const uptime = await calculateUptime({
        organizationId: 'org-perfect',
        period: 'month',
      });

      expect(uptime.percentage).toBe(100);
      expect(uptime.downtimeMinutes).toBe(0);
    });

    it('should handle quarter period', async () => {
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'up',
        duration: 120000,
      });

      const uptime = await calculateUptime({
        organizationId: 'org-123',
        period: 'quarter',
      });

      expect(uptime.period).toBe('quarter');
    });
  });

  describe('checkSLABreach', () => {
    beforeEach(async () => {
      // Setup low uptime org
      await recordUptimeEvent({
        organizationId: 'low-uptime-org',
        status: 'up',
        duration: 38000,
      });
      await recordUptimeEvent({
        organizationId: 'low-uptime-org',
        status: 'down',
        duration: 5200, // ~12% downtime
      });

      // Setup healthy org
      await recordUptimeEvent({
        organizationId: 'healthy-org',
        status: 'up',
        duration: 43180, // 99.95% uptime
      });
      await recordUptimeEvent({
        organizationId: 'healthy-org',
        status: 'down',
        duration: 20,
      });
    });

    it('should detect uptime breach', async () => {
      const result = await checkSLABreach({
        organizationId: 'low-uptime-org',
        metric: 'uptime',
        period: 'month',
        plan: 'PRO',
      });

      expect(result.breached).toBe(true);
      expect(result.actual).toBeLessThan(result.target);
    });

    it('should return no breach when within SLA', async () => {
      const result = await checkSLABreach({
        organizationId: 'healthy-org',
        metric: 'uptime',
        period: 'month',
        plan: 'PRO',
      });

      expect(result.breached).toBe(false);
    });

    it('should include target and actual values', async () => {
      const result = await checkSLABreach({
        organizationId: 'healthy-org',
        metric: 'uptime',
        period: 'month',
        plan: 'PRO',
      });

      expect(result.target).toBeDefined();
      expect(result.actual).toBeDefined();
      expect(result.metric).toBe('uptime');
    });

    it('should check latency breach', async () => {
      await recordLatencyEvent({
        organizationId: 'slow-org',
        p95: 1500, // Very slow
      });

      const result = await checkSLABreach({
        organizationId: 'slow-org',
        metric: 'latency',
        period: 'month',
        plan: 'PRO',
      });

      expect(result.breached).toBe(true);
    });
  });

  describe('calculateSLACredit', () => {
    it('should calculate credit percentage based on downtime', () => {
      // 99.9% SLA, actual 99.5% = 10% credit
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 99.5,
        plan: 'PRO',
      });

      expect(credit.creditPercentage).toBe(10);
    });

    it('should cap credit at 50%', () => {
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 90.0, // Major outage
        plan: 'PRO',
      });

      expect(credit.creditPercentage).toBe(50);
    });

    it('should calculate credit amount', () => {
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 99.5,
        plan: 'PRO',
        monthlyFee: 499,
      });

      expect(credit.creditAmount).toBe(49.9); // 10% of $499
    });

    it('should return zero credit when no breach', () => {
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 99.95,
        plan: 'PRO',
        monthlyFee: 499,
      });

      expect(credit.creditPercentage).toBe(0);
      expect(credit.creditAmount).toBe(0);
    });

    it('should apply enterprise credit rates', () => {
      const credit = calculateSLACredit({
        target: 99.99,
        actual: 99.9,
        plan: 'ENTERPRISE',
        monthlyFee: 2999,
      });

      expect(credit.creditPercentage).toBeGreaterThan(0);
    });

    it('should handle FREE plan (no credits)', () => {
      const credit = calculateSLACredit({
        target: 99,
        actual: 98,
        plan: 'FREE',
      });

      expect(credit.creditPercentage).toBe(0);
      expect(credit.eligible).toBe(false);
    });
  });

  describe('getSLAReport', () => {
    beforeEach(async () => {
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'up',
        duration: 42768,
      });
      await recordUptimeEvent({
        organizationId: 'org-123',
        status: 'down',
        duration: 432, // 1% downtime
      });
      await recordLatencyEvent({
        organizationId: 'org-123',
        p95: 450,
      });
    });

    it('should generate monthly SLA report', async () => {
      const report = await getSLAReport({
        organizationId: 'org-123',
        month: '2024-01',
      });

      expect(report).toMatchObject({
        period: '2024-01',
        uptime: expect.any(Object),
        latency: expect.any(Object),
        breaches: expect.any(Array),
        credits: expect.any(Object),
      });
    });

    it('should include uptime metrics in report', async () => {
      const report = await getSLAReport({
        organizationId: 'org-123',
        month: '2024-01',
      });

      expect(report.uptime.percentage).toBeDefined();
      expect(report.uptime.target).toBeDefined();
    });

    it('should include latency metrics in report', async () => {
      const report = await getSLAReport({
        organizationId: 'org-123',
        month: '2024-01',
      });

      expect(report.latency.p95).toBeDefined();
    });

    it('should list any breaches', async () => {
      const report = await getSLAReport({
        organizationId: 'org-123',
        month: '2024-01',
      });

      expect(Array.isArray(report.breaches)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle organization with no data', async () => {
      const uptime = await calculateUptime({
        organizationId: 'new-org',
        period: 'month',
      });

      expect(uptime.percentage).toBe(100); // Assume up if no data
    });

    it('should handle invalid plan gracefully', () => {
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 99.5,
        plan: 'INVALID' as 'PRO',
      });

      expect(credit.creditPercentage).toBe(0);
    });

    it('should handle zero monthly fee', () => {
      const credit = calculateSLACredit({
        target: 99.9,
        actual: 99.5,
        plan: 'PRO',
        monthlyFee: 0,
      });

      expect(credit.creditAmount).toBe(0);
    });
  });
});
