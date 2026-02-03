/**
 * Auth Middleware
 * Authentication and authorization middleware for API routes
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import type { Role, Plan } from '@prisma/client';

// Check if Clerk is properly configured (not placeholder values)
const CLERK_SECRET = process.env.CLERK_SECRET_KEY || '';
const IS_CLERK_CONFIGURED = CLERK_SECRET && !CLERK_SECRET.includes('REPLACE_ME');

// E2E Testing mode - bypass Clerk and use dev user
const IS_E2E_TESTING = process.env.NEXT_PUBLIC_E2E_TESTING === 'true';

// Development user for when Clerk isn't configured
const DEV_USER_ID = 'dev_user_001';

/**
 * Authenticated user with database info
 */
export interface AuthenticatedUser {
  id: string;
  clerkUserId: string;
  email: string;
  role: Role;
  organizationId: string;
  organization: {
    id: string;
    clerkOrgId: string;
    name: string;
    plan: Plan;
  };
}

/**
 * Auth context passed to handlers
 */
export interface AuthContext {
  userId: string;
  orgId: string | null;
  sessionId: string | null;
  user?: AuthenticatedUser;
}

/**
 * Handler type with auth context
 */
export type AuthenticatedHandler = (
  request: NextRequest,
  context: { auth: AuthContext; params?: Record<string, string> }
) => Promise<Response>;

/**
 * Get current authenticated user with database info
 * Auto-provisions users in development if they don't exist
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  let clerkUserId: string;

  // If Clerk isn't configured or in E2E testing mode, use development user
  if (!IS_CLERK_CONFIGURED || IS_E2E_TESTING) {
    if (IS_E2E_TESTING) {
      console.log('[AUTH] E2E Testing mode - using development user');
    } else {
      console.warn('[AUTH] Clerk not configured - using development user');
    }
    clerkUserId = DEV_USER_ID;
  } else {
    const authResult = await auth();
    if (!authResult.userId) {
      return null;
    }
    clerkUserId = authResult.userId;
  }

  let user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: {
      organization: true,
    },
  });

  // Auto-provision user if they don't exist (dev mode)
  if (!user) {
    let email: string;

    if (!IS_CLERK_CONFIGURED || IS_E2E_TESTING) {
      // Development/E2E mode - use dev email
      email = 'dev@caseradar.local';
    } else {
      // Get user info from Clerk
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return null;
      }
      email = clerkUser.emailAddresses?.[0]?.emailAddress || `user-${clerkUserId}@caseradar.local`;
    }

    // Find or create default organization
    let defaultOrg = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultOrg) {
      defaultOrg = await prisma.organization.create({
        data: {
          name: 'Default Organization',
          clerkOrgId: `org_default_${Date.now()}`,
          plan: 'PRO',
        },
      });
    }

    // Use upsert to handle race conditions where multiple requests
    // might try to create the same user simultaneously
    user = await prisma.user.upsert({
      where: { clerkUserId: clerkUserId },
      update: {
        // Update email in case it changed
        email,
      },
      create: {
        clerkUserId: clerkUserId,
        email,
        role: 'ADMIN', // First user gets admin
        organizationId: defaultOrg.id,
      },
      include: {
        organization: true,
      },
    });

    console.log(`Auto-provisioned user ${email} in organization ${defaultOrg.name}`);
  }

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organization: {
      id: user.organization.id,
      clerkOrgId: user.organization.clerkOrgId,
      name: user.organization.name,
      plan: user.organization.plan,
    },
  };
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<AuthContext> {
  const authResult = await auth();

  if (!authResult.userId) {
    throw new Error('Unauthorized');
  }

  return {
    userId: authResult.userId,
    orgId: authResult.orgId ?? null,
    sessionId: authResult.sessionId ?? null,
  };
}

/**
 * Higher-order function to wrap handlers with authentication
 */
export function withAuth(handler: AuthenticatedHandler): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const authResult = await auth();

    if (!authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authContext: AuthContext = {
      userId: authResult.userId,
      orgId: authResult.orgId ?? null,
      sessionId: authResult.sessionId ?? null,
    };

    return handler(request, { auth: authContext });
  };
}

/**
 * Higher-order function to require specific roles
 */
export function withRole(
  allowedRoles: Role[],
  handler: AuthenticatedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const authResult = await auth();

    if (!authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database to check role
    const user = await prisma.user.findUnique({
      where: { clerkUserId: authResult.userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden: insufficient permissions' },
        { status: 403 }
      );
    }

    const authContext: AuthContext = {
      userId: authResult.userId,
      orgId: authResult.orgId ?? null,
      sessionId: authResult.sessionId ?? null,
      user: {
        id: user.id,
        clerkUserId: user.clerkUserId,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organization: {
          id: '',
          clerkOrgId: '',
          name: '',
          plan: 'FREE',
        },
      },
    };

    return handler(request, { auth: authContext });
  };
}

/**
 * Higher-order function to require organization membership
 */
export function withOrganization(
  handler: AuthenticatedHandler
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest) => {
    const authResult = await auth();

    if (!authResult.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!authResult.orgId) {
      return NextResponse.json(
        { error: 'Forbidden: organization required' },
        { status: 403 }
      );
    }

    const authContext: AuthContext = {
      userId: authResult.userId,
      orgId: authResult.orgId,
      sessionId: authResult.sessionId ?? null,
    };

    return handler(request, { auth: authContext });
  };
}

/**
 * Combine multiple middleware
 */
export function composeMiddleware(
  ...middlewares: Array<
    (handler: AuthenticatedHandler) => (request: NextRequest) => Promise<Response>
  >
): (handler: AuthenticatedHandler) => (request: NextRequest) => Promise<Response> {
  return (handler: AuthenticatedHandler) => {
    return middlewares.reduceRight((acc, middleware) => {
      return (request: NextRequest) => {
        // Create a handler that calls the accumulator
        const wrappedHandler: AuthenticatedHandler = async (req, ctx) => {
          return acc(req);
        };
        return middleware(wrappedHandler)(request);
      };
    }, handler as unknown as (request: NextRequest) => Promise<Response>);
  };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: AuthenticatedUser, action: string, resource: string): boolean {
  const permissions: Record<Role, Record<string, string[]>> = {
    ADMIN: {
      // Admins can do everything
      '*': ['*'],
    },
    ANALYST: {
      complaints: ['read', 'search'],
      patterns: ['read', 'create', 'update'],
      generated_complaints: ['read', 'create', 'update', 'delete'],
      users: ['read'],
      organizations: ['read'],
    },
    VIEWER: {
      complaints: ['read', 'search'],
      patterns: ['read'],
      generated_complaints: ['read'],
      users: [],
      organizations: ['read'],
    },
  };

  const rolePermissions = permissions[user.role];

  // Admin has all permissions
  if (rolePermissions['*']?.includes('*')) {
    return true;
  }

  const resourcePermissions = rolePermissions[resource] || [];
  return resourcePermissions.includes(action) || resourcePermissions.includes('*');
}

/**
 * Check if user can access specific organization
 */
export async function canAccessOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: {
      clerkUserId: userId,
      organizationId: organizationId,
    },
  });

  return !!user;
}

/**
 * Get organization ID from auth context, ensuring user belongs to it
 */
export async function getOrganizationId(authContext: AuthContext): Promise<string | null> {
  if (!authContext.orgId) {
    return null;
  }

  const org = await prisma.organization.findUnique({
    where: { clerkOrgId: authContext.orgId },
  });

  return org?.id ?? null;
}
