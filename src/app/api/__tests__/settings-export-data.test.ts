/**
 * GDPR Data Export API Tests
 * Tests for GDPR Article 20 - Data Portability endpoint
 * P0-1 Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn((handler) => handler),
  withOrganization: vi.fn((handler) => handler),
  getCurrentUser: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    generatedComplaint: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    legalHold: {
      findFirst: vi.fn(),
    },
    dataExportLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Helper to create authenticated request
function createAuthenticatedRequest(queryString = ''): NextRequest {
  return new NextRequest(`http://localhost/api/settings/export-data${queryString}`);
}

describe('GET /api/settings/export-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../settings/export-data/route');
      const request = createAuthenticatedRequest();
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 for users without organization', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: null,
        role: 'ANALYST',
      });

      const { GET } = await import('../settings/export-data/route');
      const request = createAuthenticatedRequest();
      const response = await GET(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Data Export - JSON Format', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ANALYST',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      } as any);

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        plan: 'PRO',
        createdAt: new Date('2024-01-01'),
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        {
          id: 'complaint_1',
          status: 'DRAFT',
          createdAt: new Date('2024-01-10'),
          content: { title: 'Test Complaint' },
        },
      ] as any);

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log_1',
          action: 'CREATE',
          resource: 'COMPLAINT',
          resourceId: 'complaint_1',
          metadata: {},
          createdAt: new Date('2024-01-10'),
        },
      ] as any);

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should export user profile data', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toMatchObject({
        id: expect.any(String),
        email: expect.any(String),
        clerkUserId: expect.any(String),
        role: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('should export organization membership', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.organization).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        plan: expect.any(String),
      });
    });

    it('should export user-generated complaints', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.generatedComplaints).toBeInstanceOf(Array);
      expect(data.generatedComplaints.length).toBeGreaterThan(0);
      expect(data.generatedComplaints[0]).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('should export audit log of user actions', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.auditLog).toBeInstanceOf(Array);
    });

    it('should include export metadata', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.exportMetadata).toMatchObject({
        exportedAt: expect.any(String),
        format: 'json',
        version: '1.0',
        requestedBy: expect.any(String),
      });
    });
  });

  describe('Data Export - CSV Format', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ANALYST',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      } as any);

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        plan: 'PRO',
        createdAt: new Date('2024-01-01'),
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should export data as CSV when format=csv', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=csv'));

      expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('.csv');
    });

    it('should include proper CSV headers', async () => {
      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=csv'));
      const text = await response.text();

      expect(text).toContain('section,field,value');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });
    });

    it('should rate limit to 1 export per hour', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock that a recent export exists
      vi.mocked(prisma.dataExportLog.findFirst).mockResolvedValue({
        id: 'export_1',
        userId: 'user_123',
        createdAt: new Date(), // Just now
      } as any);

      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.detail).toContain('rate limit');
    });
  });

  describe('Audit Logging', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ANALYST',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      } as any);

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        plan: 'PRO',
        createdAt: new Date('2024-01-01'),
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should log data export to audit log', async () => {
      const { prisma } = await import('@/lib/db');
      const { GET } = await import('../settings/export-data/route');

      await GET(createAuthenticatedRequest('?format=json'));

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DATA_EXPORT',
            resource: 'USER_DATA',
          }),
        })
      );
    });
  });

  describe('Legal Hold Check', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        clerkUserId: 'clerk_123',
        role: 'ANALYST',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      } as any);

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org_123',
        name: 'Test Org',
        plan: 'PRO',
        createdAt: new Date('2024-01-01'),
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.dataExportLog.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.dataExportLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should include legal hold notice if user data is under hold', async () => {
      const { prisma } = await import('@/lib/db');

      // Mock active legal hold
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Litigation Hold',
        status: 'ACTIVE',
        createdAt: new Date('2024-01-01'),
      } as any);

      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.legalHoldNotice).toBeDefined();
      expect(data.legalHoldNotice.active).toBe(true);
    });

    it('should not include legal hold notice if no hold exists', async () => {
      const { prisma } = await import('@/lib/db');
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);

      const { GET } = await import('../settings/export-data/route');
      const response = await GET(createAuthenticatedRequest('?format=json'));
      const data = await response.json();

      expect(data.legalHoldNotice).toBeUndefined();
    });
  });
});
