/**
 * Idempotency Key Support
 * Based on architecture documentation: docs/architecture/02-api-routes.md
 *
 * Provides idempotency for non-idempotent operations (POST requests).
 * Keys are valid for 24 hours.
 */

import { NextResponse } from 'next/server';

/**
 * In-memory store for idempotency keys
 * In production, this should be replaced with Redis or a database
 */
interface IdempotencyEntry {
  response: {
    body: string;
    status: number;
    headers: Record<string, string>;
  };
  expiresAt: number;
}

const idempotencyStore = new Map<string, IdempotencyEntry>();

// TTL for idempotency keys: 24 hours
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Clean up expired entries periodically
 * Called on each check to prevent memory leaks
 */
function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt < now) {
      idempotencyStore.delete(key);
    }
  }
}

/**
 * Check if an idempotency key exists and return cached response if so
 * @param key The idempotency key from request header
 * @param organizationId The organization ID for key scoping
 * @returns Cached NextResponse if key exists, null otherwise
 */
export function checkIdempotencyKey(
  key: string | null,
  organizationId: string
): NextResponse | null {
  if (!key) {
    return null;
  }

  // Clean up expired entries
  cleanupExpired();

  // Scope key by organization to prevent cross-tenant conflicts
  const scopedKey = `${organizationId}:${key}`;
  const entry = idempotencyStore.get(scopedKey);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (entry.expiresAt < Date.now()) {
    idempotencyStore.delete(scopedKey);
    return null;
  }

  // Return cached response
  const response = new NextResponse(entry.response.body, {
    status: entry.response.status,
    headers: {
      ...entry.response.headers,
      'X-Idempotency-Replay': 'true',
    },
  });

  return response;
}

/**
 * Store a response for an idempotency key
 * @param key The idempotency key from request header
 * @param organizationId The organization ID for key scoping
 * @param response The response to cache
 */
export async function storeIdempotencyResult(
  key: string | null,
  organizationId: string,
  response: NextResponse
): Promise<void> {
  if (!key) {
    return;
  }

  // Scope key by organization
  const scopedKey = `${organizationId}:${key}`;

  // Clone response body for storage
  const body = await response.clone().text();

  // Extract headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  idempotencyStore.set(scopedKey, {
    response: {
      body,
      status: response.status,
      headers,
    },
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

/**
 * Get idempotency key from request
 * @param request The Next.js request object
 * @returns The idempotency key or null
 */
export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
}

/**
 * Clear all idempotency entries (useful for testing)
 */
export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}

/**
 * Get store size (useful for monitoring)
 */
export function getIdempotencyStoreSize(): number {
  return idempotencyStore.size;
}
