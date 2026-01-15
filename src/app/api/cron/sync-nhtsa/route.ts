/**
 * NHTSA Data Sync Cron Job
 * Runs every 6 hours to fetch new complaints from NHTSA API
 *
 * Auto-triggers bulk import when database has < 100,000 complaints
 */

import { NextResponse } from 'next/server';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const startTime = Date.now();

    // Import services dynamically to avoid loading at build time
    const { nhtsaSyncService } = await import('@/lib/nhtsa');
    const { runBulkImportIfNeeded } = await import('@/lib/nhtsa/bulk-import');

    // First, check if bulk import is needed (database under-populated)
    // This will automatically trigger if complaint count < 100,000
    const bulkImportResult = await runBulkImportIfNeeded();

    if (bulkImportResult) {
      // Bulk import was triggered and completed
      const duration = Date.now() - startTime;

      console.log(`[CRON] Bulk import completed in ${duration}ms`, {
        recordsProcessed: bulkImportResult.recordsProcessed,
        recordsInserted: bulkImportResult.recordsInserted,
        recordsSkipped: bulkImportResult.recordsSkipped,
        recordsErrored: bulkImportResult.recordsErrored,
      });

      return NextResponse.json({
        success: true,
        duration,
        bulkImport: true,
        recordsProcessed: bulkImportResult.recordsProcessed,
        recordsInserted: bulkImportResult.recordsInserted,
        recordsSkipped: bulkImportResult.recordsSkipped,
        recordsErrored: bulkImportResult.recordsErrored,
      });
    }

    // Normal incremental sync (database already has sufficient data)
    const result = await nhtsaSyncService.syncNewComplaints();

    const duration = Date.now() - startTime;

    console.log(`[CRON] NHTSA sync completed in ${duration}ms`, {
      totalComplaints: result.totalComplaints,
      newComplaints: result.newComplaints,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      duration,
      bulkImport: false,
      totalComplaints: result.totalComplaints,
      newComplaints: result.newComplaints,
      errors: result.errors.length,
    });
  } catch (error) {
    console.error('[CRON] NHTSA sync failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cron jobs
