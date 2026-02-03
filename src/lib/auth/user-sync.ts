/**
 * User Sync
 * Syncs Clerk users and organizations with local database
 */

import { clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import type { Role } from '@prisma/client';

/**
 * Clerk webhook event types
 */
export interface ClerkWebhookEvent {
  type: string;
  data: Record<string, any>;
}

/**
 * Sync user input
 */
export interface SyncUserInput {
  clerkUserId: string;
  email: string;
  clerkOrgId: string;
  role?: Role;
  useUpsert?: boolean;
}

/**
 * Sync organization input
 */
export interface SyncOrgInput {
  clerkOrgId: string;
  name: string;
}

/**
 * Map Clerk org role to database role
 */
function mapClerkRoleToDbRole(clerkRole: string): Role {
  switch (clerkRole) {
    case 'org:admin':
      return 'ADMIN';
    case 'org:analyst':
      return 'ANALYST';
    case 'org:member':
    default:
      return 'VIEWER';
  }
}

/**
 * Sync user from Clerk to database
 */
export async function syncUser(input: SyncUserInput) {
  const { clerkUserId, email, clerkOrgId, role = 'VIEWER', useUpsert = false } = input;

  // Find the organization in our database
  const organization = await prisma.organization.findUnique({
    where: { clerkOrgId },
  });

  if (!organization) {
    throw new Error(`Organization not found: ${clerkOrgId}`);
  }

  // Always use upsert to handle race conditions where multiple requests
  // might try to create the same user simultaneously
  return prisma.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email,
      role,
      organizationId: organization.id,
    },
    update: useUpsert ? { email } : {},
  });
}

/**
 * Sync organization from Clerk to database
 */
export async function syncOrganization(input: SyncOrgInput) {
  const { clerkOrgId, name } = input;

  // Check if organization exists
  const existingOrg = await prisma.organization.findUnique({
    where: { clerkOrgId },
  });

  if (existingOrg) {
    return prisma.organization.update({
      where: { clerkOrgId },
      data: { name },
    });
  }

  return prisma.organization.create({
    data: {
      clerkOrgId,
      name,
      plan: 'FREE',
    },
  });
}

/**
 * Handle user.created webhook
 */
export async function handleUserCreated(event: ClerkWebhookEvent) {
  const { id: clerkUserId, email_addresses, organization_memberships } = event.data;

  const email = email_addresses?.[0]?.email_address;
  if (!email) {
    console.warn('User created without email:', clerkUserId);
    return;
  }

  // If user is in an organization, sync them
  if (organization_memberships?.length > 0) {
    const membership = organization_memberships[0];
    const clerkOrgId = membership.organization?.id;

    if (clerkOrgId) {
      // Ensure org exists
      try {
        const org = await prisma.organization.findUnique({
          where: { clerkOrgId },
        });

        if (org) {
          await prisma.user.upsert({
            where: { clerkUserId },
            create: {
              clerkUserId,
              email,
              role: 'VIEWER',
              organizationId: org.id,
            },
            update: {
              email,
            },
          });
        }
      } catch (error) {
        console.error('Error syncing user from webhook:', error);
      }
    }
  }
}

/**
 * Handle user.updated webhook
 */
export async function handleUserUpdated(event: ClerkWebhookEvent) {
  const { id: clerkUserId, email_addresses } = event.data;

  const email = email_addresses?.[0]?.email_address;
  if (!email) {
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { clerkUserId },
      data: { email },
    });
  }
}

/**
 * Handle user.deleted webhook
 */
export async function handleUserDeleted(event: ClerkWebhookEvent) {
  const { id: clerkUserId } = event.data;

  try {
    await prisma.user.delete({
      where: { clerkUserId },
    });
  } catch (error) {
    // User might not exist in our database, ignore
    console.log('User not found for deletion:', clerkUserId);
  }
}

/**
 * Handle organization.created webhook
 */
export async function handleOrgCreated(event: ClerkWebhookEvent) {
  const { id: clerkOrgId, name } = event.data;

  await prisma.organization.create({
    data: {
      clerkOrgId,
      name,
      plan: 'FREE',
    },
  });
}

/**
 * Handle organization.updated webhook
 */
export async function handleOrgUpdated(event: ClerkWebhookEvent) {
  const { id: clerkOrgId, name } = event.data;

  try {
    await prisma.organization.update({
      where: { clerkOrgId },
      data: { name },
    });
  } catch (error) {
    // Org might not exist
    console.log('Organization not found for update:', clerkOrgId);
  }
}

/**
 * Handle organizationMembership.created webhook
 */
export async function handleOrgMembershipCreated(event: ClerkWebhookEvent) {
  const { organization, public_user_data, role: clerkRole } = event.data;
  const clerkOrgId = organization?.id;
  const clerkUserId = public_user_data?.user_id;

  if (!clerkOrgId || !clerkUserId) {
    console.warn('Missing org or user ID in membership webhook');
    return;
  }

  // Get user email from Clerk
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress;

  if (!email) {
    console.warn('User has no email:', clerkUserId);
    return;
  }

  // Find organization
  const org = await prisma.organization.findUnique({
    where: { clerkOrgId },
  });

  if (!org) {
    console.warn('Organization not found for membership:', clerkOrgId);
    return;
  }

  // Map Clerk role to our role
  const role = mapClerkRoleToDbRole(clerkRole);

  // Create or update user
  await prisma.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email,
      role,
      organizationId: org.id,
    },
    update: {
      organizationId: org.id,
      role,
    },
  });
}

/**
 * Handle organizationMembership.deleted webhook
 */
export async function handleOrgMembershipDeleted(event: ClerkWebhookEvent) {
  const { public_user_data } = event.data;
  const clerkUserId = public_user_data?.user_id;

  if (!clerkUserId) {
    return;
  }

  // When user leaves org, we could either delete or keep them
  // For now, we'll keep them but could implement soft delete
  console.log('User left organization:', clerkUserId);
}

/**
 * Process Clerk webhook
 */
export async function processClerkWebhook(event: ClerkWebhookEvent) {
  switch (event.type) {
    case 'user.created':
      return handleUserCreated(event);
    case 'user.updated':
      return handleUserUpdated(event);
    case 'user.deleted':
      return handleUserDeleted(event);
    case 'organization.created':
      return handleOrgCreated(event);
    case 'organization.updated':
      return handleOrgUpdated(event);
    case 'organizationMembership.created':
      return handleOrgMembershipCreated(event);
    case 'organizationMembership.deleted':
      return handleOrgMembershipDeleted(event);
    default:
      console.log('Unhandled webhook event:', event.type);
  }
}
