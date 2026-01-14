'use client';

/**
 * Feature Flags Client-Side Hook
 * P1-1 Implementation
 *
 * React hook for checking feature flags on the client side.
 * Uses local flag configuration for immediate resolution.
 */

import { useState, useEffect } from 'react';
import { FLAGS, FeatureFlag } from './config';

/**
 * Result of the useFeatureFlag hook
 */
export interface UseFeatureFlagResult {
  enabled: boolean;
  isLoading: boolean;
}

/**
 * Hook to check if a feature flag is enabled
 *
 * Note: Client-side checks only support release flags and simple enabled states.
 * For role-based or plan-gated features, use server-side isFeatureEnabled.
 *
 * @param flag - The feature flag to check
 * @returns Object with enabled state and loading indicator
 */
export function useFeatureFlag(flag: FeatureFlag): UseFeatureFlagResult {
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate async resolution (could be API call in production)
    const checkFlag = async () => {
      try {
        const config = FLAGS[flag];

        if (!config) {
          setEnabled(false);
        } else {
          // For client-side, we only check the basic enabled state
          // Complex checks (role, plan, percentage) should be done server-side
          setEnabled(config.enabled);
        }
      } catch (error) {
        console.error(`Error checking feature flag ${flag}:`, error);
        setEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkFlag();
  }, [flag]);

  return { enabled, isLoading };
}

