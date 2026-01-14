/**
 * Rate Limiting Utility
 *
 * Simple sliding window rate limiter for API endpoints.
 * Uses in-memory storage (suitable for single-instance deployment).
 * For production scale, replace with Vercel KV or Upstash Redis.
 */

interface InternalRateLimitConfig {
  maxRequests: number; // Maximum requests allowed
  windowMs: number; // Time window in milliseconds
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for rate limiting
// Key: identifier (userId or IP), Value: RateLimitEntry
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check if a request is rate limited
 * @returns Object with allowed boolean and rate limit headers
 */
export function checkRateLimit(
  identifier: string,
  config: InternalRateLimitConfig
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  headers: Record<string, string>;
} {
  cleanupOldEntries();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // If no entry or window expired, create new entry
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
      headers: getRateLimitHeaders(config.maxRequests - 1, newEntry.resetAt, config.maxRequests),
    };
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      headers: getRateLimitHeaders(0, entry.resetAt, config.maxRequests),
    };
  }

  // Increment counter
  entry.count++;
  const remaining = config.maxRequests - entry.count;

  return {
    allowed: true,
    remaining,
    resetAt: entry.resetAt,
    headers: getRateLimitHeaders(remaining, entry.resetAt, config.maxRequests),
  };
}

/**
 * Get rate limit headers for response
 */
function getRateLimitHeaders(
  remaining: number,
  resetAt: number,
  limit: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

// Predefined rate limit configurations per endpoint type
export const RATE_LIMITS = {
  // General API: 100 requests per minute
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
  // Search endpoints: 60 requests per minute
  search: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },
  // Generation endpoints: 10 requests per minute (expensive AI operations)
  generation: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
  // PDF export: 20 requests per minute
  pdf: {
    maxRequests: 20,
    windowMs: 60 * 1000,
  },
  // Webhooks: 100 requests per minute (adjusted for P1-8)
  webhook: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
  // Auth attempts: 10 per minute (prevent brute force)
  auth: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },
} as const;

/**
 * P1-8: Endpoint-specific rate limit configuration
 */
export interface RateLimitConfig {
  requests: number;
  windowMs: number;
  keyType?: 'user' | 'ip';
}

/**
 * P1-8: Result of rate limit check
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  keyType?: 'user' | 'ip';
  headers: Record<string, string>;
}

/**
 * Endpoint patterns and their rate limits
 */
const ENDPOINT_LIMITS: Array<{
  pattern: RegExp;
  config: RateLimitConfig;
}> = [
  // Generator - expensive AI operations
  {
    pattern: /^\/api\/generator/,
    config: { requests: 10, windowMs: 60000, keyType: 'user' },
  },
  // Auth endpoints - IP-based for brute force protection
  {
    pattern: /^\/api\/auth\//,
    config: { requests: 10, windowMs: 60000, keyType: 'ip' },
  },
  // Webhook endpoints - IP-based
  {
    pattern: /^\/api\/webhooks\//,
    config: { requests: 100, windowMs: 60000, keyType: 'ip' },
  },
  // Complaints search
  {
    pattern: /^\/api\/complaints/,
    config: { requests: 60, windowMs: 60000, keyType: 'user' },
  },
  // Patterns
  {
    pattern: /^\/api\/patterns/,
    config: { requests: 60, windowMs: 60000, keyType: 'user' },
  },
];

// Default limit for unmatched endpoints
const DEFAULT_LIMIT: RateLimitConfig = {
  requests: 100,
  windowMs: 60000,
  keyType: 'user',
};

/**
 * P1-8: Get rate limit configuration for a specific endpoint
 */
export function getEndpointLimit(path: string): RateLimitConfig {
  for (const { pattern, config } of ENDPOINT_LIMITS) {
    if (pattern.test(path)) {
      return config;
    }
  }
  return DEFAULT_LIMIT;
}

/**
 * P1-8: Generate rate limit key based on endpoint and identity
 */
export function getRateLimitKey(
  path: string,
  userId?: string,
  ipAddress?: string
): string {
  const config = getEndpointLimit(path);

  // Use IP for auth and webhook endpoints
  if (config.keyType === 'ip' || !userId) {
    return `ip:${ipAddress || 'unknown'}:${path}`;
  }

  return `user:${userId}:${path}`;
}

/**
 * P1-8: Check rate limit with unified interface
 */
export async function checkRateLimitAsync(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowMs } = params;

  // Handle zero limit
  if (limit <= 0) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + windowMs,
      headers: getRateLimitHeaders(0, Date.now() + windowMs, 0),
    };
  }

  const result = checkRateLimit(key, { maxRequests: limit, windowMs });

  // Extract keyType from key
  const keyType = key.startsWith('ip:') ? 'ip' : 'user';

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: result.resetAt,
    keyType,
    headers: result.headers,
  };
}


/**
 * Higher-order function to wrap a route handler with rate limiting
 */
export function withRateLimit<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  config: RateLimitConfig,
  getIdentifier: (...args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    const identifier = getIdentifier(...args);
    const result = checkRateLimit(identifier, {
      maxRequests: config.requests,
      windowMs: config.windowMs,
    });

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          type: 'https://api.caseradar.com/errors/rate-limited',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: `Too many requests. Please try again after ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/problem+json',
            ...result.headers,
          },
        }
      );
    }

    const response = await handler(...args);

    // Add rate limit headers to successful response
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    Object.entries(result.headers).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  }) as T;
}
