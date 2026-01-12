/**
 * Billing Service
 * Stripe billing operations for subscription management
 */

import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import type { Plan, SubscriptionStatus } from '@prisma/client';

// Lazy Stripe initialization to avoid build-time errors
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripe = new Stripe(apiKey, {
      apiVersion: '2025-12-15.clover',
    });
  }
  return _stripe;
}

// Valid price IDs (should match Stripe Dashboard)
const VALID_PRICE_IDS = [
  'price_basic_monthly',
  'price_basic_yearly',
  'price_pro_monthly',
  'price_pro_yearly',
  'price_enterprise_monthly',
  'price_enterprise_yearly',
  // Also accept environment variable price IDs
  process.env.STRIPE_PRICE_BASIC,
  process.env.STRIPE_PRICE_PRO,
  process.env.STRIPE_PRICE_ENTERPRISE,
].filter(Boolean);

// Price ID to Plan mapping
const PRICE_TO_PLAN: Record<string, Plan> = {
  price_basic_monthly: 'BASIC',
  price_basic_yearly: 'BASIC',
  price_pro_monthly: 'PRO',
  price_pro_yearly: 'PRO',
  price_enterprise_monthly: 'ENTERPRISE',
  price_enterprise_yearly: 'ENTERPRISE',
};

export interface PlanLimits {
  maxUsers: number;
  maxPatterns: number;
  maxComplaintsPerMonth: number;
  maxSearches: number;
  features: {
    semanticSearch: boolean;
    patternAlerts: boolean;
    complaintGeneration: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
  };
}

export interface CreateCustomerInput {
  organizationId: string;
  email: string;
  name: string;
}

export interface CheckoutSessionInput {
  organizationId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface BillingPortalInput {
  organizationId: string;
  returnUrl: string;
}

export interface CancelSubscriptionInput {
  organizationId: string;
  immediately?: boolean;
}

export interface UpdateSubscriptionInput {
  organizationId: string;
  newPriceId: string;
}

export interface CheckPlanLimitInput {
  organizationId: string;
  resource?: 'users' | 'patterns' | 'complaintsPerMonth' | 'searches';
  feature?: keyof PlanLimits['features'];
}

export interface CheckPlanLimitResult {
  allowed: boolean;
  current?: number;
  limit: number;
}

/**
 * Create a Stripe customer for an organization
 */
export async function createStripeCustomer(input: CreateCustomerInput) {
  const { organizationId, email, name } = input;

  // Check if organization already has a customer
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (existing?.stripeCustomerId) {
    throw new Error('Organization already has a Stripe customer');
  }

  // Create Stripe customer
  const customer = await getStripe().customers.create({
    email,
    name,
    metadata: {
      organizationId,
    },
  });

  // Create subscription record
  const subscription = await prisma.subscription.create({
    data: {
      organizationId,
      stripeCustomerId: customer.id,
      status: 'INACTIVE',
    },
  });

  return subscription;
}

/**
 * Create a Stripe Checkout session for subscription purchase
 */
export async function createCheckoutSession(input: CheckoutSessionInput) {
  const { organizationId, priceId, successUrl, cancelUrl, customerEmail } = input;

  // Validate price ID
  if (!VALID_PRICE_IDS.includes(priceId)) {
    throw new Error('Invalid price ID');
  }

  // Get or create customer
  let subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) {
    // Create customer if none exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const customer = await getStripe().customers.create({
      email: customerEmail,
      name: organization.name,
      metadata: {
        organizationId,
      },
    });

    subscription = await prisma.subscription.create({
      data: {
        organizationId,
        stripeCustomerId: customer.id,
        status: 'INACTIVE',
      },
    });
  }

  // Create checkout session
  const session = await getStripe().checkout.sessions.create({
    customer: subscription.stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organizationId,
    },
  });

  return {
    id: session.id,
    url: session.url,
  };
}

/**
 * Create a Stripe Billing Portal session
 */
export async function createBillingPortalSession(input: BillingPortalInput) {
  const { organizationId, returnUrl } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeCustomerId) {
    throw new Error('No billing account found');
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return {
    url: session.url,
  };
}

/**
 * Get subscription details from Stripe
 */
