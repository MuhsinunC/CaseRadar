/**
 * Sign-in Rate Limiting Tests
 * P2-4 Implementation - TDD
 *
 * Tests for IP-based rate limiting on authentication endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAuthRateLimit,
  isIPBlocked,
  recordFailedAttempt,
  clearFailedAttempts,
  getFailedAttempts,
  AuthRateLimitResult,
  clearAllAuthLimits,
} from '../auth-rate-limit';

describe('Sign-in Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllAuthLimits(); // Reset state between tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkAuthRateLimit', () => {
    it('should allow first 10 attempts per minute', async () => {
      const ip = '192.168.1.1';

      for (let i = 0; i < 10; i++) {
        const result = await checkAuthRateLimit(ip);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block after 10 attempts per minute', async () => {
      const ip = '192.168.1.2';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await checkAuthRateLimit(ip);
      }

      const result = await checkAuthRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use IP address as key', async () => {
      const result = await checkAuthRateLimit('10.0.0.1');
      expect(result.key).toContain('10.0.0.1');
    });

    it('should track different IPs separately', async () => {
      const ip1 = '192.168.1.10';
      const ip2 = '192.168.1.11';

      // Use up ip1's quota
      for (let i = 0; i < 10; i++) {
        await checkAuthRateLimit(ip1);
      }

      // ip2 should still have full quota
      const result = await checkAuthRateLimit(ip2);
      expect(result.allowed).toBe(true);
    });

    it('should reset after window expires', async () => {
      vi.useFakeTimers();
      const ip = '192.168.1.12';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await checkAuthRateLimit(ip);
      }

      expect((await checkAuthRateLimit(ip)).allowed).toBe(false);

      // Advance time past window (1 minute)
      vi.advanceTimersByTime(61000);

      const result = await checkAuthRateLimit(ip);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Failed Attempt Tracking', () => {
    it('should track consecutive failed attempts', async () => {
      const ip = '192.168.1.3';

      await recordFailedAttempt(ip);
      await recordFailedAttempt(ip);
      await recordFailedAttempt(ip);

      const attempts = await getFailedAttempts(ip);
      expect(attempts).toBe(3);
    });

    it('should block IP after 5 consecutive failures', async () => {
      const ip = '192.168.1.4';

      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(ip);
      }

      const blocked = await isIPBlocked(ip);
      expect(blocked).toBe(true);
    });

    it('should not block before 5 failures', async () => {
      const ip = '192.168.1.13';

      for (let i = 0; i < 4; i++) {
        await recordFailedAttempt(ip);
      }

      const blocked = await isIPBlocked(ip);
      expect(blocked).toBe(false);
    });

    it('should unblock after 15 minutes', async () => {
      vi.useFakeTimers();
      const ip = '192.168.1.5';

      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(ip);
      }

      expect(await isIPBlocked(ip)).toBe(true);

      vi.advanceTimersByTime(16 * 60 * 1000);

      expect(await isIPBlocked(ip)).toBe(false);
    });

    it('should clear attempts on successful login', async () => {
      const ip = '192.168.1.6';

      await recordFailedAttempt(ip);
      await recordFailedAttempt(ip);

      await clearFailedAttempts(ip);

      const attempts = await getFailedAttempts(ip);
      expect(attempts).toBe(0);
    });

    it('should return 0 for IP with no failures', async () => {
      const attempts = await getFailedAttempts('never-seen-ip');
      expect(attempts).toBe(0);
    });
  });

  describe('Response Headers', () => {
    it('should include Retry-After header when blocked', async () => {
      const ip = '192.168.1.7';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await checkAuthRateLimit(ip);
      }

      const result = await checkAuthRateLimit(ip);
      expect(result.headers['Retry-After']).toBeDefined();
    });

    it('should include X-RateLimit headers', async () => {
      const ip = '192.168.1.14';
      const result = await checkAuthRateLimit(ip);

      expect(result.headers['X-RateLimit-Limit']).toBe('10');
      expect(result.headers['X-RateLimit-Remaining']).toBeDefined();
    });

    it('should show remaining requests', async () => {
      const ip = '192.168.1.15';

      const result1 = await checkAuthRateLimit(ip);
      expect(result1.headers['X-RateLimit-Remaining']).toBe('9');

      const result2 = await checkAuthRateLimit(ip);
      expect(result2.headers['X-RateLimit-Remaining']).toBe('8');
    });
  });

  describe('IP Blocking', () => {
    it('should reject requests from blocked IPs', async () => {
      const ip = '192.168.1.8';

      // Block the IP
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(ip);
      }

      const result = await checkAuthRateLimit(ip);
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should include block reason in result', async () => {
      const ip = '192.168.1.9';

      // Block the IP
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(ip);
      }

      const result = await checkAuthRateLimit(ip);
      expect(result.reason).toContain('blocked');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty IP', async () => {
      const result = await checkAuthRateLimit('');
      expect(result.key).toContain('unknown');
    });

    it('should handle IPv6 addresses', async () => {
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const result = await checkAuthRateLimit(ipv6);

      expect(result.allowed).toBe(true);
      expect(result.key).toContain(ipv6);
    });

    it('should handle concurrent requests', async () => {
      const ip = '192.168.1.16';

      // Fire concurrent requests
      const results = await Promise.all([
        checkAuthRateLimit(ip),
        checkAuthRateLimit(ip),
        checkAuthRateLimit(ip),
        checkAuthRateLimit(ip),
        checkAuthRateLimit(ip),
      ]);

      // All should be allowed (within limit)
      expect(results.every((r) => r.allowed)).toBe(true);
    });
  });
});
