/**
 * Feature Flags System
 * P1-1 Implementation
 *
 * Exports all feature flag utilities for server and client use.
 */

// Types and configuration
export type { FeatureFlagConfig, FlagType } from './config';
export type { FeatureFlag } from './config';
export { FLAGS, getFeatureConfig } from './config';

// Server-side utilities
export type { FeatureFlagContext } from './server';
export { isFeatureEnabled } from './server';

// Client-side utilities are exported from ./client separately
// to avoid importing React in server contexts
