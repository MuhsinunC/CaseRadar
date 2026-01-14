/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreakerConfig,
  getCircuitState,
  isCircuitAllowed,
  recordSuccess,
  recordFailure,
  resetCircuit,
  withCircuitBreaker,
  withCircuitBreakerAndFallback,
  CircuitOpenError,
  CIRCUIT_BREAKER_CONFIGS,
} from '../circuit-breaker';

describe('Circuit Breaker', () => {
  const testConfig: CircuitBreakerConfig = {
    name: 'test-service',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,         // 1 second for testing
    monitoringWindow: 5000, // 5 seconds
  };

  beforeEach(() => {
    resetCircuit(testConfig.name);
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const state = getCircuitState(testConfig.name);
      expect(state.state).toBe('CLOSED');
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });

    it('should allow requests when closed', () => {
      expect(isCircuitAllowed(testConfig)).toBe(true);
    });
  });

  describe('Failure Recording', () => {
    it('should increment failure count', () => {
      recordFailure(testConfig);
      const state = getCircuitState(testConfig.name);
      expect(state.failures).toBe(1);
    });

    it('should open circuit after threshold exceeded', () => {
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }
      const state = getCircuitState(testConfig.name);
      expect(state.state).toBe('OPEN');
    });

    it('should not allow requests when open', () => {
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }
      expect(isCircuitAllowed(testConfig)).toBe(false);
    });
  });

  describe('Success Recording', () => {
    it('should reset failure count on success', () => {
      recordFailure(testConfig);
      recordFailure(testConfig);
      recordSuccess(testConfig);
      const state = getCircuitState(testConfig.name);
      expect(state.failures).toBe(0);
    });
  });

  describe('Half-Open State', () => {
    it('should transition to half-open after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }
      expect(getCircuitState(testConfig.name).state).toBe('OPEN');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, testConfig.timeout + 100));

      // Should now allow test request (transitioning to half-open)
      expect(isCircuitAllowed(testConfig)).toBe(true);
      expect(getCircuitState(testConfig.name).state).toBe('HALF_OPEN');
    });

    it('should close after success threshold in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, testConfig.timeout + 100));
      isCircuitAllowed(testConfig); // Trigger transition to half-open

      // Record successes
      for (let i = 0; i < testConfig.successThreshold; i++) {
        recordSuccess(testConfig);
      }

      expect(getCircuitState(testConfig.name).state).toBe('CLOSED');
    });

    it('should re-open on failure in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, testConfig.timeout + 100));
      isCircuitAllowed(testConfig); // Trigger transition to half-open

      // Record failure
      recordFailure(testConfig);

      expect(getCircuitState(testConfig.name).state).toBe('OPEN');
    });
  });

  describe('withCircuitBreaker', () => {
    it('should execute function when circuit is closed', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withCircuitBreaker(testConfig, fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should throw CircuitOpenError when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }

      const fn = vi.fn().mockResolvedValue('success');
      await expect(withCircuitBreaker(testConfig, fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should record success on successful execution', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await withCircuitBreaker(testConfig, fn);
      // No failures recorded
      expect(getCircuitState(testConfig.name).failures).toBe(0);
    });

    it('should record failure on failed execution', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('test error'));
      await expect(withCircuitBreaker(testConfig, fn)).rejects.toThrow('test error');
      expect(getCircuitState(testConfig.name).failures).toBe(1);
    });
  });

  describe('withCircuitBreakerAndFallback', () => {
    it('should use fallback when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        recordFailure(testConfig);
      }

      const fn = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockReturnValue('fallback');

      const result = await withCircuitBreakerAndFallback(testConfig, fn, fallback);
      expect(result).toBe('fallback');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should not use fallback when circuit is closed', async () => {
      const fn = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockReturnValue('fallback');

      const result = await withCircuitBreakerAndFallback(testConfig, fn, fallback);
      expect(result).toBe('primary');
      expect(fn).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should throw non-circuit errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('real error'));
      const fallback = vi.fn().mockReturnValue('fallback');

      await expect(withCircuitBreakerAndFallback(testConfig, fn, fallback)).rejects.toThrow('real error');
    });
  });

  describe('CircuitOpenError', () => {
    it('should have correct properties', () => {
      const error = new CircuitOpenError('test', 5000);
      expect(error.circuitName).toBe('test');
      expect(error.retryAfter).toBe(5);
      expect(error.message).toContain('test');
    });
  });

  describe('Default Configurations', () => {
    it('should have configs for OpenAI', () => {
      expect(CIRCUIT_BREAKER_CONFIGS.openai).toBeDefined();
      expect(CIRCUIT_BREAKER_CONFIGS.openai.failureThreshold).toBe(5);
    });

    it('should have configs for Anthropic', () => {
      expect(CIRCUIT_BREAKER_CONFIGS.anthropic).toBeDefined();
      expect(CIRCUIT_BREAKER_CONFIGS.anthropic.failureThreshold).toBe(5);
    });

    it('should have configs for NHTSA', () => {
      expect(CIRCUIT_BREAKER_CONFIGS.nhtsa).toBeDefined();
      expect(CIRCUIT_BREAKER_CONFIGS.nhtsa.failureThreshold).toBe(10);
    });

    it('should have configs for Stripe', () => {
      expect(CIRCUIT_BREAKER_CONFIGS.stripe).toBeDefined();
      expect(CIRCUIT_BREAKER_CONFIGS.stripe.failureThreshold).toBe(3);
    });
  });
});
