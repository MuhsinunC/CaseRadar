/**
 * Pattern Analysis Cron Job
 * Runs daily at 2 AM to analyze complaint patterns using ML clustering
 *
 * This is the main entry point for the pattern generation pipeline:
 * 1. Fetches complaints with embeddings
 * 2. Calls Python ML service for BERTopic topic clustering
 * 3. Creates/updates Pattern records from identified clusters
 * 4. Links complaints to their patterns
 */

import { NextResponse } from 'next/server';
import { patternGenerationService } from '@/lib/patterns/pattern-generation-service';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const startTime = Date.now();

    // Run the ML-powered pattern generation
    const result = await patternGenerationService.generatePatterns();

    const duration = Date.now() - startTime;

    console.log(`[CRON] Pattern analysis completed in ${duration}ms`, {
      success: result.success,
      patternsCreated: result.patternsCreated,
      patternsUpdated: result.patternsUpdated,
      complaintsProcessed: result.complaintsProcessed,
      noiseCount: result.noiseCount,
    });

    return NextResponse.json({
      success: result.success,
      duration,
      patternsCreated: result.patternsCreated,
      patternsUpdated: result.patternsUpdated,
      complaintsProcessed: result.complaintsProcessed,
      noiseCount: result.noiseCount,
      error: result.error,
    });
  } catch (error) {
    console.error('[CRON] Pattern analysis failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cron jobs
