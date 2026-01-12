/**
 * Stripe Webhook Handler
 * Processes webhooks from Stripe for subscription management
 */

import Stripe from 'stripe';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { processStripeWebhook, type StripeWebhookEvent } from '@/lib/billing';

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

export async function POST(req: Request) {
  const body = await req.text();
  const headerPayload = await headers();
  const signature = headerPayload.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Error verifying webhook signature:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  try {
    // Convert Stripe event to our webhook event type
    const webhookEvent: StripeWebhookEvent = {
      type: event.type,
      data: {
        object: event.data.object as any,
      },
    };

    await processStripeWebhook(webhookEvent);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Error processing webhook' },
      { status: 500 }
    );
  }
}
