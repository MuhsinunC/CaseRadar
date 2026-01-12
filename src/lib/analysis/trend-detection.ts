/**
 * Trend Detection Service
 * Identifies increasing complaint frequencies using statistical methods
 */

import { prisma } from '@/lib/db';

// Types
export interface TimePoint {
  date: Date;
  value: number;
}

export type TimeSeries = TimePoint[];

export interface RollingStats {
  mean: number;
  stdDev: number;
}

export interface SpikeResult {
  date: Date;
  value: number;
  zScore: number;
  expectedValue: number;
}

export interface TrendDirectionResult {
  direction: 'INCREASING' | 'DECREASING' | 'STABLE';
  slope: number;
  rSquared: number;
  pValue: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TrendResult {
  patternId: string;
  direction: 'INCREASING' | 'DECREASING' | 'STABLE';
  trendScore: number;
  slope: number;
  rSquared: number;
  recentSpikes: SpikeResult[];
  weeklyAverages: number[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TrendAnalysisOptions {
  windowWeeks?: number;
  spikeThreshold?: number;
  updatePattern?: boolean;
}

/**
 * Calculate rolling mean and standard deviation
 */
export function calculateRollingStats(
  values: number[],
  windowSize: number
): (RollingStats | null)[] {
  const results: (RollingStats | null)[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < windowSize - 1) {
      results.push(null);
      continue;
    }

    const window = values.slice(i - windowSize + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;

    const squaredDiffs = window.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / window.length;
    const stdDev = Math.sqrt(variance);

    results.push({ mean, stdDev });
  }

  return results;
}

/**
 * Calculate Z-score
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Detect spikes using Z-score method
 */
export function detectSpike(
  timeSeries: TimeSeries,
  options: { windowSize?: number; threshold?: number } = {}
): SpikeResult[] {
  const { windowSize = 4, threshold = 3 } = options;

  const values = timeSeries.map((t) => t.value);
  const rollingStats = calculateRollingStats(values, windowSize);

  const spikes: SpikeResult[] = [];

  for (let i = windowSize; i < timeSeries.length; i++) {
    const prevStats = rollingStats[i - 1];
    if (!prevStats) continue;

    const zScore = calculateZScore(timeSeries[i].value, prevStats.mean, prevStats.stdDev);

    if (zScore > threshold) {
      spikes.push({
        date: timeSeries[i].date,
        value: timeSeries[i].value,
        zScore,
        expectedValue: prevStats.mean,
      });
    }
  }

  return spikes;
}

/**
 * Calculate linear regression
 */
function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
  pValue: number;
} {
  const n = values.length;
  if (n < 3) {
    return { slope: 0, intercept: 0, rSquared: 0, pValue: 1 };
  }

  // X values are just indices
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = i - xMean;
    const yDiff = values[i] - yMean;
    ssXY += xDiff * yDiff;
    ssXX += xDiff * xDiff;
    ssYY += yDiff * yDiff;
  }

  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = yMean - slope * xMean;
  const rSquared = ssXX !== 0 && ssYY !== 0 ? Math.pow(ssXY, 2) / (ssXX * ssYY) : 0;

  // Simplified p-value calculation based on t-statistic
  // For more accurate p-values, would need a t-distribution table or library
  const residuals = values.map((y, i) => y - (slope * i + intercept));
  const ssResidual = residuals.reduce((a, b) => a + b * b, 0);
  const standardError = ssXX !== 0 ? Math.sqrt(ssResidual / (n - 2) / ssXX) : 0;
  const tStat = standardError !== 0 ? Math.abs(slope / standardError) : 0;

  // Approximate p-value (simplified)
  const pValue = tStat > 2.5 ? 0.01 : tStat > 2 ? 0.05 : tStat > 1.5 ? 0.1 : 0.5;

  return { slope, intercept, rSquared, pValue };
}

/**
 * Calculate trend direction from values
 */
export function calculateTrendDirection(values: number[]): TrendDirectionResult {
  if (values.length < 3) {
    return {
      direction: 'STABLE',
      slope: 0,
      rSquared: 0,
      pValue: 1,
      confidence: 'LOW',
    };
  }

  const { slope, rSquared, pValue } = linearRegression(values);

  // Determine confidence based on r-squared and p-value
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (rSquared > 0.7 && pValue < 0.05) {
    confidence = 'HIGH';
  } else if (rSquared > 0.4 && pValue < 0.1) {
    confidence = 'MEDIUM';
  }

  // Determine direction
  let direction: 'INCREASING' | 'DECREASING' | 'STABLE' = 'STABLE';
  if (pValue < 0.1) {
    if (slope > 0.5) {
      direction = 'INCREASING';
    } else if (slope < -0.5) {
      direction = 'DECREASING';
    }
  }

  return { direction, slope, rSquared, pValue, confidence };
}

/**
 * Calculate trend score (combines slope and confidence)
 */
export function calculateTrendScore(slope: number, rSquared: number): number {
  // Score is slope weighted by r-squared (how well the trend fits)
  return slope * rSquared * 10; // Scale factor for readability
}

/**
 * Aggregate complaints by week for a pattern
 */
async function getWeeklyComplaintCounts(
  patternId: string,
  weeks: number
): Promise<{ date: Date; count: number }[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);

