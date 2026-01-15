/**
 * Lead Scoring Module
 * Calculates lead scores for patterns based on complaint count,
 * severity, semantic match quality, and trends
 *
 * Higher scores = more valuable leads (patterns likely not addressed by recalls)
 * Cost: FREE (pure calculation logic)
 */

// Types
export interface LeadScoreInput {
  complaintCount: number;
  severityScore: number;
  avgSemanticMatch: number; // 0-1, or -1 for no recalls
  trendScore: number;
}

export interface LeadScoreBreakdown {
  complaintFactor: number;
  severityFactor: number;
  semanticFactor: number;
  trendFactor: number;
}

export interface LeadScoreResult {
  score: number;
  breakdown: LeadScoreBreakdown;
}

export interface PatternInput {
  id: string;
  name: string;
  complaintCount: number;
  severityScore: number;
  avgSemanticMatch: number;
  trendScore: number;
}

export interface RankedLead {
  pattern: PatternInput;
  leadScore: number;
  breakdown: LeadScoreBreakdown;
}

export interface RankLeadsOptions {
  minScore?: number;
  maxSemanticMatch?: number;
  minComplaintCount?: number;
  top?: number;
}

// Constants for score calculation
const WEIGHTS = {
  complaint: 0.3,
  severity: 0.3,
  semantic: 0.3,
  trend: 0.1,
};

// Normalization constants
const MAX_COMPLAINT_COUNT = 1000; // Complaints beyond this don't add more weight
const MAX_SEVERITY = 100;
const MAX_TREND = 100;

/**
 * Calculate lead score for a pattern
 * Higher scores indicate more valuable leads (patterns likely not addressed by recalls)
 *
 * Formula:
 * leadScore = (complaintFactor * 0.3) +
 *             (severityFactor * 0.3) +
 *             (semanticFactor * 0.3) +
 *             (trendFactor * 0.1)
 */
export function calculateLeadScore(input: LeadScoreInput): LeadScoreResult {
  // Handle edge case: no complaints = no lead value
  if (input.complaintCount === 0) {
    return {
      score: 0,
      breakdown: {
        complaintFactor: 0,
        severityFactor: 0,
        semanticFactor: 0,
        trendFactor: 0,
      },
    };
  }

  // Normalize complaint count (log scale to handle large numbers)
  // Using log scale: more complaints is better, but diminishing returns
  const normalizedComplaints = Math.min(
    Math.log10(input.complaintCount + 1) / Math.log10(MAX_COMPLAINT_COUNT + 1),
    1
  );
  const complaintFactor = normalizedComplaints;

  // Normalize severity (0-100 scale)
  const severityFactor = Math.min(input.severityScore / MAX_SEVERITY, 1);

  // Calculate semantic factor
  // -1 means no recalls (very high lead value)
  // 0 means recall doesn't match at all (high lead value)
  // 1 means recall perfectly matches (low lead value)
  let semanticFactor: number;
  if (input.avgSemanticMatch === -1) {
    // No recalls at all - maximum lead value
    semanticFactor = 1.0;
  } else {
    // Invert semantic match: lower match = higher lead value
    semanticFactor = 1 - Math.min(Math.max(input.avgSemanticMatch, 0), 1);
  }

  // Normalize trend score (0-100 scale)
  const trendFactor = Math.min(input.trendScore / MAX_TREND, 1);

  // Calculate weighted score
  const rawScore =
    complaintFactor * WEIGHTS.complaint +
    severityFactor * WEIGHTS.severity +
    semanticFactor * WEIGHTS.semantic +
    trendFactor * WEIGHTS.trend;

  // Scale to 0-100
  const score = Math.min(rawScore * 100, 100);

  return {
    score,
    breakdown: {
      complaintFactor,
      severityFactor,
      semanticFactor,
      trendFactor,
    },
  };
}

/**
 * Rank patterns by lead score
 * Returns patterns sorted by lead score descending, with optional filters
 */
export function rankLeads(
  patterns: PatternInput[],
  options: RankLeadsOptions = {}
): RankedLead[] {
  const { minScore, maxSemanticMatch, minComplaintCount, top } = options;

  // Calculate lead scores for all patterns
  const rankedPatterns: RankedLead[] = patterns.map((pattern) => {
    const result = calculateLeadScore({
      complaintCount: pattern.complaintCount,
      severityScore: pattern.severityScore,
      avgSemanticMatch: pattern.avgSemanticMatch,
      trendScore: pattern.trendScore,
    });

    return {
      pattern,
      leadScore: result.score,
      breakdown: result.breakdown,
    };
  });

  // Apply filters
  let filtered = rankedPatterns;

  if (minScore !== undefined) {
    filtered = filtered.filter((lead) => lead.leadScore >= minScore);
  }

  if (maxSemanticMatch !== undefined) {
    filtered = filtered.filter(
      (lead) => lead.pattern.avgSemanticMatch <= maxSemanticMatch
    );
  }

  if (minComplaintCount !== undefined) {
    filtered = filtered.filter(
      (lead) => lead.pattern.complaintCount >= minComplaintCount
    );
  }

  // Sort by lead score descending
  filtered.sort((a, b) => b.leadScore - a.leadScore);

  // Apply top limit
  if (top !== undefined && top > 0) {
    filtered = filtered.slice(0, top);
  }

  return filtered;
}
