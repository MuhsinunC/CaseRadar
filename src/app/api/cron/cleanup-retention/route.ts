/**
 * Data Retention Cleanup Cron Job
 * GET /api/cron/cleanup-retention
 *
 * P1-3 Implementation
 *
 * Handles automated cleanup of:
 * - Soft-deleted records (30 days)
 * - Processed webhooks (90 days)
 * - Respects legal holds
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Retention periods in days
 */
const RETENTION_PERIODS = {
  SOFT_DELETE: 30, // Hard delete after 30 days
  WEBHOOKS: 90, // Delete webhooks after 90 days
};

/**
 * Cleanup statistics
 */
interface CleanupStats {
  complaintsDeleted: number;
  webhooksDeleted: number;
  legalHoldsSkipped: number;
  errors: string[];
}

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
 * Get resource IDs under active legal hold
 */
async function getHeldResourceIds(): Promise<Set<string>> {
  const heldIds = new Set<string>();

  try {
    // Get all active legal holds
    const activeHolds = await prisma.legalHold.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (activeHolds.length === 0) {
      return heldIds;
    }

    // Get all scopes for active holds
    const scopes = await prisma.legalHoldScope.findMany({
      where: {
        legalHoldId: {
          in: activeHolds.map((h) => h.id),
        },
      },
      select: { resourceId: true },
    });

    scopes.forEach((scope) => {
      if (scope.resourceId) {
        heldIds.add(scope.resourceId);
      }
    });
  } catch (error) {
    console.error('Error fetching legal hold scopes:', error);
  }

  return heldIds;
}

/**
 * Cleanup soft-deleted generated complaints
 */
async function cleanupSoftDeletedComplaints(
  heldResourceIds: Set<string>
): Promise<{ deleted: number; skipped: number; error?: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.SOFT_DELETE);

  try {
    // Find soft-deleted complaints older than retention period
    const complaintsToDelete = await prisma.generatedComplaint.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
      select: { id: true },
    });

    // Filter out held resources
    const idsToDelete = complaintsToDelete
      .filter((c) => !heldResourceIds.has(c.id))
      .map((c) => c.id);

    const skippedCount = complaintsToDelete.length - idsToDelete.length;

    if (idsToDelete.length === 0) {
      return { deleted: 0, skipped: skippedCount };
    }

    // Delete the records
    const result = await prisma.generatedComplaint.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    return { deleted: result.count, skipped: skippedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { deleted: 0, skipped: 0, error: message };
  }
}

/**
 * Cleanup old processed webhooks
 */
async function cleanupProcessedWebhooks(): Promise<{
  deleted: number;
  error?: string;
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.WEBHOOKS);

  try {
    // Find old webhooks
    const webhooksToDelete = await prisma.processedWebhook.findMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
      select: { id: true },
    });

    if (webhooksToDelete.length === 0) {
      return { deleted: 0 };
    }

    // Delete the records
    const result = await prisma.processedWebhook.deleteMany({
      where: {
        id: { in: webhooksToDelete.map((w) => w.id) },
      },
    });

    return { deleted: result.count };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { deleted: 0, error: message };
  }
}

/**
 * Create audit log for retention cleanup
 */
async function createAuditLog(stats: CleanupStats): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'RETENTION_CLEANUP',
        resource: 'SYSTEM',
        metadata: {
          stats: {
            complaintsDeleted: stats.complaintsDeleted,
            webhooksDeleted: stats.webhooksDeleted,
            legalHoldsSkipped: stats.legalHoldsSkipped,
          },
          errors: stats.errors,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

/**
 * GET /api/cron/cleanup-retention
 * Run data retention cleanup job
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

  const stats: CleanupStats = {
    complaintsDeleted: 0,
    webhooksDeleted: 0,
    legalHoldsSkipped: 0,
    errors: [],
  };

  try {
    // 2. Get resource IDs under legal hold
    const heldResourceIds = await getHeldResourceIds();

    // 3. Cleanup soft-deleted complaints
    const complaintsResult = await cleanupSoftDeletedComplaints(heldResourceIds);
    stats.complaintsDeleted = complaintsResult.deleted;
    stats.legalHoldsSkipped = complaintsResult.skipped;
    if (complaintsResult.error) {
      stats.errors.push(`Complaints cleanup: ${complaintsResult.error}`);
    }

    // 4. Cleanup processed webhooks
    const webhooksResult = await cleanupProcessedWebhooks();
    stats.webhooksDeleted = webhooksResult.deleted;
    if (webhooksResult.error) {
      stats.errors.push(`Webhooks cleanup: ${webhooksResult.error}`);
    }

    // 5. Create audit log
    await createAuditLog(stats);

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      stats: {
        complaintsDeleted: stats.complaintsDeleted,
        webhooksDeleted: stats.webhooksDeleted,
        legalHoldsSkipped: stats.legalHoldsSkipped,
      },
      errors: stats.errors.length > 0 ? stats.errors : undefined,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Retention cleanup error:', error);

    // Still create audit log for failed job
    stats.errors.push(
      `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    await createAuditLog(stats);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stats: {
          complaintsDeleted: stats.complaintsDeleted,
          webhooksDeleted: stats.webhooksDeleted,
          legalHoldsSkipped: stats.legalHoldsSkipped,
        },
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
