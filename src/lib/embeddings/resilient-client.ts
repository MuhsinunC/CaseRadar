/**
 * Resilient Embedding Client
 *
 * Production-ready embedding client with:
 * - Circuit breaker pattern
 * - Retry with exponential backoff
 * - Automatic fallback to OpenAI/Ollama
 * - Health-based routing
 * - Metrics and logging
 */

import {
  ScalableEmbeddingClient,
  getScalableClient,
  formatEmbeddingForPgvector as scalableFormat,
} from './scalable-client';
import {
  generateEmbedding as openaiGenerateEmbedding,
  generateEmbeddings as openaiGenerateEmbeddings,
  formatEmbeddingForPgvector as openaiFormat,
  checkEmbeddingService as checkOpenAIService,
} from './openai';

// Circuit breaker states
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  resetTimeoutMs: number; // Time before trying again
  halfOpenMaxAttempts: number; // Max attempts in half-open state
}

interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface ResilientClientConfig {
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
  healthCheckIntervalMs: number;
  preferScalableService: boolean;
}

// Default configuration
const DEFAULT_CONFIG: ResilientClientConfig = {
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000, // 30 seconds
    halfOpenMaxAttempts: 3,
  },
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  },
  healthCheckIntervalMs: 10000, // 10 seconds
  preferScalableService: true,
};

// Metrics for monitoring
interface ClientMetrics {
  scalableRequests: number;
  scalableSuccesses: number;
  scalableFailures: number;
  fallbackRequests: number;
  fallbackSuccesses: number;
  fallbackFailures: number;
  circuitOpens: number;
  retryAttempts: number;
  averageLatencyMs: number;
  lastHealthCheck: Date | null;
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts = 0;
  private config: CircuitBreakerConfig;
  private onStateChange?: (state: CircuitState) => void;

  constructor(
    config: CircuitBreakerConfig,
    onStateChange?: (state: CircuitState) => void
  ) {
    this.config = config;
    this.onStateChange = onStateChange;
  }

  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      }
    }
    return this.state === 'open';
  }

  isHalfOpen(): boolean {
    return this.state === 'half-open';
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.transitionTo('closed');
    }
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.transitionTo('open');
      }
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }
}

/**
 * Resilient Embedding Client
 */
export class ResilientEmbeddingClient {
  private scalableClient: ScalableEmbeddingClient;
  private circuitBreaker: CircuitBreaker;
  private config: ResilientClientConfig;
  private metrics: ClientMetrics;
  private scalableHealthy = false;
  private fallbackHealthy = false;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ResilientClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scalableClient = getScalableClient();
    this.circuitBreaker = new CircuitBreaker(
      this.config.circuitBreaker,
      (state) => {
        console.log(`[ResilientEmbedding] Circuit breaker state: ${state}`);
        if (state === 'open') {
          this.metrics.circuitOpens++;
        }
      }
    );
    this.metrics = {
      scalableRequests: 0,
      scalableSuccesses: 0,
      scalableFailures: 0,
      fallbackRequests: 0,
      fallbackSuccesses: 0,
      fallbackFailures: 0,
      circuitOpens: 0,
      retryAttempts: 0,
      averageLatencyMs: 0,
      lastHealthCheck: null,
    };

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Generate embedding for a single text with automatic failover
   */
  async embedSingle(text: string): Promise<number[]> {
    const startTime = Date.now();

    try {
      // Try scalable service first if preferred and circuit is not open
      if (this.config.preferScalableService && !this.circuitBreaker.isOpen()) {
        try {
          const embedding = await this.tryScalableWithRetry(
            () => this.scalableClient.embedSingle(text)
          );
          this.updateLatency(Date.now() - startTime);
          return embedding;
        } catch (error) {
          console.warn(
            '[ResilientEmbedding] Scalable service failed, falling back:',
            error instanceof Error ? error.message : error
          );
        }
      }

      // Fallback to OpenAI/Ollama
      return await this.tryFallbackWithRetry(() => openaiGenerateEmbedding(text));
    } finally {
      this.updateLatency(Date.now() - startTime);
    }
  }

