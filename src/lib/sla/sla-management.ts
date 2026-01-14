/**
 * SLA Management System
 * P3-1 Implementation
 *
 * Provides SLA definitions, uptime calculation, breach detection,
 * credit calculation, and reporting for enterprise customers.
 */

/**
 * Plan types
 */
export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/**
 * SLA metrics types
 */
export type SLAMetric = 'uptime' | 'latency' | 'support';

/**
 * Period types
 */
export type SLAPeriod = 'month' | 'quarter' | 'year';

/**
 * SLA definition for a plan
 */
export interface SLAPlanDefinition {
  uptimeTarget: number;
  responseTimeP95: number;
  supportResponseTime?: number;
  creditTiers: CreditTier[];
}

/**
 * Credit tier definition
 */
interface CreditTier {
  threshold: number; // Uptime below this triggers credit
  creditPercentage: number;
}

/**
 * SLA definitions by plan
 */
export const SLADefinition: Record<PlanType, SLAPlanDefinition> = {
  FREE: {
    uptimeTarget: 0.99, // 99%
    responseTimeP95: 2000, // 2 seconds
    supportResponseTime: undefined, // No SLA
    creditTiers: [],
  },
  PRO: {
    uptimeTarget: 0.999, // 99.9%
    responseTimeP95: 500, // 500ms
    supportResponseTime: 24, // 24 hours
    creditTiers: [
      { threshold: 0.999, creditPercentage: 10 },
      { threshold: 0.99, creditPercentage: 25 },
      { threshold: 0.95, creditPercentage: 50 },
    ],
  },
  ENTERPRISE: {
    uptimeTarget: 0.9999, // 99.99%
    responseTimeP95: 200, // 200ms
    supportResponseTime: 4, // 4 hours
    creditTiers: [
      { threshold: 0.9999, creditPercentage: 10 },
      { threshold: 0.999, creditPercentage: 25 },
      { threshold: 0.99, creditPercentage: 50 },
    ],
  },
};

/**
 * Uptime event
 */
interface UptimeEvent {
  organizationId: string;
  status: 'up' | 'down' | 'maintenance';
  duration: number; // minutes
  timestamp?: Date;
}

/**
 * Latency event
 */
interface LatencyEvent {
  organizationId: string;
  p95: number; // milliseconds
  timestamp?: Date;
}

/**
 * In-memory storage for events
 */
const uptimeEvents: UptimeEvent[] = [];
const latencyEvents: LatencyEvent[] = [];

/**
 * Record an uptime event
 */
export async function recordUptimeEvent(event: UptimeEvent): Promise<void> {
  uptimeEvents.push({
    ...event,
    timestamp: event.timestamp || new Date(),
  });
}

/**
 * Record a latency event
 */
export async function recordLatencyEvent(event: LatencyEvent): Promise<void> {
  latencyEvents.push({
    ...event,
    timestamp: event.timestamp || new Date(),
  });
}

/**
 * Clear stored events (for testing)
 */
export function clearSLAStore(): void {
  uptimeEvents.length = 0;
  latencyEvents.length = 0;
}

/**
 * Uptime calculation params
 */
export interface UptimeParams {
  organizationId: string;
  period: SLAPeriod;
  excludeScheduledMaintenance?: boolean;
}

/**
 * Uptime result
 */
export interface UptimeResult {
  percentage: number;
  downtimeMinutes: number;
  uptimeMinutes: number;
  totalMinutes: number;
  excludedMinutes: number;
  period: SLAPeriod;
}

/**
 * Calculate uptime for an organization
 */
export async function calculateUptime(
  params: UptimeParams
): Promise<UptimeResult> {
  const { organizationId, period, excludeScheduledMaintenance } = params;

  // Get events for this organization
  const orgEvents = uptimeEvents.filter(
    (e) => e.organizationId === organizationId
  );

  if (orgEvents.length === 0) {
    // No data, assume 100% uptime
    return {
      percentage: 100,
      downtimeMinutes: 0,
      uptimeMinutes: getMinutesForPeriod(period),
      totalMinutes: getMinutesForPeriod(period),
      excludedMinutes: 0,
      period,
    };
  }

  let uptimeMinutes = 0;
  let downtimeMinutes = 0;
  let excludedMinutes = 0;

  for (const event of orgEvents) {
    if (event.status === 'up') {
      uptimeMinutes += event.duration;
    } else if (event.status === 'down') {
      downtimeMinutes += event.duration;
    } else if (event.status === 'maintenance') {
      if (excludeScheduledMaintenance) {
        excludedMinutes += event.duration;
      } else {
        downtimeMinutes += event.duration;
      }
    }
  }

  const totalMinutes = uptimeMinutes + downtimeMinutes;
  const percentage =
    totalMinutes > 0 ? (uptimeMinutes / totalMinutes) * 100 : 100;

  return {
    percentage,
    downtimeMinutes,
    uptimeMinutes,
    totalMinutes,
    excludedMinutes,
    period,
  };
}

/**
 * Get minutes for a period
 */
function getMinutesForPeriod(period: SLAPeriod): number {
  switch (period) {
    case 'month':
      return 43200; // 30 days
    case 'quarter':
      return 129600; // 90 days
    case 'year':
      return 525600; // 365 days
  }
}

/**
 * SLA breach check params
 */
