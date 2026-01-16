/**
 * Pipelined Embedding Generator
 *
 * Uses async pipeline architecture for maximum throughput:
 * - Reader: Fetches batches from DB (uses FOR UPDATE SKIP LOCKED to prevent races)
 * - Embedder: Generates embeddings via API (multiple workers hit load balancer)
 * - Writer: Writes embeddings to DB with batch UNNEST
 *
 * All three stages run concurrently, limited only by the slowest stage (embedding).
 *
 * Architecture with Load Balancer (Traefik/K8s):
 *   Client Workers (3) --> Load Balancer --> Embedding Service Pods (N)
 *
 * Scaling:
 * - Single instance: ~550/s baseline
 * - 2 instances: ~1000/s (1.8x)
 * - 4 instances: ~1800/s (3.3x)
 *
 * To scale: docker-compose up -d --scale embedding=N
 */

import { prisma } from '@/lib/db';
import {
  generateResilientEmbedding,
  generateResilientEmbeddingsLarge,
  formatEmbeddingForPgvector,
  destroyEmbeddingClient,
} from './resilient-client';

// Pipeline configuration
interface PipelineConfig {
  readBatchSize: number;      // Rows to read per DB query
  embedBatchSize: number;     // Texts to send to embedding API at once
  writeBatchSize: number;     // Rows to write per DB UPDATE
  maxReadAhead: number;       // Max batches to buffer before backpressure
  maxWriteBuffer: number;     // Max batches waiting to be written
  numEmbedWorkers: number;    // Number of concurrent embedding workers
  maxTextLength: number;      // Max chars for embedding text (0 = no limit)
}

const DEFAULT_CONFIG: PipelineConfig = {
  readBatchSize: 500,         // Read 500 at a time (balanced for DB and embedding)
  embedBatchSize: 500,        // Embed 500 at a time (resilient client chunks to 128)
  writeBatchSize: 500,        // Write 500 at a time (UNNEST optimal)
  maxReadAhead: 8,            // Buffer up to 8 batches (keep GPU fed)
  maxWriteBuffer: 8,          // Buffer up to 8 write batches
  numEmbedWorkers: 4,         // 4 concurrent workers (balance concurrency vs contention)
  maxTextLength: 500,         // Truncate to 500 chars for ~195 emb/s (4x faster)
                               // Captures vehicle, component, and main issue description
                               // Set to 0 for no truncation (slower but full semantic info)
};

// Types for pipeline data
interface ComplaintBatch {
  complaints: Array<{
    id: string;
    make: string;
    model: string;
    year: number | null;
    component: string;
    description: string;
  }>;
  texts: string[];
}

interface EmbeddedBatch {
  ids: string[];
  embeddings: number[][];
}

// Pipeline statistics
interface PipelineStats {
  read: number;
  embedded: number;
  written: number;
  errors: number;
  startTime: number;
  readTime: number;
  embedTime: number;
  writeTime: number;
}

/**
 * Async queue with backpressure support
 */
class AsyncQueue<T> {
  private items: T[] = [];
  private waitingConsumers: Array<(item: T) => void> = [];
  private waitingProducers: Array<() => void> = [];
  private maxSize: number;
  private closed = false;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  async push(item: T): Promise<void> {
    if (this.closed) throw new Error('Queue is closed');

    // Wait if queue is full (backpressure)
    while (this.items.length >= this.maxSize && !this.closed) {
      await new Promise<void>(resolve => this.waitingProducers.push(resolve));
    }

    if (this.closed) return;

    // If consumers are waiting, give directly to them
    if (this.waitingConsumers.length > 0) {
      const consumer = this.waitingConsumers.shift()!;
      consumer(item);
    } else {
      this.items.push(item);
    }
  }

  async pop(): Promise<T | null> {
    // If items available, return immediately
    if (this.items.length > 0) {
      const item = this.items.shift()!;
      // Wake up any waiting producers
      if (this.waitingProducers.length > 0) {
        const producer = this.waitingProducers.shift()!;
        producer();
      }
      return item;
    }

    // If closed and empty, return null
    if (this.closed) return null;

    // Wait for an item
    return new Promise<T | null>(resolve => {
      this.waitingConsumers.push((item: T) => resolve(item));
    });
  }

  close(): void {
    this.closed = true;
    // Wake up all waiting consumers with null
    for (const consumer of this.waitingConsumers) {
      consumer(null as any);
    }
    this.waitingConsumers = [];
    // Wake up all waiting producers
    for (const producer of this.waitingProducers) {
      producer();
    }
    this.waitingProducers = [];
  }

