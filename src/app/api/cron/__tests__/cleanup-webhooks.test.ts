/**
 * Webhook Cleanup Cron Tests
 * P1-4 Implementation - TDD
 *
 * Tests for automated cleanup of ProcessedWebhook table
 * to prevent unbounded growth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../cleanup-webhooks/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    processedWebhook: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

/**
 * Create authenticated cron request
 */
function authenticatedCronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/cleanup-webhooks', {
    headers: { Authorization: 'Bearer test-cron-secret' },
  });
}

describe('GET /api/cron/cleanup-webhooks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'test-cron-secret',
    };

    // Default mocks - empty results
    vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([]);
    vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.processedWebhook.count).mockResolvedValue(0);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({
      id: 'audit_1',
      action: 'WEBHOOK_CLEANUP',
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
        'http://localhost/api/cron/cleanup-webhooks'
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should reject invalid cron secret', async () => {
      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-webhooks',
        {
          headers: { Authorization: 'Bearer wrong-secret' },
        }
      );
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should accept valid cron secret', async () => {
      const response = await GET(authenticatedCronRequest());

      expect(response.status).not.toBe(401);
    });
  });

  describe('Cleanup Logic', () => {
    it('should query for webhooks processed > 7 days ago', async () => {
      await GET(authenticatedCronRequest());

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

    it('should delete old webhooks', async () => {
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: 'webhook_1', webhookId: 'old-webhook', processedAt: new Date() },
      ] as any);

      await GET(authenticatedCronRequest());

      expect(prisma.processedWebhook.deleteMany).toHaveBeenCalled();
    });

    it('should use batch deletion for performance', async () => {
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: 'webhook_1' },
        { id: 'webhook_2' },
        { id: 'webhook_3' },
      ] as any);

      await GET(authenticatedCronRequest());

      // Should use deleteMany, not individual deletes
      expect(prisma.processedWebhook.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: expect.objectContaining({
              in: expect.arrayContaining(['webhook_1', 'webhook_2', 'webhook_3']),
            }),
          }),
        })
      );
    });

    it('should not delete webhooks processed < 7 days ago', async () => {
      // No old webhooks found
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([]);

      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(data.deletedCount).toBe(0);
    });
  });

  describe('Response', () => {
    it('should return deletion count', async () => {
      vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
        count: 5,
      });
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: '1' },
        { id: '2' },
        { id: '3' },
        { id: '4' },
        { id: '5' },
      ] as any);

      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(data).toMatchObject({
        success: true,
        deletedCount: expect.any(Number),
        durationMs: expect.any(Number),
      });
    });

    it('should include timestamp in response', async () => {
      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
    });

    it('should return success status', async () => {
      const response = await GET(authenticatedCronRequest());

      expect(response.status).toBe(200);
    });
  });

  describe('Audit Logging', () => {
    it('should create audit log for cleanup job', async () => {
      await GET(authenticatedCronRequest());

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'WEBHOOK_CLEANUP',
            resource: 'SYSTEM',
          }),
        })
      );
    });

    it('should include statistics in audit log metadata', async () => {
      vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
        count: 10,
      });
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue(
        Array(10)
          .fill(null)
          .map((_, i) => ({ id: `w_${i}` })) as any
      );

      await GET(authenticatedCronRequest());

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              deletedCount: expect.any(Number),
            }),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.processedWebhook.findMany).mockRejectedValue(
        new Error('Database error')
      );

      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle deleteMany errors', async () => {
      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue([
        { id: 'webhook_1' },
      ] as any);
      vi.mocked(prisma.processedWebhook.deleteMany).mockRejectedValue(
        new Error('Delete error')
      );

      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database gracefully', async () => {
      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.deletedCount).toBe(0);
    });

    it('should handle missing CRON_SECRET env var', async () => {
      delete process.env.CRON_SECRET;

      const request = new NextRequest(
        'http://localhost/api/cron/cleanup-webhooks',
        {
          headers: { Authorization: 'Bearer test-cron-secret' },
        }
      );

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should handle large batch of webhooks', async () => {
      // Simulate 1000 old webhooks
      const manyWebhooks = Array(1000)
        .fill(null)
        .map((_, i) => ({ id: `webhook_${i}` }));

      vi.mocked(prisma.processedWebhook.findMany).mockResolvedValue(
        manyWebhooks as any
      );
      vi.mocked(prisma.processedWebhook.deleteMany).mockResolvedValue({
        count: 1000,
      });

      const response = await GET(authenticatedCronRequest());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deletedCount).toBe(1000);
    });
  });
});
