/**
 * Per-Plan Entitlements
 * P3-4 Implementation
 *
 * Provides plan definitions, entitlement checking, and usage limit management.
 */

/**
 * Plan types
 */
export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/**
 * Entitlement features
 */
export type EntitlementFeature =
  | 'patterns'
  | 'generations'
  | 'semanticSearch'
  | 'pdfExport'
  | 'apiAccess'
  | 'customBranding'
  | 'sso'
  | 'dedicatedSupport';

/**
 * Plan entitlements interface
 */
export interface PlanEntitlements {
  maxPatterns: number;
  maxGenerations: number;
  semanticSearch: boolean;
  pdfExport: boolean;
  apiAccess: boolean;
  customBranding: boolean;
  sso: boolean;
  dedicatedSupport: boolean;
}

/**
 * Plan definition
 */
export interface PlanDefinition {
  name: string;
  entitlements: PlanEntitlements;
}

/**
 * Plan definitions
 */
export const PLANS: Record<PlanType, PlanDefinition> = {
  FREE: {
    name: 'Free',
    entitlements: {
      maxPatterns: 5,
      maxGenerations: 10,
      semanticSearch: false,
      pdfExport: false,
      apiAccess: false,
      customBranding: false,
      sso: false,
      dedicatedSupport: false,
    },
  },
  PRO: {
    name: 'Pro',
    entitlements: {
      maxPatterns: 50,
      maxGenerations: 100,
      semanticSearch: true,
      pdfExport: true,
      apiAccess: true,
      customBranding: false,
      sso: false,
      dedicatedSupport: false,
    },
  },
  ENTERPRISE: {
    name: 'Enterprise',
    entitlements: {
      maxPatterns: Infinity,
      maxGenerations: Infinity,
      semanticSearch: true,
      pdfExport: true,
      apiAccess: true,
      customBranding: true,
      sso: true,
      dedicatedSupport: true,
    },
  },
};

/**
 * Feature to required plan mapping
 */
const FEATURE_REQUIRED_PLAN: Record<EntitlementFeature, PlanType> = {
  patterns: 'FREE',
  generations: 'FREE',
  semanticSearch: 'PRO',
  pdfExport: 'PRO',
  apiAccess: 'PRO',
  customBranding: 'ENTERPRISE',
  sso: 'ENTERPRISE',
  dedicatedSupport: 'ENTERPRISE',
};

/**
 * Feature to limit property mapping
 */
const FEATURE_LIMIT_PROPERTY: Partial<Record<EntitlementFeature, keyof PlanEntitlements>> = {
  patterns: 'maxPatterns',
  generations: 'maxGenerations',
};

/**
 * In-memory storage for organization plans
 */
const organizationPlans = new Map<string, PlanType>();

/**
 * In-memory storage for usage tracking
 */
const usageTracking = new Map<string, Map<string, number>>();

/**
 * Clear entitlement store (for testing)
 */
export function clearEntitlementStore(): void {
  organizationPlans.clear();
  usageTracking.clear();
}

/**
 * Get plan entitlements
 *
 * @param plan - Plan type
 * @returns Plan entitlements
 */
export function getPlanEntitlements(plan: PlanType): PlanEntitlements {
  const planDef = PLANS[plan];
  if (!planDef) {
    return PLANS.FREE.entitlements;
  }
  return planDef.entitlements;
}

/**
 * Get organization plan
 *
 * @param organizationId - Organization ID
 * @returns Plan type (defaults to FREE)
 */
export async function getOrganizationPlan(
  organizationId: string
): Promise<PlanType> {
  return organizationPlans.get(organizationId) || 'FREE';
}

/**
 * Set organization plan
 *
 * @param organizationId - Organization ID
 * @param plan - Plan type
 */
export async function setOrganizationPlan(
  organizationId: string,
  plan: PlanType
): Promise<void> {
  organizationPlans.set(organizationId, plan);
}

/**
 * Record usage
 *
 * @param organizationId - Organization ID
 * @param feature - Feature name
 */
