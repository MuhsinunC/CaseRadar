/**
 * AI Cost Tracking
 * P2-8 Implementation
 *
 * Tracks and monitors AI API costs for budget management and reporting.
 */

/**
 * Model pricing per 1M tokens (as of 2024)
 */
export const MODEL_PRICING: Record<
  string,
  { inputPer1M: number; outputPer1M: number }
> = {
  // OpenAI Embeddings
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  'text-embedding-3-large': { inputPer1M: 0.13, outputPer1M: 0 },
  'text-embedding-ada-002': { inputPer1M: 0.1, outputPer1M: 0 },

  // Claude Models
  'claude-3-opus-20240229': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-sonnet-20240229': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0 },

  // Default for unknown models
  default: { inputPer1M: 1.0, outputPer1M: 5.0 },
};

/**
 * AI operation types
 */
export type AIOperation = 'EMBEDDING' | 'COMPLETION';

/**
 * Parameters for tracking AI cost
 */
export interface TrackAICostParams {
  operation: AIOperation;
  model: string;
  inputTokens: number;
  outputTokens: number;
  organizationId: string;
}

/**
 * Result of cost tracking
 */
export interface TrackAICostResult {
  costUSD: number;
  inputCostUSD: number;
  outputCostUSD: number;
  timestamp: Date;
  operation: AIOperation;
  model: string;
  organizationId: string;
}

/**
 * Cost record stored in memory
 */
