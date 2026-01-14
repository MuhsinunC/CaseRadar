/**
 * Redis-Backed Rate Limiting Tests
 * P2-11 Implementation - TDD
 *
 * Tests for distributed rate limiting using Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RedisRateLimiter,
  createRedisRateLimiter,
  withRedisRateLimit,
  extractRateLimitKey,
  RateLimitResult,
} from '../redis-rate-limit';

describe('RedisRateLimiter', () => {
  let limiter: RedisRateLimiter;

  beforeEach(() => {
    limiter = createRedisRateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      keyPrefix: 'rl:test:',
    });
  });

  afterEach(async () => {
    await limiter.close();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const result = await limiter.check('user:123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
      expect(result.limit).toBe(100);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it('should decrement remaining count', async () => {
      await limiter.check('user:decrement');
      const result = await limiter.check('user:decrement');

      expect(result.remaining).toBe(98);
    });

    it('should block requests exceeding limit', async () => {
      // Make 100 requests to reach limit
      for (let i = 0; i < 100; i++) {
        await limiter.check('user:limited');
      }

      const result = await limiter.check('user:limited');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should include retry-after when blocked', async () => {
      // Exhaust the limit
      for (let i = 0; i < 100; i++) {
        await limiter.check('user:retry');
      }

      const result = await limiter.check('user:retry');

      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60); // seconds
    });
  });

  describe('Key Generation', () => {
    it('should generate correct key for IP-based limiting', () => {
      const key = limiter.getKey('ip:192.168.1.1');
      expect(key).toBe('rl:test:ip:192.168.1.1');
    });

    it('should generate correct key for user-based limiting', () => {
      const key = limiter.getKey('user:user_123');
      expect(key).toBe('rl:test:user:user_123');
    });

    it('should generate correct key for endpoint-based limiting', () => {
      const key = limiter.getKey('endpoint:/api/complaints');
      expect(key).toBe('rl:test:endpoint:/api/complaints');
    });

    it('should handle special characters in keys', () => {
      const key = limiter.getKey('user:test@example.com');
      expect(key).toBe('rl:test:user:test@example.com');
    });
  });

  describe('Window Reset', () => {
    it('should return resetAt time in the future', async () => {
      const result = await limiter.check('user:reset-test');

      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return resetAt within window duration', async () => {
      const result = await limiter.check('user:window-test');
      const maxResetAt = Date.now() + 60000; // windowMs

      expect(result.resetAt.getTime()).toBeLessThanOrEqual(maxResetAt);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should return all required header values', async () => {
      const result = await limiter.check('user:headers');

      expect(result).toMatchObject({
        limit: expect.any(Number),
        remaining: expect.any(Number),
        resetAt: expect.any(Date),
        allowed: expect.any(Boolean),
      });
    });

    it('should return correct limit value', async () => {
      const result = await limiter.check('user:limit-check');
      expect(result.limit).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        limiter.check('user:concurrent')
      );

      const results = await Promise.all(promises);

      // All should be allowed (we have 100 request limit)
      expect(results.every((r) => r.allowed)).toBe(true);

      // Remaining should decrease
      const remainingCounts = results.map((r) => r.remaining);
      expect(new Set(remainingCounts).size).toBeGreaterThan(1);
    });

    it('should handle empty key', async () => {
      const result = await limiter.check('');
      expect(result).toBeDefined();
    });
  });
});

describe('extractRateLimitKey', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const key = extractRateLimitKey(
      new Request('http://localhost'),
      { headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }) }
    );
    expect(key).toContain('1.2.3.4');
  });

  it('should extract user ID when available', () => {
    const key = extractRateLimitKey(
      new Request('http://localhost'),
      { userId: 'user_123' }
    );
    expect(key).toContain('user_123');
  });

  it('should prefer user ID over IP when both available', () => {
    const key = extractRateLimitKey(
      new Request('http://localhost'),
      {
        userId: 'user_123',
        headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }),
      }
    );
    expect(key).toContain('user_123');
    expect(key).not.toContain('1.2.3.4');
  });

  it('should fallback to unknown when no identifier available', () => {
    const key = extractRateLimitKey(
      new Request('http://localhost'),
      {}
    );
    expect(key).toContain('unknown');
  });

  it('should handle multiple IPs in x-forwarded-for', () => {
    const key = extractRateLimitKey(
      new Request('http://localhost'),
      { headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' }) }
    );
    expect(key).toContain('1.2.3.4'); // First IP is the client
  });
});

describe('withRedisRateLimit middleware', () => {
  it('should be a function', () => {
    const middleware = withRedisRateLimit(
      async () => Response.json({ ok: true }),
      { maxRequests: 10, windowMs: 60000 }
    );

    expect(middleware).toBeInstanceOf(Function);
  });

  it('should pass through to handler when under limit', async () => {
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const middleware = withRedisRateLimit(handler, {
      maxRequests: 10,
      windowMs: 60000,
    });

    const request = new Request('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });

    const response = await middleware(request);

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should include rate limit headers in response', async () => {
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const middleware = withRedisRateLimit(handler, {
      maxRequests: 100,
      windowMs: 60000,
    });

    const request = new Request('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.5' },
    });

    const response = await middleware(request);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
  });
});

describe('Graceful Degradation', () => {
  it('should use fallback mode flag when enabled', async () => {
    const limiter = createRedisRateLimiter({
      windowMs: 60000,
      maxRequests: 100,
      keyPrefix: 'rl:fallback:',
      useFallback: true,
    });

    const result = await limiter.check('user:fallback');

    expect(result.fallback).toBe(true);

    await limiter.close();
  });
});
