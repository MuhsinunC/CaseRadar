/**
 * Webhook Cleanup Cron Job
 * GET /api/cron/cleanup-webhooks
 *
 * P1-4 Implementation
 *
 * Handles automated cleanup of ProcessedWebhook table
 * to prevent unbounded growth. Deletes webhooks older than 7 days.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Retention period in days for processed webhooks
 */
const WEBHOOK_RETENTION_DAYS = 7;

/**
 * Validate cron authentication
 */
function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return false;
  }

  const [type, token] = authHeader.split(' ');

  return type === 'Bearer' && token === cronSecret;
}

/**
 * Create audit log for webhook cleanup
 */
async function createAuditLog(
  deletedCount: number,
  durationMs: number
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'WEBHOOK_CLEANUP',
        resource: 'SYSTEM',
        metadata: {
          deletedCount,
          durationMs,
          retentionDays: WEBHOOK_RETENTION_DAYS,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * GET /api/cron/cleanup-webhooks
 * Run webhook cleanup job
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // 1. Validate cron authentication
  if (!validateCronAuth(request)) {
    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or missing cron secret',
      },
      { status: 401 }
    );
  }

  try {
    // 2. Calculate cutoff date (7 days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - WEBHOOK_RETENTION_DAYS);

    // 3. Find old webhooks
    const webhooksToDelete = await prisma.processedWebhook.findMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
      select: { id: true },
    });

    let deletedCount = 0;

    // 4. Batch delete if there are webhooks to clean up
    if (webhooksToDelete.length > 0) {
      const result = await prisma.processedWebhook.deleteMany({
        where: {
          id: {
            in: webhooksToDelete.map((w) => w.id),
          },
        },
      });

      deletedCount = result.count;
    }

    const durationMs = Date.now() - startTime;

    // 5. Create audit log
    await createAuditLog(deletedCount, durationMs);

    return NextResponse.json({
      success: true,
      deletedCount,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('Webhook cleanup error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        deletedCount: 0,
        durationMs,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