interface CostRecord extends TrackAICostResult {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Parameters for cost summary
 */
export interface CostSummaryParams {
  organizationId: string;
  period: 'day' | 'week' | 'month' | 'year';
  groupBy?: 'model' | 'operation';
}

/**
 * Cost summary result
 */
export interface CostSummaryResult {
  totalCostUSD: number;
  embeddingCostUSD: number;
  completionCostUSD: number;
  requestCount: number;
  period: string;
  byModel?: Record<string, number>;
  byOperation?: Record<string, number>;
}

/**
 * Budget threshold check parameters
 */
export interface BudgetThresholdParams {
  organizationId: string;
  monthlyBudgetUSD: number;
  alertOnThreshold?: boolean;
}

/**
 * Budget threshold check result
 */
export interface BudgetThresholdResult {
  status: 'OK' | 'WARNING' | 'EXCEEDED';
  percentUsed: number;
  currentUsageUSD: number;
  budgetUSD: number;
  remainingUSD: number;
}

/**
 * Budget alert details
 */
export interface BudgetAlertDetails {
  type: 'WARNING' | 'CRITICAL';
  threshold: number;
  organizationId: string;
  currentUsageUSD: number;
  budgetUSD: number;
  createdAt: Date;
}

// In-memory storage
const costRecords: CostRecord[] = [];
const mockUsage: Map<string, number> = new Map();
const alertHistory: BudgetAlertDetails[] = [];

/**
 * AIBudgetAlert utility for creating alerts
 */
export const AIBudgetAlert = {
  /**
   * Create a budget alert
   */
  create(
    details: Omit<BudgetAlertDetails, 'createdAt'>
  ): BudgetAlertDetails {
    const alert: BudgetAlertDetails = {
      ...details,
      createdAt: new Date(),
    };
    alertHistory.push(alert);
    console.warn('[AIBudgetAlert] Budget threshold reached:', alert);
    return alert;
  },

  /**
   * Get alert history
   */
  getHistory(): BudgetAlertDetails[] {
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
 * Get pricing for a model
 */
function getModelPricing(model: string): {
  inputPer1M: number;
  outputPer1M: number;
} {
  return MODEL_PRICING[model] || MODEL_PRICING['default'];
}

/**
 * Calculate cost for tokens
 */
function calculateCost(
  tokens: number,
  pricePerMillion: number
): number {
  return tokens * (pricePerMillion / 1_000_000);
}

/**
 * Track AI API cost
 *
 * @param params - Cost tracking parameters
 * @returns Cost tracking result
 */
export async function trackAICost(
  params: TrackAICostParams
): Promise<TrackAICostResult> {
  const pricing = getModelPricing(params.model);

  const inputCostUSD = calculateCost(params.inputTokens, pricing.inputPer1M);
  const outputCostUSD = calculateCost(params.outputTokens, pricing.outputPer1M);
  const costUSD = inputCostUSD + outputCostUSD;

  const record: CostRecord = {
    costUSD,
    inputCostUSD,
    outputCostUSD,
    timestamp: new Date(),
    operation: params.operation,
    model: params.model,
    organizationId: params.organizationId,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
  };

  costRecords.push(record);

  return {
    costUSD,
    inputCostUSD,
    outputCostUSD,
    timestamp: record.timestamp,
    operation: params.operation,
    model: params.model,
    organizationId: params.organizationId,
  };
}

/**
 * Get the start date for a period
 */
function getPeriodStart(period: string): Date {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }

  return start;
}

/**
 * Get AI cost summary for an organization
 *
 * @param params - Summary parameters
 * @returns Cost summary
 */
export async function getAICostSummary(
  params: CostSummaryParams
): Promise<CostSummaryResult> {
  const periodStart = getPeriodStart(params.period);

  // Filter records by organization and period
  const filteredRecords = costRecords.filter(
    (record) =>
      record.organizationId === params.organizationId &&
      record.timestamp >= periodStart
  );

  // Calculate totals
  let totalCostUSD = 0;
  let embeddingCostUSD = 0;
  let completionCostUSD = 0;

  for (const record of filteredRecords) {
    totalCostUSD += record.costUSD;
    if (record.operation === 'EMBEDDING') {
      embeddingCostUSD += record.costUSD;
    } else {
      completionCostUSD += record.costUSD;
    }
  }

  const result: CostSummaryResult = {
    totalCostUSD,
    embeddingCostUSD,
    completionCostUSD,
    requestCount: filteredRecords.length,
    period: params.period,
  };

  // Group by model if requested
  if (params.groupBy === 'model') {
    result.byModel = {};
    for (const record of filteredRecords) {
      if (!result.byModel[record.model]) {
        result.byModel[record.model] = 0;
      }
      result.byModel[record.model] += record.costUSD;
    }
  }

  // Group by operation if requested
  if (params.groupBy === 'operation') {
    result.byOperation = {
      EMBEDDING: embeddingCostUSD,
      COMPLETION: completionCostUSD,
    };
  }

  return result;
}

/**
 * Check budget threshold for an organization
 *
 * @param params - Budget threshold parameters
 * @returns Budget threshold result
 */
export async function checkBudgetThreshold(
  params: BudgetThresholdParams
): Promise<BudgetThresholdResult> {
  // Get current usage (from mock or real records)
  let currentUsageUSD = mockUsage.get(params.organizationId) ?? 0;

  // Add actual recorded costs if no mock
  if (!mockUsage.has(params.organizationId)) {
    const summary = await getAICostSummary({
      organizationId: params.organizationId,
      period: 'month',
    });
    currentUsageUSD = summary.totalCostUSD;
  }

  const percentUsed =
    params.monthlyBudgetUSD === 0
      ? 100
      : (currentUsageUSD / params.monthlyBudgetUSD) * 100;

  const remainingUSD = Math.max(0, params.monthlyBudgetUSD - currentUsageUSD);

  let status: 'OK' | 'WARNING' | 'EXCEEDED';
  if (percentUsed >= 100) {
    status = 'EXCEEDED';
  } else if (percentUsed >= 80) {
    status = 'WARNING';
  } else {
    status = 'OK';
  }

  const result: BudgetThresholdResult = {
    status,
    percentUsed,
    currentUsageUSD,
    budgetUSD: params.monthlyBudgetUSD,
    remainingUSD,
  };

  // Create alert if requested and threshold reached
  if (params.alertOnThreshold) {
    if (status === 'EXCEEDED') {
      AIBudgetAlert.create({
        type: 'CRITICAL',
        threshold: 100,
        organizationId: params.organizationId,
        currentUsageUSD,
        budgetUSD: params.monthlyBudgetUSD,
      });
    } else if (status === 'WARNING') {
      AIBudgetAlert.create({
        type: 'WARNING',
        threshold: 80,
        organizationId: params.organizationId,
        currentUsageUSD,
        budgetUSD: params.monthlyBudgetUSD,
      });
    }
  }

  return result;
}

/**
 * Clear all cost records (for testing)
 */
export function clearCostRecords(): void {
  costRecords.length = 0;
}

/**
 * Set mock usage for an organization (for testing)
 */
export function setMockUsage(
  organizationId: string,
  usageUSD: number
): void {
  mockUsage.set(organizationId, usageUSD);
}

/**
 * Clear mock usage (for testing)
 */
export function clearMockUsage(): void {
  mockUsage.clear();
}
