/**
 * Legal Holds Management API Tests
 * Tests for e-Discovery compliance endpoints
 * P0-4 Implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    legalHold: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    legalHoldScope: {
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

// Helper to create request as ADMIN
function createRequestAsAdmin(queryString = ''): NextRequest {
  return new NextRequest(`http://localhost/api/legal-holds${queryString}`);
}

// Helper to create POST request
function createPostRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/legal-holds', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper to create PATCH request
function createPatchRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/legal-holds/hold_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper to create DELETE request
function createDeleteRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/legal-holds/hold_1', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Legal Holds API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authorization', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../legal-holds/route');
      const request = new NextRequest('http://localhost/api/legal-holds');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 for VIEWER users', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'VIEWER',
      });

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin();
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should return 403 for ANALYST users', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin();
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

      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([]);
      vi.mocked(prisma.legalHold.count).mockResolvedValue(0);

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin();
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/legal-holds', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should return list of legal holds for organization', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([
        {
          id: 'hold_1',
          matterName: 'Smith v. Corp',
          status: 'ACTIVE',
          organizationId: 'org_123',
          issuedAt: new Date(),
          issuedBy: 'user_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { scopes: 5 },
        },
      ] as any);
      vi.mocked(prisma.legalHold.count).mockResolvedValue(1);

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin();
      const response = await GET(request);
      const data = await response.json();

      expect(data.legalHolds).toBeInstanceOf(Array);
      expect(data.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([
        { id: 'hold_1', status: 'ACTIVE', matterName: 'Test', issuedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      vi.mocked(prisma.legalHold.count).mockResolvedValue(1);

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin('?status=ACTIVE');
      const response = await GET(request);

      expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        })
      );
    });

    it('should filter by matterName', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([]);
      vi.mocked(prisma.legalHold.count).mockResolvedValue(0);

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin('?matterName=case-123');
      const response = await GET(request);

      expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            matterName: expect.objectContaining({
              contains: 'case-123',
            }),
          }),
        })
      );
    });

    it('should include scope count', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([
        {
          id: 'hold_1',
          matterName: 'Test',
          status: 'ACTIVE',
          issuedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { scopes: 5 },
        },
      ] as any);
      vi.mocked(prisma.legalHold.count).mockResolvedValue(1);

      const { GET } = await import('../legal-holds/route');
      const request = createRequestAsAdmin();
      const response = await GET(request);
      const data = await response.json();

      expect(data.legalHolds[0]).toHaveProperty('_count');
    });
  });

  describe('POST /api/legal-holds', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should create new legal hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.create).mockResolvedValue({
        id: 'hold_new',
        matterName: 'Smith v. AutoCorp',
        description: 'Preserve all documents',
        status: 'ISSUED',
        organizationId: 'org_123',
        issuedBy: 'user_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { POST } = await import('../legal-holds/route');
      const request = createPostRequest({
        matterName: 'Smith v. AutoCorp',
        description: 'Preserve all documents related to airbag defects',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.legalHold).toMatchObject({
        id: expect.any(String),
        matterName: 'Smith v. AutoCorp',
        status: 'ISSUED',
      });
    });

    it('should require matterName', async () => {
      const { POST } = await import('../legal-holds/route');
      const request = createPostRequest({ description: 'Test' });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('matterName');
    });

    it('should set initial status to ISSUED', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.create).mockResolvedValue({
        id: 'hold_new',
        matterName: 'Test Matter',
        status: 'ISSUED',
        organizationId: 'org_123',
        issuedBy: 'user_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { POST } = await import('../legal-holds/route');
      const request = createPostRequest({ matterName: 'Test Matter' });
      const response = await POST(request);
      const data = await response.json();

      expect(data.legalHold.status).toBe('ISSUED');
    });

    it('should create audit log entry', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.create).mockResolvedValue({
        id: 'hold_new',
        matterName: 'Test',
        status: 'ISSUED',
        organizationId: 'org_123',
        issuedBy: 'user_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { POST } = await import('../legal-holds/route');
      await POST(createPostRequest({ matterName: 'Test Matter' }));

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LEGAL_HOLD_CREATED',
          }),
        })
      );
    });
  });

  describe('GET /api/legal-holds/[id]', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should return legal hold details', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test Matter',
        status: 'ACTIVE',
        organizationId: 'org_123',
        issuedBy: 'user_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        scopes: [],
      } as any);

      const { GET } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1');
      const response = await GET(request, { params: Promise.resolve({ id: 'hold_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.legalHold.id).toBe('hold_1');
    });

    it('should include scopes', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        scopes: [
          { id: 'scope_1', resourceType: 'GENERATED_COMPLAINT', resourceId: 'comp_1', createdAt: new Date() },
        ],
      } as any);

      const { GET } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1');
      const response = await GET(request, { params: Promise.resolve({ id: 'hold_1' }) });
      const data = await response.json();

      expect(data.legalHold.scopes).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);

      const { GET } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/non-existent');
      const response = await GET(request, { params: Promise.resolve({ id: 'non-existent' }) });

      expect(response.status).toBe(404);
    });

    it('should return 404 for hold from different org (tenant isolation)', async () => {
      const { prisma } = await import('@/lib/db');

      // findFirst returns null because org filter doesn't match
      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue(null);

      const { GET } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/other_org_hold');
      const response = await GET(request, { params: Promise.resolve({ id: 'other_org_hold' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/legal-holds/[id]', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should update hold status from ISSUED to ACTIVE', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ISSUED',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.legalHold.update).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { PATCH } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'hold_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.legalHold.status).toBe('ACTIVE');
    });

    it('should prevent invalid status transitions (RELEASED to ACTIVE)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'RELEASED',
        organizationId: 'org_123',
        issuedAt: new Date(),
        releasedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const { PATCH } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('Invalid status transition');
    });

    it('should allow updating description', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        description: 'Original',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.legalHold.update).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        description: 'Updated description',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { PATCH } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'PATCH',
        body: JSON.stringify({ description: 'Updated description' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await PATCH(request, { params: Promise.resolve({ id: 'hold_1' }) });
      const data = await response.json();

      expect(data.legalHold.description).toBe('Updated description');
    });

    it('should log status changes', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ISSUED',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.legalHold.update).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { PATCH } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
        headers: { 'Content-Type': 'application/json' },
      });
      await PATCH(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LEGAL_HOLD_STATUS_CHANGED',
            metadata: expect.objectContaining({
              previousStatus: 'ISSUED',
              newStatus: 'ACTIVE',
            }),
          }),
        })
      );
    });
  });

  describe('DELETE /api/legal-holds/[id] (Release)', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should release active hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.legalHold.update).mockResolvedValue({
        id: 'hold_1',
        status: 'RELEASED',
        releasedAt: new Date(),
        releasedBy: 'user_123',
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'DELETE',
        body: JSON.stringify({ releaseReason: 'Matter resolved' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(response.status).toBe(200);
    });

    it('should require release reason', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      const { DELETE } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'DELETE',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.detail).toContain('releaseReason');
    });

    it('should log release', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        matterName: 'Test',
        status: 'ACTIVE',
        organizationId: 'org_123',
        issuedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(prisma.legalHold.update).mockResolvedValue({
        id: 'hold_1',
        status: 'RELEASED',
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../legal-holds/[id]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1', {
        method: 'DELETE',
        body: JSON.stringify({ releaseReason: 'Matter resolved' }),
        headers: { 'Content-Type': 'application/json' },
      });
      await DELETE(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'LEGAL_HOLD_RELEASED',
            metadata: expect.objectContaining({
              releaseReason: 'Matter resolved',
            }),
          }),
        })
      );
    });
  });
});

describe('Legal Hold Scope API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/legal-holds/[id]/scopes', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should add scope to hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.legalHoldScope.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.legalHoldScope.create).mockResolvedValue({
        id: 'scope_1',
        legalHoldId: 'hold_1',
        resourceType: 'GENERATED_COMPLAINT',
        resourceId: 'comp_1',
        createdAt: new Date(),
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { POST } = await import('../legal-holds/[id]/scopes/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1/scopes', {
        method: 'POST',
        body: JSON.stringify({
          resourceType: 'GENERATED_COMPLAINT',
          resourceId: 'comp_1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(response.status).toBe(201);
    });

    it('should prevent duplicate scopes', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.legalHoldScope.findFirst).mockResolvedValue({
        id: 'scope_1',
        legalHoldId: 'hold_1',
        resourceType: 'GENERATED_COMPLAINT',
        resourceId: 'comp_1',
      } as any);

      const { POST } = await import('../legal-holds/[id]/scopes/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1/scopes', {
        method: 'POST',
        body: JSON.stringify({
          resourceType: 'GENERATED_COMPLAINT',
          resourceId: 'comp_1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'hold_1' }) });

      expect(response.status).toBe(409);
    });

    it('should support batch scope addition', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.legalHoldScope.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.legalHoldScope.createMany).mockResolvedValue({ count: 3 });

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { POST } = await import('../legal-holds/[id]/scopes/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1/scopes', {
        method: 'POST',
        body: JSON.stringify({
          scopes: [
            { resourceType: 'GENERATED_COMPLAINT', resourceId: 'comp-1' },
            { resourceType: 'GENERATED_COMPLAINT', resourceId: 'comp-2' },
            { resourceType: 'PATTERN', resourceId: 'pattern-1' },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'hold_1' }) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.scopesAdded).toBe(3);
    });
  });

  describe('DELETE /api/legal-holds/[id]/scopes/[scopeId]', () => {
    beforeEach(async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      });
    });

    it('should remove scope from hold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.legalHoldScope.findUnique).mockResolvedValue({
        id: 'scope_1',
        legalHoldId: 'hold_1',
        resourceType: 'GENERATED_COMPLAINT',
        resourceId: 'comp_1',
      } as any);

      vi.mocked(prisma.legalHoldScope.delete).mockResolvedValue({
        id: 'scope_1',
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const { DELETE } = await import('../legal-holds/[id]/scopes/[scopeId]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1/scopes/scope_1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'hold_1', scopeId: 'scope_1' }),
      });

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent scope', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.legalHold.findFirst).mockResolvedValue({
        id: 'hold_1',
        status: 'ACTIVE',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.legalHoldScope.findUnique).mockResolvedValue(null);

      const { DELETE } = await import('../legal-holds/[id]/scopes/[scopeId]/route');
      const request = new NextRequest('http://localhost/api/legal-holds/hold_1/scopes/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'hold_1', scopeId: 'non-existent' }),
      });

      expect(response.status).toBe(404);
    });
  });
});
