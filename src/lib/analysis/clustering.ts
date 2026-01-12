/**
 * Clustering Service
 * Groups similar complaints into patterns using vector similarity
 */

import { prisma } from '@/lib/db';
import { cosineSimilarity } from '@/lib/embeddings';

// Types
export interface ClusterResult {
  clusters: Array<{
    patternId: string;
    complaintIds: string[];
    centroid: number[];
  }>;
  noiseCount: number;
  totalProcessed: number;
}

export interface ClusterStats {
  totalComplaints: number;
  totalDeaths: number;
  totalInjuries: number;
  crashCount: number;
  fireCount: number;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export interface SimilarComplaintResult {
  id: string;
  similarity: number;
}

export interface FindSimilarOptions {
  limit?: number;
  minSimilarity?: number;
  make?: string;
  model?: string;
  yearRange?: [number, number];
  component?: string;
  excludeIds?: string[];
}

export interface ClusterOptions {
  minClusterSize?: number;
  similarityThreshold?: number;
  maxIterations?: number;
}

export interface AssignClusterResult {
  patternId: string;
  similarity: number;
}

export interface AssignClusterOptions {
  minSimilarity?: number;
}

/**
 * Find complaints similar to a given embedding
 */
export async function findSimilarComplaints(
  embedding: number[],
  options: FindSimilarOptions = {}
): Promise<SimilarComplaintResult[]> {
  const { limit = 20, minSimilarity = 0, make, yearRange, excludeIds = [] } = options;

  const vectorStr = `[${embedding.join(',')}]`;

  // Build WHERE conditions
  const conditions: string[] = ['embedding IS NOT NULL'];

  if (make) {
    conditions.push(`make = '${make}'`);
  }

  if (yearRange) {
    conditions.push(`year >= ${yearRange[0]} AND year <= ${yearRange[1]}`);
  }

  if (excludeIds.length > 0) {
    const excludeList = excludeIds.map((id) => `'${id}'`).join(',');
    conditions.push(`id NOT IN (${excludeList})`);
  }

  const whereClause = conditions.join(' AND ');

  const results = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
    SELECT id, embedding <=> ${vectorStr}::vector as distance
    FROM "Complaint"
    WHERE ${whereClause}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return results
    .map((r) => ({
      id: r.id,
      similarity: 1 - r.distance,
    }))
    .filter((r) => r.similarity >= minSimilarity);
}

/**
 * Parse embedding string to number array
 */
function parseEmbedding(embeddingStr: string): number[] {
  try {
    // Format: [0.1,0.2,0.3,...] or (0.1,0.2,0.3,...)
    const cleaned = embeddingStr.replace(/[\[\]()]/g, '');
    return cleaned.split(',').map(Number);
  } catch {
    return [];
  }
}

/**
 * Calculate centroid from multiple embeddings
 */
export function getClusterCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('No embeddings provided');
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Simple greedy clustering algorithm
 * Groups complaints by similarity threshold
 */
export async function groupIntoClusters(options: ClusterOptions = {}): Promise<ClusterResult> {
  const { minClusterSize = 5, similarityThreshold = 0.75, maxIterations = 1000 } = options;

  // Fetch all complaints with embeddings
  const complaints = await prisma.$queryRaw<Array<{ id: string; embedding: string }>>`
    SELECT id, embedding::text as embedding
    FROM "Complaint"
    WHERE embedding IS NOT NULL
    AND "clusterId" IS NULL
    LIMIT ${maxIterations}
  `;

  if (complaints.length === 0) {
    return { clusters: [], noiseCount: 0, totalProcessed: 0 };
  }

  // Parse embeddings
  const complaintData = complaints.map((c: { id: string; embedding: string }) => ({
    id: c.id,
    embedding: parseEmbedding(c.embedding),
  }));

  // Track which complaints have been assigned
  const assigned = new Set<string>();
  const clusters: Array<{ complaintIds: string[]; embeddings: number[][] }> = [];

  // Greedy clustering
  for (const complaint of complaintData) {
    if (assigned.has(complaint.id)) continue;

    // Try to find an existing cluster this complaint fits into
    let bestCluster = -1;
    let bestSimilarity = 0;

    for (let i = 0; i < clusters.length; i++) {
      const centroid = getClusterCentroid(clusters[i].embeddings);
      const similarity = cosineSimilarity(complaint.embedding, centroid);

      if (similarity > similarityThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = i;
      }
    }

    if (bestCluster >= 0) {
      // Add to existing cluster
      clusters[bestCluster].complaintIds.push(complaint.id);
      clusters[bestCluster].embeddings.push(complaint.embedding);
      assigned.add(complaint.id);
    } else {
      // Start a new cluster
      clusters.push({
        complaintIds: [complaint.id],
        embeddings: [complaint.embedding],
      });
      assigned.add(complaint.id);
    }
  }

  // Filter clusters by minimum size and create patterns
  const validClusters: ClusterResult['clusters'] = [];
  let noiseCount = 0;

  for (const cluster of clusters) {
    if (cluster.complaintIds.length >= minClusterSize) {
      // Create a pattern in the database
      const centroid = getClusterCentroid(cluster.embeddings);
      const centroidStr = `[${centroid.join(',')}]`;

      const pattern = await prisma.pattern.create({
        data: {
          name: `Cluster ${validClusters.length + 1}`,
          description: `Auto-generated cluster with ${cluster.complaintIds.length} complaints`,
          make: 'MULTIPLE', // Will be updated with actual make from complaints
          component: 'MULTIPLE', // Will be updated with actual component from complaints
          severityScore: 0,
          complaintCount: cluster.complaintIds.length,
          trendDirection: 'STABLE',
          trendScore: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
        },
      });

      // Update complaints with cluster assignment
      await prisma.complaint.updateMany({
        where: { id: { in: cluster.complaintIds } },
        data: { clusterId: pattern.id },
      });

      validClusters.push({
        patternId: pattern.id,
        complaintIds: cluster.complaintIds,
        centroid,
      });
    } else {
      noiseCount += cluster.complaintIds.length;
    }
  }

  return {
    clusters: validClusters,
    noiseCount,
    totalProcessed: complaints.length,
  };
}

/**
 * Assign a complaint to the best matching existing cluster
 */
export async function assignToExistingCluster(
  embedding: number[],
  options: AssignClusterOptions = {}
): Promise<AssignClusterResult | null> {
  const { minSimilarity = 0.7 } = options;

  // Get all active patterns with their centroids
  const patterns = await prisma.pattern.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (patterns.length === 0) {
    return null;
  }

  // For each pattern, get a sample of complaint embeddings to calculate centroid
  let bestMatch: AssignClusterResult | null = null;
  let bestSimilarity = 0;

  for (const pattern of patterns) {
    const complaints = await prisma.$queryRaw<Array<{ embedding: string }>>`
      SELECT embedding::text as embedding
      FROM "Complaint"
      WHERE "clusterId" = ${pattern.id}
      AND embedding IS NOT NULL
      LIMIT 50
    `;

    if (complaints.length === 0) continue;

    const embeddings = complaints.map((c: { embedding: string }) => parseEmbedding(c.embedding)).filter((e: number[]) => e.length > 0);

    if (embeddings.length === 0) continue;

    const centroid = getClusterCentroid(embeddings);
    const similarity = cosineSimilarity(embedding, centroid);

    if (similarity > bestSimilarity && similarity >= minSimilarity) {
      bestSimilarity = similarity;
      bestMatch = { patternId: pattern.id, similarity };
    }
  }

  return bestMatch;
}

/**
 * Calculate statistics for a cluster/pattern
 */
export async function calculateClusterStats(patternId: string): Promise<ClusterStats> {
  const complaints = await prisma.complaint.findMany({
    where: { clusterId: patternId },
    select: {
      id: true,
      deaths: true,
      injuries: true,
      crash: true,
      fire: true,
      dateAdded: true,
    },
  });

  if (complaints.length === 0) {
    return {
      totalComplaints: 0,
      totalDeaths: 0,
      totalInjuries: 0,
      crashCount: 0,
      fireCount: 0,
      dateRange: { start: new Date(), end: new Date() },
    };
  }

  const initialStats = { totalDeaths: 0, totalInjuries: 0, crashCount: 0, fireCount: 0 };
  const stats = complaints.reduce(
    (acc: typeof initialStats, c: (typeof complaints)[0]) => ({
      totalDeaths: acc.totalDeaths + c.deaths,
      totalInjuries: acc.totalInjuries + c.injuries,
      crashCount: acc.crashCount + (c.crash ? 1 : 0),
      fireCount: acc.fireCount + (c.fire ? 1 : 0),
    }),
    initialStats
  );

  const dates = complaints.map((c: (typeof complaints)[0]) => c.dateAdded);
  const start = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d: Date) => d.getTime())));

  return {
    totalComplaints: complaints.length,
    ...stats,
    dateRange: { start, end },
  };
}
