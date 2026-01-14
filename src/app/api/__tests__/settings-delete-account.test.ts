/**
 * GDPR Account Deletion API Tests
 * Tests for GDPR Article 17 - Right to Erasure endpoint
 * P0-2 Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock Clerk
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: {
    users: {
      deleteUser: vi.fn(),
    },
  },
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    generatedComplaint: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    legalHold: {
      findFirst: vi.fn(),
    },
    legalHoldScope: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      generatedComplaint: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    })),
  },
}));

// Helper to create DELETE request
function createDeleteRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/settings/delete-account', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DELETE /api/settings/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = new NextRequest('http://localhost/api/settings/delete-account', {
        method: 'DELETE',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Confirmation Requirements', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
        email: 'test@example.com',
      });
    });

    it('should require confirmation fields in body', async () => {
      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({});
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      // Empty body should fail email validation
      expect(data.detail).toContain('email');
    });

    it('should require email confirmation match', async () => {
      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'wrong@email.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('email');
    });

    it('should require typed confirmation phrase', async () => {
      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'wrong phrase',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('phrase');
    });
  });

  describe('Legal Hold Prevention', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      });
    });

    it('should prevent deletion if user data is under legal hold', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock legal hold on user
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Litigation Hold',
        status: 'ACTIVE',
      } as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.detail).toContain('legal hold');
    });
  });

  describe('Admin User Prevention', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
    });

    it('should prevent deletion if user is sole org admin', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock user is the only admin
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.detail).toContain('administrator');
    });

    it('should allow deletion if org has other admins', async () => {
      const { prisma } = await import('@/lib/db');
      const { clerkClient } = await import('@clerk/nextjs/server');

      // Mock multiple admins exist
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(5);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'user_123',
        deletedAt: new Date(),
        isDeleted: true,
      } as any);

      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 5 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      const response = await DELETE(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Data Deletion Process', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(2); // Other admins exist
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ANALYST',
      } as any);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(3);
    });

    it('should soft-delete user record', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'user_123',
        deletedAt: new Date(),
        isDeleted: true,
        email: 'deleted_abc123@anonymized.local',
      } as any);

      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      await DELETE(request);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user_123' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            isDeleted: true,
          }),
        })
      );
    });

    it('should anonymize PII fields', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'user_123',
        deletedAt: new Date(),
        isDeleted: true,
        email: 'deleted_abc123@anonymized.local',
      } as any);

      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      await DELETE(request);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: expect.stringMatching(/^deleted_[a-z0-9]+@anonymized\.local$/),
          }),
        })
      );
    });

    it('should cascade soft-delete to generated complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({} as any);
      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      await DELETE(request);

      expect(prisma.generatedComplaint.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdBy: 'clerk_123',
            legalHold: false,
          }),
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('Audit Trail', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(2);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      } as any);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(0);
    });

    it('should create audit log entry for deletion', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({} as any);
      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      await DELETE(request);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACCOUNT_DELETION',
            resource: 'USER',
          }),
        })
      );
    });
  });

  describe('Response', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.count).mockResolvedValue(2);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
      } as any);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(5);

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.mocked(prisma.user.update).mockResolvedValue({} as any);
      vi.mocked(prisma.generatedComplaint.updateMany).mockResolvedValue({ count: 5 });
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should return deletion confirmation with timeline', async () => {
      const { DELETE } = await import('../settings/delete-account/route');
      const request = createDeleteRequest({
        confirmEmail: 'test@example.com',
        confirmPhrase: 'DELETE MY ACCOUNT',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        message: expect.stringContaining('scheduled'),
        deletionTimeline: {
          softDeletedAt: expect.any(String),
          hardDeleteScheduledAt: expect.any(String),
        },
        itemsAffected: {
          generatedComplaints: expect.any(Number),
          auditLogs: 'retained',
        },
      });
    });
  });
});
