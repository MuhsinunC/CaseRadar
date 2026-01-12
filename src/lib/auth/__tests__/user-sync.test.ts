/**
 * User Sync Tests
 * Tests for syncing Clerk users with local database
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncUser,
  syncOrganization,
  handleUserCreated,
  handleUserUpdated,
  handleUserDeleted,
  handleOrgCreated,
  handleOrgMembershipCreated,
  type ClerkWebhookEvent,
} from '../user-sync';

// Create hoisted mock functions for Clerk client (must be before vi.mock)
const { mockGetUser, mockGetOrganization, mockGetOrganizationMembershipList } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetOrganization: vi.fn(),
  mockGetOrganizationMembershipList: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// Mock Clerk
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({
    users: {
      getUser: mockGetUser,
    },
    organizations: {
      getOrganization: mockGetOrganization,
      getOrganizationMembershipList: mockGetOrganizationMembershipList,
    },
  }),
}));

describe('User Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncUser', () => {
    it('should create new user if not exists', async () => {
      const { prisma } = await import('@/lib/db');
      const { clerkClient } = await import('@clerk/nextjs/server');

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'internal_org_1',
        clerkOrgId: 'org_456',
        name: 'Test Org',
        plan: 'FREE',
      } as any);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new_user_id',
        clerkUserId: 'user_123',
        email: 'new@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      const result = await syncUser({
        clerkUserId: 'user_123',
        email: 'new@example.com',
        clerkOrgId: 'org_456',
      });

      expect(prisma.user.create).toHaveBeenCalled();
      expect(result.clerkUserId).toBe('user_123');
    });

    it('should update existing user', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'existing_user_id',
        clerkUserId: 'user_123',
        email: 'old@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'existing_user_id',
        clerkUserId: 'user_123',
        email: 'new@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      const result = await syncUser({
        clerkUserId: 'user_123',
        email: 'new@example.com',
        clerkOrgId: 'org_456',
      });

      expect(prisma.user.update).toHaveBeenCalled();
      expect(result.email).toBe('new@example.com');
    });

    it('should use upsert for atomic operation', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'internal_org_1',
        clerkOrgId: 'org_456',
        name: 'Test Org',
        plan: 'FREE',
      } as any);

      vi.mocked(prisma.user.upsert).mockResolvedValue({
        id: 'user_id',
        clerkUserId: 'user_123',
        email: 'test@example.com',
        role: 'VIEWER',
        organizationId: 'internal_org_1',
      } as any);

      await syncUser({
        clerkUserId: 'user_123',
        email: 'test@example.com',
        clerkOrgId: 'org_456',
        useUpsert: true,
      });

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { clerkUserId: 'user_123' },
        create: expect.objectContaining({
          clerkUserId: 'user_123',
          email: 'test@example.com',
        }),
        update: expect.objectContaining({
          email: 'test@example.com',
        }),
      });
    });

    it('should throw error if organization not found', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

      await expect(
        syncUser({
          clerkUserId: 'user_123',
          email: 'test@example.com',
          clerkOrgId: 'nonexistent_org',
        })
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('syncOrganization', () => {
    it('should create new organization if not exists', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.organization.create).mockResolvedValue({
        id: 'new_org_id',
        clerkOrgId: 'org_123',
        name: 'New Organization',
        plan: 'FREE',
      } as any);

      const result = await syncOrganization({
        clerkOrgId: 'org_123',
        name: 'New Organization',
      });

      expect(prisma.organization.create).toHaveBeenCalled();
      expect(result.clerkOrgId).toBe('org_123');
    });

    it('should update existing organization name', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'existing_org_id',
        clerkOrgId: 'org_123',
        name: 'Old Name',
        plan: 'FREE',
      } as any);

      vi.mocked(prisma.organization.update).mockResolvedValue({
        id: 'existing_org_id',
        clerkOrgId: 'org_123',
        name: 'New Name',
        plan: 'FREE',
      } as any);

      const result = await syncOrganization({
        clerkOrgId: 'org_123',
        name: 'New Name',
      });

      expect(prisma.organization.update).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
    });
  });

  describe('Webhook Handlers', () => {
    describe('handleUserCreated', () => {
      it('should sync new user from webhook', async () => {
        const { prisma } = await import('@/lib/db');

        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
          id: 'internal_org_1',
          clerkOrgId: 'org_456',
          name: 'Test Org',
          plan: 'FREE',
        } as any);

        vi.mocked(prisma.user.upsert).mockResolvedValue({
          id: 'new_user_id',
          clerkUserId: 'user_123',
          email: 'webhook@example.com',
          role: 'VIEWER',
          organizationId: 'internal_org_1',
        } as any);

        const event: ClerkWebhookEvent = {
          type: 'user.created',
          data: {
            id: 'user_123',
            email_addresses: [{ email_address: 'webhook@example.com' }],
            organization_memberships: [{ organization: { id: 'org_456' } }],
          },
        };

        await handleUserCreated(event);

        expect(prisma.user.upsert).toHaveBeenCalled();
      });
    });

    describe('handleUserUpdated', () => {
      it('should update user from webhook', async () => {
        const { prisma } = await import('@/lib/db');

        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: 'existing_user_id',
          clerkUserId: 'user_123',
          email: 'old@example.com',
          role: 'VIEWER',
          organizationId: 'internal_org_1',
        } as any);

        vi.mocked(prisma.user.update).mockResolvedValue({
          id: 'existing_user_id',
          clerkUserId: 'user_123',
          email: 'updated@example.com',
          role: 'VIEWER',
          organizationId: 'internal_org_1',
        } as any);

        const event: ClerkWebhookEvent = {
          type: 'user.updated',
          data: {
            id: 'user_123',
            email_addresses: [{ email_address: 'updated@example.com' }],
          },
        };

        await handleUserUpdated(event);

        expect(prisma.user.update).toHaveBeenCalled();
      });
    });

    describe('handleUserDeleted', () => {
      it('should delete user from webhook', async () => {
        const { prisma } = await import('@/lib/db');

        vi.mocked(prisma.user.delete).mockResolvedValue({} as any);

        const event: ClerkWebhookEvent = {
          type: 'user.deleted',
          data: {
            id: 'user_123',
          },
        };

        await handleUserDeleted(event);

        expect(prisma.user.delete).toHaveBeenCalledWith({
          where: { clerkUserId: 'user_123' },
        });
      });

      it('should handle non-existent user gracefully', async () => {
        const { prisma } = await import('@/lib/db');

        vi.mocked(prisma.user.delete).mockRejectedValue(
          new Error('Record to delete does not exist')
        );

        const event: ClerkWebhookEvent = {
          type: 'user.deleted',
          data: {
            id: 'nonexistent_user',
          },
        };

        // Should not throw
        await expect(handleUserDeleted(event)).resolves.not.toThrow();
      });
    });

    describe('handleOrgCreated', () => {
      it('should create organization from webhook', async () => {
        const { prisma } = await import('@/lib/db');

        vi.mocked(prisma.organization.create).mockResolvedValue({
          id: 'new_org_id',
          clerkOrgId: 'org_123',
          name: 'Webhook Created Org',
          plan: 'FREE',
        } as any);

        const event: ClerkWebhookEvent = {
          type: 'organization.created',
          data: {
            id: 'org_123',
            name: 'Webhook Created Org',
          },
        };

        await handleOrgCreated(event);

        expect(prisma.organization.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            clerkOrgId: 'org_123',
            name: 'Webhook Created Org',
          }),
        });
      });
    });

    describe('handleOrgMembershipCreated', () => {
      it('should add user to organization', async () => {
        const { prisma } = await import('@/lib/db');

        mockGetUser.mockResolvedValue({
          id: 'user_123',
          emailAddresses: [{ emailAddress: 'member@example.com' }],
        });

        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
          id: 'internal_org_1',
          clerkOrgId: 'org_456',
          name: 'Test Org',
          plan: 'FREE',
        } as any);

        vi.mocked(prisma.user.upsert).mockResolvedValue({
          id: 'user_id',
          clerkUserId: 'user_123',
          email: 'member@example.com',
          role: 'VIEWER',
          organizationId: 'internal_org_1',
        } as any);

        const event: ClerkWebhookEvent = {
          type: 'organizationMembership.created',
          data: {
            organization: { id: 'org_456' },
            public_user_data: { user_id: 'user_123' },
            role: 'org:member',
          },
        };

        await handleOrgMembershipCreated(event);

        expect(prisma.user.upsert).toHaveBeenCalled();
      });

      it('should assign ADMIN role for org admins', async () => {
        const { prisma } = await import('@/lib/db');

        mockGetUser.mockResolvedValue({
          id: 'admin_user',
          emailAddresses: [{ emailAddress: 'admin@example.com' }],
        });

        vi.mocked(prisma.organization.findUnique).mockResolvedValue({
          id: 'internal_org_1',
          clerkOrgId: 'org_456',
          name: 'Test Org',
          plan: 'FREE',
        } as any);

        vi.mocked(prisma.user.upsert).mockResolvedValue({
          id: 'admin_id',
          clerkUserId: 'admin_user',
          email: 'admin@example.com',
          role: 'ADMIN',
          organizationId: 'internal_org_1',
        } as any);

        const event: ClerkWebhookEvent = {
          type: 'organizationMembership.created',
          data: {
            organization: { id: 'org_456' },
            public_user_data: { user_id: 'admin_user' },
            role: 'org:admin',
          },
        };

        await handleOrgMembershipCreated(event);

        expect(prisma.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              role: 'ADMIN',
            }),
          })
        );
      });
    });
  });
});

describe('Role Mapping', () => {
  it('should map Clerk org:admin to ADMIN role', async () => {
    const { prisma } = await import('@/lib/db');

    mockGetUser.mockResolvedValue({
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    });

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: 'internal_org_1',
      clerkOrgId: 'org_456',
      name: 'Test Org',
      plan: 'FREE',
    } as any);

    vi.mocked(prisma.user.upsert).mockImplementation(async (args) => {
      return args.create as any;
    });

    const event: ClerkWebhookEvent = {
      type: 'organizationMembership.created',
      data: {
        organization: { id: 'org_456' },
        public_user_data: { user_id: 'user_123' },
        role: 'org:admin',
      },
    };

    await handleOrgMembershipCreated(event);

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'ADMIN' }),
      })
    );
  });

  it('should map Clerk org:member to VIEWER role by default', async () => {
    const { prisma } = await import('@/lib/db');

    mockGetUser.mockResolvedValue({
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    });

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: 'internal_org_1',
      clerkOrgId: 'org_456',
      name: 'Test Org',
      plan: 'FREE',
    } as any);

    vi.mocked(prisma.user.upsert).mockImplementation(async (args) => {
      return args.create as any;
    });

    const event: ClerkWebhookEvent = {
      type: 'organizationMembership.created',
      data: {
        organization: { id: 'org_456' },
        public_user_data: { user_id: 'user_123' },
        role: 'org:member',
      },
    };

    await handleOrgMembershipCreated(event);

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'VIEWER' }),
      })
    );
  });
});
