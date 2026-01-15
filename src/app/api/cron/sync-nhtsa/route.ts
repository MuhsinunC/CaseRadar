/**
 * NHTSA Data Sync Cron Job
 *
 * Runs the unified data pipeline:
 * 1. Ingest - Fetch new complaints from NHTSA API
 * 2. Embed - Generate embeddings for new complaints
 * 3. Patterns - Detect patterns using ML clustering
 * 4. Leads - Generate leads from high-severity patterns
 *
 * Auto-triggers bulk import when database has < 100,000 complaints
 */

import { NextResponse } from 'next/server';
import { processPipeline } from '@/lib/pipeline';

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

    // Import bulk import dynamically to check if needed
    const { runBulkImportIfNeeded } = await import('@/lib/nhtsa/bulk-import');

    // First, check if bulk import is needed (database under-populated)
    // This will automatically trigger if complaint count < 100,000
    const bulkImportResult = await runBulkImportIfNeeded();

    if (bulkImportResult) {
      // Bulk import was triggered and completed
      // Now run the full pipeline to process the imported data
      console.log(`[CRON] Bulk import completed, running pipeline...`);

      const pipelineResult = await processPipeline({
        mode: 'full',
        triggeredBy: 'cron',
        stages: {
          ingest: false, // Already imported via bulk
          embed: true,
          patterns: true,
          leads: true,
        },
      });

      const duration = Date.now() - startTime;

      console.log(`[CRON] Bulk import + pipeline completed in ${duration}ms`, {
        bulkRecordsProcessed: bulkImportResult.recordsProcessed,
        bulkRecordsInserted: bulkImportResult.recordsInserted,
        pipelineSuccess: pipelineResult.success,
        pipelineRecordsProcessed: pipelineResult.recordsProcessed,
      });

      return NextResponse.json({
        success: pipelineResult.success,
        duration,
        bulkImport: true,
        bulk: {
          recordsProcessed: bulkImportResult.recordsProcessed,
          recordsInserted: bulkImportResult.recordsInserted,
          recordsSkipped: bulkImportResult.recordsSkipped,
          recordsErrored: bulkImportResult.recordsErrored,
        },
        pipeline: {
          runId: pipelineResult.runId,
          stages: pipelineResult.stages,
          totalDuration: pipelineResult.totalDuration,
          recordsProcessed: pipelineResult.recordsProcessed,
          errors: pipelineResult.errors,
        },
      });
    }

    // Normal incremental pipeline (database already has sufficient data)
    const result = await processPipeline({
      mode: 'incremental',
      triggeredBy: 'cron',
      stages: {
        ingest: true,
        embed: true,
        patterns: true,
        leads: true,
      },
    });

    const duration = Date.now() - startTime;

    console.log(`[CRON] Pipeline completed in ${duration}ms`, {
      success: result.success,
      recordsProcessed: result.recordsProcessed,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: result.success,
      duration,
      bulkImport: false,
      pipeline: {
        runId: result.runId,
        stages: result.stages,
        totalDuration: result.totalDuration,
        recordsProcessed: result.recordsProcessed,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[CRON] Pipeline failed:', error);

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
