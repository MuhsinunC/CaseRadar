/**
 * Pattern Analysis Cron Job
 * Runs daily at 2 AM to analyze complaint patterns and detect trends
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

    // Import analysis modules dynamically
    const { calculateTrendDirection } = await import('@/lib/analysis/trend-detection');
    const { detectIQRAnomalies } = await import('@/lib/analysis/anomaly-detection');
    const { prisma } = await import('@/lib/db');

    // Get recent complaints for analysis (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const complaints = await prisma.complaint.findMany({
      where: {
        dateAdded: {
          gte: ninetyDaysAgo,
        },
      },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        component: true,
        description: true,
        dateAdded: true,
        crash: true,
        fire: true,
        injuries: true,
        deaths: true,
      },
    });

    // Prepare data for analysis
    const dataPoints = complaints.map((c) => ({
      id: c.id,
      timestamp: c.dateAdded,
      value: c.injuries + c.deaths * 10 + (c.crash ? 5 : 0) + (c.fire ? 5 : 0),
      metadata: {
        make: c.make,
        model: c.model,
        year: c.year,
        component: c.component,
      },
    }));

    // Note: Clustering requires embeddings which need a raw SQL query
    // For now, we'll skip clustering in the cron job
    // A production implementation would fetch embeddings via raw SQL:
    // SELECT id, embedding::float[] FROM complaints WHERE date_added > $1
    const clusterResults: { clusters: string[][]; noise: string[] } = { clusters: [], noise: [] };

    // Run trend detection and anomaly detection
    const timeSeriesData = dataPoints
      .filter((p) => p.timestamp)
      .map((p) => ({
        timestamp: p.timestamp,
        value: p.value,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const values = timeSeriesData.map((p) => p.value);

    let trendDirection = 'STABLE';
    let trendSlope = 0;
    let anomalyCount = 0;

    if (values.length > 10) {
      const trendResults = calculateTrendDirection(values);
      trendDirection = trendResults.direction;
      trendSlope = trendResults.slope;

      const anomalyResults = detectIQRAnomalies(values, { multiplier: 1.5 });
      anomalyCount = anomalyResults.length;
    }

    const duration = Date.now() - startTime;

    console.log(`[CRON] Pattern analysis completed in ${duration}ms`, {
      complaintsAnalyzed: complaints.length,
      clustersFound: clusterResults.clusters.length,
      trendDirection,
      anomaliesFound: anomalyCount,
    });

    return NextResponse.json({
      success: true,
      duration,
      complaintsAnalyzed: complaints.length,
      clustersFound: clusterResults.clusters.length,
      noisePoints: clusterResults.noise.length,
      trendDirection,
      trendSlope,
      anomaliesFound: anomalyCount,
    });
  } catch (error) {
    console.error('[CRON] Pattern analysis failed:', error);

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
