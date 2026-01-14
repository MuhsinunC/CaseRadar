/**
 * AI Model Version Tracking
 * P2-13 Implementation
 *
 * Provides functions for tracking AI model versions for audit trail.
 * Enables querying and reporting on model usage.
 */

/**
 * Provider types supported
 */
export type AIProvider = 'openai' | 'anthropic';

/**
 * Input for tracking a model version
 */
export interface ModelVersionInput {
  provider: AIProvider;
  model: string;
  promptVersion?: string;
  promptHash?: string;
  responseId?: string;
  tokensUsed?: { prompt: number; completion: number };
  requestId?: string;
}

/**
 * Complete model version info with tracking metadata
 */
export interface ModelVersionInfo {
  id: string;
  provider: AIProvider;
  model: string;
  promptVersion: string;
  promptHash?: string;
  responseId?: string;
  tokensUsed?: { prompt: number; completion: number };
  requestId?: string;
  timestamp: Date;
}

/**
 * Query parameters for model version reports
 */
export interface ModelVersionQuery {
  provider?: AIProvider;
  model?: string;
  promptVersion?: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: 'model' | 'provider' | 'promptVersion';
}

/**
 * Report entry for model version usage
 */
export interface ModelVersionReport {
  provider: AIProvider;
  model: string;
  promptVersion?: string;
  count: number;
  totalTokens: number;
  firstUsed: Date;
  lastUsed: Date;
}

/**
 * In-memory storage for model versions (for non-database tracking)
 */
const modelVersionStore: ModelVersionInfo[] = [];

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;

/**
 * Generate a unique ID for tracking
 */
function generateId(): string {
  return `mv_${Date.now()}_${++idCounter}`;
}

/**
 * Default prompt version when not specified
 */
const DEFAULT_PROMPT_VERSION = '1.0.0';

/**
 * Track a model version
 *
 * Records model version information for audit trail purposes.
 * Can be used during complaint generation to capture which model was used.
 *
 * @param input - Model version tracking input
 * @returns The tracked model version info
 */
export async function trackModelVersion(
  input: ModelVersionInput
): Promise<ModelVersionInfo> {
  // Normalize input with defaults
  const provider = input.provider || 'openai';
  const model = input.model || 'unknown';
  const promptVersion = input.promptVersion || DEFAULT_PROMPT_VERSION;

  const versionInfo: ModelVersionInfo = {
    id: generateId(),
    provider,
    model,
    promptVersion,
    promptHash: input.promptHash,
    responseId: input.responseId,
    tokensUsed: input.tokensUsed,
    requestId: input.requestId,
    timestamp: new Date(),
  };

  // Store the version info
  modelVersionStore.push(versionInfo);

  return versionInfo;
}

/**
 * Get model version usage report
 *
 * Generates a report of model version usage based on query parameters.
 * Supports filtering by provider, date range, and grouping options.
 *
 * @param query - Query parameters for the report
 * @returns Array of report entries
 */
export async function getModelVersionInfo(
  query: ModelVersionQuery
): Promise<ModelVersionReport[]> {
  // Filter stored versions based on query
  let filtered = modelVersionStore.filter((v) => {
    // Filter by provider
    if (query.provider && v.provider !== query.provider) {
      return false;
    }

    // Filter by model
    if (query.model && v.model !== query.model) {
      return false;
    }

    // Filter by prompt version
    if (query.promptVersion && v.promptVersion !== query.promptVersion) {
      return false;
    }

    // Filter by date range
    if (query.startDate && v.timestamp < query.startDate) {
      return false;
    }
    if (query.endDate && v.timestamp > query.endDate) {
      return false;
    }

    return true;
  });

  // Group the results
  const groupBy = query.groupBy || 'model';
  const grouped = new Map<string, ModelVersionInfo[]>();

  for (const version of filtered) {
    let key: string;
    switch (groupBy) {
      case 'provider':
        key = version.provider;
        break;
      case 'promptVersion':
        key = `${version.provider}:${version.promptVersion}`;
        break;
      case 'model':
      default:
        key = version.model;
        break;
    }

    const existing = grouped.get(key) || [];
    existing.push(version);
    grouped.set(key, existing);
  }

  // Build report entries
  const report: ModelVersionReport[] = [];

  for (const [_key, versions] of grouped) {
    if (versions.length === 0) continue;

    const first = versions[0];
    const timestamps = versions.map((v) => v.timestamp.getTime());

    const totalTokens = versions.reduce((sum, v) => {
      if (v.tokensUsed) {
        return sum + v.tokensUsed.prompt + v.tokensUsed.completion;
      }
      return sum;
    }, 0);

    report.push({
      provider: first.provider,
      model: first.model,
      promptVersion: first.promptVersion,
      count: versions.length,
      totalTokens,
      firstUsed: new Date(Math.min(...timestamps)),
      lastUsed: new Date(Math.max(...timestamps)),
    });
  }

  return report;
}

/**
 * Clear stored versions (for testing)
 */
export function clearModelVersionStore(): void {
  modelVersionStore.length = 0;
  idCounter = 0;
}

/**
 * Get all stored versions (for testing)
 */
export function getStoredVersions(): ModelVersionInfo[] {
  return [...modelVersionStore];
}