export async function getSubscription(organizationId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeSubscriptionId) {
    return null;
  }

  const stripeSubscription = await getStripe().subscriptions.retrieve(
    subscription.stripeSubscriptionId
  ) as Stripe.Subscription;

  // In newer Stripe API, current_period_end is on the subscription item
  const firstItem = stripeSubscription.items.data[0];

  return {
    id: stripeSubscription.id,
    status: stripeSubscription.status,
    currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : null,
    priceId: firstItem?.price.id,
  };
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(input: CancelSubscriptionInput) {
  const { organizationId, immediately = false } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  let canceled: Stripe.Subscription;

  if (immediately) {
    // Immediately cancel the subscription
    canceled = await getStripe().subscriptions.cancel(
      subscription.stripeSubscriptionId
    ) as unknown as Stripe.Subscription;

    await prisma.subscription.update({
      where: { organizationId },
      data: { status: 'CANCELED' },
    });
  } else {
    // Cancel at end of billing period
    canceled = await getStripe().subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );
  }

  return {
    status: canceled.status,
    cancelAtPeriodEnd: canceled.cancel_at_period_end,
  };
}

/**
 * Update subscription to a new price/plan
 */
export async function updateSubscription(input: UpdateSubscriptionInput) {
  const { organizationId, newPriceId } = input;

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeSubscriptionId) {
    throw new Error('No active subscription found');
  }

  // Get current subscription to find item ID
  const current = await getStripe().subscriptions.retrieve(
    subscription.stripeSubscriptionId
  );

  const currentItem = current.items.data[0];

  // Update subscription with new price
  const updated = await getStripe().subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    }
  );

  return {
    id: updated.id,
    priceId: updated.items.data[0]?.price.id,
  };
}

/**
 * Get plan limits for a specific plan
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  const planLimits: Record<Plan, PlanLimits> = {
    FREE: {
      maxUsers: 1,
      maxPatterns: 5,
      maxComplaintsPerMonth: 0,
      maxSearches: 50,
      features: {
        semanticSearch: false,
        patternAlerts: false,
        complaintGeneration: false,
        apiAccess: false,
        prioritySupport: false,
      },
    },
    BASIC: {
      maxUsers: 3,
      maxPatterns: 25,
      maxComplaintsPerMonth: 5,
      maxSearches: 500,
      features: {
        semanticSearch: true,
        patternAlerts: false,
        complaintGeneration: true,
        apiAccess: false,
        prioritySupport: false,
      },
    },
    PRO: {
      maxUsers: 10,
      maxPatterns: 100,
      maxComplaintsPerMonth: 25,
      maxSearches: 2500,
      features: {
        semanticSearch: true,
        patternAlerts: true,
        complaintGeneration: true,
        apiAccess: true,
        prioritySupport: false,
      },
    },
    ENTERPRISE: {
      maxUsers: -1, // unlimited
      maxPatterns: -1,
      maxComplaintsPerMonth: -1,
      maxSearches: -1,
      features: {
        semanticSearch: true,
        patternAlerts: true,
        complaintGeneration: true,
        apiAccess: true,
        prioritySupport: true,
      },
    },
  };

  return planLimits[plan];
}

/**
 * Check if an organization is within their plan limits
 */
export async function checkPlanLimit(
  input: CheckPlanLimitInput
): Promise<CheckPlanLimitResult> {
  const { organizationId, resource, feature } = input;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: {
        select: {
          users: true,
          patterns: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  const limits = getPlanLimits(organization.plan);

  // Check feature access
  if (feature) {
    return {
      allowed: limits.features[feature],
      limit: limits.features[feature] ? 1 : 0,
    };
  }

  // Check resource limits
  if (resource) {
    const resourceToLimit: Record<string, { current: number; limit: number }> = {
      users: {
        current: organization._count.users,
        limit: limits.maxUsers,
      },
      patterns: {
        current: organization._count.patterns,
        limit: limits.maxPatterns,
      },
      complaintsPerMonth: {
        current: 0, // Would need to count from GeneratedComplaint
        limit: limits.maxComplaintsPerMonth,
      },
      searches: {
        current: 0, // Would need usage tracking
        limit: limits.maxSearches,
      },
    };

    const check = resourceToLimit[resource];
    if (!check) {
      throw new Error('Invalid resource type');
    }

    // -1 means unlimited
    if (check.limit === -1) {
      return {
        allowed: true,
        current: check.current,
        limit: -1,
      };
    }

    return {
      allowed: check.current < check.limit,
      current: check.current,
      limit: check.limit,
    };
  }

  throw new Error('Must specify either resource or feature');
}

/**
 * Map price ID to plan
 */
export function mapPriceToPlan(priceId: string): Plan {
  // Check direct mapping
  if (PRICE_TO_PLAN[priceId]) {
    return PRICE_TO_PLAN[priceId];
  }

  // Check environment variable price IDs
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'BASIC';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'PRO';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return 'ENTERPRISE';

  // Infer from price ID pattern
  if (priceId.includes('basic')) return 'BASIC';
  if (priceId.includes('pro')) return 'PRO';
  if (priceId.includes('enterprise')) return 'ENTERPRISE';

  return 'FREE';
}
