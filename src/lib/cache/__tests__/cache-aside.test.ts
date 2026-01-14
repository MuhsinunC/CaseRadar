/**
 * Cache-Aside Pattern Tests
 * P3-5 Implementation - TDD
 *
 * Tests for cache-aside pattern with TTL support, invalidation, and statistics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cacheAside,
  invalidateCache,
  getCacheStats,
  clearCache,
  CacheOptions,
} from '../cache-aside';

describe('Cache-Aside Pattern', () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
    vi.useRealTimers();
  });

  describe('cacheAside', () => {
    it('should return cached value on hit', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      // First call - cache miss
      await cacheAside('test-key', fetchFn, { ttl: 60 });

      // Second call - cache hit
      const result = await cacheAside('test-key', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: 'test' });
    });

    it('should fetch on cache miss', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'fresh' });

      const result = await cacheAside('new-key', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ data: 'fresh' });
    });

    it('should respect TTL', async () => {
      vi.useFakeTimers();
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('ttl-key', fetchFn, { ttl: 60 });

      vi.advanceTimersByTime(61 * 1000);

      await cacheAside('ttl-key', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should handle fetch errors gracefully', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Fetch failed'));

      await expect(
        cacheAside('error-key', fetchFn, { ttl: 60 })
      ).rejects.toThrow('Fetch failed');
    });

    it('should use default TTL when not specified', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('default-ttl-key', fetchFn);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should cache different keys separately', async () => {
      const fetchFn1 = vi.fn().mockResolvedValue({ data: 'one' });
      const fetchFn2 = vi.fn().mockResolvedValue({ data: 'two' });

      await cacheAside('key-1', fetchFn1, { ttl: 60 });
      await cacheAside('key-2', fetchFn2, { ttl: 60 });

      const result1 = await cacheAside('key-1', fetchFn1, { ttl: 60 });
      const result2 = await cacheAside('key-2', fetchFn2, { ttl: 60 });

      expect(result1).toEqual({ data: 'one' });
      expect(result2).toEqual({ data: 'two' });
      expect(fetchFn1).toHaveBeenCalledTimes(1);
      expect(fetchFn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate specific key', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('invalidate-key', fetchFn, { ttl: 60 });
      await invalidateCache('invalidate-key');
      await cacheAside('invalidate-key', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('should invalidate by pattern', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('patterns:a', fetchFn, { ttl: 60 });
      await cacheAside('patterns:b', fetchFn, { ttl: 60 });
      await cacheAside('other:x', fetchFn, { ttl: 60 });

      await invalidateCache('patterns:*');

      // These should be fetched again
      await cacheAside('patterns:a', fetchFn, { ttl: 60 });
      await cacheAside('patterns:b', fetchFn, { ttl: 60 });
      // This should still be cached
      await cacheAside('other:x', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(5); // 3 initial + 2 refetches for patterns
    });

    it('should not throw on non-existent key', async () => {
      await expect(invalidateCache('non-existent')).resolves.not.toThrow();
    });

    it('should handle empty pattern', async () => {
      await expect(invalidateCache('*')).resolves.not.toThrow();
    });
  });

  describe('getCacheStats', () => {
    it('should return hit/miss statistics', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      // Generate some cache activity
      await cacheAside('stats-key', fetchFn, { ttl: 60 }); // miss
      await cacheAside('stats-key', fetchFn, { ttl: 60 }); // hit
      await cacheAside('stats-key', fetchFn, { ttl: 60 }); // hit

      const stats = await getCacheStats();

      expect(stats).toMatchObject({
        hits: expect.any(Number),
        misses: expect.any(Number),
        hitRate: expect.any(Number),
        size: expect.any(Number),
      });
    });

    it('should track correct hit count', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('hit-key', fetchFn, { ttl: 60 });
      await cacheAside('hit-key', fetchFn, { ttl: 60 });
      await cacheAside('hit-key', fetchFn, { ttl: 60 });

      const stats = await getCacheStats();
      expect(stats.hits).toBe(2);
    });

    it('should track correct miss count', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('miss-key-1', fetchFn, { ttl: 60 });
      await cacheAside('miss-key-2', fetchFn, { ttl: 60 });
      await cacheAside('miss-key-3', fetchFn, { ttl: 60 });

      const stats = await getCacheStats();
      expect(stats.misses).toBe(3);
    });

    it('should calculate hit rate', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('rate-key', fetchFn, { ttl: 60 }); // miss
      await cacheAside('rate-key', fetchFn, { ttl: 60 }); // hit
      await cacheAside('rate-key', fetchFn, { ttl: 60 }); // hit
      await cacheAside('rate-key', fetchFn, { ttl: 60 }); // hit

      const stats = await getCacheStats();
      expect(stats.hitRate).toBeCloseTo(0.75, 2); // 3 hits / 4 total
    });

    it('should track cache size', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('size-key-1', fetchFn, { ttl: 60 });
      await cacheAside('size-key-2', fetchFn, { ttl: 60 });

      const stats = await getCacheStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached values', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('clear-key-1', fetchFn, { ttl: 60 });
      await cacheAside('clear-key-2', fetchFn, { ttl: 60 });

      clearCache();

      await cacheAside('clear-key-1', fetchFn, { ttl: 60 });
      await cacheAside('clear-key-2', fetchFn, { ttl: 60 });

      expect(fetchFn).toHaveBeenCalledTimes(4);
    });

    it('should reset statistics', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });

      await cacheAside('stats-key', fetchFn, { ttl: 60 });
      await cacheAside('stats-key', fetchFn, { ttl: 60 });

      clearCache();

      const stats = await getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', async () => {
      const fetchFn = vi.fn().mockResolvedValue(null);

      const result = await cacheAside('null-key', fetchFn, { ttl: 60 });
      expect(result).toBeNull();
    });

    it('should handle undefined values', async () => {
      const fetchFn = vi.fn().mockResolvedValue(undefined);

      const result = await cacheAside('undefined-key', fetchFn, { ttl: 60 });
      expect(result).toBeUndefined();
    });

    it('should handle concurrent accesses', async () => {
      let callCount = 0;
      const fetchFn = vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { call: callCount };
      });

      const results = await Promise.all([
        cacheAside('concurrent-key', fetchFn, { ttl: 60 }),
        cacheAside('concurrent-key', fetchFn, { ttl: 60 }),
        cacheAside('concurrent-key', fetchFn, { ttl: 60 }),
      ]);

      // All should get the same result from the single fetch
      expect(results.every((r) => r.call === results[0].call)).toBe(true);
    });
  });
});
