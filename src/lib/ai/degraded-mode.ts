/**
 * Degraded Mode Management
 * P1-9 Implementation
 *
 * Provides utilities for graceful degradation when AI services
 * are unavailable. Allows switching to fallback implementations
 * and auto-recovery when services become available again.
 */

/**
 * Degraded mode state
 */
interface DegradedState {
  isDegraded: boolean;
  reason: string | null;
  since: number | null;
}

// In-memory state for degraded mode
let state: DegradedState = {
  isDegraded: false,
  reason: null,
  since: null,
};

/**
 * Check if the system is in degraded mode
 *
 * @returns True if degraded mode is active
 */
export function isDegradedMode(): boolean {
  return state.isDegraded;
}

/**
 * Set degraded mode state
 *
 * @param degraded - Whether to enable degraded mode
 * @param reason - Optional reason for degradation
 */
export function setDegradedMode(degraded: boolean, reason?: string): void {
  if (degraded) {
    // Only update timestamp if transitioning to degraded
    if (!state.isDegraded) {
      state.since = Date.now();
    }
    state.isDegraded = true;
    state.reason = reason ?? 'Unknown reason';
  } else {
    // Clear state when disabling
    state.isDegraded = false;
    state.reason = null;
    state.since = null;
  }
}

/**
 * Get the reason for degraded mode
 *
 * @returns Reason string or null if not degraded
 */
export function getDegradedReason(): string | null {
  return state.reason;
}

/**
 * Clear degraded mode state
 * Resets all state to initial values
 */
export function clearDegradedMode(): void {
  state = {
    isDegraded: false,
    reason: null,
    since: null,
  };
}

/**
 * Get full degraded state object
 *
 * @returns Complete state object with all properties
 */
export function getDegradedState(): DegradedState {
  return { ...state };
}

/**
 * Context type for fallback functions
 */
export interface FallbackContext {
  operation?: string;
  [key: string]: unknown;
}

/**
 * Execute function with degraded mode fallback
 *
 * If not in degraded mode, tries the primary function.
 * If in degraded mode or primary fails, uses fallback.
 *
 * @param primary - Primary async function to try
 * @param fallback - Fallback async function to use in degraded mode
 * @param context - Optional context to pass to fallback
 * @returns Result from either primary or fallback
 */
export async function withDegradedFallback<T>(
  primary: () => Promise<T>,
  fallback: (context?: FallbackContext) => Promise<T>,
  context?: FallbackContext
): Promise<T> {
  // If already in degraded mode, skip primary
  if (isDegradedMode()) {
    return fallback(context);
  }

  try {
    // Try primary function
    return await primary();
  } catch (error) {
    // Primary failed - switch to degraded mode
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    setDegradedMode(true, `Primary function failed: ${errorMessage}`);

    // Try fallback
    return fallback(context);
  }
}

/**
 * Check if system should attempt recovery
 * Returns true if enough time has passed since degradation
 *
 * @param intervalMs - Recovery check interval in milliseconds (default: 5 minutes)
 * @returns True if recovery should be attempted
 */
export function shouldAttemptRecovery(intervalMs: number = 5 * 60 * 1000): boolean {
  if (!state.isDegraded || !state.since) {
    return false;
  }

  const elapsed = Date.now() - state.since;
  return elapsed >= intervalMs;
}

/**
 * Attempt to recover from degraded mode
 *
 * @param healthCheck - Async function that returns true if service is healthy
 * @returns True if recovery was successful
 */
export async function attemptRecovery(
  healthCheck: () => Promise<boolean>
): Promise<boolean> {
  try {
    const isHealthy = await healthCheck();
    if (isHealthy) {
      clearDegradedMode();
      return true;
    }
  } catch {
    // Health check failed - remain in degraded mode
  }

  return false;
}

/**
 * Create a degraded-aware function wrapper
 *
 * @param primary - Primary implementation
 * @param fallback - Fallback implementation
 * @returns Wrapped function that handles degraded mode
 */
export function createDegradedAwareFunction<T extends (...args: unknown[]) => Promise<unknown>>(
  primary: T,
  fallback: T
): T {
  return (async (...args: Parameters<T>) => {
    if (isDegradedMode()) {
      return fallback(...args);
    }

    try {
      return await primary(...args);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setDegradedMode(true, `Service error: ${errorMessage}`);
      return fallback(...args);
    }
  }) as T;
}
