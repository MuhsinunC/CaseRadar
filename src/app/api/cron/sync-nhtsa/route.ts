/**
 * NHTSA Data Sync Cron Job
 * Runs every 6 hours to fetch new complaints from NHTSA API
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

    // Import sync service dynamically to avoid loading at build time
    const { nhtsaSyncService } = await import('@/lib/nhtsa');

    // Sync new complaints
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
