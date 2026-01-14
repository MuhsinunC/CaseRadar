/**
 * Embedding Drift Detection
 * P2-7 Implementation
 *
 * Detects changes in embedding model behavior over time by comparing
 * current embeddings against stored baselines using cosine similarity.
 */

/**
 * Drift threshold - embeddings with cosine similarity below this
 * are considered to have drifted significantly.
 */
export const DRIFT_THRESHOLD = 0.95;

/**
 * Reference text used for baseline computation.
 * This should be a stable, representative text that doesn't change.
 */
export const REFERENCE_TEXT =
  'This is a standard reference text used for embedding drift detection. ' +
  'Consumer complaints regarding product defects and service issues are ' +
  'tracked and analyzed for patterns. The system processes text to identify ' +
  'similar cases and potential regulatory violations.';

/**
 * Baseline embedding record
 */
export interface BaselineEmbedding {
  embedding: number[];
  referenceText: string;
  computedAt: Date;
}

/**
 * Options for drift checking
 */
export interface DriftCheckOptions {
  /** Whether to create an alert when drift is detected */
  alertOnDrift?: boolean;
}

/**
 * Result of drift check
 */
export interface DriftCheckResult {
  driftDetected: boolean;
  cosineSimilarity: number;
  driftMagnitude: number;
  threshold: number;
}

/**
 * Alert details for drift detection
 */
export interface DriftAlertDetails {
  cosineSimilarity: number;
  driftMagnitude: number;
  threshold: number;
  detectedAt: Date;
}

/**
 * In-memory baseline storage (would be database in production)
 */
let storedBaseline: BaselineEmbedding | null = null;

/**
 * Alert history for drift events
 */
const alertHistory: DriftAlertDetails[] = [];

/**
 * DriftAlert utility for creating alerts
 */
export const DriftAlert = {
  /**
   * Create a drift alert
   */
  create(details: Omit<DriftAlertDetails, 'detectedAt'>): DriftAlertDetails {
    const alert: DriftAlertDetails = {
      ...details,
      detectedAt: new Date(),
    };
    alertHistory.push(alert);
    console.warn('[DriftAlert] Embedding drift detected:', alert);
    return alert;
  },

  /**
   * Get alert history
   */
  getHistory(): DriftAlertDetails[] {
    return [...alertHistory];
  },

  /**
   * Clear alert history (for testing)
   */
  clearHistory(): void {
    alertHistory.length = 0;
  },
};

/**
 * Calculate cosine similarity between two vectors
 *
 * Cosine similarity = (A · B) / (||A|| * ||B||)
 *
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

  // Handle zero vectors
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Generate a mock embedding for reference text
 *
 * In production, this would call the OpenAI API.
 * For testing purposes, we generate a deterministic embedding.
 *
 * @param text - Text to embed
 * @returns Normalized 1536-dimensional embedding
 */
function generateMockEmbedding(text: string): number[] {
  const embedding = new Array(1536);

  // Use text hash to generate deterministic values
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate embedding values based on hash
  for (let i = 0; i < 1536; i++) {
    // Use a simple PRNG seeded by hash + index
    const seed = hash + i * 31;
    embedding[i] = Math.sin(seed) * 0.5;
  }

  // Normalize to unit length
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );

  return embedding.map((val) => val / magnitude);
}

/**
 * Compute baseline embedding for the reference text
 *
 * @returns Baseline embedding record
 */
export async function computeBaselineEmbedding(): Promise<BaselineEmbedding> {
  const embedding = generateMockEmbedding(REFERENCE_TEXT);

  return {
    embedding,
    referenceText: REFERENCE_TEXT,
    computedAt: new Date(),
  };
}

/**
 * Check for embedding drift between baseline and current embedding
 *
 * @param baselineEmbedding - The baseline embedding to compare against
 * @param currentEmbedding - The current embedding to check
 * @param options - Options for drift checking
 * @returns Drift check result
 */
export async function checkDrift(
  baselineEmbedding: number[],
  currentEmbedding: number[],
  options?: DriftCheckOptions
): Promise<DriftCheckResult> {
  const similarity = cosineSimilarity(baselineEmbedding, currentEmbedding);
  const driftDetected = similarity < DRIFT_THRESHOLD;
  const driftMagnitude = 1 - similarity;

  const result: DriftCheckResult = {
    driftDetected,
    cosineSimilarity: similarity,
    driftMagnitude,
    threshold: DRIFT_THRESHOLD,
  };

  // Create alert if requested and drift detected
  if (options?.alertOnDrift && driftDetected) {
    DriftAlert.create({
      cosineSimilarity: similarity,
      driftMagnitude,
      threshold: DRIFT_THRESHOLD,
    });
  }

  return result;
}

/**
 * Store baseline embedding for future comparisons
 *
 * @param baseline - The baseline to store
 */
export async function storeBaseline(
  baseline: BaselineEmbedding
): Promise<void> {
  storedBaseline = { ...baseline };
}

/**
 * Get the stored baseline embedding
 *
 * @returns The stored baseline or null if none exists
 */
export async function getStoredBaseline(): Promise<BaselineEmbedding | null> {
  return storedBaseline ? { ...storedBaseline } : null;
}

/**
 * Clear the stored baseline (for testing)
 */
export function clearStoredBaseline(): void {
  storedBaseline = null;
}
