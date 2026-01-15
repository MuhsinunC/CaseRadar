/**
 * Pipeline API
 *
 * GET /api/pipeline - Get pipeline status and statistics
 * POST /api/pipeline - Trigger the unified data pipeline
 *
 * The pipeline processes complaints through:
 * 1. Ingest - Fetch new NHTSA records
 * 2. Embed - Generate embeddings
 * 3. Patterns - Detect patterns using ML clustering
 * 4. Leads - Generate leads from high-severity patterns
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  processPipeline,
  getPipelineStats,
  getLastPipelineRun,
  type PipelineOptions,
} from '@/lib/pipeline';

/**
 * GET /api/pipeline
 * Get pipeline status and statistics
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [stats, lastRun] = await Promise.all([
      getPipelineStats(),
      getLastPipelineRun(),
    ]);

    return NextResponse.json({
      success: true,
      stats,
      lastRun: lastRun ? {
        id: lastRun.id,
        mode: lastRun.mode,
        status: lastRun.status,
        triggeredBy: lastRun.triggeredBy,
        startedAt: lastRun.startedAt,
        completedAt: lastRun.completedAt,
        totalRecords: lastRun.totalRecords,
        totalDuration: lastRun.totalDuration,
        errorMessage: lastRun.errorMessage,
      } : null,
    });
  } catch (error) {
    console.error('[Pipeline API] Error getting stats:', error);
    return NextResponse.json(
      { error: 'Failed to get pipeline stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pipeline
 * Trigger the unified data pipeline
 *
 * Body options:
 * - mode: 'full' | 'incremental' (default 'incremental')
 * - stages: { ingest?: boolean, embed?: boolean, patterns?: boolean, leads?: boolean }
 * - filters: { since?: string (ISO date), make?: string, highQualityOnly?: boolean }
 * - dryRun: boolean - Simulate without writing
 * - continueOnError: boolean - Continue pipeline even if a stage fails
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Build pipeline options
    const options: PipelineOptions = {
      mode: body.mode || 'incremental',
      triggeredBy: 'api',
      dryRun: body.dryRun || false,
      continueOnError: body.continueOnError || false,
    };

    // Parse stages if provided
    if (body.stages) {
      options.stages = {
        ingest: body.stages.ingest,
        embed: body.stages.embed,
        patterns: body.stages.patterns,
        leads: body.stages.leads,
      };
    }

    // Parse filters if provided
    if (body.filters) {
      options.filters = {
        since: body.filters.since ? new Date(body.filters.since) : undefined,
        make: body.filters.make,
        highQualityOnly: body.filters.highQualityOnly,
      };
    }

    // Parse execution options
    if (body.batchSize) {
      options.batchSize = body.batchSize;
    }

    console.log('[Pipeline API] Starting pipeline with options:', options);

    // Run pipeline
    const result = await processPipeline(options);

    return NextResponse.json({
      success: result.success,
      runId: result.runId,
      stages: result.stages,
      totalDuration: result.totalDuration,
      recordsProcessed: result.recordsProcessed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Pipeline API] Error running pipeline:', error);
    return NextResponse.json(
      {
        error: 'Pipeline execution failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Allow longer execution time for pipeline
export const maxDuration = 300; // 5 minutes
