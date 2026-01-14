/**
 * SLI/SLO Tracking
 * P2-10 Implementation
 *
 * Service Level Indicator (SLI) and Service Level Objective (SLO) tracking
 * for monitoring system reliability and error budgets.
 */

/**
 * SLO Definitions for the system
 */
export const SLODefinitions = {
  availability: {
    target: 0.999, // 99.9%
    window: '30d',
    description: 'Percentage of successful requests',
  },
  latency: {
    p50Target: 200, // ms
    p95Target: 500,
    p99Target: 1000,
    window: '30d',
    description: 'Request latency percentiles',
  },
  errorRate: {
    target: 0.001, // 0.1%
    window: '30d',
    description: 'Percentage of failed requests',
  },
};

/**
 * Time window for metrics
 */
export type MetricsWindow = 'hour' | '24h' | '7d' | '30d';

/**
 * SLI type
 */
export type SLIType = 'availability' | 'latency' | 'errorRate';

/**
 * Latency percentile
 */
export type LatencyPercentile = 'p50' | 'p95' | 'p99';

/**
 * Latency record
 */
interface LatencyRecord {
  endpoint: string;
  latencyMs: number;
  timestamp: Date;
}

/**
 * Error record
 */
interface ErrorRecord {
  endpoint: string;
  errorCode: number;
  errorType: string;
  timestamp: Date;
}

/**
 * Request record
 */
interface RequestRecord {
  endpoint: string;
  success: boolean;
  latencyMs: number;
  timestamp: Date;
}

/**
 * Latency metrics result
 */
