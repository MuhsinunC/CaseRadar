/**
 * Semantic Matching Module
 * Uses embedding similarity to determine if recalls actually address detected patterns
 *
 * Cost: FREE (uses existing embeddings in database)
 */

import { prisma } from '@/lib/db';

// Types
export interface RecallData {
  nhtsaCampaignNumber: string;
  manufacturer: string;
  make: string;
  model: string;
  year: number;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  notes: string | null;
  reportReceivedDate: Date;
  parkIt: boolean;
  parkOutside: boolean;
}

export interface SemanticMatch {
  recallId: string;
  semanticScore: number;
  recall: RecallData;
}

/**
 * Compute cosine similarity between two embedding vectors
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 *
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 */
export function computeCosineSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  if (embedding1.length === 0) {
    return 0;
  }

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Handle zero vectors
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Generate the text to embed for a recall
 * Combines component, summary, consequence, remedy, and vehicle info
 */
export function getRecallEmbeddingText(recall: RecallData): string {
  const parts: string[] = [];

  // Add vehicle info for context
  if (recall.make) parts.push(recall.make);
  if (recall.model) parts.push(recall.model);
  if (recall.component) parts.push(recall.component);

  // Add main content
  if (recall.summary) parts.push(recall.summary);
  if (recall.consequence) parts.push(recall.consequence);
  if (recall.remedy) parts.push(recall.remedy);

  return parts.filter((p) => p.trim().length > 0).join(' ');
}

/**
 * Get the centroid embedding for a pattern
 * Computes average of all complaint embeddings in the pattern
 */
export async function getPatternCentroidEmbedding(
  patternId: string
): Promise<number[]> {
  // Get all complaints in this pattern that have embeddings
  // Use text conversion for pgvector compatibility
  const complaints = await prisma.$queryRaw<Array<{ embedding: string }>>`
    SELECT embedding::text as embedding
    FROM "Complaint"
    WHERE "clusterId" = ${patternId}
    AND embedding IS NOT NULL
  `;

  if (!complaints || complaints.length === 0) {
    throw new Error(`No embeddings found for pattern ${patternId}`);
  }

  // Parse pgvector text format "[0.1,0.2,...]" to number[]
  const parseEmbedding = (text: string): number[] => {
    return JSON.parse(text) as number[];
  };

  // Compute centroid (average of all embeddings)
  const firstEmbedding = parseEmbedding(complaints[0].embedding);
  const dimension = firstEmbedding.length;
  const centroid = new Array(dimension).fill(0);

  for (const complaint of complaints) {
    const embedding = parseEmbedding(complaint.embedding);
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Average
  for (let i = 0; i < dimension; i++) {
    centroid[i] /= complaints.length;
  }

  return centroid;
}

/**
 * Find semantically similar recalls for a pattern
 * Returns recalls with similarity above threshold, sorted by score descending
 */
export async function findSemanticRecallMatches(
  patternId: string,
  threshold: number = 0.7
): Promise<SemanticMatch[]> {
  // Get pattern centroid
  let patternCentroid: number[];
  try {
    patternCentroid = await getPatternCentroidEmbedding(patternId);
  } catch {
    // No embeddings for this pattern
    return [];
  }

  // Get all recalls with embeddings (use text conversion for pgvector)
  const recalls = await prisma.$queryRaw<
    Array<{
      id: string;
      nhtsaCampaignNumber: string;
      manufacturer: string;
      make: string;
      model: string;
      year: number;
      component: string;
      summary: string;
      consequence: string;
      remedy: string;
      notes: string | null;
      reportReceivedDate: Date;
      parkIt: boolean;
      parkOutside: boolean;
      embedding: string;
    }>
  >`
    SELECT
      id,
      "nhtsaCampaignNumber",
      manufacturer,
      make,
      model,
      year,
      component,
      summary,
      consequence,
      remedy,
      notes,
      "reportReceivedDate",
      "parkIt",
      "parkOutside",
      embedding::text as embedding
    FROM "Recall"
    WHERE embedding IS NOT NULL
  `;

  const matches: SemanticMatch[] = [];

  for (const recall of recalls) {
    const recallEmbedding = JSON.parse(recall.embedding) as number[];
    const similarity = computeCosineSimilarity(patternCentroid, recallEmbedding);

    if (similarity >= threshold) {
      matches.push({
        recallId: recall.id,
        semanticScore: similarity,
        recall: {
          nhtsaCampaignNumber: recall.nhtsaCampaignNumber,
          manufacturer: recall.manufacturer,
          make: recall.make,
          model: recall.model,
          year: recall.year,
          component: recall.component,
          summary: recall.summary,
          consequence: recall.consequence,
          remedy: recall.remedy,
          notes: recall.notes,
          reportReceivedDate: recall.reportReceivedDate,
          parkIt: recall.parkIt,
          parkOutside: recall.parkOutside,
        },
      });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.semanticScore - a.semanticScore);

  return matches;
}
