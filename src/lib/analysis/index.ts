/**
 * Semantic Analysis Engine
 * Exports all analysis services for pattern detection and scoring
 */

// Clustering
export {
  findSimilarComplaints,
  groupIntoClusters,
  assignToExistingCluster,
  getClusterCentroid,
  calculateClusterStats,
  type ClusterResult,
  type ClusterStats,
  type SimilarComplaintResult,
  type FindSimilarOptions,
  type ClusterOptions,
  type AssignClusterResult,
  type AssignClusterOptions,
} from './clustering';

// Trend Detection
export {
  calculateRollingStats,
  calculateZScore,
  detectSpike,
  calculateTrendDirection,
  calculateTrendScore,
  analyzePatternTrend,
  analyzeAllPatternTrends,
  type TimeSeries,
  type TimePoint,
  type RollingStats,
  type SpikeResult,
  type TrendDirectionResult,
  type TrendResult,
  type TrendAnalysisOptions,
} from './trend-detection';

// Pattern Scoring
export {
  getDefaultWeights,
  calculateWeightedScore,
  calculateSeverityScore,
  rankPatterns,
  updatePatternSeverity,
  getTopPatterns,
  calculateRelativeSeverity,
  type SeverityWeights,
  type PatternMetrics,
  type SeverityScoreResult,
  type ScoredPattern,
  type RankOptions,
} from './pattern-scoring';

// Anomaly Detection
export {
  detectIQRAnomalies,
  detectLevelShift,
  detectSeasonalAnomaly,
  classifyAnomaly,
  detectAnomalies,
  getAnomalyAlerts,
  getPatternAnomalies,
  type AnomalyType,
  type Anomaly,
  type IQRAnomaly,
  type LevelShiftResult,
  type AnomalyAlert,
} from './anomaly-detection';
