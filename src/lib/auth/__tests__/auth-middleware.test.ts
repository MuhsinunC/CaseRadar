/**
 * Auth Middleware Tests
 * Tests for authentication and authorization middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withAuth,
  withRole,
  withOrganization,
  getCurrentUser,
  requireAuth,
  composeMiddleware,
  hasPermission,
  canAccessOrganization,
  getOrganizationId,
  type AuthenticatedUser,
  type AuthContext,
} from '../auth-middleware';

// Mock Clerk
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: {
    users: {
      getUser: vi.fn(),
    },
    organizations: {
      getOrganization: vi.fn(),
    },
  },
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withAuth', () => {
    it('should allow authenticated users', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
        sessionId: 'sess_789',
      } as any);

      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withAuth(handler);

      const mockRequest = new Request('http://localhost/api/test');
      const result = await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalled();
    });

    it('should reject unauthenticated users with 401', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: null,
        sessionId: null,
      } as any);

      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withAuth(handler);

      const mockRequest = new Request('http://localhost/api/test');
      const result = await wrappedHandler(mockRequest);

      expect(result.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass auth context to handler', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
        sessionId: 'sess_789',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withAuth(handler);

      const mockRequest = new Request('http://localhost/api/test');
      await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({
          auth: expect.objectContaining({
            userId: 'user_123',
            orgId: 'org_456',
          }),
        })
      );
    });
  });

  describe('withRole', () => {
    it('should allow users with required role', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_user_1',
        clerkUserId: 'user_123',
        email: 'admin@example.com',
        role: 'ADMIN',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withRole(['ADMIN'], handler);

      const mockRequest = new Request('http://localhost/api/admin/test');
      await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalled();
    });

    it('should reject users without required role with 403', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_user_1',
        clerkUserId: 'user_123',
        email: 'viewer@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withRole(['ADMIN'], handler);

      const mockRequest = new Request('http://localhost/api/admin/test');
      const result = await wrappedHandler(mockRequest);

      expect(result.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow multiple roles', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_user_1',
        clerkUserId: 'user_123',
        email: 'analyst@example.com',
        role: 'ANALYST',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withRole(['ADMIN', 'ANALYST'], handler);

      const mockRequest = new Request('http://localhost/api/test');
      await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('withOrganization', () => {
    it('should require organization membership', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withOrganization(handler);

      const mockRequest = new Request('http://localhost/api/test');
      await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalled();
    });

    it('should reject users without organization with 403', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: null, // No org selected
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const wrappedHandler = withOrganization(handler);

      const mockRequest = new Request('http://localhost/api/test');
      const result = await wrappedHandler(mockRequest);

      expect(result.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return authenticated user with roles', async () => {
      const { auth, currentUser } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
      } as any);

      vi.mocked(currentUser).mockResolvedValue({
        id: 'user_123',
        emailAddresses: [{ emailAddress: 'test@example.com' }],
        firstName: 'Test',
        lastName: 'User',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_user_1',
        clerkUserId: 'user_123',
        email: 'test@example.com',
        role: 'ANALYST',
        organizationId: 'internal_org_1',
        organization: {
          id: 'internal_org_1',
          clerkOrgId: 'org_456',
          name: 'Test Org',
          plan: 'PRO',
        },
      } as any);

      const user = await getCurrentUser();

      expect(user).toBeDefined();
      expect(user?.clerkUserId).toBe('user_123');
      expect(user?.role).toBe('ANALYST');
      expect(user?.organization).toBeDefined();
    });

    it('should return null for unauthenticated users', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: null,
      } as any);

      const user = await getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe('requireAuth', () => {
    it('should throw error for unauthenticated requests', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: null,
        orgId: null,
      } as any);

      await expect(requireAuth()).rejects.toThrow('Unauthorized');
    });

    it('should return auth context for authenticated requests', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      vi.mocked(auth).mockResolvedValue({
        userId: 'user_123',
        orgId: 'org_456',
        sessionId: 'sess_789',
      } as any);

      const authContext = await requireAuth();

      expect(authContext.userId).toBe('user_123');
      expect(authContext.orgId).toBe('org_456');
    });
  });
});

describe('Role-Based Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ADMIN role', () => {
    it('should have access to all features', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'admin_user',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_admin',
        clerkUserId: 'admin_user',
        email: 'admin@example.com',
        role: 'ADMIN',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));

      // Test each permission level
      const adminOnlyHandler = withRole(['ADMIN'], handler);
      const analystHandler = withRole(['ADMIN', 'ANALYST'], handler);
      const viewerHandler = withRole(['ADMIN', 'ANALYST', 'VIEWER'], handler);

      const mockRequest = new Request('http://localhost/api/test');

      await adminOnlyHandler(mockRequest);
      expect(handler).toHaveBeenCalledTimes(1);

      await analystHandler(mockRequest);
      expect(handler).toHaveBeenCalledTimes(2);

      await viewerHandler(mockRequest);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('ANALYST role', () => {
    it('should not have access to admin-only features', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'analyst_user',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_analyst',
        clerkUserId: 'analyst_user',
        email: 'analyst@example.com',
        role: 'ANALYST',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const adminOnlyHandler = withRole(['ADMIN'], handler);

      const mockRequest = new Request('http://localhost/api/admin/test');
      const result = await adminOnlyHandler(mockRequest);

      expect(result.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should have access to analyst-level features', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'analyst_user',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_analyst',
        clerkUserId: 'analyst_user',
        email: 'analyst@example.com',
        role: 'ANALYST',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const analystHandler = withRole(['ADMIN', 'ANALYST'], handler);

      const mockRequest = new Request('http://localhost/api/test');
      await analystHandler(mockRequest);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('VIEWER role', () => {
    it('should only have view-only access', async () => {
      const { auth } = await import('@clerk/nextjs/server');
      const { prisma } = await import('@/lib/db');

      vi.mocked(auth).mockResolvedValue({
        userId: 'viewer_user',
        orgId: 'org_456',
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'internal_viewer',
        clerkUserId: 'viewer_user',
        email: 'viewer@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      const handler = vi.fn().mockResolvedValue(new Response('ok'));

      // Should be rejected from admin routes
      const adminHandler = withRole(['ADMIN'], handler);
      let result = await adminHandler(new Request('http://localhost/api/admin'));
      expect(result.status).toBe(403);

      // Should be rejected from analyst routes
      const analystHandler = withRole(['ADMIN', 'ANALYST'], handler);
      result = await analystHandler(new Request('http://localhost/api/analyst'));
      expect(result.status).toBe(403);

      // Should be allowed for viewer routes
      const viewerHandler = withRole(['ADMIN', 'ANALYST', 'VIEWER'], handler);
      await viewerHandler(new Request('http://localhost/api/view'));
      expect(handler).toHaveBeenCalled();
    });
  });
});

describe('Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should isolate data access by organization', async () => {
    const { auth } = await import('@clerk/nextjs/server');
    const { prisma } = await import('@/lib/db');

    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_A',
    } as any);

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: 'internal_org_A',
      clerkOrgId: 'org_A',
      name: 'Org A',
      plan: 'PRO',
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'internal_user',
      clerkUserId: 'user_123',
      email: 'user@orgA.com',
      role: 'ANALYST',
      organizationId: 'internal_org_A',
    } as any);

    // Access should be scoped to user's organization
    const handler = vi.fn().mockImplementation(async (req, ctx) => {
      // Handler receives the organizationId for scoping queries
      expect(ctx.auth.orgId).toBe('org_A');
      return new Response('ok');
    });

    const wrappedHandler = withOrganization(handler);
    const mockRequest = new Request('http://localhost/api/data');
    await wrappedHandler(mockRequest);

    expect(handler).toHaveBeenCalled();
  });

  it('should prevent cross-tenant access', async () => {
    const { auth } = await import('@clerk/nextjs/server');

    // User belongs to Org A
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_from_org_A',
      orgId: 'org_A',
    } as any);

    // A proper handler would check organizationId before returning data
    // This test verifies the pattern
    const handler = vi.fn().mockImplementation(async (req, ctx) => {
      const resourceOrgId = 'org_B'; // Resource belongs to Org B
      if (ctx.auth.orgId !== resourceOrgId) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response('ok');
    });

    const wrappedHandler = withOrganization(handler);
    const mockRequest = new Request('http://localhost/api/data/resource_from_org_B');
    const result = await wrappedHandler(mockRequest);

    expect(result.status).toBe(403);
  });
});

describe('hasPermission', () => {
  it('should return true for admin with any permission', () => {
    const adminUser: AuthenticatedUser = {
      id: 'user-1',
      clerkUserId: 'clerk_123',
      email: 'admin@example.com',
      role: 'ADMIN',
      organizationId: 'org-1',
    };

    expect(hasPermission(adminUser, 'read', 'complaints')).toBe(true);
    expect(hasPermission(adminUser, 'delete', 'users')).toBe(true);
    expect(hasPermission(adminUser, 'any_action', 'any_resource')).toBe(true);
  });

  it('should return correct permissions for analyst role', () => {
    const analystUser: AuthenticatedUser = {
      id: 'user-1',
      clerkUserId: 'clerk_123',
      email: 'analyst@example.com',
      role: 'ANALYST',
      organizationId: 'org-1',
    };

    expect(hasPermission(analystUser, 'read', 'complaints')).toBe(true);
    expect(hasPermission(analystUser, 'search', 'complaints')).toBe(true);
    expect(hasPermission(analystUser, 'create', 'patterns')).toBe(true);
    expect(hasPermission(analystUser, 'read', 'users')).toBe(true);
  });

  it('should return correct permissions for viewer role', () => {
    const viewerUser: AuthenticatedUser = {
      id: 'user-1',
      clerkUserId: 'clerk_123',
      email: 'viewer@example.com',
      role: 'VIEWER',
      organizationId: 'org-1',
    };

    expect(hasPermission(viewerUser, 'read', 'complaints')).toBe(true);
    expect(hasPermission(viewerUser, 'read', 'patterns')).toBe(true);
    expect(hasPermission(viewerUser, 'create', 'patterns')).toBe(false);
    expect(hasPermission(viewerUser, 'delete', 'generated_complaints')).toBe(false);
  });

  it('should return false for unknown resource', () => {
    const viewerUser: AuthenticatedUser = {
      id: 'user-1',
      clerkUserId: 'clerk_123',
      email: 'viewer@example.com',
      role: 'VIEWER',
      organizationId: 'org-1',
    };

    expect(hasPermission(viewerUser, 'read', 'unknown_resource')).toBe(false);
  });
});

describe('canAccessOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true if user belongs to organization', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      clerkUserId: 'clerk_123',
      organizationId: 'org-1',
    } as any);

    const result = await canAccessOrganization('clerk_123', 'org-1');
    expect(result).toBe(true);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        clerkUserId: 'clerk_123',
        organizationId: 'org-1',
      },
    });
  });

  it('should return false if user does not belong to organization', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const result = await canAccessOrganization('clerk_123', 'other-org');
    expect(result).toBe(false);
  });
});

describe('getOrganizationId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if auth context has no orgId', async () => {
    const authContext: AuthContext = {
      userId: 'user_123',
      orgId: null,
      sessionId: 'sess_123',
    };

    const result = await getOrganizationId(authContext);
    expect(result).toBeNull();
  });

  it('should return organization id if found', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: 'internal_org_1',
      clerkOrgId: 'org_456',
      name: 'Test Org',
    } as any);

    const authContext: AuthContext = {
      userId: 'user_123',
      orgId: 'org_456',
      sessionId: 'sess_123',
    };

    const result = await getOrganizationId(authContext);
    expect(result).toBe('internal_org_1');

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: 'org_456' },
    });
  });

  it('should return null if organization not found', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    const authContext: AuthContext = {
      userId: 'user_123',
      orgId: 'unknown_org',
      sessionId: 'sess_123',
    };

    const result = await getOrganizationId(authContext);
    expect(result).toBeNull();
  });
});

describe('composeMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should compose multiple middleware functions', async () => {
    const { auth } = await import('@clerk/nextjs/server');

    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      orgId: 'org_456',
      sessionId: 'sess_789',
    } as any);

    const composed = composeMiddleware(withAuth, withOrganization);
    const handler = vi.fn().mockResolvedValue(new Response('ok'));
    const wrappedHandler = composed(handler);

    const mockRequest = new Request('http://localhost/api/test');
    await wrappedHandler(mockRequest);

    expect(handler).toHaveBeenCalled();
  });

  it('should short-circuit if first middleware fails', async () => {
    const { auth } = await import('@clerk/nextjs/server');

    vi.mocked(auth).mockResolvedValue({
      userId: null, // Not authenticated
      orgId: null,
      sessionId: null,
    } as any);

    const composed = composeMiddleware(withAuth, withOrganization);
    const handler = vi.fn().mockResolvedValue(new Response('ok'));
    const wrappedHandler = composed(handler);

    const mockRequest = new Request('http://localhost/api/test');
    const result = await wrappedHandler(mockRequest);

    expect(result.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
