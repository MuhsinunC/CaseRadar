/**
 * Per-Service Timeout Configurations Tests
 * P3-6 Implementation - TDD
 *
 * Tests for service-specific timeout configurations and timeout wrapper function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getServiceTimeout,
  withTimeout,
  SERVICE_TIMEOUTS,
  ServiceName,
} from '../timeouts';

describe('Service Timeouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('SERVICE_TIMEOUTS', () => {
    it('should define timeout for each service', () => {
      expect(SERVICE_TIMEOUTS.openai).toBeDefined();
      expect(SERVICE_TIMEOUTS.anthropic).toBeDefined();
      expect(SERVICE_TIMEOUTS.nhtsa).toBeDefined();
      expect(SERVICE_TIMEOUTS.clerk).toBeDefined();
      expect(SERVICE_TIMEOUTS.stripe).toBeDefined();
      expect(SERVICE_TIMEOUTS.database).toBeDefined();
      expect(SERVICE_TIMEOUTS.default).toBeDefined();
    });

    it('should have reasonable timeout values', () => {
      // AI services can be slow
      expect(SERVICE_TIMEOUTS.openai).toBeGreaterThanOrEqual(5000);
      expect(SERVICE_TIMEOUTS.anthropic).toBeGreaterThanOrEqual(30000);

      // Auth should be fast
      expect(SERVICE_TIMEOUTS.clerk).toBeLessThanOrEqual(10000);

      // Database should be fast
      expect(SERVICE_TIMEOUTS.database).toBeLessThanOrEqual(10000);
    });

    it('should have OpenAI timeout of 30000ms', () => {
      expect(SERVICE_TIMEOUTS.openai).toBe(30000);
    });

    it('should have Anthropic timeout of 60000ms', () => {
      expect(SERVICE_TIMEOUTS.anthropic).toBe(60000);
    });

    it('should have NHTSA timeout of 10000ms', () => {
      expect(SERVICE_TIMEOUTS.nhtsa).toBe(10000);
    });

    it('should have Clerk timeout of 5000ms', () => {
      expect(SERVICE_TIMEOUTS.clerk).toBe(5000);
    });

    it('should have Stripe timeout of 10000ms', () => {
      expect(SERVICE_TIMEOUTS.stripe).toBe(10000);
    });

    it('should have Database timeout of 5000ms', () => {
      expect(SERVICE_TIMEOUTS.database).toBe(5000);
    });

    it('should have default timeout of 10000ms', () => {
      expect(SERVICE_TIMEOUTS.default).toBe(10000);
    });
  });

  describe('getServiceTimeout', () => {
    it('should return timeout for openai', () => {
      const timeout = getServiceTimeout('openai');
      expect(timeout).toBe(SERVICE_TIMEOUTS.openai);
    });

    it('should return timeout for anthropic', () => {
      const timeout = getServiceTimeout('anthropic');
      expect(timeout).toBe(SERVICE_TIMEOUTS.anthropic);
    });

    it('should return timeout for nhtsa', () => {
      const timeout = getServiceTimeout('nhtsa');
      expect(timeout).toBe(SERVICE_TIMEOUTS.nhtsa);
    });

    it('should return timeout for clerk', () => {
      const timeout = getServiceTimeout('clerk');
      expect(timeout).toBe(SERVICE_TIMEOUTS.clerk);
    });

    it('should return timeout for stripe', () => {
      const timeout = getServiceTimeout('stripe');
      expect(timeout).toBe(SERVICE_TIMEOUTS.stripe);
    });

    it('should return timeout for database', () => {
      const timeout = getServiceTimeout('database');
      expect(timeout).toBe(SERVICE_TIMEOUTS.database);
    });

    it('should return default for unknown service', () => {
      const timeout = getServiceTimeout('unknown' as ServiceName);
      expect(timeout).toBe(SERVICE_TIMEOUTS.default);
    });

    it('should return default for empty string', () => {
      const timeout = getServiceTimeout('' as ServiceName);
      expect(timeout).toBe(SERVICE_TIMEOUTS.default);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if within timeout', async () => {
      const result = await withTimeout(
        Promise.resolve('success'),
        1000
      );

      expect(result).toBe('success');
    });

    it('should resolve with complex objects', async () => {
      const data = { id: 1, name: 'test', items: [1, 2, 3] };
      const result = await withTimeout(
        Promise.resolve(data),
        1000
      );

      expect(result).toEqual(data);
    });

    it('should reject if exceeds timeout', async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('too late'), 2000);
      });

      const timeoutPromise = withTimeout(slowPromise, 100);

      vi.advanceTimersByTime(101);

      await expect(timeoutPromise).rejects.toThrow('timeout');

      vi.useRealTimers();
    });

    it('should include service name in timeout error', async () => {
      vi.useFakeTimers();

      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('too late'), 2000);
      });

      const timeoutPromise = withTimeout(slowPromise, 100, 'openai');

      vi.advanceTimersByTime(101);

      await expect(timeoutPromise).rejects.toThrow('openai');

      vi.useRealTimers();
    });

    it('should propagate errors from the promise', async () => {
      const failingPromise = Promise.reject(new Error('Internal error'));

      await expect(
        withTimeout(failingPromise, 1000)
      ).rejects.toThrow('Internal error');
    });

    it('should handle already resolved promises', async () => {
      const result = await withTimeout(
        Promise.resolve(42),
        100
      );

      expect(result).toBe(42);
    });

    it('should handle null and undefined results', async () => {
      const nullResult = await withTimeout(
        Promise.resolve(null),
        1000
      );
      expect(nullResult).toBeNull();

      const undefinedResult = await withTimeout(
        Promise.resolve(undefined),
        1000
      );
      expect(undefinedResult).toBeUndefined();
    });

    it('should use service-specific timeout when provided', async () => {
      vi.useFakeTimers();

      const fastPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('fast'), 100);
      });

      const timeoutPromise = withTimeout(
        fastPromise,
        getServiceTimeout('openai') // 30000ms
      );

      vi.advanceTimersByTime(101);

      const result = await timeoutPromise;
      expect(result).toBe('fast');

      vi.useRealTimers();
    });
  });

  describe('Integration', () => {
    it('should allow fetching with appropriate timeout', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'result' });

      const result = await withTimeout(
        mockFetch(),
        getServiceTimeout('nhtsa')
      );

      expect(result).toEqual({ data: 'result' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should timeout slow external service', async () => {
      vi.useFakeTimers();

      const slowService = new Promise<void>((resolve) => {
        setTimeout(resolve, 15000); // 15 seconds
      });

      const timeoutPromise = withTimeout(
        slowService,
        getServiceTimeout('clerk') // 5000ms
      );

      vi.advanceTimersByTime(5001);

      await expect(timeoutPromise).rejects.toThrow('timeout');

      vi.useRealTimers();
    });

    it('should handle concurrent requests with different timeouts', async () => {
      const results = await Promise.all([
        withTimeout(Promise.resolve('fast'), getServiceTimeout('clerk')),
        withTimeout(Promise.resolve('medium'), getServiceTimeout('nhtsa')),
        withTimeout(Promise.resolve('slow'), getServiceTimeout('openai')),
      ]);

      expect(results).toEqual(['fast', 'medium', 'slow']);
    });
  });
});