export async function recordUsage(
  organizationId: string,
  feature: string
): Promise<void> {
  let orgUsage = usageTracking.get(organizationId);
  if (!orgUsage) {
    orgUsage = new Map<string, number>();
    usageTracking.set(organizationId, orgUsage);
  }

  const current = orgUsage.get(feature) || 0;
  orgUsage.set(feature, current + 1);
}

/**
 * Get current usage
 *
 * @param organizationId - Organization ID
 * @param feature - Feature name
 * @returns Current usage count
 */
export async function getCurrentUsage(
  organizationId: string,
  feature: string
): Promise<number> {
  const orgUsage = usageTracking.get(organizationId);
  return orgUsage?.get(feature) || 0;
}

/**
 * Check entitlement params
 */
export interface CheckEntitlementParams {
  organizationId: string;
  feature: EntitlementFeature;
  currentUsage?: number;
}

/**
 * Check entitlement result
 */
export interface CheckEntitlementResult {
  entitled: boolean;
  limitReached: boolean;
  currentUsage?: number;
  maxUsage?: number;
  requiredPlan?: PlanType;
}

/**
 * Check if organization is entitled to a feature
 *
 * @param params - Check parameters
 * @returns Entitlement check result
 */
export async function checkEntitlement(
  params: CheckEntitlementParams
): Promise<CheckEntitlementResult> {
  const { organizationId, feature, currentUsage } = params;

  // Get organization's plan
  const plan = await getOrganizationPlan(organizationId);
  const entitlements = getPlanEntitlements(plan);

  // Check if feature is valid
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature];
  if (!requiredPlan) {
    return {
      entitled: false,
      limitReached: false,
      requiredPlan: undefined,
    };
  }

  // Check boolean entitlements
  const booleanFeatures: EntitlementFeature[] = [
    'semanticSearch',
    'pdfExport',
    'apiAccess',
    'customBranding',
    'sso',
    'dedicatedSupport',
  ];

  if (booleanFeatures.includes(feature)) {
    const entitled = entitlements[feature as keyof PlanEntitlements] === true;
    return {
      entitled,
      limitReached: false,
      requiredPlan: entitled ? undefined : requiredPlan,
    };
  }

  // Check usage limits for patterns and generations
  const limitProperty = FEATURE_LIMIT_PROPERTY[feature];
  if (limitProperty) {
    const maxUsage = entitlements[limitProperty] as number;
    const usage = currentUsage ?? (await getCurrentUsage(organizationId, feature));

    const limitReached = usage >= maxUsage;
    const entitled = !limitReached;

    return {
      entitled,
      limitReached,
      currentUsage: usage,
      maxUsage,
      requiredPlan: entitled ? undefined : getUpgradePlan(plan),
    };
  }

  return {
    entitled: false,
    limitReached: false,
  };
}

/**
 * Get the next upgrade plan
 *
 * @param currentPlan - Current plan
 * @returns Next plan or undefined
 */
function getUpgradePlan(currentPlan: PlanType): PlanType | undefined {
  const planOrder: PlanType[] = ['FREE', 'PRO', 'ENTERPRISE'];
  const currentIndex = planOrder.indexOf(currentPlan);

  if (currentIndex < planOrder.length - 1) {
    return planOrder[currentIndex + 1];
  }

  return undefined;
}

/**
 * Get all features available for a plan
 *
 * @param plan - Plan type
 * @returns Array of available features
 */
export function getAvailableFeatures(plan: PlanType): EntitlementFeature[] {
  const entitlements = getPlanEntitlements(plan);
  const features: EntitlementFeature[] = [];

  if (entitlements.maxPatterns > 0) features.push('patterns');
  if (entitlements.maxGenerations > 0) features.push('generations');
  if (entitlements.semanticSearch) features.push('semanticSearch');
  if (entitlements.pdfExport) features.push('pdfExport');
  if (entitlements.apiAccess) features.push('apiAccess');
  if (entitlements.customBranding) features.push('customBranding');
  if (entitlements.sso) features.push('sso');
  if (entitlements.dedicatedSupport) features.push('dedicatedSupport');

  return features;
}
