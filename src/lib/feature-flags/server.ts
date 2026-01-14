/**
 * Feature Flags Server-Side Utilities
 * P1-1 Implementation
 *
 * Server-side feature flag checking with support for:
 * - Release flags (global on/off)
 * - Experiment flags (percentage rollout)
 * - Permission flags (role-based and plan-gated)
 * - Ops flags (environment variable controlled)
 */

import { FLAGS, FeatureFlag, FeatureFlagConfig } from './config';

/**
 * Context for evaluating feature flags
 */
export interface FeatureFlagContext {
  userId?: string;
  organizationId?: string;
  role?: string;
  plan?: string;
}

/**
 * Generate a deterministic hash for a string
 * Used for consistent percentage rollout
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if a user is in the rollout percentage
 * Uses deterministic hashing so same user always gets same result
 */
function isInRollout(
  userId: string,
  flagName: string,
  percentage: number
): boolean {
  // Create a unique key combining user and flag
  const key = `${userId}:${flagName}`;
  const hash = hashString(key);

  // Convert hash to 0-100 range
  const bucket = hash % 100;

  return bucket < percentage;
}

/**
 * Check if a feature flag is enabled
 *
 * @param flag - The feature flag to check
 * @param context - Optional context with user/org info
 * @returns Promise<boolean> - Whether the flag is enabled
 */
export async function isFeatureEnabled(
  flag: FeatureFlag,
  context: FeatureFlagContext = {}
): Promise<boolean> {
  const config = FLAGS[flag];

  // Unknown flags default to false
  if (!config) {
    return false;
  }

  // Check based on flag type
  switch (config.type) {
    case 'release':
      return config.enabled;

    case 'experiment':
      return checkExperimentFlag(config, context);

    case 'permission':
      return checkPermissionFlag(config, context);

    case 'ops':
      return checkOpsFlag(config);

    default:
      return config.enabled;
  }
}

/**
 * Check experiment flags (percentage rollout)
 */
function checkExperimentFlag(
  config: FeatureFlagConfig,
  context: FeatureFlagContext
): boolean {
  // If globally disabled, always return false
  if (!config.enabled) {
    return false;
  }

  // If no rollout percentage, return enabled state
  if (config.rolloutPercentage === undefined) {
    return config.enabled;
  }

  // Need a user ID for percentage rollout
  if (!context.userId) {
    return false;
  }

  return isInRollout(context.userId, config.name, config.rolloutPercentage);
}

/**
 * Check permission flags (role-based and plan-gated)
 */
function checkPermissionFlag(
  config: FeatureFlagConfig,
  context: FeatureFlagContext
): boolean {
  // If globally disabled, always return false
  if (!config.enabled) {
    return false;
  }

  // Check required role if specified
  if (config.requiredRole && config.requiredRole.length > 0) {
    if (!context.role) {
      return false;
    }
    return config.requiredRole.includes(context.role);
  }

  // Check required plan if specified
  if (config.requiredPlan && config.requiredPlan.length > 0) {
    if (!context.plan) {
      return false;
    }
    return config.requiredPlan.includes(context.plan);
  }

  // If no specific requirements, return enabled state
  return config.enabled;
}

/**
 * Check ops flags (environment variable controlled)
 */
function checkOpsFlag(config: FeatureFlagConfig): boolean {
  // If env override is specified, check the environment variable
  if (config.envOverride) {
    const envValue = process.env[config.envOverride];
    return envValue === 'true' || envValue === '1';
  }

  // Fall back to enabled state
  return config.enabled;
}
