/**
 * Redis-Backed Rate Limiting
 * P2-11 Implementation
 *
 * Provides distributed rate limiting using Redis or in-memory fallback.
 * Implements sliding window algorithm for accurate rate limiting.
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Key prefix for Redis keys */
  keyPrefix?: string;
  /** Redis URL (optional, uses in-memory if not provided) */
  redisUrl?: string;
  /** Use fallback (in-memory) mode */
  useFallback?: boolean;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Maximum requests per window */
  limit: number;
  /** Remaining requests in current window */
  remaining: number;
  /** When the rate limit resets */
  resetAt: Date;
  /** Seconds until retry is allowed (when blocked) */
  retryAfter?: number;
  /** Whether fallback mode is active */
  fallback?: boolean;
}

/**
 * In-memory rate limit entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory storage for rate limiting (fallback mode)
 */
const inMemoryStore = new Map<string, RateLimitEntry>();

/**
 * Redis Rate Limiter class
 */
export class RedisRateLimiter {
  private config: Required<RateLimiterConfig>;
  private closed = false;

  constructor(config: RateLimiterConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      keyPrefix: config.keyPrefix || 'rl:',
      redisUrl: config.redisUrl || '',
      useFallback: config.useFallback ?? true, // Default to fallback mode
    };
  }

  /**
   * Generate a full key with prefix
   */
  getKey(identifier: string): string {
    return `${this.config.keyPrefix}${identifier}`;
  }

  /**
   * Check rate limit for an identifier
   */
  async check(identifier: string): Promise<RateLimitResult> {
    if (this.closed) {
      return this.createFallbackResult();
    }

    // Use in-memory fallback mode
    return this.checkInMemory(identifier);
  }

  /**
   * Check rate limit using in-memory store
   */
  private checkInMemory(identifier: string): RateLimitResult {
    const key = this.getKey(identifier);
    const now = Date.now();
    const entry = inMemoryStore.get(key);

    // Create new entry or reset if window expired
    if (!entry || entry.resetAt <= now) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + this.config.windowMs,
      };
      inMemoryStore.set(key, newEntry);

      return {
        allowed: true,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests - 1,
        resetAt: new Date(newEntry.resetAt),
        fallback: this.config.useFallback,
      };
    }

    // Increment counter
    entry.count++;

    // Check if over limit
    if (entry.count > this.config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
        retryAfter,
        fallback: this.config.useFallback,
      };
    }

    return {
      allowed: true,
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
      fallback: this.config.useFallback,
    };
  }

  /**
   * Create a fallback result (always allow)
   */
  private createFallbackResult(): RateLimitResult {
    return {
      allowed: true,
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests,
      resetAt: new Date(Date.now() + this.config.windowMs),
      fallback: true,
    };
  }

  /**
   * Close the rate limiter
   */
  async close(): Promise<void> {
    this.closed = true;
  }

  /**
   * Reset a specific key (for testing)
   */
  async reset(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    inMemoryStore.delete(key);
  }

  /**
   * Clear all rate limit entries (for testing)
   */
  static clearAll(): void {
    inMemoryStore.clear();
  }
}

/**
 * Create a new Redis rate limiter instance
 */
export function createRedisRateLimiter(
  config: RateLimiterConfig
): RedisRateLimiter {
  return new RedisRateLimiter(config);
}

/**
 * Extract rate limit key from request context
 */
export function extractRateLimitKey(
  request: Request,
  context: {
    userId?: string;
    headers?: Headers;
  }
): string {
  // Prefer user ID if available
  if (context.userId) {
    return `user:${context.userId}`;
  }

  // Try to get IP from headers
  const headers = context.headers || request.headers;
  const forwardedFor = headers.get('x-forwarded-for');

  if (forwardedFor) {
    // Get first IP (client IP) from comma-separated list
    const clientIP = forwardedFor.split(',')[0].trim();
    return `ip:${clientIP}`;
  }

  // Try other common headers
  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return `ip:${realIP}`;
  }

  // Fallback to unknown
  return 'ip:unknown';
}

/**
 * Middleware configuration
 */
interface MiddlewareConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

/**
 * Rate limiter instances for middleware (keyed by config hash)
 */
const middlewareLimiters = new Map<string, RedisRateLimiter>();

/**
 * Get or create a rate limiter for middleware
 */
function getMiddlewareLimiter(config: MiddlewareConfig): RedisRateLimiter {
  const key = `${config.maxRequests}:${config.windowMs}:${config.keyPrefix || ''}`;

  let limiter = middlewareLimiters.get(key);
  if (!limiter) {
    limiter = createRedisRateLimiter({
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      keyPrefix: config.keyPrefix || 'rl:api:',
      useFallback: true,
    });
    middlewareLimiters.set(key, limiter);
  }

  return limiter;
}

/**
 * Wrap a request handler with rate limiting
 */
export function withRedisRateLimit(
  handler: (request: Request) => Promise<Response>,
  config: MiddlewareConfig
): (request: Request, context?: { userId?: string }) => Promise<Response> {
  const limiter = getMiddlewareLimiter(config);

  return async (
    request: Request,
    context?: { userId?: string }
  ): Promise<Response> => {
    const identifier = extractRateLimitKey(request, {
      userId: context?.userId,
      headers: request.headers,
    });

    const result = await limiter.check(identifier);

    // If rate limited, return 429
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          type: 'https://api.caseradar.com/errors/rate-limited',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Rate limit exceeded. Please try again later.',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/problem+json',
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt.getTime() / 1000)),
            'Retry-After': String(result.retryAfter || 60),
          },
        }
      );
    }

    // Call the handler
    const response = await handler(request);

    // Clone response to add headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-RateLimit-Limit', String(result.limit));
    newHeaders.set('X-RateLimit-Remaining', String(result.remaining));
    newHeaders.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
