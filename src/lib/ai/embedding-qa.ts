/**
 * Embedding Quality Assurance
 * P2-6 Implementation
 *
 * Provides utilities for validating embedding quality and consistency.
 * Ensures embeddings meet expected dimensions and normalization standards.
 */

/**
 * Expected dimensions for OpenAI text-embedding-ada-002 model
 */
export const EXPECTED_DIMENSIONS = 1536;

/**
 * Check types for embedding validation
 */
export type EmbeddingCheckType =
  | 'dimensions'
  | 'norm'
  | 'zeroVector'
  | 'hasNaN'
  | 'hasInfinity';

/**
 * Error thrown when embedding quality check fails
 */
export class EmbeddingQAError extends Error {
  public readonly checkType?: EmbeddingCheckType;

  constructor(
    message: string,
    options?: {
      checkType?: EmbeddingCheckType;
    }
  ) {
    super(message);
    this.name = 'EmbeddingQAError';
    this.checkType = options?.checkType;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmbeddingQAError);
    }
  }
}

/**
 * Result of dimension check
 */
export interface DimensionCheckResult {
  dimensions: number;
  expected: number;
}

/**
 * Options for norm check
 */
export interface NormCheckOptions {
  /** Tolerance for normalized check (default: 0.05) */
  tolerance?: number;
}

/**
 * Result of norm check
 */
export interface NormCheckResult {
  l2Norm: number;
  isNormalized: boolean;
}

/**
 * Check status for validation
 */
export type CheckStatus = 'pass' | 'fail' | 'warn';

/**
 * Result of full embedding validation
 */
export interface ValidationResult {
  valid: boolean;
  checks: {
    dimensions: CheckStatus;
    norm: CheckStatus;
    zeroVector?: CheckStatus;
    hasNaN?: CheckStatus;
    hasInfinity?: CheckStatus;
  };
  metadata: {
    dimensions: number;
    l2Norm: number;
  };
}

/**
 * Check if embedding has correct dimensions (1536 for ada-002)
 *
 * @param embedding - The embedding vector to check
 * @returns Dimension check result
 * @throws EmbeddingQAError if dimensions are incorrect
 */
export function checkEmbeddingDimensions(
  embedding: number[]
): DimensionCheckResult {
  const dimensions = embedding.length;

  if (dimensions !== EXPECTED_DIMENSIONS) {
    throw new EmbeddingQAError(
      `Invalid embedding dimensions: expected ${EXPECTED_DIMENSIONS}, got ${dimensions}`,
      { checkType: 'dimensions' }
    );
  }

  return {
    dimensions,
    expected: EXPECTED_DIMENSIONS,
  };
}

/**
 * Calculate L2 norm (Euclidean length) of a vector
 */
function calculateL2Norm(embedding: number[]): number {
  const sumOfSquares = embedding.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumOfSquares);
}

/**
 * Check if embedding is normalized (L2 norm ≈ 1)
 *
 * OpenAI embeddings are normalized to unit length.
 *
 * @param embedding - The embedding vector to check
 * @param options - Options including tolerance
 * @returns Norm check result
 */
export function checkEmbeddingNorm(
  embedding: number[],
  options?: NormCheckOptions
): NormCheckResult {
  const tolerance = options?.tolerance ?? 0.05;
  const l2Norm = calculateL2Norm(embedding);

  // Check if norm is within tolerance of 1.0
  const isNormalized = Math.abs(l2Norm - 1.0) <= tolerance;

  return {
    l2Norm,
    isNormalized,
  };
}

/**
 * Check if embedding is a zero vector
 */
function isZeroVector(embedding: number[]): boolean {
  return embedding.every((val) => val === 0);
}

/**
 * Check if embedding contains NaN values
 */
function hasNaNValues(embedding: number[]): boolean {
  return embedding.some((val) => Number.isNaN(val));
}

/**
 * Check if embedding contains Infinity values
 */
function hasInfinityValues(embedding: number[]): boolean {
  return embedding.some((val) => !Number.isFinite(val) && !Number.isNaN(val));
}

/**
 * Validate an embedding against all quality checks
 *
 * Performs comprehensive validation:
 * - Dimension check (1536)
 * - Normalization check (L2 norm ≈ 1)
 * - Zero vector detection
 * - NaN value detection
 * - Infinity value detection
 *
 * @param embedding - The embedding vector to validate
 * @returns Validation result with all check statuses
 */
export function validateEmbedding(embedding: number[]): ValidationResult {
  const checks: ValidationResult['checks'] = {
    dimensions: 'pass',
    norm: 'pass',
    zeroVector: 'pass',
    hasNaN: 'pass',
    hasInfinity: 'pass',
  };

  let valid = true;

  // Check dimensions
  try {
    checkEmbeddingDimensions(embedding);
  } catch {
    checks.dimensions = 'fail';
    valid = false;
  }

  // Check for NaN values
  if (hasNaNValues(embedding)) {
    checks.hasNaN = 'fail';
    valid = false;
  }

  // Check for Infinity values
  if (hasInfinityValues(embedding)) {
    checks.hasInfinity = 'fail';
    valid = false;
  }

  // Check for zero vector
  if (isZeroVector(embedding)) {
    checks.zeroVector = 'fail';
    valid = false;
  }

  // Check normalization (warn if not normalized, don't fail)
  const normResult = checkEmbeddingNorm(embedding);
  if (!normResult.isNormalized) {
    checks.norm = 'warn';
  }

  return {
    valid,
    checks,
    metadata: {
      dimensions: embedding.length,
      l2Norm: normResult.l2Norm,
    },
  };
}
