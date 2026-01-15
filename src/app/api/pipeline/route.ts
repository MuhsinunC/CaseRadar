/**
 * Pipeline API
 *
 * GET /api/pipeline - Get pipeline status and statistics
 * POST /api/pipeline - Trigger the full complaint processing pipeline
 *
 * The pipeline processes complaints through:
 * 1. Embedding generation
 * 2. Pattern detection
 * 3. Lead scoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { complaintPipeline, getPipelineProgress } from '@/lib/pipeline/complaint-pipeline';

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

    const stats = await complaintPipeline.getStats();

    return NextResponse.json({
      success: true,
      ...stats,
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
 * Trigger the full complaint processing pipeline
 *
 * Body options:
 * - maxEmbeddings: number (default 10000) - Max embeddings to generate per run
 * - skipEmbeddings: boolean - Skip embedding generation
 * - skipPatterns: boolean - Skip pattern generation
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if pipeline is already running
    const currentProgress = getPipelineProgress();
    if (currentProgress.stage !== 'idle' && currentProgress.stage !== 'complete' && currentProgress.stage !== 'error') {
      return NextResponse.json({
        success: false,
        error: 'Pipeline is already running',
        currentProgress,
      }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));

    console.log('[Pipeline API] Starting pipeline with options:', body);

    // Run pipeline (this can take a while)
    const result = await complaintPipeline.runFullPipeline({
      maxEmbeddings: body.maxEmbeddings,
      skipEmbeddings: body.skipEmbeddings,
      skipPatterns: body.skipPatterns,
    });

    return NextResponse.json({
      success: result.success,
      result,
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
