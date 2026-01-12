/**
 * Anomaly Detection Service
 * Identifies unusual patterns in complaint data
 */

import { prisma } from '@/lib/db';
import { calculateRollingStats, calculateZScore, TimeSeries, TimePoint } from './trend-detection';

// Types
export type AnomalyType = 'SPIKE' | 'LEVEL_SHIFT' | 'SEASONAL' | 'COLLECTIVE' | 'UNKNOWN';

export interface Anomaly {
  date: Date;
  value: number;
  expectedValue: number;
  deviation: number;
  type: AnomalyType;
  relatedAnomalies?: string[];
}

export interface IQRAnomaly {
  index: number;
  value: number;
  lowerBound: number;
  upperBound: number;
}

export interface LevelShiftResult {
  date: Date;
  type: 'LEVEL_SHIFT';
  beforeMean: number;
  afterMean: number;
  changePercent: number;
}

export interface AnomalyAlert {
  patternId: string;
  patternName: string;
  severity: number;
  anomalies: Anomaly[];
  recommendedAction: string;
}

export interface IQROptions {
  multiplier?: number;
}

export interface LevelShiftOptions {
  windowSize?: number;
  minChangePercent?: number;
}

export interface SeasonalOptions {
  seasonLength?: number;
}

export interface ClassifyContext {
  previousValues: number[];
  nextValues: number[];
}

export type { TimeSeries, TimePoint };

/**
 * Detect anomalies using Interquartile Range (IQR) method
 */
export function detectIQRAnomalies(values: number[], options: IQROptions = {}): IQRAnomaly[] {
  const { multiplier = 1.5 } = options;

  if (values.length < 4) {
    return [];
  }

  // Sort values to find quartiles
  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);

  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  const anomalies: IQRAnomaly[] = [];

  for (let i = 0; i < values.length; i++) {
    if (values[i] < lowerBound || values[i] > upperBound) {
      anomalies.push({
        index: i,
        value: values[i],
        lowerBound,
        upperBound,
      });
    }
  }

  return anomalies;
}

/**
 * Detect level shift (sustained change in mean)
 */
export function detectLevelShift(
  timeSeries: TimeSeries,
  options: LevelShiftOptions = {}
): LevelShiftResult[] {
  const { windowSize = 4, minChangePercent = 50 } = options;

  if (timeSeries.length < windowSize * 2) {
    return [];
  }

  const shifts: LevelShiftResult[] = [];

  for (let i = windowSize; i <= timeSeries.length - windowSize; i++) {
    const beforeWindow = timeSeries.slice(i - windowSize, i);
    const afterWindow = timeSeries.slice(i, i + windowSize);

    const beforeMean = beforeWindow.reduce((a, b) => a + b.value, 0) / beforeWindow.length;
    const afterMean = afterWindow.reduce((a, b) => a + b.value, 0) / afterWindow.length;

    if (beforeMean === 0) continue;

    const changePercent = ((afterMean - beforeMean) / beforeMean) * 100;

    if (Math.abs(changePercent) >= minChangePercent) {
      shifts.push({
        date: timeSeries[i].date,
        type: 'LEVEL_SHIFT',
        beforeMean,
        afterMean,
        changePercent,
      });
    }
  }

  return shifts;
}

/**
 * Detect seasonal anomalies (deviation from seasonal pattern)
 */
export function detectSeasonalAnomaly(
  timeSeries: TimeSeries,
  options: SeasonalOptions = {}
): Anomaly[] {
  const { seasonLength = 52 } = options; // Default: weekly seasonality over a year

  if (timeSeries.length < seasonLength * 2) {
    return [];
  }

  // Calculate seasonal averages
  const seasonalMeans: number[] = new Array(seasonLength).fill(0);
  const seasonalCounts: number[] = new Array(seasonLength).fill(0);

  for (let i = 0; i < timeSeries.length; i++) {
    const seasonIndex = i % seasonLength;
    seasonalMeans[seasonIndex] += timeSeries[i].value;
    seasonalCounts[seasonIndex]++;
  }

  for (let i = 0; i < seasonLength; i++) {
    if (seasonalCounts[i] > 0) {
      seasonalMeans[i] /= seasonalCounts[i];
    }
  }

  // Calculate standard deviation for each season
  const seasonalStdDevs: number[] = new Array(seasonLength).fill(0);

  for (let i = 0; i < timeSeries.length; i++) {
    const seasonIndex = i % seasonLength;
    seasonalStdDevs[seasonIndex] += Math.pow(
      timeSeries[i].value - seasonalMeans[seasonIndex],
      2
    );
  }

  for (let i = 0; i < seasonLength; i++) {
    if (seasonalCounts[i] > 1) {
      seasonalStdDevs[i] = Math.sqrt(seasonalStdDevs[i] / (seasonalCounts[i] - 1));
    }
  }

  // Detect anomalies
  const anomalies: Anomaly[] = [];

  for (let i = 0; i < timeSeries.length; i++) {
    const seasonIndex = i % seasonLength;
    const expectedValue = seasonalMeans[seasonIndex];
    const stdDev = seasonalStdDevs[seasonIndex];

    if (stdDev > 0) {
      const zScore = (timeSeries[i].value - expectedValue) / stdDev;

      if (Math.abs(zScore) > 3) {
        anomalies.push({
          date: timeSeries[i].date,
          value: timeSeries[i].value,
          expectedValue,
          deviation: zScore,
          type: 'SEASONAL',
        });
      }
    }
  }

  return anomalies;
}

