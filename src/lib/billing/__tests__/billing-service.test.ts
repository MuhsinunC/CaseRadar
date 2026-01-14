/**
 * Billing Service Tests
 * Tests for Stripe billing operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStripeCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscription,
  cancelSubscription,
  updateSubscription,
  getPlanLimits,
  checkPlanLimit,
  type PlanLimits,
} from '../billing-service';

// Create hoisted mock for Stripe
const {
  mockCustomersCreate,
  mockCheckoutSessionsCreate,
  mockBillingPortalSessionsCreate,
  mockSubscriptionsRetrieve,
  mockSubscriptionsCancel,
  mockSubscriptionsUpdate,
} = vi.hoisted(() => ({
  mockCustomersCreate: vi.fn(),
  mockCheckoutSessionsCreate: vi.fn(),
  mockBillingPortalSessionsCreate: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  mockSubscriptionsCancel: vi.fn(),
  mockSubscriptionsUpdate: vi.fn(),
}));

// Mock Stripe - use class mock
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = { create: mockCustomersCreate };
      checkout = { sessions: { create: mockCheckoutSessionsCreate } };
      billingPortal = { sessions: { create: mockBillingPortalSessionsCreate } };
      subscriptions = {
        retrieve: mockSubscriptionsRetrieve,
        cancel: mockSubscriptionsCancel,
        update: mockSubscriptionsUpdate,
      };
    },
  };
});

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Billing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set env variable for Stripe initialization
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake_key_for_testing');
  });

  describe('createStripeCustomer', () => {
    it('should create a Stripe customer and store in database', async () => {
      const { prisma } = await import('@/lib/db');

      mockCustomersCreate.mockResolvedValue({
        id: 'cus_123456789',
        email: 'billing@lawfirm.com',
      });

      vi.mocked(prisma.subscription.create).mockResolvedValue({
        id: 'sub_internal_1',
        organizationId: 'org_1',
        stripeCustomerId: 'cus_123456789',
        status: 'INACTIVE',
      } as any);

      const result = await createStripeCustomer({
        organizationId: 'org_1',
        email: 'billing@lawfirm.com',
        name: 'Smith & Associates Law Firm',
      });

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'billing@lawfirm.com',
        name: 'Smith & Associates Law Firm',
        metadata: {
          organizationId: 'org_1',
        },
      });

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org_1',
          stripeCustomerId: 'cus_123456789',
        }),
      });

      expect(result.stripeCustomerId).toBe('cus_123456789');
    });

    it('should throw error if organization already has a customer', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        stripeCustomerId: 'cus_existing',
      } as any);

      await expect(
        createStripeCustomer({
          organizationId: 'org_1',
          email: 'billing@lawfirm.com',
          name: 'Existing Firm',
        })
      ).rejects.toThrow('Organization already has a Stripe customer');
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session for subscription upgrade', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
        stripeCustomerId: 'cus_123',
      } as any);

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_123456789',
        url: 'https://checkout.stripe.com/session/cs_123456789',
      });

      const result = await createCheckoutSession({
        organizationId: 'org_1',
        priceId: 'price_pro_monthly',
        successUrl: 'https://app.caseradar.com/billing/success',
        cancelUrl: 'https://app.caseradar.com/billing/cancel',
      });

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        mode: 'subscription',
        line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
        success_url: 'https://app.caseradar.com/billing/success',
        cancel_url: 'https://app.caseradar.com/billing/cancel',
        metadata: {
          organizationId: 'org_1',
        },
      });

      expect(result.url).toBe('https://checkout.stripe.com/session/cs_123456789');
    });

    it('should create customer if none exists', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        name: 'New Law Firm',
      } as any);

      mockCustomersCreate.mockResolvedValue({
        id: 'cus_new_123',
      });

      vi.mocked(prisma.subscription.create).mockResolvedValue({
        id: 'sub_new',
        stripeCustomerId: 'cus_new_123',
      } as any);

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_456',
        url: 'https://checkout.stripe.com/session/cs_456',
      });

      const result = await createCheckoutSession({
        organizationId: 'org_1',
        priceId: 'price_basic_monthly',
        successUrl: 'https://app.caseradar.com/success',
        cancelUrl: 'https://app.caseradar.com/cancel',
        customerEmail: 'billing@newfirm.com',
      });

      expect(mockCustomersCreate).toHaveBeenCalled();
      expect(result.url).toContain('checkout.stripe.com');
    });

    it('should throw error for invalid price ID', async () => {
      await expect(
        createCheckoutSession({
          organizationId: 'org_1',
          priceId: 'invalid_price',
          successUrl: 'https://app.caseradar.com/success',
          cancelUrl: 'https://app.caseradar.com/cancel',
        })
      ).rejects.toThrow('Invalid price ID');
    });
  });

  describe('createBillingPortalSession', () => {
    it('should create billing portal session for existing customer', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        stripeCustomerId: 'cus_123',
      } as any);

      mockBillingPortalSessionsCreate.mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/session/bps_123',
      });

      const result = await createBillingPortalSession({
        organizationId: 'org_1',
        returnUrl: 'https://app.caseradar.com/settings/billing',
      });

      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://app.caseradar.com/settings/billing',
      });

      expect(result.url).toContain('billing.stripe.com');
    });

    it('should throw error if no customer exists', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      await expect(
        createBillingPortalSession({
          organizationId: 'org_1',
          returnUrl: 'https://app.caseradar.com/settings',
        })
      ).rejects.toThrow('No billing account found');
    });
  });

  describe('getSubscription', () => {
    it('should retrieve subscription details from Stripe', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_internal_1',
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_123',
        status: 'ACTIVE',
      } as any);

      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_stripe_123',
        status: 'active',
        current_period_end: 1704067200,
        items: {
          data: [
            {
              price: {
                id: 'price_pro_monthly',
                product: 'prod_pro',
              },
            },
          ],
        },
      });

      const result = await getSubscription('org_1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(result!.currentPeriodEnd).toBeDefined();
    });

    it('should return null for organization without subscription', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      const result = await getSubscription('org_no_sub');

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription at period end', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        stripeSubscriptionId: 'sub_stripe_123',
      } as any);

      // For cancel at period end, we now use update instead of cancel
      mockSubscriptionsUpdate.mockResolvedValue({
        id: 'sub_stripe_123',
        status: 'active',
        cancel_at_period_end: true,
      });

      const result = await cancelSubscription({
        organizationId: 'org_1',
        immediately: false,
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_stripe_123', {
        cancel_at_period_end: true,
      });

      expect(result.cancelAtPeriodEnd).toBe(true);
    });

    it('should cancel subscription immediately when specified', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        stripeSubscriptionId: 'sub_stripe_123',
      } as any);

      // For immediate cancel, we now call cancel without parameters
      mockSubscriptionsCancel.mockResolvedValue({
        id: 'sub_stripe_123',
        status: 'canceled',
        cancel_at_period_end: false,
      });

      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 'sub_1',
        status: 'CANCELED',
      } as any);

      const result = await cancelSubscription({
        organizationId: 'org_1',
        immediately: true,
      });

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_stripe_123');

      expect(result.status).toBe('canceled');
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription to new price', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        stripeSubscriptionId: 'sub_stripe_123',
      } as any);

      mockSubscriptionsRetrieve.mockResolvedValue({
        id: 'sub_stripe_123',
        items: {
          data: [{ id: 'si_old_item' }],
        },
      });

      mockSubscriptionsUpdate.mockResolvedValue({
        id: 'sub_stripe_123',
        items: {
          data: [
            {
              price: {
                id: 'price_enterprise_monthly',
              },
            },
          ],
        },
      });

      const result = await updateSubscription({
        organizationId: 'org_1',
        newPriceId: 'price_enterprise_monthly',
      });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_stripe_123',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              price: 'price_enterprise_monthly',
            }),
          ]),
          proration_behavior: 'create_prorations',
        })
      );
    });
  });
});

describe('Plan Limits', () => {
  describe('getPlanLimits', () => {
    it('should return correct limits for FREE plan', () => {
      const limits = getPlanLimits('FREE');

      expect(limits).toEqual<PlanLimits>({
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
      });
    });

    it('should return correct limits for BASIC plan', () => {
      const limits = getPlanLimits('BASIC');

      expect(limits).toEqual<PlanLimits>({
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
      });
    });

    it('should return correct limits for PRO plan', () => {
      const limits = getPlanLimits('PRO');

      expect(limits).toEqual<PlanLimits>({
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
      });
    });

    it('should return correct limits for ENTERPRISE plan', () => {
      const limits = getPlanLimits('ENTERPRISE');

      expect(limits).toEqual<PlanLimits>({
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
      });
    });
  });

  describe('checkPlanLimit', () => {
    it('should return true when within limits', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        plan: 'PRO',
        _count: {
          users: 5,
          patterns: 50,
        },
      } as any);

      const result = await checkPlanLimit({
        organizationId: 'org_1',
        resource: 'users',
      });

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(10);
    });

    it('should return false when at limit', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        plan: 'BASIC',
        _count: {
          users: 3,
        },
      } as any);

      const result = await checkPlanLimit({
        organizationId: 'org_1',
        resource: 'users',
      });

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(3);
      expect(result.limit).toBe(3);
    });

    it('should always allow for unlimited resources (ENTERPRISE)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        plan: 'ENTERPRISE',
        _count: {
          users: 1000,
        },
      } as any);

      const result = await checkPlanLimit({
        organizationId: 'org_1',
        resource: 'users',
      });

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });

    it('should check feature access', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        plan: 'FREE',
      } as any);

      const result = await checkPlanLimit({
        organizationId: 'org_1',
        feature: 'complaintGeneration',
      });

      expect(result.allowed).toBe(false);
    });

    it('should allow feature for higher plans', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_1',
        plan: 'BASIC',
      } as any);

      const result = await checkPlanLimit({
        organizationId: 'org_1',
        feature: 'complaintGeneration',
      });

      expect(result.allowed).toBe(true);
    });
  });
});
