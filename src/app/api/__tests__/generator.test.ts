/**
 * Generator API Tests
 * Tests for legal complaint generation endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as generateComplaint, GET as getGeneratedComplaints } from '../generator/route';
import { GET as getGeneratedById, DELETE as deleteGenerated } from '../generator/[id]/route';
import { GET as downloadPdf } from '../generator/[id]/pdf/route';

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
    generatedComplaint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    pattern: {
      findUnique: vi.fn(),
    },
    complaint: {
      findMany: vi.fn(),
    },
  },
}));

// Mock billing service - use vi.hoisted to avoid hoisting issues
const { mockCheckPlanLimit } = vi.hoisted(() => ({
  mockCheckPlanLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 10 }),
}));
vi.mock('@/lib/billing', () => ({
  checkPlanLimit: mockCheckPlanLimit,
}));

// Mock complaint generator
vi.mock('@/lib/complaint', () => ({
  generateComplaintDocument: vi.fn().mockResolvedValue({
    title: 'Class Action Complaint',
    content: 'Full complaint text...',
    sections: [],
  }),
  exportToPdf: vi.fn().mockResolvedValue(Buffer.from('PDF content')),
}));

describe('Generator API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/generator', () => {
    it('should generate complaint from pattern', async () => {
      const { prisma } = await import('@/lib/db');
      const { generateComplaintDocument } = await import('@/lib/complaint');

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        name: 'Airbag Failures',
        make: 'Toyota',
        model: 'RAV4',
        organizationId: 'org_123',
        complaints: [
          { id: 'c1', summary: 'Airbag failed' },
          { id: 'c2', summary: 'Airbag deployed randomly' },
        ],
      } as any);

      vi.mocked(prisma.generatedComplaint.create).mockResolvedValue({
        id: 'gen_1',
        title: 'Class Action Complaint - Toyota RAV4 Airbag Defect',
        status: 'DRAFT',
        patternId: 'pattern_1',
        organizationId: 'org_123',
        createdBy: 'user_123',
        createdAt: new Date(),
      } as any);

      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          patternId: 'pattern_1',
          plaintiffInfo: {
            name: 'John Doe',
            state: 'California',
          },
          court: 'US District Court, Northern District of California',
        }),
      });

      const response = await generateComplaint(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.complaint.title).toContain('Class Action');
      expect(generateComplaintDocument).toHaveBeenCalled();
    });

    it('should validate required inputs', async () => {
      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          // Missing patternId
          plaintiffInfo: { name: 'John Doe' },
        }),
      });

      const response = await generateComplaint(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('patternId');
    });

    it('should enforce plan limits on complaint generation', async () => {
      const { checkPlanLimit } = await import('@/lib/billing');

      // First call for feature check returns allowed, second call for limit returns denied
      vi.mocked(checkPlanLimit)
        .mockResolvedValueOnce({ allowed: true }) // Feature check passes
        .mockResolvedValueOnce({ allowed: false, current: 5, limit: 5 }); // Monthly limit fails

      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          patternId: 'pattern_1',
          plaintiffInfo: { name: 'John Doe', state: 'CA' },
        }),
      });

      const response = await generateComplaint(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('limit');
    });

    it('should require complaintGeneration feature', async () => {
      const { checkPlanLimit } = await import('@/lib/billing');

      vi.mocked(checkPlanLimit).mockResolvedValue({
        allowed: false, // Feature not available on FREE plan
        limit: 0,
      });

      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          patternId: 'pattern_1',
          plaintiffInfo: { name: 'John Doe' },
        }),
      });

      const response = await generateComplaint(request);

      expect(response.status).toBe(403);
    });

    it('should return 404 if pattern not found', async () => {
      const { prisma } = await import('@/lib/db');
      const { checkPlanLimit } = await import('@/lib/billing');

      // Reset and allow plan limits
      vi.mocked(checkPlanLimit).mockResolvedValue({ allowed: true, current: 0, limit: 10 });
      vi.mocked(prisma.pattern.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          patternId: 'nonexistent',
          plaintiffInfo: { name: 'John Doe' },
        }),
      });

      const response = await generateComplaint(request);

      expect(response.status).toBe(404);
    });

    it('should return 403 if pattern belongs to different org', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findUnique).mockResolvedValue({
        id: 'pattern_1',
        organizationId: 'other_org',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/generator', {
        method: 'POST',
        body: JSON.stringify({
          patternId: 'pattern_1',
          plaintiffInfo: { name: 'John Doe' },
        }),
      });

      const response = await generateComplaint(request);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/generator', () => {
    it('should return list of generated complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        {
          id: 'gen_1',
          title: 'Toyota Airbag Class Action',
          status: 'DRAFT',
          createdAt: new Date('2024-01-15'),
          pattern: { name: 'Airbag Failures' },
        },
        {
          id: 'gen_2',
          title: 'Honda Brake Class Action',
          status: 'FINALIZED',
          createdAt: new Date('2024-01-10'),
          pattern: { name: 'Brake Defects' },
        },
      ] as any);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/generator');
      const response = await getGeneratedComplaints(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.complaints).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/generator?status=DRAFT');
      await getGeneratedComplaints(request);

      expect(prisma.generatedComplaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'DRAFT',
          }),
        })
      );
    });
  });

  describe('GET /api/generator/[id]', () => {
    it('should return generated complaint by ID', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue({
        id: 'gen_1',
        title: 'Class Action Complaint',
        content: 'Full complaint text...',
        status: 'DRAFT',
        organizationId: 'org_123',
        pattern: { name: 'Airbag Failures' },
        plaintiffInfo: { name: 'John Doe' },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/generator/gen_1');
      const response = await getGeneratedById(request, { params: Promise.resolve({ id: 'gen_1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.complaint.title).toBe('Class Action Complaint');
    });

    it('should return 404 for non-existent complaint', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/generator/nonexistent');
      const response = await getGeneratedById(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/generator/[id]/pdf', () => {
    it('should return PDF download', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue({
        id: 'gen_1',
        title: 'Class Action Complaint',
        content: JSON.stringify({
          sections: [{ heading: 'Introduction', content: 'Complaint text...' }],
          allegations: ['Allegation 1'],
          prayerForRelief: ['Relief 1'],
        }),
        court: 'US District Court',
        plaintiffInfo: { name: 'John Doe' },
        organizationId: 'org_123',
        pattern: { id: 'p1', name: 'Airbag Failures', make: 'Toyota', model: 'RAV4' },
      } as any);

      const request = new NextRequest('http://localhost:3000/api/generator/gen_1/pdf');
      const response = await downloadPdf(request, { params: Promise.resolve({ id: 'gen_1' }) });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
    });

    it('should return 404 if complaint not found', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/generator/nonexistent/pdf');
      const response = await downloadPdf(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/generator/[id]', () => {
    it('should delete generated complaint', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue({
        id: 'gen_1',
        organizationId: 'org_123',
        status: 'DRAFT',
      } as any);

      vi.mocked(prisma.generatedComplaint.delete).mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost:3000/api/generator/gen_1', {
        method: 'DELETE',
      });

      const response = await deleteGenerated(request, { params: Promise.resolve({ id: 'gen_1' }) });

      expect(response.status).toBe(204);
    });

    it('should prevent deleting finalized complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.generatedComplaint.findUnique).mockResolvedValue({
        id: 'gen_1',
        organizationId: 'org_123',
        status: 'FINALIZED',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/generator/gen_1', {
        method: 'DELETE',
      });

      const response = await deleteGenerated(request, { params: Promise.resolve({ id: 'gen_1' }) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('finalized');
    });
  });
});
