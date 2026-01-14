/**
 * Feature Flags System Tests
 * P1-1 Implementation - TDD
 *
 * Tests for server-side flag checking, client-side hooks,
 * percentage rollout, plan-gating, and role-based features.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  isFeatureEnabled,
  getFeatureConfig,
  FeatureFlag,
  FeatureFlagConfig,
} from '../index';
import { useFeatureFlag } from '../client';

// Mock environment for tests
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Feature Flags - Server Side', () => {
  describe('isFeatureEnabled', () => {
    it('should return true for globally enabled flags', async () => {
      const result = await isFeatureEnabled('SEMANTIC_SEARCH');
      expect(result).toBe(true);
    });

    it('should return false for disabled flags', async () => {
      const result = await isFeatureEnabled('BETA_AI_MODEL');
      expect(result).toBe(false);
    });

    it('should check user role for permission flags', async () => {
      // ADMIN user should have access to admin features
      const adminResult = await isFeatureEnabled('ADMIN_ANALYTICS', {
        userId: 'admin-user',
        role: 'ADMIN',
      });
      expect(adminResult).toBe(true);

      // VIEWER should not
      const viewerResult = await isFeatureEnabled('ADMIN_ANALYTICS', {
        userId: 'viewer-user',
        role: 'VIEWER',
      });
      expect(viewerResult).toBe(false);
    });

    it('should check organization plan for plan-gated flags', async () => {
      // PRO plan should have access
      const proResult = await isFeatureEnabled('ADVANCED_EXPORT', {
        organizationId: 'pro-org',
        plan: 'PRO',
      });
      expect(proResult).toBe(true);

      // FREE plan should not
      const freeResult = await isFeatureEnabled('ADVANCED_EXPORT', {
        organizationId: 'free-org',
        plan: 'FREE',
      });
      expect(freeResult).toBe(false);
    });

    it('should support percentage rollout', async () => {
      // With 50% rollout, roughly half should get true
      let trueCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = await isFeatureEnabled('GRADUAL_ROLLOUT', {
          userId: `user-${i}`,
        });
        if (result) trueCount++;
      }
      // Allow some variance (30-70% for 50% rollout)
      expect(trueCount).toBeGreaterThan(30);
      expect(trueCount).toBeLessThan(70);
    });

    it('should be deterministic for same user', async () => {
      const result1 = await isFeatureEnabled('GRADUAL_ROLLOUT', {
        userId: 'consistent-user',
      });
      const result2 = await isFeatureEnabled('GRADUAL_ROLLOUT', {
        userId: 'consistent-user',
      });
      expect(result1).toBe(result2);
    });

    it('should check environment for ops flags', async () => {
      process.env.ENABLE_DEBUG_MODE = 'true';
      const result = await isFeatureEnabled('DEBUG_MODE');
      expect(result).toBe(true);
    });

    it('should return false when env var is not set for ops flags', async () => {
      delete process.env.ENABLE_DEBUG_MODE;
      const result = await isFeatureEnabled('DEBUG_MODE');
      expect(result).toBe(false);
    });

    it('should return default value for unknown flags', async () => {
      const result = await isFeatureEnabled('UNKNOWN_FLAG' as FeatureFlag);
      expect(result).toBe(false);
    });

    it('should enable maintenance mode via environment variable', async () => {
      process.env.MAINTENANCE_MODE = 'true';
      const result = await isFeatureEnabled('MAINTENANCE_MODE');
      expect(result).toBe(true);
    });

    it('should allow ENTERPRISE plan for plan-gated features', async () => {
      const result = await isFeatureEnabled('ADVANCED_EXPORT', {
        organizationId: 'enterprise-org',
        plan: 'ENTERPRISE',
      });
      expect(result).toBe(true);
    });

    it('should deny TEAM plan when only PRO/ENTERPRISE required', async () => {
      const result = await isFeatureEnabled('ADVANCED_EXPORT', {
        organizationId: 'team-org',
        plan: 'TEAM',
      });
      expect(result).toBe(false);
    });

    it('should check multiple roles for permission flags', async () => {
      // ANALYST should also have access to analytics
      const analystResult = await isFeatureEnabled('ADMIN_ANALYTICS', {
        userId: 'analyst-user',
        role: 'ANALYST',
      });
      expect(analystResult).toBe(true);
    });
  });

  describe('getFeatureConfig', () => {
    it('should return flag configuration', () => {
      const config = getFeatureConfig('SEMANTIC_SEARCH');

      expect(config).toMatchObject({
        name: 'SEMANTIC_SEARCH',
        type: expect.stringMatching(/release|experiment|ops|permission/),
        enabled: expect.any(Boolean),
        description: expect.any(String),
      });
    });

    it('should include rollout percentage for experiment flags', () => {
      const config = getFeatureConfig('GRADUAL_ROLLOUT');
      expect(config).toBeDefined();

      expect(config!.type).toBe('experiment');
      expect(config!.rolloutPercentage).toBeDefined();
    });

    it('should include required plans for plan-gated flags', () => {
      const config = getFeatureConfig('ADVANCED_EXPORT');
      expect(config).toBeDefined();

      expect(config!.requiredPlan).toBeDefined();
      expect(config!.requiredPlan).toContain('PRO');
    });

    it('should include required roles for permission flags', () => {
      const config = getFeatureConfig('ADMIN_ANALYTICS');
      expect(config).toBeDefined();

      expect(config!.requiredRole).toBeDefined();
      expect(config!.requiredRole).toContain('ADMIN');
    });

    it('should include env override for ops flags', () => {
      const config = getFeatureConfig('DEBUG_MODE');
      expect(config).toBeDefined();

      expect(config!.type).toBe('ops');
      expect(config!.envOverride).toBeDefined();
    });

    it('should return undefined for unknown flags', () => {
      const config = getFeatureConfig('UNKNOWN_FLAG' as FeatureFlag);
      expect(config).toBeUndefined();
    });
  });
});

describe('Feature Flags - Client Side', () => {
  describe('useFeatureFlag hook', () => {
    it('should return flag value and loading state', () => {
      const { result } = renderHook(() => useFeatureFlag('SEMANTIC_SEARCH'));

      expect(result.current).toHaveProperty('enabled');
      expect(result.current).toHaveProperty('isLoading');
    });

    it('should eventually return enabled value', async () => {
      const { result } = renderHook(() => useFeatureFlag('SEMANTIC_SEARCH'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.enabled).toBe('boolean');
    });

    it('should return false for disabled flags', async () => {
      const { result } = renderHook(() => useFeatureFlag('BETA_AI_MODEL'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.enabled).toBe(false);
    });

    it('should handle unknown flags gracefully', async () => {
      const { result } = renderHook(() =>
        useFeatureFlag('UNKNOWN_FLAG' as FeatureFlag)
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.enabled).toBe(false);
    });
  });
});

describe('Feature Flag Types', () => {
  it('should define all required flag types', () => {
    const flags: FeatureFlag[] = [
      'SEMANTIC_SEARCH',
      'BETA_AI_MODEL',
      'ADVANCED_EXPORT',
      'ADMIN_ANALYTICS',
      'DEBUG_MODE',
      'MAINTENANCE_MODE',
      'GRADUAL_ROLLOUT',
    ];

    flags.forEach((flag) => {
      const config = getFeatureConfig(flag);
      expect(config).toBeDefined();
      expect(config!.name).toBe(flag);
    });
  });

  it('should have valid flag types', () => {
    const validTypes = ['release', 'experiment', 'ops', 'permission'];

    const configs = [
      getFeatureConfig('SEMANTIC_SEARCH'),
      getFeatureConfig('BETA_AI_MODEL'),
      getFeatureConfig('ADVANCED_EXPORT'),
      getFeatureConfig('ADMIN_ANALYTICS'),
      getFeatureConfig('DEBUG_MODE'),
    ];

    configs.forEach((config) => {
      expect(config).toBeDefined();
      expect(validTypes).toContain(config!.type);
    });
  });

  it('should have descriptions for all flags', () => {
    const flags: FeatureFlag[] = [
      'SEMANTIC_SEARCH',
      'BETA_AI_MODEL',
      'ADVANCED_EXPORT',
      'ADMIN_ANALYTICS',
      'DEBUG_MODE',
      'MAINTENANCE_MODE',
    ];

    flags.forEach((flag) => {
      const config = getFeatureConfig(flag);
      expect(config).toBeDefined();
      expect(config!.description).toBeTruthy();
      expect(config!.description.length).toBeGreaterThan(0);
    });
  });
});

describe('Feature Flag Configuration Integrity', () => {
  it('should have unique flag names', () => {
    const flags: FeatureFlag[] = [
      'SEMANTIC_SEARCH',
      'BETA_AI_MODEL',
      'ADVANCED_EXPORT',
      'ADMIN_ANALYTICS',
      'DEBUG_MODE',
      'MAINTENANCE_MODE',
      'GRADUAL_ROLLOUT',
    ];

    const uniqueFlags = new Set(flags);
    expect(uniqueFlags.size).toBe(flags.length);
  });

  it('experiment flags should have rollout percentage between 0-100', () => {
    const config = getFeatureConfig('GRADUAL_ROLLOUT');
    expect(config).toBeDefined();

    if (config && config.type === 'experiment' && config.rolloutPercentage !== undefined) {
      expect(config.rolloutPercentage).toBeGreaterThanOrEqual(0);
      expect(config.rolloutPercentage).toBeLessThanOrEqual(100);
    }
  });

  it('permission flags should have at least one required role', () => {
    const config = getFeatureConfig('ADMIN_ANALYTICS');
    expect(config).toBeDefined();

    expect(config!.type).toBe('permission');
    expect(config!.requiredRole).toBeDefined();
    expect(config!.requiredRole!.length).toBeGreaterThan(0);
  });

  it('plan-gated flags should have at least one required plan', () => {
    const config = getFeatureConfig('ADVANCED_EXPORT');
    expect(config).toBeDefined();

    expect(config!.requiredPlan).toBeDefined();
    expect(config!.requiredPlan!.length).toBeGreaterThan(0);
  });
});
