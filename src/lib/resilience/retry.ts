/**
 * Retry Logic with Exponential Backoff
 * Implements retry pattern for transient failures
 * Based on architecture documentation: docs/architecture/12-reliability-scalability.md
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryableErrors?: (error: unknown) => boolean;
}

// Retry configurations from architecture docs
export const RETRY_CONFIGS: Record<string, RetryConfig> = {
  openaiEmbedding: {
    maxRetries: 3,
    baseDelayMs: 1000,      // 1s
    maxDelayMs: 8000,       // 8s
    jitterMs: 500,          // ±500ms
  },
  anthropicGeneration: {
    maxRetries: 3,
    baseDelayMs: 2000,      // 2s
    maxDelayMs: 16000,      // 16s
    jitterMs: 1000,         // ±1s
  },
  nhtsaFetch: {
    maxRetries: 5,
    baseDelayMs: 5000,      // 5s
    maxDelayMs: 60000,      // 60s
    jitterMs: 2000,         // ±2s
  },
  databaseQuery: {
    maxRetries: 2,
    baseDelayMs: 100,       // 100ms
    maxDelayMs: 1000,       // 1s
    jitterMs: 50,           // ±50ms
  },
  stripeApi: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    jitterMs: 500,
  },
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (random variance to prevent thundering herd)
  const jitter = (Math.random() * 2 - 1) * config.jitterMs;

  return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default function to determine if error is retryable
 */
function defaultIsRetryable(error: unknown): boolean {
  // Retry on network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Retry on specific HTTP status codes
  if (error && typeof error === 'object') {
    const e = error as { status?: number; code?: string; message?: string };

    // Retry on rate limits (429)
    if (e.status === 429) {
      return true;
    }

    // Retry on server errors (5xx)
    if (e.status && e.status >= 500 && e.status < 600) {
      return true;
    }

    // Retry on connection errors
    if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND') {
      return true;
    }

    // Check message for common transient errors
    if (e.message?.toLowerCase().includes('timeout')) {
      return true;
    }
    if (e.message?.toLowerCase().includes('rate limit')) {
      return true;
    }
    if (e.message?.toLowerCase().includes('temporarily unavailable')) {
      return true;
    }
  }

  return false;
}

/**
 * Retry result with metadata
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  config: RetryConfig,
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  const isRetryable = config.retryableErrors || defaultIsRetryable;
  let lastError: unknown;
  let totalDelay = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < config.maxRetries && isRetryable(error)) {
        const delay = calculateDelay(attempt, config);
        totalDelay += delay;

        if (onRetry) {
          onRetry(attempt + 1, error, delay);
        } else {
          console.warn(
            `Retry attempt ${attempt + 1}/${config.maxRetries} after ${Math.round(delay)}ms`,
            error instanceof Error ? error.message : error
          );
        }

        await sleep(delay);
      } else {
        break;
      }
    }
  }

  throw lastError;
}

/**
 * Execute function with retry and return detailed result
 */
export async function withRetryDetailed<T>(
  config: RetryConfig,
  fn: () => Promise<T>
): Promise<RetryResult<T>> {
  const isRetryable = config.retryableErrors || defaultIsRetryable;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalDelayMs,
      };
    } catch (error) {
      // Check if we should retry
      if (attempt < config.maxRetries && isRetryable(error)) {
        const delay = calculateDelay(attempt, config);
        totalDelayMs += delay;
        await sleep(delay);
      } else {
        return {
          success: false,
          error,
          attempts: attempt + 1,
          totalDelayMs,
        };
      }
    }
  }

  // Should not reach here
  return {
    success: false,
    error: new Error('Max retries exceeded'),
    attempts: config.maxRetries + 1,
    totalDelayMs,
  };
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends unknown[], R>(
  config: RetryConfig,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return (...args: T) => withRetry(config, () => fn(...args));
}

/**
 * Combine circuit breaker with retry
 * Retries happen inside the circuit breaker protection
 */
export async function withRetryAndCircuitBreaker<T>(
  retryConfig: RetryConfig,
  circuitBreaker: {
    isAllowed: () => boolean;
    recordSuccess: () => void;
    recordFailure: () => void;
    getRetryAfter: () => number;
  },
  fn: () => Promise<T>
): Promise<T> {
  // Check circuit first
  if (!circuitBreaker.isAllowed()) {
    throw new Error(`Circuit breaker open - retry after ${circuitBreaker.getRetryAfter()}s`);
  }

  try {
    // Retry logic wraps the actual call
    const result = await withRetry(retryConfig, fn);
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}
