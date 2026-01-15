import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import {
  ScalableEmbeddingClient,
  cosineSimilarity,
  formatEmbeddingForPgvector,
} from '../scalable-client';

// Helper to create mock embedding (768 dimensions, normalized)
function createMockEmbedding(seed: number = 0): number[] {
  const embedding = Array.from({ length: 768 }, (_, i) => Math.sin(i + seed));
  const magnitude = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  return embedding.map((x) => x / magnitude);
}

const BASE_URL = 'http://test-embedding-service:8080';

describe('ScalableEmbeddingClient', () => {
  let client: ScalableEmbeddingClient;

  beforeEach(() => {
    client = new ScalableEmbeddingClient(BASE_URL);
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('embedSingle', () => {
    it('should return 768-dimensional embedding', async () => {
      const mockEmb = createMockEmbedding();
      server.use(
        http.post(`${BASE_URL}/embed`, () => {
          return HttpResponse.json({
            embedding: mockEmb,
            model: 'nomic-embed-text-v1.5',
            latency_ms: 45,
          });
        })
      );

      const embedding = await client.embedSingle('test text');
      expect(embedding).toHaveLength(768);
    });

    it('should throw on empty text', async () => {
      await expect(client.embedSingle('')).rejects.toThrow('Text cannot be empty');
    });

    it('should throw on whitespace-only text', async () => {
      await expect(client.embedSingle('   ')).rejects.toThrow('Text cannot be empty');
    });

    it('should call correct endpoint', async () => {
      let capturedBody: { text?: string } = {};
      server.use(
        http.post(`${BASE_URL}/embed`, async ({ request }) => {
          capturedBody = (await request.json()) as { text?: string };
          return HttpResponse.json({
            embedding: createMockEmbedding(),
            model: 'nomic-embed-text-v1.5',
            latency_ms: 45,
          });
        })
      );

      await client.embedSingle('test');
      expect(capturedBody.text).toBe('test');
    });
  });

  describe('embedBatch', () => {
    it('should return embeddings for all texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      server.use(
        http.post(`${BASE_URL}/embed/batch`, () => {
          return HttpResponse.json({
            embeddings: texts.map((_, i) => createMockEmbedding(i)),
            model: 'nomic-embed-text-v1.5',
            count: 3,
            latency_ms: 150,
          });
        })
      );

      const embeddings = await client.embedBatch(texts);
      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toHaveLength(768);
    });

    it('should handle max batch size of 100', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `text ${i}`);
      server.use(
        http.post(`${BASE_URL}/embed/batch`, () => {
          return HttpResponse.json({
            embeddings: texts.map((_, i) => createMockEmbedding(i)),
            model: 'nomic-embed-text-v1.5',
            count: 100,
            latency_ms: 1500,
          });
        })
      );

      const embeddings = await client.embedBatch(texts);
      expect(embeddings).toHaveLength(100);
    });

    it('should reject batch size over 100', async () => {
      const texts = Array.from({ length: 101 }, (_, i) => `text ${i}`);
      await expect(client.embedBatch(texts)).rejects.toThrow('cannot exceed 100');
    });

    it('should reject empty array', async () => {
      await expect(client.embedBatch([])).rejects.toThrow('cannot be empty');
    });

    it('should reject array with empty text', async () => {
      await expect(client.embedBatch(['valid', '', 'valid'])).rejects.toThrow(
        'index 1 cannot be empty'
      );
    });
  });

  describe('embedBatchLarge', () => {
    it('should chunk large batches', async () => {
      const texts = Array.from({ length: 250 }, (_, i) => `text ${i}`);
      let callCount = 0;

      server.use(
        http.post(`${BASE_URL}/embed/batch`, async ({ request }) => {
          const body = (await request.json()) as { texts: string[] };
          const count = body.texts.length;
          callCount++;
          return HttpResponse.json({
            embeddings: Array.from({ length: count }, (_, i) => createMockEmbedding(i)),
            count: count,
          });
        })
      );

      const embeddings = await client.embedBatchLarge(texts);
      expect(embeddings).toHaveLength(250);
      expect(callCount).toBe(3); // 100 + 100 + 50
    });

    it('should call progress callback', async () => {
      const texts = Array.from({ length: 250 }, (_, i) => `text ${i}`);
      const progress: Array<{ completed: number; total: number }> = [];

      server.use(
        http.post(`${BASE_URL}/embed/batch`, async ({ request }) => {
          const body = (await request.json()) as { texts: string[] };
          const count = body.texts.length;
          return HttpResponse.json({
            embeddings: Array.from({ length: count }, () => createMockEmbedding()),
            count: count,
          });
        })
      );

      await client.embedBatchLarge(texts, 100, (completed, total) => {
        progress.push({ completed, total });
      });

      expect(progress).toHaveLength(3);
      expect(progress[2]).toEqual({ completed: 250, total: 250 });
    });
  });

  describe('submitAsync', () => {
    it('should return job ID for async processing', async () => {
      server.use(
        http.post(`${BASE_URL}/embed/async`, () => {
          return HttpResponse.json({
            job_id: 'test-job-123',
            status: 'queued',
            queue_position: 5,
          });
        })
      );

      const jobId = await client.submitAsync(['text1', 'text2']);
      expect(jobId).toBe('test-job-123');
    });
  });

  describe('getJobStatus', () => {
    it('should return job status', async () => {
      server.use(
        http.get(`${BASE_URL}/embed/job/test-job-123`, () => {
          return HttpResponse.json({
            job_id: 'test-job-123',
            status: 'processing',
            progress: 50,
          });
        })
      );

      const status = await client.getJobStatus('test-job-123');
      expect(status.status).toBe('processing');
      expect(status.progress).toBe(50);
    });
  });

  describe('waitForCompletion', () => {
    it('should poll for completion', async () => {
      let callCount = 0;
      server.use(
        http.get(`${BASE_URL}/embed/job/test-job-123`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({
              job_id: 'test-job-123',
              status: 'processing',
              progress: 50,
            });
          }
          return HttpResponse.json({
            job_id: 'test-job-123',
            status: 'completed',
            progress: 100,
            embeddings: [createMockEmbedding(), createMockEmbedding()],
          });
        })
      );

      const result = await client.waitForCompletion('test-job-123', 5000, 100);
      expect(result.status).toBe('completed');
      expect(result.embeddings).toHaveLength(2);
    });

    it('should throw on job failure', async () => {
      server.use(
        http.get(`${BASE_URL}/embed/job/test-job-123`, () => {
          return HttpResponse.json({
            job_id: 'test-job-123',
            status: 'failed',
            progress: 0,
            error: 'Processing error',
          });
        })
      );

      await expect(client.waitForCompletion('test-job-123')).rejects.toThrow(
        'Job failed: Processing error'
      );
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue metrics', async () => {
      server.use(
        http.get(`${BASE_URL}/queue/status`, () => {
          return HttpResponse.json({
            pending: 10,
            processing: 2,
            completed: 100,
            failed: 1,
          });
        })
      );

      const status = await client.getQueueStatus();
      expect(status).toHaveProperty('pending', 10);
      expect(status).toHaveProperty('processing', 2);
      expect(status).toHaveProperty('completed', 100);
      expect(status).toHaveProperty('failed', 1);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      server.use(
        http.get(`${BASE_URL}/health`, () => {
          return HttpResponse.json({
            status: 'healthy',
            model_loaded: true,
            model_name: 'nomic-embed-text-v1.5',
            redis_connected: true,
          });
        })
      );

      const health = await client.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.model_loaded).toBe(true);
    });
  });

  describe('isHealthy', () => {
    it('should return true when service is healthy', async () => {
      server.use(
        http.get(`${BASE_URL}/health`, () => {
          return HttpResponse.json({
            status: 'healthy',
            model_loaded: true,
          });
        })
      );

      const healthy = await client.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false when model not loaded', async () => {
      server.use(
        http.get(`${BASE_URL}/health`, () => {
          return HttpResponse.json({
            status: 'healthy',
            model_loaded: false,
          });
        })
      );

      const healthy = await client.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return false on error', async () => {
      server.use(
        http.get(`${BASE_URL}/health`, () => {
          return HttpResponse.error();
        })
      );

      const healthy = await client.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});

describe('Utility Functions', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical embeddings', () => {
      const emb = createMockEmbedding();
      expect(cosineSimilarity(emb, emb)).toBeCloseTo(1, 5);
    });

    it('should return value between -1 and 1', () => {
      const emb1 = createMockEmbedding(0);
      const emb2 = createMockEmbedding(100);
      const similarity = cosineSimilarity(emb1, emb2);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should throw for different lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
        'must have the same length'
      );
    });
  });

  describe('formatEmbeddingForPgvector', () => {
    it('should format embedding as pgvector string', () => {
      const embedding = [0.1, 0.2, 0.3];
      const formatted = formatEmbeddingForPgvector(embedding);
      expect(formatted).toBe('[0.1,0.2,0.3]');
    });

    it('should handle empty embedding', () => {
      expect(formatEmbeddingForPgvector([])).toBe('[]');
    });
  });
});
