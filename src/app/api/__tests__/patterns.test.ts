/**
 * Patterns API Tests
 * Tests for pattern/cluster detection endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPatterns, POST as createPattern } from '../patterns/route';
import { GET as getPatternById, PATCH as updatePattern, DELETE as deletePattern } from '../patterns/[id]/route';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn((handler) => handler),
  withOrganization: vi.fn((handler) => handler),
  withRole: vi.fn((roles, handler) => handler),
  getCurrentUser: vi.fn().mockResolvedValue({
    id: 'user_123',
    organizationId: 'org_123',
    role: 'ANALYST',
  }),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    pattern: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    complaint: {
      findMany: vi.fn(),
    },
    legalHoldScope: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

// Mock billing service for plan checks
vi.mock('@/lib/billing', () => ({
  checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

describe('Patterns API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/patterns', () => {
    it('should return list of patterns for organization', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'Airbag Deployment Failures',
          description: 'Pattern of airbag failures in 2020+ vehicles',
          make: 'Toyota',
          model: 'RAV4',
          yearRange: '2020-2023',
          severity: 8.5,
          complaintCount: 150,
          trendDirection: 'INCREASING',
          organizationId: 'org_123',
          createdAt: new Date('2024-01-01'),
          _count: { complaints: 150 },
        },
      ] as any);
      vi.mocked(prisma.pattern.count).mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/patterns');
      const response = await getPatterns(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.patterns).toHaveLength(1);
      expect(data.patterns[0].name).toBe('Airbag Deployment Failures');
    });

    it('should filter patterns by organization (tenant isolation)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/patterns');
      await getPatterns(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org_123',
          }),
        })
      );
    });

    it('should filter patterns by severity threshold', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/patterns?minSeverity=7');
      await getPatterns(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severityScore: { gte: 7 },
          }),
        })
      );
    });

    it('should filter patterns by trend direction', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/patterns?trend=INCREASING');
      await getPatterns(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trendDirection: 'INCREASING',
          }),
        })
      );
    });

    it('should sort patterns by severity by default', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pattern.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/patterns');
      await getPatterns(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { severityScore: 'desc' },
        })
      );
    });
  });

  describe('GET /api/patterns/[id]', () => {
    it('should return pattern details with complaints', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        name: 'Brake Failures',
        description: 'Systematic brake failures',
        make: 'Honda',
        model: 'Civic',
        severity: 9.0,
        organizationId: 'org_123',
        complaints: [
          { id: 'complaint_1', summary: 'Brake failed while driving' },
          { id: 'complaint_2', summary: 'Brake pedal went to floor' },
        ],
        trendData: [
          { date: '2024-01', count: 10 },
          { date: '2024-02', count: 15 },
        ],
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1');
      const response = await getPatternById(request, { params: Promise.resolve({ id: 'pattern_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pattern.complaints).toHaveLength(2);
      expect(data.pattern.trendData).toHaveLength(2);
    });

    it('should return 404 for non-existent pattern', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/patterns/nonexistent');
      const response = await getPatternById(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
    });

    it('should return 403 if pattern belongs to different organization', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        organizationId: 'other_org', // Different org
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1');
      const response = await getPatternById(request, { params: Promise.resolve({ id: 'pattern_1' }) });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/patterns', () => {
    it('should create a new pattern', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.pattern.create).mockResolvedValue({
        id: 'pattern_new',
        name: 'New Pattern',
        description: 'A new pattern',
        make: 'Ford',
        model: 'F-150',
        organizationId: 'org_123',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Pattern',
          description: 'A new pattern',
          make: 'Ford',
          model: 'F-150',
          complaintIds: ['complaint_1', 'complaint_2'],
        }),
      });

      const response = await createPattern(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.pattern.name).toBe('New Pattern');
    });

    it('should validate required fields', async () => {
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields
          description: 'A pattern',
        }),
      });

      const response = await createPattern(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('name');
    });

    it('should enforce plan limits on pattern creation', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { checkPlanLimit } = await import('@/lib/billing');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(checkPlanLimit).mockResolvedValue({
        allowed: false,
        current: 5,
        limit: 5,
      });

      const request = new NextRequest('http://localhost:3000/api/patterns', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Pattern',
          description: 'A new pattern',
        }),
      });

      const response = await createPattern(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('limit');
    });
  });

  describe('PATCH /api/patterns/[id]', () => {
    it('should update pattern', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      } as any);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        organizationId: 'org_123',
      } as any);

      vi.mocked(prisma.pattern.update).mockResolvedValue({
        id: 'pattern_1',
        name: 'Updated Name',
        description: 'Updated description',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Updated Name',
          description: 'Updated description',
        }),
      });

      const response = await updatePattern(request, { params: Promise.resolve({ id: 'pattern_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pattern.name).toBe('Updated Name');
    });

    it('should require ANALYST or ADMIN role', async () => {
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'VIEWER',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await updatePattern(request, { params: Promise.resolve({ id: 'pattern_1' }) });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/patterns/[id]', () => {
    it('should delete pattern', async () => {
      const { prisma } = await import('@/lib/db');
      const { getCurrentUser } = await import('@/lib/auth');

      // Set user to ADMIN for delete
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ADMIN',
      } as any);

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        organizationId: 'org_123',
      } as any);

      // Mock no legal hold on the pattern
      vi.mocked(prisma.legalHoldScope.findFirst).mockResolvedValue(null);

      vi.mocked(prisma.pattern.delete).mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1', {
        method: 'DELETE',
      });

      const response = await deletePattern(request, { params: Promise.resolve({ id: 'pattern_1' }) });

      expect(response.status).toBe(204);
    });

    it('should require ADMIN role for deletion', async () => {
      const { getCurrentUser } = await import('@/lib/auth');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1', {
        method: 'DELETE',
      });

      const response = await deletePattern(request, { params: Promise.resolve({ id: 'pattern_1' }) });

      expect(response.status).toBe(403);
    });
  });
});

describe('Patterns API - Trend Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return trend data for pattern', async () => {
    const { getCurrentUser } = await import('@/lib/auth');
    const { prisma } = await import('@/lib/db');

    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user_123',
      organizationId: 'org_123',
      role: 'ADMIN',
    } as any);

    vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
      id: 'pattern_1',
      organizationId: 'org_123',
      trendData: [
        { date: '2024-01', count: 10, severity: 7.5 },
        { date: '2024-02', count: 15, severity: 8.0 },
        { date: '2024-03', count: 25, severity: 8.5 },
      ],
    } as any);

    const request = new NextRequest('http://localhost:3000/api/patterns/pattern_1?include=trend');
    const response = await getPatternById(request, { params: Promise.resolve({ id: 'pattern_1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pattern.trendData).toHaveLength(3);
    expect(data.pattern.trendData[2].count).toBe(25);
  });
});
