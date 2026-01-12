/**
 * Pattern Scoring Service
 * Calculates severity scores for complaint patterns
 */

import { prisma } from '@/lib/db';

// Types
export interface SeverityWeights {
  deaths: number;
  injuries: number;
  crashes: number;
  fires: number;
  complaintCount: number;
  trendScore: number;
}

export interface PatternMetrics {
  deaths: number;
  injuries: number;
  crashes: number;
  fires: number;
  complaintCount: number;
  trendScore: number;
}

export interface SeverityScoreResult {
  patternId: string;
  score: number;
  metrics: PatternMetrics;
  breakdown: Record<string, number>;
}

export interface ScoredPattern {
  patternId: string;
  patternName: string;
  rank: number;
  score: number;
  metrics: PatternMetrics;
}

export interface RankOptions {
  limit?: number;
  minScore?: number;
  weights?: Partial<SeverityWeights>;
}

/**
 * Get default severity weights
 * These weights reflect the relative importance of each factor
 */
export function getDefaultWeights(): SeverityWeights {
  return {
    deaths: 100, // Deaths are the most serious
    injuries: 20, // Injuries are significant
    crashes: 10, // Crash without injury
    fires: 15, // Fires are dangerous
    complaintCount: 1, // More complaints = more attention
    trendScore: 5, // Trending patterns deserve attention
  };
}

/**
 * Calculate weighted score from metrics
 */
export function calculateWeightedScore(
  metrics: PatternMetrics,
  weights: SeverityWeights
): number {
  return (
    metrics.deaths * weights.deaths +
    metrics.injuries * weights.injuries +
    metrics.crashes * weights.crashes +
    metrics.fires * weights.fires +
    metrics.complaintCount * weights.complaintCount +
    metrics.trendScore * weights.trendScore
  );
}

/**
 * Get metrics for a pattern from the database
 */
async function getPatternMetrics(patternId: string): Promise<PatternMetrics> {
  // Get aggregate stats from complaints
  const aggregates = await prisma.complaint.aggregate({
    where: { clusterId: patternId },
    _sum: {
      deaths: true,
      injuries: true,
    },
    _count: {
      id: true,
    },
  });

  // Count crashes and fires
  const [crashCount, fireCount] = await Promise.all([
    prisma.complaint.count({
      where: { clusterId: patternId, crash: true },
    }),
    prisma.complaint.count({
      where: { clusterId: patternId, fire: true },
    }),
  ]);

  // Get pattern for trend score
  const pattern = await prisma.pattern.findUnique({
    where: { id: patternId },
    select: { trendScore: true },
  });

  return {
    deaths: aggregates._sum.deaths || 0,
    injuries: aggregates._sum.injuries || 0,
    crashes: crashCount,
    fires: fireCount,
    complaintCount: aggregates._count.id,
    trendScore: pattern?.trendScore || 0,
  };
}

/**
 * Calculate severity score for a pattern
 */
export async function calculateSeverityScore(
  patternId: string,
  weights?: Partial<SeverityWeights>
): Promise<SeverityScoreResult> {
  const finalWeights = { ...getDefaultWeights(), ...weights };
  const metrics = await getPatternMetrics(patternId);
  const score = calculateWeightedScore(metrics, finalWeights);

  // Calculate breakdown (contribution of each factor)
  const breakdown = {
    deaths: metrics.deaths * finalWeights.deaths,
    injuries: metrics.injuries * finalWeights.injuries,
    crashes: metrics.crashes * finalWeights.crashes,
    fires: metrics.fires * finalWeights.fires,
    complaintCount: metrics.complaintCount * finalWeights.complaintCount,
    trendScore: metrics.trendScore * finalWeights.trendScore,
  };

  return {
    patternId,
    score,
    metrics,
    breakdown,
  };
}

/**
 * Rank all patterns by severity score
 */
export async function rankPatterns(options: RankOptions = {}): Promise<ScoredPattern[]> {
  const { limit = 100, minScore = 0, weights } = options;

  // Get all active patterns
  const patterns = await prisma.pattern.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  // Calculate scores for each
  const scoredPatterns: ScoredPattern[] = [];

  for (const pattern of patterns) {
    const result = await calculateSeverityScore(pattern.id, weights);

    if (result.score >= minScore) {
      scoredPatterns.push({
        patternId: pattern.id,
        patternName: pattern.name,
        rank: 0, // Will be set after sorting
        score: result.score,
        metrics: result.metrics,
      });
    }
  }

  // Sort by score descending
  scoredPatterns.sort((a, b) => b.score - a.score);

  // Assign ranks
  scoredPatterns.forEach((p, i) => {
    p.rank = i + 1;
  });

  // Return limited results
  return scoredPatterns.slice(0, limit);
}

/**
 * Update pattern severity in database
 */
export async function updatePatternSeverity(
  patternId?: string,
  weights?: Partial<SeverityWeights>
): Promise<void> {
  if (patternId) {
    // Update single pattern
    const result = await calculateSeverityScore(patternId, weights);
    await prisma.pattern.update({
      where: { id: patternId },
      data: {
        severityScore: result.score,
        complaintCount: result.metrics.complaintCount,
        lastUpdated: new Date(),
      },
    });
  } else {
    // Update all patterns
    const patterns = await prisma.pattern.findMany({
      select: { id: true },
    });

    for (const pattern of patterns) {
      const result = await calculateSeverityScore(pattern.id, weights);
      await prisma.pattern.update({
        where: { id: pattern.id },
        data: {
          severityScore: result.score,
          complaintCount: result.metrics.complaintCount,
          lastUpdated: new Date(),
        },
      });
    }
  }
}

/**
 * Get top patterns for dashboard display
 */
export async function getTopPatterns(
  count: number = 10,
  options: { includeMetrics?: boolean; weights?: Partial<SeverityWeights> } = {}
): Promise<ScoredPattern[]> {
  const ranked = await rankPatterns({
    limit: count,
    weights: options.weights,
  });

  return ranked;
}

/**
 * Calculate relative severity (percentile rank)
 */
export async function calculateRelativeSeverity(patternId: string): Promise<{
  score: number;
  percentile: number;
  rank: number;
  totalPatterns: number;
}> {
  const ranked = await rankPatterns();
  const patternRank = ranked.find((p) => p.patternId === patternId);

  if (!patternRank) {
    return { score: 0, percentile: 0, rank: 0, totalPatterns: ranked.length };
  }

  const percentile = ((ranked.length - patternRank.rank + 1) / ranked.length) * 100;

  return {
    score: patternRank.score,
    percentile: Math.round(percentile),
    rank: patternRank.rank,
    totalPatterns: ranked.length,
  };
}
