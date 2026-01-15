/**
 * Trends API
 * GET /api/trends - Topic trends over time
 *
 * Wrapper for Python ML service topic over time analysis.
 * Based on architecture document Appendix F.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { mlDetectionClient } from '@/lib/patterns/ml-detection-client';
import { Problems } from '@/lib/api/rfc7807-errors';

interface TrendResponse {
  topicId: number;
  name: string;
  frequency: number;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view trends');
    }

    const searchParams = request.nextUrl.searchParams;

    // Date range filters
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : undefined;
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : undefined;

    // Granularity: daily, weekly, monthly (default)
    const granularity = searchParams.get('granularity') || 'monthly';

    // Optional pattern ID to filter to specific topic
    const patternId = searchParams.get('patternId') || undefined;

    // Calculate nr_bins based on granularity
    let nrBins = 12; // monthly default
    switch (granularity) {
      case 'daily':
        nrBins = 90; // 90 days
        break;
      case 'weekly':
        nrBins = 52; // 52 weeks
        break;
      case 'monthly':
      default:
        nrBins = 12; // 12 months
        break;
    }

    // Note: Pattern filtering by topic ID is not implemented since Pattern model
    // doesn't have a topicId field. The patternId parameter is accepted but ignored.
    // Future enhancement: Map patterns to topics dynamically based on complaint clustering

    // Fetch complaints with embeddings for topic modeling
    // Note: NHTSA complaints are global (organizationId is null), so we don't filter by org
    // Note: embedding field is pgvector Unsupported type, so we use raw SQL
    // Build date filter clause for raw SQL
    let dateClause = '';
    if (startDate && endDate) {
      dateClause = `AND "dateAdded" >= '${startDate.toISOString()}' AND "dateAdded" <= '${endDate.toISOString()}'`;
    } else if (startDate) {
      dateClause = `AND "dateAdded" >= '${startDate.toISOString()}'`;
    } else if (endDate) {
      dateClause = `AND "dateAdded" <= '${endDate.toISOString()}'`;
    }

    const rawComplaints = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        description: string | null;
        dateAdded: Date;
        embedding: string;
      }>
    >(`
      SELECT id, description, "dateAdded", embedding::text as embedding
      FROM "Complaint"
      WHERE embedding IS NOT NULL ${dateClause}
      ORDER BY "dateAdded" ASC
      LIMIT 5000
    `);

    if (rawComplaints.length === 0) {
      return NextResponse.json({
        trends: [],
        meta: {
          total: 0,
          granularity,
          message: 'No complaints with embeddings found',
        },
      });
    }

    // Parse pgvector text format "[0.1,0.2,...]" to number[]
    const parseEmbedding = (text: string): number[] => JSON.parse(text);

    // Prepare data for ML service
    const documents = rawComplaints.map((c) => c.description || '');
    const timestamps = rawComplaints.map((c) =>
      c.dateAdded ? c.dateAdded.toISOString() : new Date().toISOString()
    );
    const embeddings = rawComplaints.map((c) => parseEmbedding(c.embedding));

    let topicTrends;

    try {
      // Call ML service for topics over time
      topicTrends = await mlDetectionClient.topics.topicsOverTime(
        documents,
        timestamps,
        nrBins,
        embeddings.length > 0 ? embeddings : undefined
      );
    } catch (mlError) {
      console.error('ML Service error:', mlError);
      return Problems.serviceUnavailable(
        'Pattern detection service is currently unavailable'
      );
    }

    // Transform to API schema
    const transformedTrends: TrendResponse[] = topicTrends.topics.map((t) => ({
      topicId: t.topic_id,
      name: t.name,
      frequency: t.frequency,
      timestamp: t.timestamp,
    }));

    return NextResponse.json({
      trends: transformedTrends,
      meta: {
        total: transformedTrends.length,
        granularity,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        patternId,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return Problems.internalError('Failed to fetch trends');
  }
}
