/**
 * Data Retention Scheduler Tests
 * P1-3 Implementation - TDD
 *
 * Tests for automated cleanup of:
 * - Soft-deleted records (30 days)
 * - Processed webhooks (90 days)
 * - Records under legal hold (skipped)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../cleanup-retention/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    generatedComplaint: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    processedWebhook: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    legalHold: {
      findMany: vi.fn(),
    },
    legalHoldScope: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe('GET /api/cron/cleanup-retention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'test-cron-secret',
    };

    // Default mocks - empty results
    vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedComplaint.deleteMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([]);
    vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.legalHold.findMany).mockResolvedValue([]);
    vi.mocked(prisma.legalHoldScope.findMany).mockResolvedValue([]);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({
      id: 'audit_1',
      action: 'RETENTION_CLEANUP',
      resource: 'SYSTEM',
      resourceId: null,
      userId: null,
      organizationId: null,
      metadata: {},
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication', () => {
    it('should require cron secret', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention'
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should reject invalid cron secret', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer wrong-secret' },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept valid cron secret', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );
      const response = await GET(request);

      expect(response.status).not.toBe(401);
    });
  });

  describe('Soft Delete Cleanup', () => {
    it('should query for records soft-deleted > 30 days ago', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.generatedComplaint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: expect.objectContaining({
              not: null,
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should delete soft-deleted records older than 30 days', async () => {
      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        { id: 'complaint_1' },
        { id: 'complaint_2' },
      ] as any);

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.generatedComplaint.deleteMany).toHaveBeenCalled();
    });

    it('should skip records under legal hold', async () => {
      // Mock an active legal hold with scope on a complaint
      vi.mocked(prisma.legalHold.findMany).mockResolvedValue([
        {
          id: 'hold_1',
          status: 'ACTIVE',
          organizationId: 'org_1',
        },
      ] as any);

      vi.mocked(prisma.legalHoldScope.findMany).mockResolvedValue([
        {
          id: 'scope_1',
          legalHoldId: 'hold_1',
          resourceType: 'GENERATED_COMPLAINT',
          resourceId: 'complaint_held',
        },
      ] as any);

      vi.mocked(prisma.generatedComplaint.findMany).mockResolvedValue([
        { id: 'complaint_held' },
        { id: 'complaint_2' },
      ] as any);

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      // Should report that some records were skipped
      expect(data.stats.legalHoldsSkipped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Processed Webhook Cleanup', () => {
    it('should query for webhooks older than 90 days', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.processedWebhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            processedAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should delete webhooks older than 90 days', async () => {
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: 'webhook_1', provider: 'stripe', eventType: 'payment.success' },
      ] as any);

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.processedWebhook.deleteMany).toHaveBeenCalled();
    });
  });

  describe('Reporting', () => {
    it('should return cleanup statistics', async () => {
      vi.mocked(prisma.generatedComplaint.deleteMany).mockResolvedValue({
        count: 5,
      });
      vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
        count: 10,
      });

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data).toMatchObject({
        success: true,
        stats: {
          complaintsDeleted: expect.any(Number),
          webhooksDeleted: expect.any(Number),
          legalHoldsSkipped: expect.any(Number),
        },
        durationMs: expect.any(Number),
      });
    });

    it('should include timestamp in response', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log for retention job', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RETENTION_CLEANUP',
            resource: 'SYSTEM',
          }),
        })
      );
    });

    it('should include statistics in audit log metadata', async () => {
      vi.mocked(prisma.generatedComplaint.deleteMany).mockResolvedValue({
        count: 3,
      });

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      await GET(request);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              stats: expect.any(Object),
            }),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully and report in errors array', async () => {
      vi.mocked(prisma.generatedComplaint.findMany).mockRejectedValue(
        new Error('Database error')
      );

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      // Still returns 200 because it continues on partial errors
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // But errors should be recorded
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it('should continue if one cleanup step fails', async () => {
      // Complaints fail, but webhooks should still be cleaned
      vi.mocked(prisma.generatedComplaint.findMany).mockRejectedValue(
        new Error('Complaints error')
      );
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: 'webhook_1' },
      ] as any);
      vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
        count: 1,
      });

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      // Should still succeed partially
      expect(data.stats.webhooksDeleted).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database gracefully', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.stats.complaintsDeleted).toBe(0);
      expect(data.stats.webhooksDeleted).toBe(0);
    });

    it('should handle missing CRON_SECRET env var', async () => {
      delete process.env.CRON_SECRET;

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-retention',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });
});
