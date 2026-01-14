/**
 * e-Discovery Export API Tests
 * Tests for legal discovery data export endpoint
 * P0-3 Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    legalHold: {
      findFirst: vi.fn(),
    },
    generatedComplaint: {
      findMany: vi.fn(),
    },
    pattern: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// Helper to create request as ADMIN
function createRequestAsAdmin(queryString: string): NextRequest {
  return new NextRequest(`http://localhost/api/discovery/export-data${queryString}`);
}

describe('GET /api/discovery/export-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authorization', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../discovery/export-data/route');
      const request = new NextRequest('http://localhost/api/discovery/export-data');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-ADMIN users', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should allow ADMIN users', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);

      expect(response.status).not.toBe(403);
    });
  });

  describe('Required Parameters', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should require matterId parameter', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('matterId');
    });

    it('should validate date range format', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test&startDate=invalid');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('date');
    });
  });

  describe('Legal Hold Verification', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should only export data under active legal hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'active-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=active-matter');
      const response = await GET(request);
      const data = await response.json();

      expect(data.legalHold).toMatchObject({
        id: expect.any(String),
        matterName: 'active-matter',
        status: 'ACTIVE',
      });
    });

    it('should return 404 if no legal hold for matter', async () => {
      const { prisma } = await import('@/lib/db');
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=no-hold-matter');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.detail).toContain('No active legal hold');
    });
  });

  describe('Export Formats', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should export as JSON by default', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);

      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    it('should export as CSV when format=csv', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter&format=csv');
      const response = await GET(request);

      expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    });
  });

  describe('Data Scope', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should include all generated complaints in scope', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        {
          id: 'complaint_1',
          title: 'Test Complaint',
          status: 'DRAFT',
          content: {},
          createdAt: new Date('2024-03-15'),
        },
      ] as any);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);
      const data = await response.json();

      expect(data.generatedComplaints).toBeInstanceOf(Array);
      expect(data.generatedComplaints.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        {
          id: 'complaint_1',
          title: 'In Range',
          createdAt: new Date('2024-03-15'),
        },
      ] as any);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin(
        '?matterId=test-matter&startDate=2024-01-01&endDate=2024-06-30'
      );
      const response = await GET(request);
      const data = await response.json();

      // Verify the Prisma query was called with date filters
      expect(prisma.generatedComplaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should include related patterns when requested', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'Test Pattern',
          firstSeen: new Date('2024-01-01'),
          lastUpdated: new Date('2024-03-15'),
        },
      ] as any);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter&includePatterns=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.patterns).toBeInstanceOf(Array);
    });

    it('should include audit logs for chain of custody', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
        {
          id: 'log_1',
          action: 'CREATE',
          resource: 'COMPLAINT',
          createdAt: new Date('2024-03-15'),
        },
      ] as any);

      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);
      const data = await response.json();

      expect(data.auditTrail).toBeInstanceOf(Array);
    });
  });

  describe('Chain of Custody', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should include SHA-256 hash of export content', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);
      const data = await response.json();

      expect(data.chainOfCustody).toMatchObject({
        exportHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        hashAlgorithm: 'SHA-256',
        exportedAt: expect.any(String),
        exportedBy: expect.any(String),
        recordCount: expect.any(Number),
      });
    });
  });

  describe('Audit Logging', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should log discovery export to audit log', async () => {
      const { prisma } = await import('@/lib/db');
      const { GET } = await import('../discovery/export-data/route');

      await GET(createRequestAsAdmin('?matterId=test-matter'));

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DISCOVERY_EXPORT',
            resource: 'LEGAL_HOLD',
          }),
        })
      );
    });
  });

  describe('Response Headers', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'test-matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    });

    it('should set Content-Disposition for download', async () => {
      const { GET } = await import('../discovery/export-data/route');
      const request = createRequestAsAdmin('?matterId=test-matter');
      const response = await GET(request);

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('discovery-export');
    });
  });
});
