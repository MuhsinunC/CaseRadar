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

// Batch processing configuration
const PROCESSING_BATCH_SIZE = 50;

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

      // Store embeddings
      for (let i = 0; i < complaints.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          try {
            await prisma.$executeRaw`
              UPDATE "Complaint"
              SET embedding = ${formatEmbeddingForPgvector(embeddings[i])}::vector
              WHERE id = ${complaints[i].id}
            `;
            processed++;
          } catch (dbError) {
            const msg = dbError instanceof Error ? dbError.message : String(dbError);
            errors.push(`DB error for ${complaints[i].id}: ${msg}`);
          }
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
