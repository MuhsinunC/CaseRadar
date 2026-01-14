/**
 * Per-Plan Entitlements Tests
 * P3-4 Implementation - TDD
 *
 * Tests for plan entitlements, feature access, and usage limits.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPlanEntitlements,
  checkEntitlement,
  PLANS,
  PlanType,
  EntitlementFeature,
  setOrganizationPlan,
  getOrganizationPlan,
  clearEntitlementStore,
  recordUsage,
} from '../entitlements';

describe('Per-Plan Entitlements', () => {
  beforeEach(() => {
    clearEntitlementStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearEntitlementStore();
  });

  describe('Plan Definitions', () => {
    it('should define FREE plan', () => {
      expect(PLANS.FREE).toBeDefined();
      expect(PLANS.FREE.name).toBe('Free');
    });

    it('should define PRO plan', () => {
      expect(PLANS.PRO).toBeDefined();
      expect(PLANS.PRO.name).toBe('Pro');
    });

    it('should define ENTERPRISE plan', () => {
      expect(PLANS.ENTERPRISE).toBeDefined();
      expect(PLANS.ENTERPRISE.name).toBe('Enterprise');
    });
  });

  describe('getPlanEntitlements', () => {
    it('should return entitlements for FREE plan', () => {
      const entitlements = getPlanEntitlements('FREE');

      expect(entitlements).toMatchObject({
        maxPatterns: 5,
        maxGenerations: 10,
        semanticSearch: false,
        pdfExport: false,
        apiAccess: false,
      });
    });

    it('should return entitlements for PRO plan', () => {
      const entitlements = getPlanEntitlements('PRO');

      expect(entitlements).toMatchObject({
        maxPatterns: 50,
        maxGenerations: 100,
        semanticSearch: true,
        pdfExport: true,
        apiAccess: true,
      });
    });

    it('should return unlimited for ENTERPRISE plan', () => {
      const entitlements = getPlanEntitlements('ENTERPRISE');

      expect(entitlements.maxPatterns).toBe(Infinity);
      expect(entitlements.maxGenerations).toBe(Infinity);
    });

    it('should include custom branding for ENTERPRISE only', () => {
      expect(getPlanEntitlements('FREE').customBranding).toBe(false);
      expect(getPlanEntitlements('PRO').customBranding).toBe(false);
      expect(getPlanEntitlements('ENTERPRISE').customBranding).toBe(true);
    });

    it('should include SSO for ENTERPRISE only', () => {
      expect(getPlanEntitlements('FREE').sso).toBe(false);
      expect(getPlanEntitlements('PRO').sso).toBe(false);
      expect(getPlanEntitlements('ENTERPRISE').sso).toBe(true);
    });

    it('should include dedicated support for ENTERPRISE only', () => {
      expect(getPlanEntitlements('FREE').dedicatedSupport).toBe(false);
      expect(getPlanEntitlements('PRO').dedicatedSupport).toBe(false);
      expect(getPlanEntitlements('ENTERPRISE').dedicatedSupport).toBe(true);
    });
  });

  describe('checkEntitlement', () => {
    beforeEach(async () => {
      await setOrganizationPlan('pro-org', 'PRO');
      await setOrganizationPlan('free-org', 'FREE');
      await setOrganizationPlan('enterprise-org', 'ENTERPRISE');
    });

    it('should allow entitled features', async () => {
      const result = await checkEntitlement({
        organizationId: 'pro-org',
        feature: 'semanticSearch',
      });

      expect(result.entitled).toBe(true);
    });

    it('should deny non-entitled features', async () => {
      const result = await checkEntitlement({
        organizationId: 'free-org',
        feature: 'semanticSearch',
      });

      expect(result.entitled).toBe(false);
      expect(result.requiredPlan).toBe('PRO');
    });

    it('should check usage limits', async () => {
      // Use up the pattern limit
      for (let i = 0; i < 5; i++) {
        await recordUsage('free-org', 'patterns');
      }

      const result = await checkEntitlement({
        organizationId: 'free-org',
        feature: 'patterns',
        currentUsage: 5,
      });

      expect(result.entitled).toBe(false);
      expect(result.limitReached).toBe(true);
    });

    it('should allow within usage limits', async () => {
      await recordUsage('free-org', 'patterns');

      const result = await checkEntitlement({
        organizationId: 'free-org',
        feature: 'patterns',
        currentUsage: 1,
      });

      expect(result.entitled).toBe(true);
      expect(result.limitReached).toBe(false);
    });

    it('should not limit ENTERPRISE usage', async () => {
      const result = await checkEntitlement({
        organizationId: 'enterprise-org',
        feature: 'patterns',
        currentUsage: 10000,
      });

      expect(result.entitled).toBe(true);
      expect(result.limitReached).toBe(false);
    });

    it('should return upgrade plan for limited features', async () => {
      const result = await checkEntitlement({
        organizationId: 'free-org',
        feature: 'apiAccess',
      });

      expect(result.entitled).toBe(false);
      expect(result.requiredPlan).toBeDefined();
    });
  });

  describe('Organization Plan Management', () => {
    it('should set organization plan', async () => {
      await setOrganizationPlan('new-org', 'PRO');

      const plan = await getOrganizationPlan('new-org');
      expect(plan).toBe('PRO');
    });

    it('should default to FREE plan', async () => {
      const plan = await getOrganizationPlan('unknown-org');
      expect(plan).toBe('FREE');
    });

    it('should update existing plan', async () => {
      await setOrganizationPlan('upgrade-org', 'FREE');
      await setOrganizationPlan('upgrade-org', 'PRO');

      const plan = await getOrganizationPlan('upgrade-org');
      expect(plan).toBe('PRO');
    });
  });

  describe('Usage Tracking', () => {
    it('should track pattern usage', async () => {
      await recordUsage('usage-org', 'patterns');
      await recordUsage('usage-org', 'patterns');

      await setOrganizationPlan('usage-org', 'FREE');

      const result = await checkEntitlement({
        organizationId: 'usage-org',
        feature: 'patterns',
        currentUsage: 2,
      });

      expect(result.entitled).toBe(true);
    });

    it('should track generation usage', async () => {
      await recordUsage('gen-org', 'generations');

      await setOrganizationPlan('gen-org', 'FREE');

      const result = await checkEntitlement({
        organizationId: 'gen-org',
        feature: 'generations',
        currentUsage: 1,
      });

      expect(result.entitled).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown plan gracefully', () => {
      const entitlements = getPlanEntitlements('INVALID' as PlanType);

      // Should return FREE plan entitlements as fallback
      expect(entitlements.maxPatterns).toBe(5);
    });

    it('should handle unknown feature gracefully', async () => {
      await setOrganizationPlan('test-org', 'PRO');

      const result = await checkEntitlement({
        organizationId: 'test-org',
        feature: 'unknownFeature' as EntitlementFeature,
      });

      expect(result.entitled).toBe(false);
    });

    it('should handle concurrent plan updates', async () => {
      const updates = [
        setOrganizationPlan('concurrent-org', 'FREE'),
        setOrganizationPlan('concurrent-org', 'PRO'),
        setOrganizationPlan('concurrent-org', 'ENTERPRISE'),
      ];

      await Promise.all(updates);

      const plan = await getOrganizationPlan('concurrent-org');
      expect(['FREE', 'PRO', 'ENTERPRISE']).toContain(plan);
    });
  });
});