/**
 * Classify an anomaly based on context
 */
export function classifyAnomaly(anomaly: Anomaly, context: ClassifyContext): Anomaly {
  const { previousValues, nextValues } = context;

  // Check if related anomalies exist (collective anomaly)
  if (anomaly.relatedAnomalies && anomaly.relatedAnomalies.length >= 3) {
    return { ...anomaly, type: 'COLLECTIVE' };
  }

  // Calculate average of next values to detect level shift
  if (nextValues.length >= 3) {
    const avgPrev =
      previousValues.length > 0
        ? previousValues.reduce((a, b) => a + b, 0) / previousValues.length
        : 0;
    const avgNext = nextValues.reduce((a, b) => a + b, 0) / nextValues.length;

    // If values stay high after the anomaly, it's a level shift
    if (avgNext > avgPrev * 2 && Math.abs(avgNext - anomaly.value) < anomaly.value * 0.3) {
      return { ...anomaly, type: 'LEVEL_SHIFT' };
    }
  }

  // Default to spike if value returns to normal
  if (nextValues.length > 0) {
    const avgNext = nextValues.reduce((a, b) => a + b, 0) / nextValues.length;
    if (avgNext < anomaly.value * 0.5) {
      return { ...anomaly, type: 'SPIKE' };
    }
  }

  return { ...anomaly, type: 'SPIKE' };
}

/**
 * Detect all types of anomalies in a time series
 */
export async function detectAnomalies(timeSeries: TimeSeries): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const values = timeSeries.map((t) => t.value);

  // IQR-based detection
  const iqrAnomalies = detectIQRAnomalies(values, { multiplier: 1.5 });

  for (const iqr of iqrAnomalies) {
    const point = timeSeries[iqr.index];
    const rollingStats = calculateRollingStats(values.slice(0, iqr.index), 4);
    const lastStats = rollingStats[rollingStats.length - 1];
    const expectedValue = lastStats?.mean || values.slice(0, iqr.index).reduce((a, b) => a + b, 0) / iqr.index || 0;

    const anomaly: Anomaly = {
      date: point.date,
      value: point.value,
      expectedValue,
      deviation: (point.value - expectedValue) / (lastStats?.stdDev || 1),
      type: 'UNKNOWN',
    };

    // Classify the anomaly
    const classified = classifyAnomaly(anomaly, {
      previousValues: values.slice(Math.max(0, iqr.index - 4), iqr.index),
      nextValues: values.slice(iqr.index + 1, Math.min(values.length, iqr.index + 4)),
    });

    anomalies.push(classified);
  }

  return anomalies;
}

/**
 * Get anomaly alerts for all patterns
 */
export async function getAnomalyAlerts(): Promise<AnomalyAlert[]> {
  const patterns = await prisma.pattern.findMany({
    where: { isActive: true },
    select: { id: true, name: true, severityScore: true },
  });

  const alerts: AnomalyAlert[] = [];

  for (const pattern of patterns) {
    // Get weekly complaint counts
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // 3 months

    const complaints = await prisma.complaint.groupBy({
      by: ['dateAdded'],
      where: {
        clusterId: pattern.id,
        dateAdded: { gte: startDate },
      },
      _count: { id: true },
    });

    // Convert to time series
    const weeklyMap = new Map<string, number>();
    for (const c of complaints) {
      const date = new Date(c.dateAdded);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + c._count.id);
    }

    const timeSeries: TimeSeries = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, count]) => ({
        date: new Date(dateStr),
        value: count,
      }));

    if (timeSeries.length < 4) continue;

    // Detect anomalies
    const anomalies = await detectAnomalies(timeSeries);

    if (anomalies.length > 0) {
      // Determine recommended action
      let recommendedAction = 'Monitor closely';
      if (anomalies.some((a) => a.type === 'LEVEL_SHIFT')) {
        recommendedAction = 'Investigate sustained increase in complaints';
      } else if (anomalies.some((a) => a.type === 'SPIKE' && a.deviation > 5)) {
        recommendedAction = 'Urgent review needed - significant spike detected';
      }

      alerts.push({
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severityScore || 0,
        anomalies,
        recommendedAction,
      });
    }
  }

  // Sort by severity
  alerts.sort((a, b) => b.severity - a.severity);

  return alerts;
}

/**
 * Get recent anomalies for a specific pattern
 */
export async function getPatternAnomalies(
  patternId: string,
  weeks: number = 12
): Promise<Anomaly[]> {
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

  const timeSeries: TimeSeries = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateStr, count]) => ({
      date: new Date(dateStr),
      value: count,
    }));

  return detectAnomalies(timeSeries);
}
