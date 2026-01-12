/**
 * Dashboard API Tests
 * Tests for dashboard statistics and analytics endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Stripe before importing billing
vi.mock('stripe', () => ({
  default: class MockStripe {
    customers = { create: vi.fn(), retrieve: vi.fn() };
    subscriptions = { create: vi.fn(), retrieve: vi.fn() };
  },
}));

// Mock billing service
vi.mock('@/lib/billing', () => ({
  checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true, current: 5, limit: 100 }),
}));

import { GET as getStats } from '../dashboard/stats/route';
import { GET as getActivity } from '../dashboard/activity/route';
import { GET as getAlerts } from '../dashboard/alerts/route';

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
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    pattern: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    generatedComplaint: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('Dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return dashboard statistics', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.complaint.count).mockResolvedValue(15000);
      vi.mocked(prisma.pattern.count).mockResolvedValue(45);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(12);
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { make: 'Toyota', _count: { make: 2500 } },
        { make: 'Honda', _count: { make: 2000 } },
      ] as any);

      const request = new NextRequest('http://localhost:3000/api/dashboard/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats).toBeDefined();
      expect(data.stats.patterns).toBeDefined();
      expect(data.stats.complaints).toBeDefined();
      expect(data.stats.topManufacturers).toBeDefined();
    });

    it('should return top manufacturers by complaint count', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.count).mockResolvedValue(10);
      vi.mocked(prisma.complaint.count).mockResolvedValue(1000);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(5);
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([
        { make: 'Toyota', _count: { make: 2500 } },
        { make: 'Honda', _count: { make: 2000 } },
        { make: 'Ford', _count: { make: 1500 } },
      ] as any);

      const request = new NextRequest('http://localhost:3000/api/dashboard/stats');
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.topManufacturers).toHaveLength(3);
      expect(data.stats.topManufacturers[0].make).toBe('Toyota');
    });

    it('should support different time periods', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.count).mockResolvedValue(10);
      vi.mocked(prisma.complaint.count).mockResolvedValue(1000);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(5);
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/dashboard/stats?period=7d');
      const response = await getStats(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.period).toBe('7d');
    });

    it('should scope stats to organization', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.count).mockResolvedValue(10);
      vi.mocked(prisma.complaint.count).mockResolvedValue(1000);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(5);
      vi.mocked(prisma.complaint.groupBy).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/dashboard/stats');
      await getStats(request);

      // Check that pattern count is called with org filter
      expect(prisma.pattern.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org_123',
          }),
        })
      );
    });
  });

  describe('GET /api/dashboard/activity', () => {
    it('should return recent activity feed', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'Airbag Failures',
          make: 'Toyota',
          model: 'RAV4',
          createdAt: new Date('2024-01-15T10:00:00Z'),
          updatedAt: new Date('2024-01-15T10:00:00Z'),
        },
      ] as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        {
          id: 'gen_1',
          title: 'Toyota Class Action',
          status: 'DRAFT',
          createdAt: new Date('2024-01-14T15:30:00Z'),
          pattern: { name: 'Airbag Failures' },
        },
      ] as any);

      const request = new NextRequest('http://localhost:3000/api/dashboard/activity');
      const response = await getActivity(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.activities).toBeDefined();
      expect(data.activities.length).toBeGreaterThan(0);
    });

    it('should limit activity to specified count', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/dashboard/activity?limit=5');
      await getActivity(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });

  describe('GET /api/dashboard/alerts', () => {
    it('should return pattern alerts (high severity, upward trends)', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([
        {
          id: 'pattern_1',
          name: 'Critical Airbag Issue',
          severity: 9.5,
        },
        {
          id: 'pattern_2',
          name: 'Brake System Failures',
          severity: 8.8,
        },
      ] as any);

      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(3);

      const request = new NextRequest('http://localhost:3000/api/dashboard/alerts');
      const response = await getAlerts(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.alerts).toBeDefined();
    });

    it('should check for high-severity patterns with INCREASING trend', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/dashboard/alerts');
      await getAlerts(request);

      expect(prisma.pattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trendDirection: 'INCREASING',
          }),
        })
      );
    });

    it('should generate alert for draft complaints', async () => {
      const { prisma } = await import('@/lib/db');

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(10); // More than 5 drafts

      const request = new NextRequest('http://localhost:3000/api/dashboard/alerts');
      const response = await getAlerts(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const draftAlert = data.alerts.find((a: any) => a.id === 'draft-complaints');
      expect(draftAlert).toBeDefined();
      expect(draftAlert.type).toBe('info');
    });

    it('should generate usage alerts when approaching limits', async () => {
      const { prisma } = await import('@/lib/db');
      const { checkPlanLimit } = await import('@/lib/billing');

      // Mock approaching limit (90%+)
      vi.mocked(checkPlanLimit).mockResolvedValue({
        allowed: true,
        current: 95,
        limit: 100,
      });

      vi.mocked(prisma.pattern.findMany).mockResolvedValue([]);
      vi.mocked(prisma.generatedComplaint.count).mockResolvedValue(0);

      const request = new NextRequest('http://localhost:3000/api/dashboard/alerts');
      const response = await getAlerts(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      const limitAlert = data.alerts.find((a: any) => a.id.includes('limit'));
      expect(limitAlert).toBeDefined();
      expect(limitAlert.type).toBe('critical');
    });
  });
});
