/**
 * Per-Service Timeout Configurations
 * P3-6 Implementation
 *
 * Provides service-specific timeout configurations and timeout wrapper function.
 */

/**
 * Service names for timeout configuration
 */
export type ServiceName =
  | 'openai'
  | 'anthropic'
  | 'nhtsa'
  | 'clerk'
  | 'stripe'
  | 'database'
  | 'default';

/**
 * Service timeout configuration (in milliseconds)
 */
export interface ServiceTimeoutConfig {
  openai: number;
  anthropic: number;
  nhtsa: number;
  clerk: number;
  stripe: number;
  database: number;
  default: number;
}

/**
 * Default service timeouts
 *
 * | Service   | Timeout (ms) | Rationale                |
 * |-----------|--------------|--------------------------|
 * | OpenAI    | 30000        | Embeddings can be slow   |
 * | Anthropic | 60000        | Generation takes time    |
 * | NHTSA     | 10000        | External API             |
 * | Clerk     | 5000         | Auth should be fast      |
 * | Stripe    | 10000        | Payment processing       |
 * | Database  | 5000         | Local/managed            |
 * | Default   | 10000        | Fallback                 |
 */
export const SERVICE_TIMEOUTS: ServiceTimeoutConfig = {
  openai: 30000,
  anthropic: 60000,
  nhtsa: 10000,
  clerk: 5000,
  stripe: 10000,
  database: 5000,
  default: 10000,
};

/**
 * Timeout error class
 */
export class TimeoutError extends Error {
  public readonly service?: string;
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, service?: string) {
    super(message);
    this.name = 'TimeoutError';
    this.service = service;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Get timeout for a specific service
 *
 * @param service - Service name
 * @returns Timeout in milliseconds
 */
export function getServiceTimeout(service: ServiceName): number {
  if (!service || !(service in SERVICE_TIMEOUTS)) {
    return SERVICE_TIMEOUTS.default;
  }
  return SERVICE_TIMEOUTS[service];
}

/**
 * Wrap a promise with a timeout
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param serviceName - Optional service name for error message
 * @returns Promise that rejects if timeout is exceeded
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  serviceName?: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const message = serviceName
        ? `Service '${serviceName}' timeout after ${timeoutMs}ms`
        : `Operation timeout after ${timeoutMs}ms`;
      reject(new TimeoutError(message, timeoutMs, serviceName));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Create a timeout-wrapped fetch function for a service
 *
 * @param serviceName - Service name
 * @param fetchFn - Fetch function to wrap
 * @returns Wrapped function with timeout
 */
export function withServiceTimeout<T extends (...args: unknown[]) => Promise<unknown>>(
  serviceName: ServiceName,
  fetchFn: T
): T {
  const timeout = getServiceTimeout(serviceName);

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withTimeout(
      fetchFn(...args) as Promise<ReturnType<T>>,
      timeout,
      serviceName
    );
  }) as T;
}

/**
 * Validate that a timeout value is reasonable
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns True if timeout is valid
 */
export function isValidTimeout(timeoutMs: number): boolean {
  // Timeout should be between 100ms and 5 minutes
  return timeoutMs >= 100 && timeoutMs <= 300000;
}

/**
 * Get all service timeout configurations
 *
 * @returns Service timeout configuration
 */
export function getAllTimeouts(): ServiceTimeoutConfig {
  return { ...SERVICE_TIMEOUTS };
}