export interface LatencyMetrics {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

/**
 * SLI result
 */
export interface SLIResult {
  value: number;
  target: number;
  met: boolean;
  type: SLIType;
}

/**
 * Error budget result
 */
export interface ErrorBudgetResult {
  totalBudget: number;
  consumed: number;
  remaining: number;
  percentRemaining: number;
}

/**
 * Error budget options
 */
export interface ErrorBudgetOptions {
  alertThreshold?: number;
  onAlert?: (details: { type: SLIType; percentRemaining: number }) => void;
}

/**
 * SLI calculation options
 */
export interface SLIOptions {
  window: MetricsWindow;
  percentile?: LatencyPercentile;
}

// In-memory storage
const latencyRecords: LatencyRecord[] = [];
const errorRecords: ErrorRecord[] = [];
const requestRecords: RequestRecord[] = [];

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

/**
 * Get window start time
 */
function getWindowStart(window: MetricsWindow): Date {
  const now = new Date();
  const start = new Date(now);

  switch (window) {
    case 'hour':
      start.setHours(now.getHours() - 1);
      break;
    case '24h':
      start.setDate(now.getDate() - 1);
      break;
    case '7d':
      start.setDate(now.getDate() - 7);
      break;
    case '30d':
      start.setDate(now.getDate() - 30);
      break;
  }

  return start;
}

/**
 * Record request latency
 */
export async function recordLatency(params: {
  endpoint: string;
  latencyMs: number;
  timestamp?: Date;
}): Promise<void> {
  latencyRecords.push({
    endpoint: params.endpoint,
    latencyMs: params.latencyMs,
    timestamp: params.timestamp || new Date(),
  });
}

/**
 * Record an error
 */
export async function recordError(params: {
  endpoint: string;
  errorCode: number;
  errorType: string;
  timestamp?: Date;
}): Promise<void> {
  errorRecords.push({
    endpoint: params.endpoint,
    errorCode: params.errorCode,
    errorType: params.errorType,
    timestamp: params.timestamp || new Date(),
  });
}

/**
 * Record a request (success or failure)
 */
export async function recordRequest(params: {
  endpoint: string;
  success: boolean;
  latencyMs: number;
  timestamp?: Date;
}): Promise<void> {
  const timestamp = params.timestamp || new Date();

  requestRecords.push({
    endpoint: params.endpoint,
    success: params.success,
    latencyMs: params.latencyMs,
    timestamp,
  });

  // Also record latency
  await recordLatency({
    endpoint: params.endpoint,
    latencyMs: params.latencyMs,
    timestamp,
  });

  // Record error if failed
  if (!params.success) {
    await recordError({
      endpoint: params.endpoint,
      errorCode: 500,
      errorType: 'REQUEST_FAILED',
      timestamp,
    });
  }
}

/**
 * Get latency metrics for an endpoint
 */
export async function getLatencyMetrics(
  endpoint: string,
  window: MetricsWindow
): Promise<LatencyMetrics> {
  const windowStart = getWindowStart(window);

  const relevantRecords = latencyRecords.filter(
    (r) => r.endpoint === endpoint && r.timestamp >= windowStart
  );

  if (relevantRecords.length === 0) {
    return {
      count: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      avg: 0,
    };
  }

  const latencies = relevantRecords.map((r) => r.latencyMs).sort((a, b) => a - b);

  const sum = latencies.reduce((acc, val) => acc + val, 0);

  return {
    count: latencies.length,
    p50: calculatePercentile(latencies, 50),
    p95: calculatePercentile(latencies, 95),
    p99: calculatePercentile(latencies, 99),
    min: latencies[0],
    max: latencies[latencies.length - 1],
    avg: sum / latencies.length,
  };
}

/**
 * Get error count for an endpoint
 */
export async function getErrorCount(
  endpoint: string,
  window: MetricsWindow
): Promise<number> {
  const windowStart = getWindowStart(window);

  return errorRecords.filter(
    (r) => r.endpoint === endpoint && r.timestamp >= windowStart
  ).length;
}

/**
 * Calculate SLI
 */
export async function calculateSLI(
  type: SLIType,
  options: SLIOptions
): Promise<SLIResult> {
  const windowStart = getWindowStart(options.window);

  switch (type) {
    case 'availability': {
      const relevantRequests = requestRecords.filter(
        (r) => r.timestamp >= windowStart
      );

      if (relevantRequests.length === 0) {
        return {
          value: 1, // No data = no failures
          target: SLODefinitions.availability.target,
          met: true,
          type,
        };
      }

      const successCount = relevantRequests.filter((r) => r.success).length;
      const value = successCount / relevantRequests.length;

      return {
        value,
        target: SLODefinitions.availability.target,
        met: value >= SLODefinitions.availability.target,
        type,
      };
    }

    case 'latency': {
      const percentile = options.percentile || 'p95';
      const targetKey = `${percentile}Target` as keyof typeof SLODefinitions.latency;
      const target = SLODefinitions.latency[targetKey] as number;

      const relevantRecords = latencyRecords.filter(
        (r) => r.timestamp >= windowStart
      );

      if (relevantRecords.length === 0) {
        return {
          value: 0,
          target,
          met: true,
          type,
        };
      }

      const latencies = relevantRecords.map((r) => r.latencyMs).sort((a, b) => a - b);
      const percentileValue = calculatePercentile(
        latencies,
        parseInt(percentile.substring(1))
      );

      return {
        value: percentileValue,
        target,
        met: percentileValue <= target,
        type,
      };
    }

    case 'errorRate': {
      const relevantRequests = requestRecords.filter(
        (r) => r.timestamp >= windowStart
      );

      if (relevantRequests.length === 0) {
        return {
          value: 0,
          target: SLODefinitions.errorRate.target,
          met: true,
          type,
        };
      }

      const errorCount = relevantRequests.filter((r) => !r.success).length;
      const value = errorCount / relevantRequests.length;

      return {
        value,
        target: SLODefinitions.errorRate.target,
        met: value <= SLODefinitions.errorRate.target,
        type,
      };
    }

    default:
      throw new Error(`Unknown SLI type: ${type}`);
  }
}

/**
 * Calculate error budget
 */
export async function calculateErrorBudget(
  type: SLIType,
  options?: ErrorBudgetOptions
): Promise<ErrorBudgetResult> {
  const sli = await calculateSLI(type, { window: '30d' });

  let totalBudget: number;
  let consumed: number;

  switch (type) {
    case 'availability': {
      // Error budget = 1 - target (e.g., 0.1% for 99.9% availability)
      totalBudget = 1 - SLODefinitions.availability.target;
      // Consumed = 1 - actual availability
      consumed = 1 - sli.value;
      break;
    }
    case 'errorRate': {
      totalBudget = SLODefinitions.errorRate.target;
      consumed = sli.value;
      break;
    }
    default:
      // For latency, budget is conceptually different
      totalBudget = SLODefinitions.latency.p99Target;
      consumed = sli.value;
  }

  const remaining = totalBudget - consumed;
  const percentRemaining =
    totalBudget === 0 ? 0 : (remaining / totalBudget) * 100;

  // Alert if below threshold
  if (options?.onAlert && options.alertThreshold !== undefined) {
    if (percentRemaining < options.alertThreshold) {
      options.onAlert({
        type,
        percentRemaining,
      });
    }
  }

  return {
    totalBudget,
    consumed,
    remaining,
    percentRemaining,
  };
}

/**
 * Clear all metrics (for testing)
 */
export function clearMetrics(): void {
  latencyRecords.length = 0;
  errorRecords.length = 0;
  requestRecords.length = 0;
}
