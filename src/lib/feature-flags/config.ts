/**
 * Feature Flags Configuration
 * P1-1 Implementation
 *
 * Defines all feature flags and their configurations.
 */

export type FlagType = 'release' | 'experiment' | 'ops' | 'permission';

export interface FeatureFlagConfig {
  name: string;
  type: FlagType;
  enabled: boolean;
  description: string;
  rolloutPercentage?: number; // For experiment flags (0-100)
  requiredPlan?: string[]; // For plan-gated flags
  requiredRole?: string[]; // For permission flags
  envOverride?: string; // For ops flags - env var name
}

/**
 * All available feature flags
 */
export type FeatureFlag =
  | 'SEMANTIC_SEARCH'
  | 'BETA_AI_MODEL'
  | 'ADVANCED_EXPORT'
  | 'ADMIN_ANALYTICS'
  | 'DEBUG_MODE'
  | 'MAINTENANCE_MODE'
  | 'GRADUAL_ROLLOUT';

/**
 * Feature flag configurations
 */
export const FLAGS: Record<FeatureFlag, FeatureFlagConfig> = {
  /**
   * Release Flags - Simple on/off toggles
   */
  SEMANTIC_SEARCH: {
    name: 'SEMANTIC_SEARCH',
    type: 'release',
    enabled: true,
    description: 'Enable semantic search using vector embeddings',
  },

  /**
   * Experiment Flags - Gradual rollout with percentage
   */
  BETA_AI_MODEL: {
    name: 'BETA_AI_MODEL',
    type: 'experiment',
    enabled: false,
    description: 'Use beta AI model for complaint generation',
    rolloutPercentage: 10,
  },

  GRADUAL_ROLLOUT: {
    name: 'GRADUAL_ROLLOUT',
    type: 'experiment',
    enabled: true,
    description: 'Test feature with gradual rollout',
    rolloutPercentage: 50,
  },

  /**
   * Permission Flags - Plan-gated features
   */
  ADVANCED_EXPORT: {
    name: 'ADVANCED_EXPORT',
    type: 'permission',
    enabled: true,
    description: 'Advanced export formats (PDF, DOCX)',
    requiredPlan: ['PRO', 'ENTERPRISE'],
  },

  /**
   * Permission Flags - Role-based features
   */
  ADMIN_ANALYTICS: {
    name: 'ADMIN_ANALYTICS',
    type: 'permission',
    enabled: true,
    description: 'Advanced analytics dashboard for administrators',
    requiredRole: ['ADMIN', 'ANALYST'],
  },

  /**
   * Ops Flags - Environment-controlled features
   */
  DEBUG_MODE: {
    name: 'DEBUG_MODE',
    type: 'ops',
    enabled: false,
    description: 'Enable debug logging and diagnostic information',
    envOverride: 'ENABLE_DEBUG_MODE',
  },

  MAINTENANCE_MODE: {
    name: 'MAINTENANCE_MODE',
    type: 'ops',
    enabled: false,
    description: 'Enable maintenance mode - shows maintenance page to users',
    envOverride: 'MAINTENANCE_MODE',
  },
};

/**
 * Get configuration for a specific flag
 */
export function getFeatureConfig(
  flag: FeatureFlag
): FeatureFlagConfig | undefined {
  return FLAGS[flag];
}
