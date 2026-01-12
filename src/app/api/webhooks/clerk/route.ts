/**
 * Clerk Webhook Handler
 * Processes webhooks from Clerk for user/org sync
 */

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { processClerkWebhook, type ClerkWebhookEvent } from '@/lib/auth';

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
      { status: 400 }
    );
  }

  // Process the webhook event
  try {
    await processClerkWebhook(evt);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Error processing webhook' },
      { status: 500 }
    );
  }
}
