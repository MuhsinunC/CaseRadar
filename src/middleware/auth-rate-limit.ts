/**
 * Sign-in Rate Limiting
 * P2-4 Implementation
 *
 * IP-based rate limiting for authentication endpoints to prevent
 * brute force attacks.
 */

/**
 * Configuration for auth rate limiting
 */
const AUTH_RATE_LIMIT_CONFIG = {
  /** Maximum requests per window */
  maxRequests: 10,
  /** Window duration in milliseconds (1 minute) */
  windowMs: 60 * 1000,
  /** Maximum consecutive failed attempts before blocking */
  maxFailedAttempts: 5,
  /** Block duration in milliseconds (15 minutes) */
  blockDurationMs: 15 * 60 * 1000,
};

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Failed attempt entry for tracking consecutive failures
 */
interface FailedAttemptEntry {
  count: number;
  blockedUntil: number | null;
}

/**
 * Result of auth rate limit check
 */
export interface AuthRateLimitResult {
  allowed: boolean;
  key: string;
  retryAfter?: number;
  blocked?: boolean;
  reason?: string;
  headers: Record<string, string>;
}

// In-memory stores
const rateLimitStore = new Map<string, RateLimitEntry>();
const failedAttemptsStore = new Map<string, FailedAttemptEntry>();

/**
 * Generate rate limit key from IP
 */
function generateKey(ip: string): string {
  const normalizedIP = ip || 'unknown';
  return `auth:${normalizedIP}`;
}

/**
 * Check if an IP is blocked due to failed attempts
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  const entry = failedAttemptsStore.get(ip);
  if (!entry) return false;

  // Check if block has expired
  if (entry.blockedUntil && entry.blockedUntil > Date.now()) {
    return true;
  }

  // If block expired, clear the entry
  if (entry.blockedUntil && entry.blockedUntil <= Date.now()) {
    failedAttemptsStore.delete(ip);
    return false;
  }

  // Check if reached failure threshold
  return entry.count >= AUTH_RATE_LIMIT_CONFIG.maxFailedAttempts;
}

/**
 * Record a failed authentication attempt
 */
export async function recordFailedAttempt(ip: string): Promise<void> {
  const entry = failedAttemptsStore.get(ip) || { count: 0, blockedUntil: null };
  entry.count++;

  // Block if threshold reached
  if (entry.count >= AUTH_RATE_LIMIT_CONFIG.maxFailedAttempts) {
    entry.blockedUntil = Date.now() + AUTH_RATE_LIMIT_CONFIG.blockDurationMs;
  }

  failedAttemptsStore.set(ip, entry);
}

/**
 * Clear failed attempts for an IP (on successful login)
 */
export async function clearFailedAttempts(ip: string): Promise<void> {
  failedAttemptsStore.delete(ip);
}

/**
 * Get the number of failed attempts for an IP
 */
export async function getFailedAttempts(ip: string): Promise<number> {
  const entry = failedAttemptsStore.get(ip);
  return entry?.count || 0;
}

/**
 * Check auth rate limit for an IP
 */
export async function checkAuthRateLimit(
  ip: string
): Promise<AuthRateLimitResult> {
  const key = generateKey(ip);
  const now = Date.now();

  // Check if IP is blocked
  if (await isIPBlocked(ip)) {
    const entry = failedAttemptsStore.get(ip);
    const retryAfter = entry?.blockedUntil
      ? Math.ceil((entry.blockedUntil - now) / 1000)
      : AUTH_RATE_LIMIT_CONFIG.blockDurationMs / 1000;

    return {
      allowed: false,
      key,
      retryAfter,
      blocked: true,
      reason: 'IP blocked due to too many failed attempts',
      headers: {
        'X-RateLimit-Limit': String(AUTH_RATE_LIMIT_CONFIG.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((entry?.blockedUntil || now) / 1000)),
        'Retry-After': String(retryAfter),
      },
    };
  }

  // Check rate limit
  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + AUTH_RATE_LIMIT_CONFIG.windowMs,
    };
    rateLimitStore.set(key, newEntry);

    return {
      allowed: true,
      key,
      headers: {
        'X-RateLimit-Limit': String(AUTH_RATE_LIMIT_CONFIG.maxRequests),
        'X-RateLimit-Remaining': String(AUTH_RATE_LIMIT_CONFIG.maxRequests - 1),
        'X-RateLimit-Reset': String(Math.ceil(newEntry.resetAt / 1000)),
      },
    };
  }

  // Check if limit exceeded
  if (entry.count >= AUTH_RATE_LIMIT_CONFIG.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    return {
      allowed: false,
      key,
      retryAfter,
      reason: 'Rate limit exceeded',
      headers: {
        'X-RateLimit-Limit': String(AUTH_RATE_LIMIT_CONFIG.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        'Retry-After': String(retryAfter),
      },
    };
  }

  // Increment counter
  entry.count++;
  const remaining = AUTH_RATE_LIMIT_CONFIG.maxRequests - entry.count;

  return {
    allowed: true,
    key,
    headers: {
      'X-RateLimit-Limit': String(AUTH_RATE_LIMIT_CONFIG.maxRequests),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    },
  };
}

/**
 * Clear all auth rate limits (for testing)
 */
export function clearAllAuthLimits(): void {
  rateLimitStore.clear();
  failedAttemptsStore.clear();
}

/**
 * Create 429 response for rate limit exceeded
 */
export function createRateLimitResponse(
  result: AuthRateLimitResult
): Response {
  return new Response(
    JSON.stringify({
      type: 'https://api.caseradar.com/errors/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: result.reason || 'Rate limit exceeded. Please try again later.',
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