  const complaints = await prisma.complaint.groupBy({
    by: ['dateAdded'],
    where: {
      clusterId: patternId,
      dateAdded: { gte: startDate },
    },
    _count: { id: true },
  });

  // Group by week
  const weeklyMap = new Map<string, number>();

  for (const c of complaints) {
    const date = new Date(c.dateAdded);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + c._count.id);
  }

  // Sort by date
  const sortedWeeks = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateStr, count]) => ({
      date: new Date(dateStr),
      count,
    }));

  return sortedWeeks;
}

/**
 * Analyze trend for a specific pattern
 */
export async function analyzePatternTrend(
  patternId: string,
  options: TrendAnalysisOptions = {}
): Promise<TrendResult> {
  const { windowWeeks = 12, spikeThreshold = 3, updatePattern = false } = options;

  const weeklyCounts = await getWeeklyComplaintCounts(patternId, windowWeeks);

  if (weeklyCounts.length === 0) {
    return {
      patternId,
      direction: 'STABLE',
      trendScore: 0,
      slope: 0,
      rSquared: 0,
      recentSpikes: [],
      weeklyAverages: [],
      confidence: 'LOW',
    };
  }

  const values = weeklyCounts.map((w) => w.count);
  const timeSeries: TimeSeries = weeklyCounts.map((w) => ({
    date: w.date,
    value: w.count,
  }));

  // Calculate trend
  const trendResult = calculateTrendDirection(values);
  const trendScore = calculateTrendScore(trendResult.slope, trendResult.rSquared);

  // Detect spikes
  const recentSpikes = detectSpike(timeSeries, {
    windowSize: Math.min(4, Math.floor(values.length / 2)),
    threshold: spikeThreshold,
  });

  // Update pattern if requested
  if (updatePattern) {
    await prisma.pattern.update({
      where: { id: patternId },
      data: {
        trendDirection: trendResult.direction,
        trendScore,
      },
    });
  }

  return {
    patternId,
    direction: trendResult.direction,
    trendScore,
    slope: trendResult.slope,
    rSquared: trendResult.rSquared,
    recentSpikes,
    weeklyAverages: values,
    confidence: trendResult.confidence,
  };
}

/**
 * Analyze trends for all active patterns
 */
export async function analyzeAllPatternTrends(
  options: TrendAnalysisOptions = {}
): Promise<TrendResult[]> {
  const patterns = await prisma.pattern.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results: TrendResult[] = [];

  for (const pattern of patterns) {
    const result = await analyzePatternTrend(pattern.id, options);
    results.push(result);
  }

  return results;
}
