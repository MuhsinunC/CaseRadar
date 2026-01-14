/**
 * Retry Logic Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryConfig,
  calculateDelay,
  withRetry,
  withRetryDetailed,
  makeRetryable,
  RETRY_CONFIGS,
} from '../retry';

describe('Retry Logic', () => {
  const testConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    jitterMs: 0, // No jitter for predictable tests
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe('calculateDelay', () => {
    it('should calculate exponential delay', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitterMs: 0,
      };

      expect(calculateDelay(0, config)).toBe(100);  // 100 * 2^0
      expect(calculateDelay(1, config)).toBe(200);  // 100 * 2^1
      expect(calculateDelay(2, config)).toBe(400);  // 100 * 2^2
      expect(calculateDelay(3, config)).toBe(800);  // 100 * 2^3
    });

    it('should cap at maxDelay', () => {
      const config: RetryConfig = {
        maxRetries: 10,
        baseDelayMs: 100,
        maxDelayMs: 500,
        jitterMs: 0,
      };

      expect(calculateDelay(5, config)).toBe(500); // Would be 3200, capped at 500
    });

    it('should add jitter within bounds', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 100,
        maxDelayMs: 10000,
        jitterMs: 50,
      };

      // Run multiple times to test jitter variance
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(calculateDelay(0, config));
      }

      // All delays should be within jitter range (100 ± 50)
      expect(delays.every((d) => d >= 50 && d <= 150)).toBe(true);
      // Should have some variance (not all the same)
      expect(new Set(delays).size).toBeGreaterThan(1);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt if no error', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(testConfig, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValue('success');

      const result = await withRetry(testConfig, fn);

      // Fast-forward timers
      await vi.runAllTimersAsync();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 500 });

      await expect(withRetry(testConfig, fn)).rejects.toEqual({ status: 500 });
      expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 400 }); // Client error - not retryable

      await expect(withRetry(testConfig, fn)).rejects.toEqual({ status: 400 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit errors (429)', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValue('success');

      const result = await withRetry(testConfig, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on timeout errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ message: 'Request timeout' })
        .mockResolvedValue('success');

      const result = await withRetry(testConfig, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      await withRetry(testConfig, fn, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, { status: 500 }, expect.any(Number));
    });
  });

  describe('withRetryDetailed', () => {
    it('should return success result with attempts', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetryDetailed(testConfig, fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDelayMs).toBe(0);
    });

    it('should return failure result with attempts and delay', async () => {
      const fn = vi.fn().mockRejectedValue({ status: 500 });
      const result = await withRetryDetailed(testConfig, fn);

      expect(result.success).toBe(false);
      expect(result.error).toEqual({ status: 500 });
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
      expect(result.totalDelayMs).toBeGreaterThan(0);
    });

    it('should track total delay correctly', async () => {
      const configNoJitter: RetryConfig = {
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterMs: 0,
      };

      const fn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValue('success');

      const result = await withRetryDetailed(configNoJitter, fn);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.totalDelayMs).toBe(300); // 100 + 200
    });
  });

  describe('makeRetryable', () => {
    it('should create retryable version of function', async () => {
      const originalFn = vi.fn()
        .mockRejectedValueOnce({ status: 500 })
        .mockResolvedValue('success');

      const retryableFn = makeRetryable(testConfig, originalFn);
      const result = await retryableFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('Custom Retry Conditions', () => {
    it('should use custom retryable errors function', async () => {
      const customConfig: RetryConfig = {
        ...testConfig,
        retryableErrors: (error: unknown) => {
          const e = error as { code?: string };
          return e.code === 'CUSTOM_RETRY';
        },
      };

      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'CUSTOM_RETRY' })
        .mockResolvedValue('success');

      const result = await withRetry(customConfig, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry when custom function returns false', async () => {
      const customConfig: RetryConfig = {
        ...testConfig,
        retryableErrors: () => false,
      };

      const fn = vi.fn().mockRejectedValue({ status: 500 });

      await expect(withRetry(customConfig, fn)).rejects.toEqual({ status: 500 });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Default Configurations', () => {
    it('should have configs for OpenAI embedding', () => {
      expect(RETRY_CONFIGS.openaiEmbedding).toBeDefined();
      expect(RETRY_CONFIGS.openaiEmbedding.maxRetries).toBe(3);
    });

    it('should have configs for Anthropic generation', () => {
      expect(RETRY_CONFIGS.anthropicGeneration).toBeDefined();
      expect(RETRY_CONFIGS.anthropicGeneration.maxRetries).toBe(3);
    });

    it('should have configs for NHTSA fetch', () => {
      expect(RETRY_CONFIGS.nhtsaFetch).toBeDefined();
      expect(RETRY_CONFIGS.nhtsaFetch.maxRetries).toBe(5);
    });

    it('should have configs for database queries', () => {
      expect(RETRY_CONFIGS.databaseQuery).toBeDefined();
      expect(RETRY_CONFIGS.databaseQuery.maxRetries).toBe(2);
    });

    it('should have configs for Stripe API', () => {
      expect(RETRY_CONFIGS.stripeApi).toBeDefined();
      expect(RETRY_CONFIGS.stripeApi.maxRetries).toBe(3);
    });
  });
});
