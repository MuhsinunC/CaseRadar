/**
 * Complaint Embeddings Service
 * Generates and stores embeddings for complaint descriptions
 *
 * Uses the resilient embedding client which:
 * - Tries the scalable embedding service first
 * - Falls back to OpenAI/Ollama if scalable service is unavailable
 * - Has circuit breaker pattern and retry logic
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  generateResilientEmbedding,
  generateResilientEmbeddingsLarge,
  formatEmbeddingForPgvector,
  getEmbeddingHealth,
  getEmbeddingMetrics,
} from './resilient-client';
import { cosineSimilarity } from './openai';

// Batch processing configuration - optimized for throughput
// Testing showed: batch 100 = 922 emb/s, batch 500 = 46,704 emb/s (50x faster!)
// DB writes: Individual UPDATEs = 2,000/s, Batch UNNEST = 50,000+/s (25x faster!)
const PROCESSING_BATCH_SIZE = 500;  // Optimal batch size based on load testing
const DB_BATCH_SIZE = 500;          // Rows per batch UPDATE (UNNEST pattern)

/**
 * Prepare complaint text for embedding
 * Combines relevant fields for better semantic representation
 */
function prepareComplaintText(complaint: {
  make: string;
  model: string;
  year: number | null;
  component: string;
  description: string;
}): string {
  const yearStr = complaint.year ?? 'Unknown';
  return [
    `Vehicle: ${yearStr} ${complaint.make} ${complaint.model}`,
    `Component: ${complaint.component}`,
    `Issue: ${complaint.description}`,
  ].join('\n');
}

/**
 * Complaint Embedder Service
 */
export const complaintEmbedder = {
  /**
   * Generate and store embedding for a single complaint
   */
  async embedComplaint(complaintId: string): Promise<void> {
    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        component: true,
        description: true,
      },
    });

    if (!complaint) {
      throw new Error(`Complaint not found: ${complaintId}`);
    }

    const text = prepareComplaintText(complaint);
    const embedding = await generateResilientEmbedding(text);

    // Update using raw SQL for pgvector
    await prisma.$executeRaw`
      UPDATE "Complaint"
      SET embedding = ${formatEmbeddingForPgvector(embedding)}::vector
      WHERE id = ${complaintId}
    `;
  },

  /**
   * Generate embeddings for complaints without embeddings
   */
  async embedMissingComplaints(limit: number = 1000): Promise<{
    processed: number;
    errors: string[];
  }> {
    // Find complaints without embeddings using raw query for Unsupported vector type
    const complaints = await prisma.$queryRaw<
      Array<{
        id: string;
        make: string;
        model: string;
        year: number;
        component: string;
        description: string;
      }>
    >`
      SELECT id, make, model, year, component, description
      FROM "Complaint"
      WHERE embedding IS NULL
      LIMIT ${limit}
    `;

    if (complaints.length === 0) {
      return { processed: 0, errors: [] };
    }

    console.log(`Processing ${complaints.length} complaints for embeddings`);

    const errors: string[] = [];
    let processed = 0;

    // Prepare all texts
    const texts = complaints.map(prepareComplaintText);

    try {
      // Use resilient client with progress tracking
      const embeddings = await generateResilientEmbeddingsLarge(texts, (completed, total) => {
        console.log(`Embedding progress: ${completed}/${total}`);
      });

      // Prepare valid embedding pairs (filter out any failures)
      const validPairs: Array<{ id: string; embedding: number[] }> = [];
      for (let i = 0; i < complaints.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          validPairs.push({ id: complaints[i].id, embedding: embeddings[i] });
        }
      }

      // Batch UPDATE using UNNEST pattern - 25x faster than individual UPDATEs
      // Individual UPDATEs: ~2,000 writes/s, Batch UNNEST: ~50,000+ writes/s
      for (let i = 0; i < validPairs.length; i += DB_BATCH_SIZE) {
        const batch = validPairs.slice(i, i + DB_BATCH_SIZE);
        const ids = batch.map(p => p.id);
        const embeddingStrs = batch.map(p => formatEmbeddingForPgvector(p.embedding));

        try {
          // Use UNNEST to batch update multiple rows in single query
          await prisma.$executeRaw`
            UPDATE "Complaint" c
            SET embedding = data.embedding::vector
            FROM (
              SELECT
                unnest(${ids}::text[]) as id,
                unnest(${embeddingStrs}::text[]) as embedding
            ) data
            WHERE c.id = data.id
          `;
          processed += batch.length;
        } catch (dbError) {
          const msg = dbError instanceof Error ? dbError.message : String(dbError);
          errors.push(`Batch DB error (${batch.length} rows): ${msg}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Embedding generation failed: ${msg}`);
    }

    return { processed, errors };
  },

  /**
   * Find similar complaints using vector similarity
   */
  async findSimilarComplaints(
    complaintId: string,
    limit: number = 10
  ): Promise<Array<{ id: string; similarity: number }>> {
    // Get the source complaint's embedding
    const result = await prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT embedding::text as embedding
      FROM "Complaint"
      WHERE id = ${complaintId}
    `;

    if (!result[0]?.embedding) {
      throw new Error('Source complaint has no embedding');
    }

    // Find similar complaints using cosine distance
    const similar = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT id, embedding <=> (
        SELECT embedding FROM "Complaint" WHERE id = ${complaintId}
      ) as distance
      FROM "Complaint"
      WHERE id != ${complaintId}
      AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    return similar.map((r) => ({
      id: r.id,
      similarity: 1 - r.distance, // Convert distance to similarity
    }));
  },

  /**
   * Find complaints similar to a text query
   */
  async searchByText(
    query: string,
    limit: number = 20
  ): Promise<Array<{ id: string; similarity: number }>> {
    const queryEmbedding = await generateResilientEmbedding(query);
    const vectorStr = formatEmbeddingForPgvector(queryEmbedding);

    const results = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT id, embedding <=> ${vectorStr}::vector as distance
      FROM "Complaint"
      WHERE embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      id: r.id,
      similarity: 1 - r.distance,
    }));
  },

  /**
   * Get embedding statistics
   */
  async getStats(): Promise<{
    total: number;
    withEmbedding: number;
    withoutEmbedding: number;
    percentComplete: number;
  }> {
    const [total, withEmbedding] = await Promise.all([
      prisma.complaint.count(),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
      `,
    ]);

    const withEmbeddingCount = Number(withEmbedding[0].count);
    const withoutEmbedding = total - withEmbeddingCount;
    const percentComplete = total > 0 ? (withEmbeddingCount / total) * 100 : 0;

    return {
      total,
      withEmbedding: withEmbeddingCount,
      withoutEmbedding,
      percentComplete: Math.round(percentComplete * 10) / 10,
    };
  },

  /**
   * Get embedding service health status
   */
  async getServiceHealth() {
    return getEmbeddingHealth();
  },

  /**
   * Get embedding service metrics
   */
  getServiceMetrics() {
    return getEmbeddingMetrics();
  },
};

export default complaintEmbedder;
