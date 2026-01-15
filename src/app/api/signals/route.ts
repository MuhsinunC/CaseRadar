/**
 * Signals API
 * GET /api/signals - List detected safety signals
 *
 * Wrapper for Python ML service signal detection.
 * Based on architecture document Appendix F.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { mlDetectionClient, ComplaintData, SignalResult } from '@/lib/patterns/ml-detection-client';
import { Problems } from '@/lib/api/rfc7807-errors';

interface SignalResponse {
  component: string;
  prr: number | null;
  ciLower: number | null;
  count: number;
  signalStrength: 'strong' | 'weak' | 'none' | 'insufficient_data';
  recommendation: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view signals');
    }

    const searchParams = request.nextUrl.searchParams;

    // Filter by signal strength: strong, weak, all (default)
    const strength = searchParams.get('strength') || 'all';

    // Optional make/model filters
    const make = searchParams.get('make') || undefined;
    const model = searchParams.get('model') || undefined;

    // Fetch complaint data for signal analysis
    // Note: NHTSA complaints are global (organizationId is null), so we don't filter by org
    const complaints = await prisma.complaint.findMany({
      where: {},
      select: {
        component: true,
        make: true,
        model: true,
        year: true,
      },
      take: 10000, // Limit for performance
    });

    // Transform to ML service format
    const complaintData: ComplaintData[] = complaints.map((c) => ({
      component: c.component || 'UNKNOWN',
      make: c.make || 'UNKNOWN',
      model: c.model || undefined,
      year: c.year || 0,
    }));

    let signals: SignalResult[];

    try {
      // Call appropriate ML service endpoint based on filter
      if (strength === 'strong') {
        const response = await mlDetectionClient.signals.getStrongSignals(
          complaintData,
          make,
          model
        );
        signals = response.signals;
      } else if (strength === 'weak') {
        const response = await mlDetectionClient.signals.getWatchList(
          complaintData,
          make,
          model
        );
        signals = response.signals;
      } else {
        // Get all signals
        const response = await mlDetectionClient.signals.scan(
          complaintData,
          make,
          model
        );
        signals = response.results;
      }
    } catch (mlError) {
      console.error('ML Service error:', mlError);
      return Problems.serviceUnavailable(
        'Pattern detection service is currently unavailable'
      );
    }

    // Transform response to match API schema
    const transformedSignals: SignalResponse[] = signals.map((s) => ({
      component: s.component,
      prr: s.prr,
      ciLower: s.ci_lower,
      count: s.count,
      signalStrength: mapSignalStrength(s.signal_strength),
      recommendation: s.recommendation,
    }));

    // Count strong and weak signals
    const strongCount = transformedSignals.filter(
      (s) => s.signalStrength === 'strong'
    ).length;
    const weakCount = transformedSignals.filter(
      (s) => s.signalStrength === 'weak'
    ).length;

    return NextResponse.json({
      signals: transformedSignals,
      meta: {
        total: transformedSignals.length,
        strongSignals: strongCount,
        weakSignals: weakCount,
        filter: strength,
      },
    });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return Problems.internalError('Failed to fetch signals');
  }
}

/**
 * Map ML service signal strength to API schema format
 */
function mapSignalStrength(
  strength: string
): 'strong' | 'weak' | 'none' | 'insufficient_data' {
  switch (strength) {
    case 'strong_signal':
      return 'strong';
    case 'weak_signal':
      return 'weak';
    case 'no_signal':
      return 'none';
    case 'insufficient_data':
    default:
      return 'insufficient_data';
  }
}
