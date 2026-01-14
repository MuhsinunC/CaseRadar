/**
 * Resilience Module
 * Exports circuit breaker and retry utilities for external API calls
 */

export {
  // Circuit breaker types
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerState,
  // Circuit breaker configs
  CIRCUIT_BREAKER_CONFIGS,
  // Circuit breaker functions
  getCircuitState,
  isCircuitAllowed,
  recordSuccess,
  recordFailure,
  resetCircuit,
  getAllCircuitStates,
  withCircuitBreaker,
  withCircuitBreakerAndFallback,
  // Circuit breaker errors
  CircuitOpenError,
} from './circuit-breaker';

export {
  // Retry types
  type RetryConfig,
  type RetryResult,
  // Retry configs
  RETRY_CONFIGS,
  // Retry functions
  calculateDelay,
  sleep,
  withRetry,
  withRetryDetailed,
  makeRetryable,
  withRetryAndCircuitBreaker,
} from './retry';
