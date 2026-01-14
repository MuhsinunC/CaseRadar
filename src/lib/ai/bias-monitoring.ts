/**
 * AI Bias Monitoring
 * P3-8 Implementation
 *
 * Provides AI bias detection for clustering, generation consistency, and severity scoring.
 * Fairness monitoring for AI outputs.
 */

/**
 * Period type for analysis
 */
export type AnalysisPeriod = 'week' | 'month' | 'year';

/**
 * Clustering bias check params
 */
export interface ClusteringBiasParams {
  clusteringRunId: string;
  threshold?: number;
}

/**
 * Cluster distribution entry
 */
export interface ClusterDistribution {
  clusterId: string;
  makeDistribution: Record<string, number>;
  totalComplaints: number;
}

/**
 * Clustering bias result
 */
export interface ClusteringBiasResult {
  statisticalParity: number;
  biasDetected: boolean;
  affectedMakes: string[];
  clusterDistribution?: ClusterDistribution[];
  threshold: number;
}

/**
 * Generation consistency params
 */
export interface GenerationConsistencyParams {
  input: Record<string, unknown>;
  iterations: number;
  threshold?: number;
}

/**
 * Generation consistency result
 */
export interface GenerationConsistencyResult {
  similarity: number;
  consistent: boolean;
  outputs: string[];
  threshold: number;
}

/**
 * Severity scoring bias params
 */
export interface SeverityScoringBiasParams {
  period: AnalysisPeriod;
  organizationId?: string;
}

/**
 * Severity scoring bias result
 */
export interface SeverityScoringBiasResult {
  meanByMake: Record<string, number>;
  standardDeviation: number;
  calibrated: boolean;
  sampleSize: number;
  period: AnalysisPeriod;
}

/**
 * Bias report params
 */
export interface BiasReportParams {
  organizationId: string;
  period: AnalysisPeriod;
}

/**
 * Comprehensive bias report
 */
export interface BiasReport {
  organizationId: string;
  period: AnalysisPeriod;
  clustering: ClusteringBiasResult;
  generation: GenerationConsistencyResult;
  severity: SeverityScoringBiasResult;
  overallScore: number;
  recommendations: string[];
  generatedAt: string;
}

/**
 * In-memory storage for clustering runs (for testing)
 */
const clusteringRuns = new Map<string, ClusterDistribution[]>();

/**
 * In-memory storage for severity scores (for testing)
 */
const severityScores = new Map<string, { make: string; score: number }[]>();

/**
 * Clear bias monitoring store (for testing)
 */
export function clearBiasMonitoringStore(): void {
  clusteringRuns.clear();
  severityScores.clear();
}

/**
 * Calculate statistical parity
 *
 * Statistical parity measures how evenly distributed outcomes are across groups.
 * A value of 1 indicates perfect parity, while lower values indicate bias.
 */
function calculateStatisticalParity(
  distribution: Record<string, number>
): number {
  const values = Object.values(distribution);
  if (values.length === 0) return 1;

  const total = values.reduce((sum, v) => sum + v, 0);
  if (total === 0) return 1;

  const expected = total / values.length;
  const deviations = values.map((v) => Math.abs(v - expected) / expected);
  const maxDeviation = Math.max(...deviations);

  // Convert to parity score (0 = max bias, 1 = no bias)
  return Math.max(0, 1 - maxDeviation);
}

/**
 * Calculate standard deviation
 */
function calculateStandardDeviation(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const squaredDiffs = numbers.map((n) => Math.pow(n - mean, 2));
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;

  return Math.sqrt(variance);
}

/**
 * Calculate similarity between strings using Jaccard similarity
 */
function calculateSimilarity(outputs: string[]): number {
  if (outputs.length <= 1) return 1;

  // Use word-level Jaccard similarity
  const wordSets = outputs.map((o) =>
    new Set(o.toLowerCase().split(/\s+/).filter((w) => w.length > 0))
  );

  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const intersection = new Set(
        [...wordSets[i]].filter((x) => wordSets[j].has(x))
      );
      const union = new Set([...wordSets[i], ...wordSets[j]]);

      const similarity = union.size > 0 ? intersection.size / union.size : 1;
      totalSimilarity += similarity;
      comparisons++;
    }
  }

  return comparisons > 0 ? totalSimilarity / comparisons : 1;
}

/**
 * Check for clustering bias
 *
 * Analyzes cluster distribution to detect if certain makes are over-represented.
 *
 * @param params - Check parameters
 * @returns Clustering bias result
 */
