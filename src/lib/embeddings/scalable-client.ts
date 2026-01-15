/**
 * Scalable Embedding Client
 *
 * TypeScript client for the scalable embedding service.
 * Supports single embedding, batch processing, and async job queue.
 */

export interface EmbedResponse {
  embedding: number[];
  model: string;
  latency_ms: number;
}

export interface BatchEmbedResponse {
  embeddings: number[][];
  model: string;
  count: number;
  latency_ms: number;
}

export interface AsyncJobResponse {
  job_id: string;
  status: string;
  queue_position: number;
}

export interface JobStatusResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  embeddings?: number[][];
  error?: string;
}

export interface QueueStatus {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface HealthStatus {
  status: string;
  model_loaded: boolean;
  model_name: string;
  redis_connected: boolean;
}

export class ScalableEmbeddingClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:8080', timeout: number = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Generate embedding for a single text.
   */
  async embedSingle(text: string): Promise<number[]> {
    if (!text || !text.trim()) {
      throw new Error('Text cannot be empty');
    }

    const response = await this.fetch('/embed', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });

    const data = (await response.json()) as EmbedResponse;
    return data.embedding;
  }

  /**
   * Generate embeddings for multiple texts (up to 100).
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      throw new Error('Texts array cannot be empty');
    }

    if (texts.length > 100) {
      throw new Error('Batch size cannot exceed 100 texts');
    }

    // Validate all texts are non-empty
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i] || !texts[i].trim()) {
        throw new Error(`Text at index ${i} cannot be empty`);
      }
    }

    const response = await this.fetch('/embed/batch', {
      method: 'POST',
      body: JSON.stringify({ texts }),
    });

    const data = (await response.json()) as BatchEmbedResponse;
    return data.embeddings;
  }

  /**
   * Generate embeddings for large batches by chunking into smaller batches.
   */
  async embedBatchLarge(
    texts: string[],
    batchSize: number = 100,
    onProgress?: (completed: number, total: number) => void
  ): Promise<number[][]> {
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await this.embedBatch(batch);
      results.push(...embeddings);

      if (onProgress) {
        onProgress(Math.min(i + batchSize, texts.length), texts.length);
      }
    }

    return results;
  }

  /**
   * Submit a batch job for async processing.
   */
  async submitAsync(texts: string[], callbackUrl?: string): Promise<string> {
    const response = await this.fetch('/embed/async', {
      method: 'POST',
      body: JSON.stringify({ texts, callback_url: callbackUrl }),
    });

    const data = (await response.json()) as AsyncJobResponse;
    return data.job_id;
  }

  /**
   * Get the status of an async job.
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await this.fetch(`/embed/job/${jobId}`);
    return (await response.json()) as JobStatusResponse;
  }

  /**
   * Wait for an async job to complete, polling at intervals.
   */
  async waitForCompletion(
    jobId: string,
    timeoutMs: number = 300000,
    pollIntervalMs: number = 1000
  ): Promise<JobStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Job failed: ${status.error || 'Unknown error'}`);
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Job timed out after ${timeoutMs}ms`);
  }

  /**
   * Get the current queue status.
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const response = await this.fetch('/queue/status');
    return (await response.json()) as QueueStatus;
  }

  /**
   * Get health status of the service.
   */
  async getHealth(): Promise<HealthStatus> {
    const response = await this.fetch('/health');
    return (await response.json()) as HealthStatus;
  }

  /**
   * Check if the service is healthy and ready.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.getHealth();
      return health.status === 'healthy' && health.model_loaded;
    } catch {
      return false;
    }
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance for convenience
let defaultClient: ScalableEmbeddingClient | null = null;

/**
 * Get the default scalable embedding client.
 * Uses EMBEDDING_SERVICE_URL environment variable or defaults to localhost:8080.
 *
 * For local development with Docker Compose scaling:
 *   EMBEDDING_SERVICE_URL=http://localhost:8080 (Traefik load balancer)
 *
 * For production with Kubernetes:
 *   EMBEDDING_SERVICE_URL=http://embedding-service (K8s Service)
 */
export function getScalableClient(): ScalableEmbeddingClient {
  if (!defaultClient) {
    const baseUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8080';
    defaultClient = new ScalableEmbeddingClient(baseUrl);
  }
  return defaultClient;
}

/**
 * Reset the singleton client (for testing purposes).
 */
export function resetScalableClient(): void {
  defaultClient = null;
}

/**
 * Generate embedding for a single text using the scalable service.
 */
export async function generateScalableEmbedding(text: string): Promise<number[]> {
  return getScalableClient().embedSingle(text);
}

/**
 * Generate embeddings for multiple texts using the scalable service.
 */
export async function generateScalableEmbeddings(texts: string[]): Promise<number[][]> {
  return getScalableClient().embedBatchLarge(texts);
}

/**
 * Format embedding array for pgvector storage.
 */
export function formatEmbeddingForPgvector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Calculate cosine similarity between two embeddings.
 * Assumes embeddings are L2 normalized, so dot product = cosine similarity.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }

  return dotProduct;
}