export interface SLABreachParams {
  organizationId: string;
  metric: SLAMetric;
  period: SLAPeriod;
  plan?: PlanType;
}

/**
 * SLA breach result
 */
export interface SLABreachResult {
  breached: boolean;
  metric: SLAMetric;
  target: number;
  actual: number;
  period: SLAPeriod;
}

/**
 * Check for SLA breach
 */
export async function checkSLABreach(
  params: SLABreachParams
): Promise<SLABreachResult> {
  const { organizationId, metric, period, plan = 'PRO' } = params;

  const slaDef = SLADefinition[plan];
  if (!slaDef) {
    return {
      breached: false,
      metric,
      target: 0,
      actual: 0,
      period,
    };
  }

  if (metric === 'uptime') {
    const uptime = await calculateUptime({
      organizationId,
      period,
    });

    const uptimeDecimal = uptime.percentage / 100;
    return {
      breached: uptimeDecimal < slaDef.uptimeTarget,
      metric,
      target: slaDef.uptimeTarget * 100,
      actual: uptime.percentage,
      period,
    };
  }

  if (metric === 'latency') {
    const orgEvents = latencyEvents.filter(
      (e) => e.organizationId === organizationId
    );

    const avgP95 =
      orgEvents.length > 0
        ? orgEvents.reduce((sum, e) => sum + e.p95, 0) / orgEvents.length
        : 0;

    return {
      breached: avgP95 > slaDef.responseTimeP95,
      metric,
      target: slaDef.responseTimeP95,
      actual: avgP95,
      period,
    };
  }

  return {
    breached: false,
    metric,
    target: 0,
    actual: 0,
    period,
  };
}

/**
 * SLA credit params
 */
export interface SLACreditParams {
  target: number;
  actual: number;
  plan: PlanType;
  monthlyFee?: number;
}

/**
 * SLA credit result
 */
export interface SLACreditResult {
  creditPercentage: number;
  creditAmount: number;
  eligible: boolean;
}

/**
 * Calculate SLA credit
 */
export function calculateSLACredit(params: SLACreditParams): SLACreditResult {
  const { target, actual, plan, monthlyFee = 0 } = params;

  // FREE plan doesn't get credits
  if (plan === 'FREE') {
    return {
      creditPercentage: 0,
      creditAmount: 0,
      eligible: false,
    };
  }

  // No breach, no credit
  if (actual >= target) {
    return {
      creditPercentage: 0,
      creditAmount: 0,
      eligible: true,
    };
  }

  const slaDef = SLADefinition[plan];
  if (!slaDef) {
    return {
      creditPercentage: 0,
      creditAmount: 0,
      eligible: false,
    };
  }

  // Find applicable credit tier
  const actualDecimal = actual / 100;
  let creditPercentage = 0;

  for (const tier of slaDef.creditTiers) {
    if (actualDecimal < tier.threshold) {
      creditPercentage = tier.creditPercentage;
    }
  }

  // Cap at 50%
  creditPercentage = Math.min(creditPercentage, 50);

  const creditAmount = Math.round(monthlyFee * (creditPercentage / 100) * 10) / 10;

  return {
    creditPercentage,
    creditAmount,
    eligible: true,
  };
}

/**
 * SLA report params
 */
export interface SLAReportParams {
  organizationId: string;
  month: string;
  plan?: PlanType;
}

/**
 * SLA report
 */
export interface SLAReport {
  organizationId: string;
  period: string;
  uptime: {
    percentage: number;
    target: number;
    downtimeMinutes: number;
  };
  latency: {
    p95: number;
    target: number;
  };
  breaches: SLABreachResult[];
  credits: SLACreditResult;
}

/**
 * Generate SLA report
 */
export async function getSLAReport(
  params: SLAReportParams
): Promise<SLAReport> {
  const { organizationId, month, plan = 'PRO' } = params;

  const slaDef = SLADefinition[plan] || SLADefinition.PRO;

  // Calculate uptime
  const uptimeResult = await calculateUptime({
    organizationId,
    period: 'month',
    excludeScheduledMaintenance: true,
  });

  // Get latency
  const orgLatencyEvents = latencyEvents.filter(
    (e) => e.organizationId === organizationId
  );
  const avgP95 =
    orgLatencyEvents.length > 0
      ? orgLatencyEvents.reduce((sum, e) => sum + e.p95, 0) /
        orgLatencyEvents.length
      : 0;

  // Check for breaches
  const breaches: SLABreachResult[] = [];

  const uptimeBreach = await checkSLABreach({
    organizationId,
    metric: 'uptime',
    period: 'month',
    plan,
  });
  if (uptimeBreach.breached) {
    breaches.push(uptimeBreach);
  }

  const latencyBreach = await checkSLABreach({
    organizationId,
    metric: 'latency',
    period: 'month',
    plan,
  });
  if (latencyBreach.breached) {
    breaches.push(latencyBreach);
  }

  // Calculate credits
  const credits = calculateSLACredit({
    target: slaDef.uptimeTarget * 100,
    actual: uptimeResult.percentage,
    plan,
  });

  return {
    organizationId,
    period: month,
    uptime: {
      percentage: uptimeResult.percentage,
      target: slaDef.uptimeTarget * 100,
      downtimeMinutes: uptimeResult.downtimeMinutes,
    },
    latency: {
      p95: avgP95,
      target: slaDef.responseTimeP95,
    },
    breaches,
    credits,
  };
}