  get length(): number {
    return this.items.length;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Prepare complaint text for embedding
 * @param maxLength Optional max length (0 = no truncation)
 */
function prepareText(
  complaint: {
    make: string;
    model: string;
    year: number | null;
    component: string;
    description: string;
  },
  maxLength: number = 0
): string {
  const yearStr = complaint.year ?? 'Unknown';
  let text = [
    `Vehicle: ${yearStr} ${complaint.make} ${complaint.model}`,
    `Component: ${complaint.component}`,
    `Issue: ${complaint.description}`,
  ].join('\n');

  // Truncate if maxLength is set and text exceeds it
  if (maxLength > 0 && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  return text;
}

/**
 * Pipelined Embedder - runs three concurrent workers
 */
export class PipelinedEmbedder {
  private config: PipelineConfig;
  private stats: PipelineStats;
  private readQueue: AsyncQueue<ComplaintBatch>;
  private writeQueue: AsyncQueue<EmbeddedBatch>;
  private stopSignal = false;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      read: 0,
      embedded: 0,
      written: 0,
      errors: 0,
      startTime: 0,
      readTime: 0,
      embedTime: 0,
      writeTime: 0,
    };
    this.readQueue = new AsyncQueue(this.config.maxReadAhead);
    this.writeQueue = new AsyncQueue(this.config.maxWriteBuffer);
  }

  /**
   * Run the pipelined embedding generation
   */
  async run(
    limit: number,
    onProgress?: (stats: PipelineStats) => void
  ): Promise<PipelineStats> {
    this.stats.startTime = Date.now();
    this.stopSignal = false;

    // Start reader, multiple embedders, and writer concurrently
    const readerPromise = this.readerWorker(limit);

    // Spawn multiple embedder workers for parallel processing
    const embedderPromises = [];
    for (let i = 0; i < this.config.numEmbedWorkers; i++) {
      embedderPromises.push(this.embedderWorker(i));
    }

    const writerPromise = this.writerWorker(onProgress);

    // Wait for all to complete
    await Promise.all([readerPromise, ...embedderPromises, writerPromise]);

    return this.stats;
  }

  /**
   * Reader worker - fetches batches from DB
   * Uses FOR UPDATE SKIP LOCKED to prevent race conditions
   */
  private async readerWorker(limit: number): Promise<void> {
    let totalRead = 0;

    try {
      while (totalRead < limit && !this.stopSignal) {
        const batchSize = Math.min(this.config.readBatchSize, limit - totalRead);
        const readStart = Date.now();

        // Use FOR UPDATE SKIP LOCKED to prevent reading same rows
        // This locks the rows we're selecting, skipping any already locked
        const complaints = await prisma.$queryRaw<
          Array<{
            id: string;
            make: string;
            model: string;
            year: number | null;
            component: string;
            description: string;
          }>
        >`
          SELECT id, make, model, year, component, description
          FROM "Complaint"
          WHERE embedding IS NULL
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
        `;

        this.stats.readTime += Date.now() - readStart;

        if (complaints.length === 0) {
          break; // No more to process
        }

        const texts = complaints.map(c => prepareText(c, this.config.maxTextLength));

        await this.readQueue.push({ complaints, texts });

        totalRead += complaints.length;
        this.stats.read = totalRead;
      }
    } finally {
      this.readQueue.close();
    }
  }

  private activeEmbedders = 0;
  private embedderLock = false;

  /**
   * Embedder worker - generates embeddings from texts
   * Multiple workers can run concurrently for parallel processing
   */
  private async embedderWorker(workerId: number): Promise<void> {
    this.activeEmbedders++;

    try {
      while (true) {
        const batch = await this.readQueue.pop();
        if (batch === null) break; // Queue closed

        const embedStart = Date.now();

        try {
          const embeddings = await generateResilientEmbeddingsLarge(
            batch.texts,
            undefined // No progress callback for inner batches
          );

          this.stats.embedTime += Date.now() - embedStart;

          const ids = batch.complaints.map(c => c.id);
          await this.writeQueue.push({ ids, embeddings });

          this.stats.embedded += embeddings.length;
        } catch (error) {
          console.error(`Embedding error (worker ${workerId}):`, error);
          this.stats.errors++;
        }
      }
    } finally {
      this.activeEmbedders--;
      // Only close write queue when ALL embedders are done
      if (this.activeEmbedders === 0) {
        this.writeQueue.close();
      }
    }
  }

  /**
   * Writer worker - writes embeddings to DB using batch UNNEST
   */
  private async writerWorker(
    onProgress?: (stats: PipelineStats) => void
  ): Promise<void> {
    while (true) {
      const batch = await this.writeQueue.pop();
      if (batch === null) break; // Queue closed

      const writeStart = Date.now();

      try {
        // Batch UPDATE using UNNEST
        const embeddingStrs = batch.embeddings.map(e => formatEmbeddingForPgvector(e));

        await prisma.$executeRaw`
          UPDATE "Complaint" c
          SET embedding = data.embedding::vector
          FROM (
            SELECT
              unnest(${batch.ids}::text[]) as id,
              unnest(${embeddingStrs}::text[]) as embedding
          ) data
          WHERE c.id = data.id
        `;

        this.stats.writeTime += Date.now() - writeStart;
        this.stats.written += batch.ids.length;

        if (onProgress) {
          onProgress({ ...this.stats });
        }
      } catch (error) {
        console.error('Write error:', error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Stop the pipeline gracefully
   */
  stop(): void {
    this.stopSignal = true;
  }

  /**
   * Get current statistics
   */
  getStats(): PipelineStats {
    return { ...this.stats };
  }
}

/**
 * Run pipelined embedding generation
 */
export async function runPipelinedEmbedding(
  limit: number = 500000,
  onProgress?: (stats: PipelineStats) => void,
  config?: Partial<PipelineConfig>
): Promise<PipelineStats> {
  const embedder = new PipelinedEmbedder(config);
  return embedder.run(limit, onProgress);
}

export type { PipelineConfig, PipelineStats };
