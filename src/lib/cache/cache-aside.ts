/**
 * Cache-Aside Pattern
 * P3-5 Implementation
 *
 * Provides cache-aside pattern with TTL support, invalidation, and statistics.
 */

/**
 * Cache entry
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

/**
 * Default TTL in seconds
 */
const DEFAULT_TTL = 300; // 5 minutes

/**
 * Global cache type for persistence across Hot Reloads
 * In Next.js dev mode, modules are frequently reloaded, which would
 * clear a regular Map. Using globalThis persists the cache.
 */
interface GlobalCache {
  cache: Map<string, CacheEntry<unknown>>;
  pending: Map<string, Promise<unknown>>;
  stats: { hits: number; misses: number };
}

// Extend globalThis type
declare global {
  // eslint-disable-next-line no-var
  var __caseradar_cache: GlobalCache | undefined;
}

/**
 * Get or create the global cache (persists across Hot Reloads in dev)
 */
function getGlobalCache(): GlobalCache {
  if (!globalThis.__caseradar_cache) {
    globalThis.__caseradar_cache = {
      cache: new Map<string, CacheEntry<unknown>>(),
      pending: new Map<string, Promise<unknown>>(),
      stats: { hits: 0, misses: 0 },
    };
  }
  return globalThis.__caseradar_cache;
}

/**
 * In-memory cache storage (persisted via globalThis)
 */
const cache = getGlobalCache().cache;

/**
 * Pending promises for deduplication
 */
const pending = getGlobalCache().pending;

/**
 * Statistics tracking
 */
const stats = getGlobalCache().stats;

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  cache.clear();
  pending.clear();
  const globalCache = getGlobalCache();
  globalCache.stats.hits = 0;
  globalCache.stats.misses = 0;
}

/**
 * Cache-aside pattern implementation
 *
 * Checks cache first, fetches from source on miss.
 *
 * @param key - Cache key
 * @param fetchFn - Function to fetch data on cache miss
 * @param options - Cache options
 * @returns Cached or fetched data
 */
export async function cacheAside<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const now = Date.now();

  // Check for cached value
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    stats.hits++;
    return entry.value;
  }

  // Check for pending request (deduplication)
  const pendingPromise = pending.get(key);
  if (pendingPromise) {
    stats.hits++;
    return pendingPromise as Promise<T>;
  }

  // Cache miss
  stats.misses++;

  // Fetch and cache
  const promise = fetchFn().then((value) => {
    cache.set(key, {
      value,
      expiresAt: now + ttl * 1000,
    });
    pending.delete(key);
    return value;
  });

  pending.set(key, promise);

  try {
    return await promise;
  } catch (error) {
    pending.delete(key);
    throw error;
  }
}

/**
 * Invalidate cache by key or pattern
 *
 * @param keyOrPattern - Exact key or pattern with wildcard (*)
 */
export async function invalidateCache(keyOrPattern: string): Promise<void> {
  if (keyOrPattern.includes('*')) {
    // Pattern invalidation
    const prefix = keyOrPattern.replace('*', '');
    const keysToDelete: string[] = [];

    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      cache.delete(key);
    }
  } else {
    // Exact key invalidation
    cache.delete(keyOrPattern);
  }
}

/**
 * Get cache statistics
 *
 * @returns Cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const total = stats.hits + stats.misses;

  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total > 0 ? stats.hits / total : 0,
    size: cache.size,
  };
}

/**
 * Get a cached value directly (without fetching)
 *
 * @param key - Cache key
 * @returns Cached value or undefined
 */
export function getCachedValue<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && entry.expiresAt > now) {
    return entry.value;
  }

  return undefined;
}

/**
 * Set a cached value directly
 *
 * @param key - Cache key
 * @param value - Value to cache
 * @param options - Cache options
 */
export function setCachedValue<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): void {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const now = Date.now();

  cache.set(key, {
    value,
    expiresAt: now + ttl * 1000,
  });
}

/**
 * Check if a key exists and is not expired
 *
 * @param key - Cache key
 * @returns Whether key exists and is valid
 */
export function hasKey(key: string): boolean {
  const entry = cache.get(key);
  const now = Date.now();

  return entry !== undefined && entry.expiresAt > now;
}
