/**
 * Clustering Audit Trail
 * P1-6 Implementation
 *
 * Provides utilities for tracking clustering runs and ensuring
 * reproducibility for compliance and audit purposes.
 */

import { prisma } from '@/lib/db';

/**
 * Data required to record a clustering run
 */
export interface ClusteringRunData {
  algorithmVersion: string;
  randomSeed: number;
  minClusterSize: number;
  similarityThreshold: number;
  inputComplaintCount: number;
  inputComplaintIds: string[];
  outputPatternCount: number;
  outputPatternIds: string[];
  durationMs: number;
  organizationId: string;
  createdBy: string;
}

/**
 * Clustering run record from database
 */
export interface ClusteringRunRecord extends ClusteringRunData {
  id: string;
  createdAt: Date;
  patterns?: PatternSummary[];
}

/**
 * Pattern summary for clustering run
 */
export interface PatternSummary {
  id: string;
  name?: string;
}

/**
 * Replay metadata for a clustering run
 */
export interface ReplayMetadata {
  originalRunId: string;
  canReplay: boolean;
  reason?: string;
  parameters: {
    algorithmVersion: string;
    randomSeed: number;
    minClusterSize: number;
    similarityThreshold: number;
  };
  inputCount: number;
  outputCount: number;
}

/**
 * Record a clustering run in the database for audit trail
 *
 * @param data - Clustering run data to record
 * @returns The created ClusteringRun record
 */
export async function recordClusteringRun(
  data: ClusteringRunData
): Promise<ClusteringRunRecord> {
  const created = await prisma.clusteringRun.create({
    data: {
      algorithmVersion: data.algorithmVersion,
      randomSeed: data.randomSeed,
      minClusterSize: data.minClusterSize,
      similarityThreshold: data.similarityThreshold,
      inputComplaintCount: data.inputComplaintCount,
      inputComplaintIds: data.inputComplaintIds,
      outputPatternCount: data.outputPatternCount,
      outputPatternIds: data.outputPatternIds,
      durationMs: data.durationMs,
      organizationId: data.organizationId,
      createdBy: data.createdBy,
    },
  });

  return {
    id: created.id,
    algorithmVersion: created.algorithmVersion,
    randomSeed: created.randomSeed,
    minClusterSize: created.minClusterSize,
    similarityThreshold: created.similarityThreshold,
    inputComplaintCount: created.inputComplaintCount,
    inputComplaintIds: created.inputComplaintIds,
    outputPatternCount: created.outputPatternCount,
    outputPatternIds: created.outputPatternIds,
    durationMs: created.durationMs,
    organizationId: created.organizationId,
    createdBy: created.createdBy,
    createdAt: created.createdAt,
  };
}

/**
 * Get a clustering run by ID with associated patterns
 *
 * @param id - Clustering run ID
 * @returns The clustering run record or null if not found
 */
export async function getClusteringRun(
  id: string
): Promise<ClusteringRunRecord | null> {
  const run = await prisma.clusteringRun.findUnique({
    where: { id },
    include: { patterns: true },
  });

  if (!run) {
    return null;
  }

  return {
    id: run.id,
    algorithmVersion: run.algorithmVersion,
    randomSeed: run.randomSeed,
    minClusterSize: run.minClusterSize,
    similarityThreshold: run.similarityThreshold,
    inputComplaintCount: run.inputComplaintCount,
    inputComplaintIds: run.inputComplaintIds,
    outputPatternCount: run.outputPatternCount,
    outputPatternIds: run.outputPatternIds,
    durationMs: run.durationMs,
    organizationId: run.organizationId,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    patterns: run.patterns.map((p) => ({ id: p.id, name: p.name })),
  };
}

/**
 * Get replay metadata for a clustering run
 * Determines if the run can be replayed and provides parameters needed
 *
 * @param id - Clustering run ID
 * @returns Replay metadata or null if run not found
 */
export async function replayClusteringRun(
  id: string
): Promise<ReplayMetadata | null> {
  const run = await prisma.clusteringRun.findUnique({
    where: { id },
  });

  if (!run) {
    return null;
  }

  // Determine if replay is possible
  const canReplay = run.inputComplaintIds.length > 0;
  const reason = canReplay
    ? undefined
    : 'Input complaint IDs not recorded - cannot replay';

  return {
    originalRunId: run.id,
    canReplay,
    reason,
    parameters: {
      algorithmVersion: run.algorithmVersion,
      randomSeed: run.randomSeed,
      minClusterSize: run.minClusterSize,
      similarityThreshold: run.similarityThreshold,
    },
    inputCount: run.inputComplaintCount,
    outputCount: run.outputPatternCount,
  };
}

/**
 * Link patterns to a clustering run
 * Used after pattern creation to associate them with the run
 *
 * @param runId - Clustering run ID
 * @param patternIds - IDs of patterns to link
 */
export async function linkPatternsToRun(
  runId: string,
  patternIds: string[]
): Promise<void> {
  await prisma.pattern.updateMany({
    where: {
      id: { in: patternIds },
    },
    data: {
      clusteringRunId: runId,
    },
  });
}

/**
 * Get all clustering runs for an organization
 *
 * @param organizationId - Organization ID
 * @param limit - Maximum number of runs to return
 * @returns List of clustering runs
 */
export async function getOrganizationClusteringRuns(
  organizationId: string,
  limit = 50
): Promise<ClusteringRunRecord[]> {
  const runs = await prisma.clusteringRun.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { patterns: true },
  });

  return runs.map((run) => ({
    id: run.id,
    algorithmVersion: run.algorithmVersion,
    randomSeed: run.randomSeed,
    minClusterSize: run.minClusterSize,
    similarityThreshold: run.similarityThreshold,
    inputComplaintCount: run.inputComplaintCount,
    inputComplaintIds: run.inputComplaintIds,
    outputPatternCount: run.outputPatternCount,
    outputPatternIds: run.outputPatternIds,
    durationMs: run.durationMs,
    organizationId: run.organizationId,
    createdBy: run.createdBy,
    createdAt: run.createdAt,
    patterns: run.patterns.map((p) => ({ id: p.id, name: p.name })),
  }));
}
