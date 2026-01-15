/**
 * Anomalies API
 * GET /api/anomalies - List anomalous complaints
 *
 * Wrapper for Python ML service anomaly detection.
 * Based on architecture document Appendix F.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { mlDetectionClient } from '@/lib/patterns/ml-detection-client';
import { Problems } from '@/lib/api/rfc7807-errors';

interface AnomalyResponse {
  complaintId: string;
  anomalyScore: number;
  isAnomaly: boolean;
  anomalyType: 'point' | 'contextual' | 'collective' | 'normal';
  detectorScores: {
    isolationForest?: number;
    localOutlierFactor?: number;
    histogramBased?: number;
  };
  complaint?: {
    description: string;
    make: string;
    model: string;
    year: number;
    component: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view anomalies');
    }

    const searchParams = request.nextUrl.searchParams;

    // Filter by minimum anomaly score (default: 0.8)
    const minScore = parseFloat(searchParams.get('minScore') || '0.8');

    // Optional limit
    const limit = parseInt(searchParams.get('limit') || '100');

    // Fetch complaints with embeddings for anomaly detection
    // Note: NHTSA complaints are global (organizationId is null), so we don't filter by org
    // Note: embedding field is pgvector Unsupported type, so we use raw SQL
    const fetchLimit = Math.min(limit * 10, 5000);
    const rawComplaints = await prisma.$queryRaw<
      Array<{
        id: string;
        description: string | null;
        make: string | null;
        model: string | null;
        year: number | null;
        component: string | null;
        embedding: string;
      }>
    >`
      SELECT id, description, make, model, year, component, embedding::text as embedding
      FROM "Complaint"
      WHERE embedding IS NOT NULL
      ORDER BY "dateAdded" DESC
      LIMIT ${fetchLimit}
    `;

    if (rawComplaints.length === 0) {
      return NextResponse.json({
        anomalies: [],
        meta: {
          total: 0,
          minScore,
          message: 'No complaints with embeddings found',
        },
      });
    }

    // Parse pgvector text format "[0.1,0.2,...]" to number[]
    const parseEmbedding = (text: string): number[] => JSON.parse(text);

    // Transform raw complaints to typed format
    const complaints = rawComplaints.map((c) => ({
      id: c.id,
      description: c.description,
      make: c.make,
      model: c.model,
      year: c.year,
      component: c.component,
      embedding: parseEmbedding(c.embedding),
    }));

    // Extract embeddings and IDs
    const embeddings = complaints.map((c) => c.embedding);
    const documentIds = complaints.map((c) => c.id);

    let anomalyResults;

    try {
      // Call ML service for anomaly detection
      anomalyResults = await mlDetectionClient.anomalies.detect(
        embeddings,
        documentIds
      );
    } catch (mlError) {
      console.error('ML Service error:', mlError);
      return Problems.serviceUnavailable(
        'Pattern detection service is currently unavailable'
      );
    }

    // Create a map of complaint data for enrichment
    const complaintMap = new Map(complaints.map((c) => [c.id, c]));

    // Transform and filter by minScore
    const transformedAnomalies: AnomalyResponse[] = anomalyResults.results
      .filter((r) => r.anomaly_score >= minScore)
      .map((r) => {
        const complaint = complaintMap.get(r.document_id);
        return {
          complaintId: r.document_id,
          anomalyScore: r.anomaly_score,
          isAnomaly: r.is_anomaly,
          anomalyType: r.anomaly_type,
          detectorScores: {
            isolationForest: r.detector_scores?.isolation_forest,
            localOutlierFactor: r.detector_scores?.local_outlier_factor,
            histogramBased: r.detector_scores?.histogram_based,
          },
          complaint: complaint
            ? {
                description: complaint.description?.substring(0, 200) || '',
                make: complaint.make || '',
                model: complaint.model || '',
                year: complaint.year || 0,
                component: complaint.component || '',
              }
            : undefined,
        };
      })
      .slice(0, limit);

    // Sort by anomaly score descending
    transformedAnomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);

    return NextResponse.json({
      anomalies: transformedAnomalies,
      meta: {
        total: transformedAnomalies.length,
        totalAnalyzed: anomalyResults.total,
        anomalyCount: anomalyResults.anomaly_count,
        minScore,
      },
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    return Problems.internalError('Failed to fetch anomalies');
  }
}
