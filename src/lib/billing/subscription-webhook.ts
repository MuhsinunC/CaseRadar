/**
 * Subscription Webhook Handlers
 * Process Stripe webhook events for subscription lifecycle
 */

import { prisma } from '@/lib/db';
import type { Plan, SubscriptionStatus } from '@prisma/client';
import { mapPriceToPlan } from './billing-service';

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      subscription?: string;
      mode?: string;
      status?: string;
      metadata?: Record<string, string>;
      current_period_start?: number;
      current_period_end?: number;
      attempt_count?: number;
      next_payment_attempt?: number | null;
      items?: {
        data: Array<{
          id?: string;
          price: {
            id: string;
          };
        }>;
      };
    };
  };
}

/**
 * Map Stripe subscription status to internal status
 */
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const statusMap: Record<string, SubscriptionStatus> = {
    active: 'ACTIVE',
    trialing: 'ACTIVE',
    past_due: 'PAST_DUE',
    unpaid: 'PAST_DUE',
    canceled: 'CANCELED',
    incomplete: 'INACTIVE',
    incomplete_expired: 'CANCELED',
    paused: 'INACTIVE',
  };

  return statusMap[stripeStatus] || 'INACTIVE';
}

/**
 * Handle checkout.session.completed event
 */
export async function handleCheckoutCompleted(event: StripeWebhookEvent) {
  const session = event.data.object;

  // Only handle subscription checkouts
  if (session.mode !== 'subscription') {
    return;
  }

  const organizationId = session.metadata?.organizationId;
  const priceId = session.metadata?.priceId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!organizationId || !customerId || !subscriptionId) {
    console.error('Missing required metadata in checkout session');
    return;
  }

  // Upsert subscription record
  await prisma.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      status: 'ACTIVE',
    },
    update: {
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      status: 'ACTIVE',
    },
  });

  // Update organization plan based on price
  if (priceId) {
    const plan = mapPriceToPlan(priceId);
    await prisma.organization.update({
      where: { id: organizationId },
      data: { plan },
    });
  }
}

/**
 * Handle customer.subscription.updated event
 */
export async function handleSubscriptionUpdated(event: StripeWebhookEvent) {
  const subscription = event.data.object;

  const customerId = subscription.customer;
  const status = subscription.status;
  const periodStart = subscription.current_period_start;
  const periodEnd = subscription.current_period_end;
  const priceId = subscription.items?.data[0]?.price.id;

  if (!customerId || !status) {
    return;
  }

  // Get existing subscription to find organization
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSub) {
    console.warn('Subscription not found for customer:', customerId);
    return;
  }

  // Check if price changed (plan upgrade/downgrade)
  const priceChanged = priceId && existingSub.stripePriceId !== priceId;

  // Update subscription
  const updatedSub = await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      status: mapStripeStatus(status),
      stripePriceId: priceId,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : undefined,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
    },
  });

  // Update organization plan if price changed
  if (priceChanged && priceId) {
    const plan = mapPriceToPlan(priceId);
    await prisma.organization.update({
      where: { id: updatedSub.organizationId },
      data: { plan },
    });
  }
}

/**
 * Handle customer.subscription.deleted event
 */
export async function handleSubscriptionDeleted(event: StripeWebhookEvent) {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  if (!customerId) {
    return;
  }

  // Find subscription
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSub) {
    console.warn('Subscription not found for deletion:', customerId);
    return;
  }

  // Mark subscription as canceled
  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      status: 'CANCELED',
      stripeSubscriptionId: null,
    },
  });

  // Downgrade organization to FREE
  await prisma.organization.update({
    where: { id: existingSub.organizationId },
    data: { plan: 'FREE' },
  });
}

/**
 * Handle invoice.payment_failed event
 */
export async function handleInvoicePaymentFailed(event: StripeWebhookEvent) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const attemptCount = invoice.attempt_count || 0;
  const nextAttempt = invoice.next_payment_attempt;

  if (!customerId) {
    return;
  }

  // Mark subscription as past due
  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: { status: 'PAST_DUE' },
  });

  // If this is the final attempt (no more retries), downgrade to FREE
  if (nextAttempt === null && attemptCount >= 4) {
    const subscription = await prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (subscription) {
      await prisma.organization.update({
        where: { id: subscription.organizationId },
        data: { plan: 'FREE' },
      });
    }
  }
}

/**
 * Process a Stripe webhook event
 */
export async function processStripeWebhook(event: StripeWebhookEvent) {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      default:
        // Ignore unsupported event types
        console.log('Unhandled Stripe event type:', event.type);
    }
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    throw error;
  }
}
