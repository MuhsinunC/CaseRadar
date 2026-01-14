/**
 * Circuit Breaker Pattern
 * Implements circuit breaker for external API calls to prevent cascading failures
 * Based on architecture documentation: docs/architecture/12-reliability-scalability.md
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;   // Number of failures to open circuit
  successThreshold: number;   // Successes in half-open to close
  timeout: number;            // Time in ms before testing recovery
  monitoringWindow: number;   // Window for counting failures
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastStateChange: number;
}

// Circuit breaker configurations from architecture docs
export const CIRCUIT_BREAKER_CONFIGS: Record<string, CircuitBreakerConfig> = {
  openai: {
    name: 'openai',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,            // 30 seconds
    monitoringWindow: 60000,   // 60 seconds
  },
  anthropic: {
    name: 'anthropic',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    monitoringWindow: 60000,
  },
  nhtsa: {
    name: 'nhtsa',
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 60000,            // 60 seconds
    monitoringWindow: 300000,  // 5 minutes
  },
  stripe: {
    name: 'stripe',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000,
    monitoringWindow: 60000,
  },
};

// In-memory state storage (consider Redis for distributed systems)
const circuitStates: Map<string, CircuitBreakerState> = new Map();

/**
 * Initialize circuit state if not exists
 */
function initializeState(name: string): CircuitBreakerState {
  const state: CircuitBreakerState = {
    state: 'CLOSED',
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastStateChange: Date.now(),
  };
  circuitStates.set(name, state);
  return state;
}

/**
 * Get current circuit state
 */
export function getCircuitState(name: string): CircuitBreakerState {
  return circuitStates.get(name) || initializeState(name);
}

/**
 * Check if circuit allows request
 */
export function isCircuitAllowed(config: CircuitBreakerConfig): boolean {
  const state = getCircuitState(config.name);
  const now = Date.now();

  switch (state.state) {
    case 'CLOSED':
      return true;

    case 'OPEN':
      // Check if timeout has elapsed to transition to half-open
      if (now - state.lastStateChange >= config.timeout) {
        transitionToHalfOpen(config.name);
        return true; // Allow test request
      }
      return false;

    case 'HALF_OPEN':
      // Allow limited requests to test recovery
      return state.successes < config.successThreshold;

    default:
      return true;
  }
}

/**
 * Record successful request
 */
export function recordSuccess(config: CircuitBreakerConfig): void {
  const state = getCircuitState(config.name);

  if (state.state === 'HALF_OPEN') {
    state.successes++;
    if (state.successes >= config.successThreshold) {
      transitionToClosed(config.name);
    }
  }

  // Reset failure count on success in closed state
  if (state.state === 'CLOSED') {
    state.failures = 0;
  }

  circuitStates.set(config.name, state);
}

/**
 * Record failed request
 */
export function recordFailure(config: CircuitBreakerConfig): void {
  const state = getCircuitState(config.name);
  const now = Date.now();

  // Reset failures if outside monitoring window
  if (now - state.lastFailureTime > config.monitoringWindow) {
    state.failures = 0;
  }

  state.failures++;
  state.lastFailureTime = now;

  if (state.state === 'HALF_OPEN') {
    // Any failure in half-open immediately opens circuit
    transitionToOpen(config.name);
  } else if (state.state === 'CLOSED' && state.failures >= config.failureThreshold) {
    transitionToOpen(config.name);
  }

  circuitStates.set(config.name, state);
}

/**
 * Transition to OPEN state
 */
function transitionToOpen(name: string): void {
  const state = getCircuitState(name);
  state.state = 'OPEN';
  state.lastStateChange = Date.now();
  state.successes = 0;
  circuitStates.set(name, state);
  console.warn(`Circuit breaker [${name}] opened - failing fast`);
}

/**
 * Transition to HALF_OPEN state
 */
function transitionToHalfOpen(name: string): void {
  const state = getCircuitState(name);
  state.state = 'HALF_OPEN';
  state.lastStateChange = Date.now();
  state.successes = 0;
  circuitStates.set(name, state);
  console.info(`Circuit breaker [${name}] half-open - testing recovery`);
}

/**
 * Transition to CLOSED state
 */
function transitionToClosed(name: string): void {
  const state = getCircuitState(name);
  state.state = 'CLOSED';
  state.lastStateChange = Date.now();
  state.failures = 0;
  state.successes = 0;
  circuitStates.set(name, state);
  console.info(`Circuit breaker [${name}] closed - recovered`);
}

/**
 * Reset circuit state (for testing or manual recovery)
 */
export function resetCircuit(name: string): void {
  circuitStates.delete(name);
}

/**
 * Get all circuit states (for monitoring/health checks)
 */
export function getAllCircuitStates(): Record<string, CircuitBreakerState & { config: CircuitBreakerConfig }> {
  const states: Record<string, CircuitBreakerState & { config: CircuitBreakerConfig }> = {};

  for (const [name, config] of Object.entries(CIRCUIT_BREAKER_CONFIGS)) {
    const state = getCircuitState(name);
    states[name] = { ...state, config };
  }

  return states;
}

/**
 * Circuit breaker error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  readonly retryAfter: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(`Circuit breaker [${circuitName}] is open - service unavailable`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfter = Math.ceil(retryAfterMs / 1000);
  }
}

/**
 * Execute function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  config: CircuitBreakerConfig,
  fn: () => Promise<T>
): Promise<T> {
  // Check if circuit allows request
  if (!isCircuitAllowed(config)) {
    const state = getCircuitState(config.name);
    const retryAfter = config.timeout - (Date.now() - state.lastStateChange);
    throw new CircuitOpenError(config.name, Math.max(retryAfter, 1000));
  }

  try {
    const result = await fn();
    recordSuccess(config);
    return result;
  } catch (error) {
    recordFailure(config);
    throw error;
  }
}

/**
 * Execute function with circuit breaker and fallback
 */
export async function withCircuitBreakerAndFallback<T>(
  config: CircuitBreakerConfig,
  fn: () => Promise<T>,
  fallback: () => T | Promise<T>
): Promise<T> {
  try {
    return await withCircuitBreaker(config, fn);
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.warn(`Circuit [${config.name}] open, using fallback`);
      return fallback();
    }
    throw error;
  }
}
