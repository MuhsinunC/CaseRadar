/**
 * Complaints API Tests
 * Tests for NHTSA complaint search and retrieval endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getComplaints } from '../complaints/route';
import { GET as getComplaintById } from '../complaints/[id]/route';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn((handler) => handler),
  withOrganization: vi.fn((handler) => handler),
  getCurrentUser: vi.fn().mockResolvedValue({
    id: 'user_123',
    organizationId: 'org_123',
    role: 'ANALYST',
  }),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    complaint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

describe('Complaints API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/complaints', () => {
    it('should return paginated list of complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([
        {
          id: 'complaint_1',
          nhtsaId: 'NHTSA_123',
          make: 'Toyota',
          model: 'Camry',
          year: 2021,
          summary: 'Airbag deployment issue',
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'complaint_2',
          nhtsaId: 'NHTSA_456',
          make: 'Honda',
          model: 'Accord',
          year: 2020,
          summary: 'Brake failure',
          createdAt: new Date('2024-01-14'),
        },
      ] as any);

      vi.mocked(prisma.complaint.count).mockResolvedValue(100);

      const request = new NextRequest('http://localhost:3000/api/complaints?page=1&limit=10');
      const response = await getComplaints(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.complaints).toHaveLength(2);
      // Hybrid pagination includes both offset and cursor fields
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.total).toBe(100);
      expect(data.pagination.totalPages).toBe(10);
      // Cursor-based fields
      expect(data.pagination).toHaveProperty('hasMore');
      expect(data.pagination).toHaveProperty('nextCursor');
      expect(data.pagination).toHaveProperty('prevCursor');
    });

    it('should filter complaints by make', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([
        {
          id: 'complaint_1',
          make: 'Toyota',
          model: 'Camry',
          year: 2021,
        },
      ] as any);
      vi.mocked(prisma.complaint.count).mockResolvedValue(1);

      const request = new NextRequest('http://localhost:3000/api/complaints?make=Toyota');
      const response = await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            make: { contains: 'Toyota', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should filter complaints by model', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?model=Camry');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model: { contains: 'Camry', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should filter complaints by year range', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?yearFrom=2020&yearTo=2022');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year: { gte: 2020, lte: 2022 },
          }),
        })
      );
    });

    it('should filter complaints by component', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?component=AIRBAG');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            component: { contains: 'AIRBAG', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should search complaints by keyword', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?search=airbag deployment');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { description: { contains: 'airbag deployment', mode: 'insensitive' } },
              { component: { contains: 'airbag deployment', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should sort complaints by date descending by default', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should support custom sort order', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?sortBy=year&sortOrder=asc');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { year: 'asc' },
        })
      );
    });

    it('should filter by severity (crash, fire, injury, death)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.complaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/complaints?hasCrash=true&hasDeath=true');
      await getComplaints(request);

      expect(prisma.complaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            crash: true,
            deaths: { gt: 0 },
          }),
        })
      );
    });

    it('should return 400 for invalid pagination parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/complaints?page=-1');
      const response = await getComplaints(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      // RFC 7807 format: validation errors in 'errors' object or detail
      expect(data.errors || data.detail).toBeTruthy();
    });
  });

  describe('GET /api/complaints/[id]', () => {
    it('should return complaint by ID', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findUnique).mockResolvedValue({
        id: 'complaint_1',
        nhtsaId: 'NHTSA_123',
        make: 'Toyota',
        model: 'Camry',
        year: 2021,
        summary: 'Airbag deployment issue',
        description: 'Full description of the complaint...',
        component: 'AIRBAG',
        crash: true,
        fire: false,
        injuries: 2,
        deaths: 0,
        createdAt: new Date('2024-01-15'),
      } as any);

      const request = new NextRequest('http://localhost:3000/api/complaints/complaint_1');
      const response = await getComplaintById(request, { params: Promise.resolve({ id: 'complaint_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.complaint.id).toBe('complaint_1');
      expect(data.complaint.make).toBe('Toyota');
    });

    it('should return 404 for non-existent complaint', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/complaints/nonexistent');
      const response = await getComplaintById(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      // RFC 7807 format: error details in 'detail' field
      expect(data.detail).toContain('not found');
    });

    it('should include related patterns if requested', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.findUnique).mockResolvedValue({
        id: 'complaint_1',
        make: 'Toyota',
        model: 'Camry',
        patterns: [
          { id: 'pattern_1', name: 'Airbag Failures' },
        ],
      } as any);

      const request = new NextRequest('http://localhost:3000/api/complaints/complaint_1?include=patterns');
      const response = await getComplaintById(request, { params: Promise.resolve({ id: 'complaint_1' }) });
      const data = await response.json();

      expect(data.complaint.patterns).toHaveLength(1);
      expect(data.complaint.patterns[0].name).toBe('Airbag Failures');
    });
  });
});

describe('Complaints API - Semantic Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should perform semantic search when embeddings available', async () => {
    const { prisma } = await import('@/lib/db');

    // Mock semantic search results
    vi.mocked(prisma.complaint.findMany).mockResolvedValue([
      {
        id: 'complaint_1',
        similarity: 0.95,
        make: 'Toyota',
        model: 'RAV4',
        summary: 'Sudden acceleration issue',
      },
    ] as any);
    vi.mocked(prisma.complaint.count).mockResolvedValue(1);

    const request = new NextRequest('http://localhost:3000/api/complaints?semanticSearch=unintended acceleration');
    const response = await getComplaints(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Semantic search should be attempted
    expect(data.searchType).toBe('semantic');
  });

  it('should fallback to keyword search if semantic search unavailable', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(0);

    const request = new NextRequest('http://localhost:3000/api/complaints?search=brake failure');
    const response = await getComplaints(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.searchType).toBe('keyword');
  });
});

describe('Complaints API - Aggregations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return complaint statistics with aggregations', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
    vi.mocked(prisma.complaint.count).mockResolvedValue(1000);
    vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
      { make: 'Toyota', _count: 500 },
      { make: 'Honda', _count: 300 },
    ] as any);

    const request = new NextRequest('http://localhost:3000/api/complaints?includeStats=true');
    const response = await getComplaints(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stats).toBeDefined();
    expect(data.stats).toHaveProperty('totalComplaints');
    expect(data.stats).toHaveProperty('topMakes');
    expect(data.stats).toHaveProperty('severityBreakdown');
  });
});