export async function checkClusteringBias(
  params: ClusteringBiasParams
): Promise<ClusteringBiasResult> {
  const { clusteringRunId, threshold = 0.8 } = params;

  // Get clustering data (in production, this would query the database)
  const clusterData = clusteringRuns.get(clusteringRunId);

  if (!clusterData || clusterData.length === 0) {
    return {
      statisticalParity: 1,
      biasDetected: false,
      affectedMakes: [],
      clusterDistribution: [],
      threshold,
    };
  }

  // Aggregate make distribution across all clusters
  const totalMakeDistribution: Record<string, number> = {};
  for (const cluster of clusterData) {
    for (const [make, count] of Object.entries(cluster.makeDistribution)) {
      totalMakeDistribution[make] = (totalMakeDistribution[make] || 0) + count;
    }
  }

  const statisticalParity = calculateStatisticalParity(totalMakeDistribution);
  const biasDetected = statisticalParity < threshold;

  // Find affected makes (those with significantly different representation)
  const affectedMakes: string[] = [];
  if (biasDetected) {
    const total = Object.values(totalMakeDistribution).reduce((sum, v) => sum + v, 0);
    const expected = total / Object.keys(totalMakeDistribution).length;

    for (const [make, count] of Object.entries(totalMakeDistribution)) {
      const deviation = Math.abs(count - expected) / expected;
      if (deviation > 0.3) {
        affectedMakes.push(make);
      }
    }
  }

  return {
    statisticalParity,
    biasDetected,
    affectedMakes,
    clusterDistribution: clusterData,
    threshold,
  };
}

/**
 * Check generation consistency
 *
 * Tests if the same input produces similar outputs across multiple runs.
 *
 * @param params - Check parameters
 * @returns Generation consistency result
 */
export async function checkGenerationConsistency(
  params: GenerationConsistencyParams
): Promise<GenerationConsistencyResult> {
  const { input, iterations, threshold = 0.8 } = params;

  // Generate outputs (in production, this would call the AI model)
  const outputs: string[] = [];
  for (let i = 0; i < iterations; i++) {
    // Simulate generation with some variation
    const baseOutput = `Analysis for ${JSON.stringify(input).slice(0, 50)}`;
    const variation = Math.random() < 0.9 ? '' : ` (variation ${i})`;
    outputs.push(baseOutput + variation);
  }

  const similarity = calculateSimilarity(outputs);
  const consistent = similarity >= threshold;

  return {
    similarity,
    consistent,
    outputs,
    threshold,
  };
}

/**
 * Check severity scoring bias
 *
 * Analyzes severity scores by make to detect calibration issues.
 *
 * @param params - Check parameters
 * @returns Severity scoring bias result
 */
export async function checkSeverityScoringBias(
  params: SeverityScoringBiasParams
): Promise<SeverityScoringBiasResult> {
  const { period, organizationId } = params;

  // Get severity scores (in production, this would query the database)
  const key = organizationId || 'default';
  const scores = severityScores.get(key) || [];

  // Group by make
  const scoresByMake: Record<string, number[]> = {};
  for (const { make, score } of scores) {
    if (!scoresByMake[make]) {
      scoresByMake[make] = [];
    }
    scoresByMake[make].push(score);
  }

  // Calculate mean by make
  const meanByMake: Record<string, number> = {};
  for (const [make, makeScores] of Object.entries(scoresByMake)) {
    meanByMake[make] = makeScores.reduce((sum, s) => sum + s, 0) / makeScores.length;
  }

  // Calculate overall standard deviation of means
  const means = Object.values(meanByMake);
  const standardDeviation = calculateStandardDeviation(means);

  // Calibrated if standard deviation is low (means are similar across makes)
  const calibrated = standardDeviation < 1.5;

  return {
    meanByMake,
    standardDeviation,
    calibrated,
    sampleSize: scores.length,
    period,
  };
}

/**
 * Generate comprehensive bias report
 *
 * @param params - Report parameters
 * @returns Comprehensive bias report
 */
export async function generateBiasReport(
  params: BiasReportParams
): Promise<BiasReport> {
  const { organizationId, period } = params;

  // Run all bias checks
  const [clustering, generation, severity] = await Promise.all([
    checkClusteringBias({ clusteringRunId: `${organizationId}-latest` }),
    checkGenerationConsistency({
      input: { organizationId, test: true },
      iterations: 3,
    }),
    checkSeverityScoringBias({ period, organizationId }),
  ]);

  // Calculate overall score (0-100)
  const clusteringScore = clustering.statisticalParity * 100;
  const generationScore = generation.similarity * 100;
  const severityScore = severity.calibrated ? 100 : Math.max(0, 100 - severity.standardDeviation * 10);

  const overallScore = Math.round(
    (clusteringScore + generationScore + severityScore) / 3
  );

  // Generate recommendations
  const recommendations: string[] = [];

  if (!clustering.biasDetected === false && clustering.statisticalParity < 0.8) {
    recommendations.push(
      `Review clustering algorithm for potential make-based bias. Affected makes: ${clustering.affectedMakes.join(', ') || 'None detected'}`
    );
  }

  if (!generation.consistent) {
    recommendations.push(
      'AI generation shows inconsistency. Consider adjusting temperature or reviewing prompts.'
    );
  }

  if (!severity.calibrated) {
    recommendations.push(
      'Severity scoring shows variation across makes. Review scoring model for calibration.'
    );
  }

  if (recommendations.length === 0 && overallScore < 80) {
    recommendations.push(
      'Overall bias score is below threshold. Review AI models for potential issues.'
    );
  }

  return {
    organizationId,
    period,
    clustering,
    generation,
    severity,
    overallScore,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Add clustering run data (for testing)
 */
export function addClusteringRunData(
  runId: string,
  data: ClusterDistribution[]
): void {
  clusteringRuns.set(runId, data);
}

/**
 * Add severity score data (for testing)
 */
export function addSeverityScoreData(
  organizationId: string,
  data: { make: string; score: number }[]
): void {
  severityScores.set(organizationId, data);
}
