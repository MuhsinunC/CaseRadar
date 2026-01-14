/**
 * Clerk Webhook Handler
 * Processes webhooks from Clerk for user/org sync
 *
 * Security features:
 * - Signature verification (Svix)
 * - Timestamp validation (5 minute window)
 * - Idempotency tracking (prevent replay attacks)
 */

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { processClerkWebhook, type ClerkWebhookEvent } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Maximum age for webhook timestamp (5 minutes)
const MAX_WEBHOOK_AGE_SECONDS = 300;

export async function POST(req: Request) {
  // Get the Svix headers for verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  // Validate timestamp to prevent replay attacks
  const timestamp = parseInt(svix_timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_WEBHOOK_AGE_SECONDS) {
    console.warn('Webhook timestamp too old or in future:', { timestamp, now });
    return NextResponse.json(
      { error: 'Webhook timestamp too old' },
      { status: 401 }
    );
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Get the webhook secret from environment
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Create a new Svix instance with your secret
  const wh = new Webhook(webhookSecret);

  let evt: ClerkWebhookEvent;

  // Verify the webhook signature
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 401 }
    );
  }

  // Check idempotency - prevent replay attacks
  const existingWebhook = await prisma.processedWebhook.findUnique({
    where: { id: svix_id },
  });

  if (existingWebhook) {
    // Already processed, return success (idempotent)
    console.log('Webhook already processed:', svix_id);
    return NextResponse.json({ received: true, cached: true });
  }

  // Process the webhook event
  try {
    await processClerkWebhook(evt);

    // Mark webhook as processed (expires in 30 days)
    await prisma.processedWebhook.create({
      data: {
        id: svix_id,
        provider: 'clerk',
        eventType: evt.type,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Error processing webhook' },
      { status: 500 }
    );
  }
}
