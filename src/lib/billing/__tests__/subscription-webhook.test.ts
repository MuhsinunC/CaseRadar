/**
 * Subscription Webhook Tests
 * Tests for Stripe webhook event handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  processStripeWebhook,
  type StripeWebhookEvent,
} from '../subscription-webhook';

// Mock Stripe - billing-service imports it
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = { create: vi.fn() };
      checkout = { sessions: { create: vi.fn() } };
      billingPortal = { sessions: { create: vi.fn() } };
      subscriptions = { retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn() };
    },
  };
});

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Subscription Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCheckoutCompleted', () => {
    it('should activate subscription after successful checkout', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.upsert).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.organization.update).mockResolvedValue({
        id: 'org_1',
        plan: 'PRO',
      } as any);

      const event: StripeWebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            mode: 'subscription',
            subscription: 'sub_stripe_123',
            customer: 'cus_123',
            metadata: {
              organizationId: 'org_1',
              priceId: 'price_pro_monthly',
            },
          },
        },
      };

      await handleCheckoutCompleted(event);

      expect(prisma.subscription.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org_1' },
        create: expect.objectContaining({
          organizationId: 'org_1',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_stripe_123',
          status: 'ACTIVE',
        }),
        update: expect.objectContaining({
          stripeSubscriptionId: 'sub_stripe_123',
          status: 'ACTIVE',
        }),
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { plan: 'PRO' },
      });
    });

    it('should ignore non-subscription checkout events', async () => {
      const { prisma } = await import('@/lib/db');

      const event: StripeWebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            mode: 'payment', // one-time payment, not subscription
            customer: 'cus_123',
          },
        },
      };

      await handleCheckoutCompleted(event);

      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('should map price ID to correct plan', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as any);
      vi.mocked(prisma.organization.update).mockResolvedValue({} as any);

      const testCases = [
        { priceId: 'price_basic_monthly', expectedPlan: 'BASIC' },
        { priceId: 'price_basic_yearly', expectedPlan: 'BASIC' },
        { priceId: 'price_pro_monthly', expectedPlan: 'PRO' },
        { priceId: 'price_pro_yearly', expectedPlan: 'PRO' },
        { priceId: 'price_enterprise_monthly', expectedPlan: 'ENTERPRISE' },
        { priceId: 'price_enterprise_yearly', expectedPlan: 'ENTERPRISE' },
      ];

      for (const { priceId, expectedPlan } of testCases) {
        vi.clearAllMocks();

        const event: StripeWebhookEvent = {
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_123',
              mode: 'subscription',
              subscription: 'sub_123',
              customer: 'cus_123',
              metadata: {
                organizationId: 'org_1',
                priceId,
              },
            },
          },
        };

        await handleCheckoutCompleted(event);

        expect(prisma.organization.update).toHaveBeenCalledWith({
          where: { id: 'org_1' },
          data: { plan: expectedPlan },
        });
      }
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('should update subscription status from Stripe', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
        stripeCustomerId: 'cus_123',
      } as any);

      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 'sub_1',
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2024-02-01'),
      } as any);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1704067200,
            current_period_end: 1706745600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_pro_monthly',
                  },
                },
              ],
            },
          },
        },
      };

      await handleSubscriptionUpdated(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          currentPeriodStart: expect.any(Date),
          currentPeriodEnd: expect.any(Date),
          stripePriceId: 'price_pro_monthly',
        }),
      });
    });

    it('should handle past_due status', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
      } as any);
      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'past_due',
            current_period_start: 1704067200,
            current_period_end: 1706745600,
            items: { data: [{ price: { id: 'price_pro' } }] },
          },
        },
      };

      await handleSubscriptionUpdated(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: expect.objectContaining({
          status: 'PAST_DUE',
        }),
      });
    });

    it('should downgrade plan when subscription changes', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
        stripePriceId: 'price_pro_monthly',
      } as any);

      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
      } as any);

      vi.mocked(prisma.organization.update).mockResolvedValue({} as any);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1704067200,
            current_period_end: 1706745600,
            items: {
              data: [
                {
                  price: {
                    id: 'price_basic_monthly', // downgraded from PRO
                  },
                },
              ],
            },
          },
        },
      };

      await handleSubscriptionUpdated(event);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { plan: 'BASIC' },
      });
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('should mark subscription as canceled and downgrade to FREE', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
        stripeCustomerId: 'cus_123',
      } as any);

      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 'sub_1',
        status: 'CANCELED',
      } as any);

      vi.mocked(prisma.organization.update).mockResolvedValue({
        id: 'org_1',
        plan: 'FREE',
      } as any);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
          },
        },
      };

      await handleSubscriptionDeleted(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: {
          status: 'CANCELED',
          stripeSubscriptionId: null,
        },
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { plan: 'FREE' },
      });
    });

    it('should handle non-existent subscription gracefully', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_nonexistent',
            customer: 'cus_unknown',
          },
        },
      };

      // Should not throw
      await expect(handleSubscriptionDeleted(event)).resolves.not.toThrow();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it('should update subscription to past_due on payment failure', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.update).mockResolvedValue({
        id: 'sub_1',
        status: 'PAST_DUE',
      } as any);

      const event: StripeWebhookEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            subscription: 'sub_stripe_123',
            attempt_count: 1,
          },
        },
      };

      await handleInvoicePaymentFailed(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
        data: { status: 'PAST_DUE' },
      });
    });

    it('should handle final failure (dunning complete)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
        organizationId: 'org_1',
      } as any);

      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any);
      vi.mocked(prisma.organization.update).mockResolvedValue({} as any);

      const event: StripeWebhookEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            subscription: 'sub_stripe_123',
            attempt_count: 4, // Final attempt
            next_payment_attempt: null, // No more attempts
          },
        },
      };

      await handleInvoicePaymentFailed(event);

      // Should downgrade to FREE after final payment failure
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { plan: 'FREE' },
      });
    });
  });

  describe('processStripeWebhook', () => {
    it('should route events to correct handlers', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as any);
      vi.mocked(prisma.organization.update).mockResolvedValue({} as any);

      const event: StripeWebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            mode: 'subscription',
            subscription: 'sub_123',
            customer: 'cus_123',
            metadata: { organizationId: 'org_1', priceId: 'price_pro' },
          },
        },
      };

      await processStripeWebhook(event);

      expect(prisma.subscription.upsert).toHaveBeenCalled();
    });

    it('should handle unknown event types gracefully', async () => {
      const event: StripeWebhookEvent = {
        type: 'unknown.event.type' as any,
        data: { object: {} },
      };

      // Should not throw
      await expect(processStripeWebhook(event)).resolves.not.toThrow();
    });

    it('should process all supported event types', async () => {
      const supportedEvents = [
        'checkout.session.completed',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_failed',
      ];

      for (const eventType of supportedEvents) {
        const event: StripeWebhookEvent = {
          type: eventType as any,
          data: {
            object: {
              id: 'test_123',
              customer: 'cus_123',
              mode: 'subscription',
              subscription: 'sub_123',
              metadata: { organizationId: 'org_1' },
            },
          },
        };

        // Should not throw
        await expect(processStripeWebhook(event)).resolves.not.toThrow();
      }
    });
  });
});

describe('Stripe Status Mapping', () => {
  it('should map Stripe statuses to internal statuses', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: 'sub_1',
    } as any);
    vi.mocked(prisma.subscription.update).mockResolvedValue({} as any);

    const statusMap: Record<string, string> = {
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELED',
      unpaid: 'PAST_DUE',
      incomplete: 'INACTIVE',
      incomplete_expired: 'CANCELED',
      trialing: 'ACTIVE',
    };

    for (const [stripeStatus, internalStatus] of Object.entries(statusMap)) {
      vi.clearAllMocks();
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        id: 'sub_1',
      } as any);
      vi.mocked(prisma.subscription.update).mockResolvedValue({} as any);

      const event: StripeWebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: stripeStatus,
            current_period_start: 1704067200,
            current_period_end: 1706745600,
            items: { data: [{ price: { id: 'price_pro' } }] },
          },
        },
      };

      await handleSubscriptionUpdated(event);

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: internalStatus,
          }),
        })
      );
    }
  });
});