  /**
   * Generate embeddings for multiple texts with automatic failover
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();

    try {
      // Try scalable service first if preferred and circuit is not open
      if (this.config.preferScalableService && !this.circuitBreaker.isOpen()) {
        try {
          const embeddings = await this.tryScalableWithRetry(
            () => this.scalableClient.embedBatchLarge(texts)
          );
          this.updateLatency(Date.now() - startTime);
          return embeddings;
        } catch (error) {
          console.warn(
            '[ResilientEmbedding] Scalable service batch failed, falling back:',
            error instanceof Error ? error.message : error
          );
        }
      }

      // Fallback to OpenAI/Ollama (needs chunking for large batches)
      return await this.tryFallbackWithRetry(() =>
        this.fallbackBatchWithChunking(texts)
      );
    } finally {
      this.updateLatency(Date.now() - startTime);
    }
  }

  /**
   * Generate embeddings for large batches with progress callback
   */
  async embedBatchLarge(
    texts: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<number[][]> {
    const startTime = Date.now();

    try {
      if (this.config.preferScalableService && !this.circuitBreaker.isOpen()) {
        try {
          const embeddings = await this.tryScalableWithRetry(() =>
            this.scalableClient.embedBatchLarge(texts, 100, onProgress)
          );
          this.updateLatency(Date.now() - startTime);
          return embeddings;
        } catch (error) {
          console.warn(
            '[ResilientEmbedding] Scalable service large batch failed, falling back:',
            error instanceof Error ? error.message : error
          );
        }
      }

      // Fallback with progress tracking
      return await this.fallbackBatchWithChunking(texts, onProgress);
    } finally {
      this.updateLatency(Date.now() - startTime);
    }
  }

  /**
   * Submit async job (scalable service only, with fallback to sync)
   */
  async submitAsync(texts: string[]): Promise<{
    jobId?: string;
    embeddings?: number[][];
    isAsync: boolean;
  }> {
    if (!this.circuitBreaker.isOpen()) {
      try {
        const jobId = await this.scalableClient.submitAsync(texts);
        return { jobId, isAsync: true };
      } catch (error) {
        console.warn(
          '[ResilientEmbedding] Async submit failed, processing synchronously:',
          error instanceof Error ? error.message : error
        );
      }
    }

    // Fallback to synchronous processing
    const embeddings = await this.embedBatch(texts);
    return { embeddings, isAsync: false };
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): ClientMetrics {
    return { ...this.metrics };
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{
    scalable: { healthy: boolean; circuitState: CircuitState };
    fallback: { healthy: boolean };
    preferredService: 'scalable' | 'fallback';
  }> {
    return {
      scalable: {
        healthy: this.scalableHealthy,
        circuitState: this.circuitBreaker.getState(),
      },
      fallback: {
        healthy: this.fallbackHealthy,
      },
      preferredService:
        this.config.preferScalableService && !this.circuitBreaker.isOpen()
          ? 'scalable'
          : 'fallback',
    };
  }

  /**
   * Reset circuit breaker (for testing/admin)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Stop health checks (for cleanup)
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // Private methods

  private async tryScalableWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.scalableRequests++;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.circuitBreaker.recordSuccess();
        this.metrics.scalableSuccesses++;
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        this.metrics.retryAttempts++;

        if (attempt === this.config.retry.maxAttempts) {
          this.metrics.scalableFailures++;
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(
          this.config.retry.initialDelayMs *
            Math.pow(this.config.retry.backoffMultiplier, attempt - 1),
          this.config.retry.maxDelayMs
        );
        await this.sleep(delay);
      }
    }

    throw new Error('Retry logic error'); // Should never reach here
  }

  private async tryFallbackWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.fallbackRequests++;

    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const result = await fn();
        this.metrics.fallbackSuccesses++;
        return result;
      } catch (error) {
        this.metrics.retryAttempts++;

        if (attempt === this.config.retry.maxAttempts) {
          this.metrics.fallbackFailures++;
          throw error;
        }

        const delay = Math.min(
          this.config.retry.initialDelayMs *
            Math.pow(this.config.retry.backoffMultiplier, attempt - 1),
          this.config.retry.maxDelayMs
        );
        await this.sleep(delay);
      }
    }

    throw new Error('Retry logic error');
  }

  private async fallbackBatchWithChunking(
    texts: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<number[][]> {
    const BATCH_SIZE = 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await openaiGenerateEmbeddings(batch);
      results.push(...embeddings);

      if (onProgress) {
        onProgress(Math.min(i + BATCH_SIZE, texts.length), texts.length);
      }

      // Rate limiting for fallback
      if (i + BATCH_SIZE < texts.length) {
        await this.sleep(100);
      }
    }

    return results;
  }

  private startHealthChecks(): void {
    // Initial check
    this.performHealthCheck();

    // Periodic checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    this.metrics.lastHealthCheck = new Date();

    // Check scalable service
    try {
      this.scalableHealthy = await this.scalableClient.isHealthy();
    } catch {
      this.scalableHealthy = false;
    }

    // Check fallback service
    try {
      this.fallbackHealthy = await checkOpenAIService();
    } catch {
      this.fallbackHealthy = false;
    }

    // Auto-reset circuit if scalable becomes healthy
    if (
      this.scalableHealthy &&
      this.circuitBreaker.getState() === 'open'
    ) {
      console.log(
        '[ResilientEmbedding] Scalable service recovered, resetting circuit'
      );
      this.circuitBreaker.reset();
    }
  }

  private updateLatency(latencyMs: number): void {
    const totalRequests =
      this.metrics.scalableRequests + this.metrics.fallbackRequests;
    if (totalRequests === 1) {
      this.metrics.averageLatencyMs = latencyMs;
    } else {
      // Rolling average
      this.metrics.averageLatencyMs =
        (this.metrics.averageLatencyMs * (totalRequests - 1) + latencyMs) /
        totalRequests;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let defaultClient: ResilientEmbeddingClient | null = null;

/**
 * Get the default resilient embedding client
 */
export function getResilientClient(): ResilientEmbeddingClient {
  if (!defaultClient) {
    defaultClient = new ResilientEmbeddingClient();
  }
  return defaultClient;
}

/**
 * Generate embedding with automatic failover
 */
export async function generateResilientEmbedding(text: string): Promise<number[]> {
  return getResilientClient().embedSingle(text);
}

/**
 * Generate batch embeddings with automatic failover
 */
export async function generateResilientEmbeddings(
  texts: string[]
): Promise<number[][]> {
  return getResilientClient().embedBatch(texts);
}

/**
 * Generate large batch embeddings with progress tracking
 */
export async function generateResilientEmbeddingsLarge(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  return getResilientClient().embedBatchLarge(texts, onProgress);
}

/**
 * Format embedding for pgvector (uses same format as scalable service)
 */
export { scalableFormat as formatEmbeddingForPgvector };

/**
 * Get embedding client health
 */
export async function getEmbeddingHealth() {
  return getResilientClient().getHealth();
}

/**
 * Get embedding client metrics
 */
export function getEmbeddingMetrics() {
  return getResilientClient().getMetrics();
}
