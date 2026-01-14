/**
 * Per-Endpoint Rate Limiting Tests
 * P1-8 Implementation - TDD
 *
 * Tests for configurable rate limiting per API endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkRateLimitAsync,
  getEndpointLimit,
  getRateLimitKey,
  RateLimitConfig,
  RateLimitResult,
} from '../rate-limit';

describe('Per-Endpoint Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEndpointLimit', () => {
    it('should return specific limit for generator endpoint', () => {
      const limit = getEndpointLimit('/api/generator');
      expect(limit).toMatchObject({
        requests: 10,
        windowMs: 60000, // 1 minute
      });
    });

    it('should return specific limit for complaints search', () => {
      const limit = getEndpointLimit('/api/complaints');
      expect(limit).toMatchObject({
        requests: 60,
        windowMs: 60000,
      });
    });

    it('should return specific limit for complaints search endpoint', () => {
      const limit = getEndpointLimit('/api/complaints/search');
      expect(limit).toMatchObject({
        requests: 60,
        windowMs: 60000,
      });
    });

    it('should return specific limit for patterns endpoint', () => {
      const limit = getEndpointLimit('/api/patterns');
      expect(limit).toMatchObject({
        requests: 60,
        windowMs: 60000,
      });
    });

    it('should return specific limit for auth endpoints', () => {
      const limit = getEndpointLimit('/api/auth/sign-in');
      expect(limit).toMatchObject({
        requests: 10,
        windowMs: 60000,
        keyType: 'ip', // IP-based for brute force prevention
      });
    });

    it('should return specific limit for webhooks endpoints', () => {
      const limit = getEndpointLimit('/api/webhooks/stripe');
      expect(limit).toMatchObject({
        requests: 100,
        windowMs: 60000,
        keyType: 'ip',
      });
    });

    it('should return default limit for unknown endpoints', () => {
      const limit = getEndpointLimit('/api/unknown');
      expect(limit).toMatchObject({
        requests: 100,
        windowMs: 60000,
      });
    });
  });

  describe('checkRateLimitAsync', () => {
    it('should allow requests under limit', async () => {
      const result = await checkRateLimitAsync({
        key: 'user:123:/api/generator',
        limit: 10,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should decrement remaining count on each request', async () => {
      const key = 'user:decrement-test:/api/generator';

      const result1 = await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });
      expect(result1.remaining).toBe(9);

      const result2 = await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });
      expect(result2.remaining).toBe(8);
    });

    it('should block requests over limit', async () => {
      const key = 'user:block-test:/api/generator';

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });
      }

      const result = await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after window expires', async () => {
      vi.useFakeTimers();

      const key = 'user:window-test:/api/generator';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });
      }

      // Verify blocked
      const blockedResult = await checkRateLimitAsync({
        key,
        limit: 10,
        windowMs: 60000,
      });
      expect(blockedResult.allowed).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(61000);

      const result = await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);

      vi.useRealTimers();
    });

    it('should track different keys separately', async () => {
      const key1 = 'user:separate1:/api/generator';
      const key2 = 'user:separate2:/api/generator';

      // Use up 5 requests on key1
      for (let i = 0; i < 5; i++) {
        await checkRateLimitAsync({ key: key1, limit: 10, windowMs: 60000 });
      }

      // key2 should still have full quota
      const result = await checkRateLimitAsync({
        key: key2,
        limit: 10,
        windowMs: 60000,
      });
      expect(result.remaining).toBe(9);
    });
  });

  describe('getRateLimitKey', () => {
    it('should generate user-based key by default', () => {
      const key = getRateLimitKey('/api/complaints', 'user_123', '192.168.1.1');
      expect(key).toBe('user:user_123:/api/complaints');
    });

    it('should generate IP-based key for auth endpoints', () => {
      const key = getRateLimitKey('/api/auth/sign-in', 'user_123', '192.168.1.1');
      expect(key).toBe('ip:192.168.1.1:/api/auth/sign-in');
    });

    it('should generate IP-based key for webhook endpoints', () => {
      const key = getRateLimitKey('/api/webhooks/stripe', undefined, '192.168.1.1');
      expect(key).toBe('ip:192.168.1.1:/api/webhooks/stripe');
    });

    it('should fallback to IP when no user ID', () => {
      const key = getRateLimitKey('/api/complaints', undefined, '192.168.1.1');
      expect(key).toBe('ip:192.168.1.1:/api/complaints');
    });
  });

  describe('Rate Limit Headers', () => {
    it('should return X-RateLimit headers', async () => {
      const result = await checkRateLimitAsync({
        key: 'user:headers-test:/api/generator',
        limit: 10,
        windowMs: 60000,
      });

      expect(result.headers).toMatchObject({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': expect.any(String),
        'X-RateLimit-Reset': expect.any(String),
      });
    });

    it('should include Retry-After header when blocked', async () => {
      const key = 'user:retry-test:/api/generator';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });
      }

      const result = await checkRateLimitAsync({ key, limit: 10, windowMs: 60000 });

      expect(result.headers['Retry-After']).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests safely', async () => {
      const key = 'user:concurrent:/api/generator';
      const limit = 10;
      const windowMs = 60000;

      // Fire 5 concurrent requests
      const results = await Promise.all([
        checkRateLimitAsync({ key, limit, windowMs }),
        checkRateLimitAsync({ key, limit, windowMs }),
        checkRateLimitAsync({ key, limit, windowMs }),
        checkRateLimitAsync({ key, limit, windowMs }),
        checkRateLimitAsync({ key, limit, windowMs }),
      ]);

      // All should be allowed
      expect(results.every((r) => r.allowed)).toBe(true);

      // Total remaining should reflect all requests
      const minRemaining = Math.min(...results.map((r) => r.remaining));
      expect(minRemaining).toBeLessThanOrEqual(5);
    });

    it('should handle zero limit', async () => {
      const result = await checkRateLimitAsync({
        key: 'user:zero:/api/test',
        limit: 0,
        windowMs: 60000,
      });

      expect(result.allowed).toBe(false);
    });

    it('should handle very short window', async () => {
      vi.useFakeTimers();

      const key = 'user:short:/api/test';

      await checkRateLimitAsync({ key, limit: 1, windowMs: 100 });
      const blocked = await checkRateLimitAsync({ key, limit: 1, windowMs: 100 });
      expect(blocked.allowed).toBe(false);

      vi.advanceTimersByTime(101);

      const result = await checkRateLimitAsync({ key, limit: 1, windowMs: 100 });
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });
});
