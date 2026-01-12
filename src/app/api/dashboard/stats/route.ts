/**
 * Dashboard Stats API
 * GET /api/dashboard/stats - Get dashboard statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '30d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Fetch stats in parallel
    const [
      totalPatterns,
      highSeverityPatterns,
      upwardTrendPatterns,
      recentPatterns,
      totalComplaints,
      complaintsInPeriod,
      generatedComplaints,
      complaintsByMake,
    ] = await Promise.all([
      // Total patterns for org
      prisma.pattern.count({
        where: { organizationId: user.organizationId },
      }),
      // High severity patterns (>= 7)
      prisma.pattern.count({
        where: {
          organizationId: user.organizationId,
          severityScore: { gte: 7 },
        },
      }),
      // Upward trending patterns
      prisma.pattern.count({
        where: {
          organizationId: user.organizationId,
          trendDirection: 'INCREASING',
        },
      }),
      // Patterns created in period
      prisma.pattern.count({
        where: {
          organizationId: user.organizationId,
          createdAt: { gte: startDate },
        },
      }),
      // Total complaints tracked
      prisma.complaint.count(),
      // Complaints received in period
      prisma.complaint.count({
        where: {
          dateAdded: { gte: startDate },
        },
      }),
      // Generated complaints for org
      prisma.generatedComplaint.count({
        where: { organizationId: user.organizationId },
      }),
      // Top manufacturers
      prisma.complaint.groupBy({
        by: ['make'],
        _count: { make: true },
        orderBy: { _count: { make: 'desc' } },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      stats: {
        patterns: {
          total: totalPatterns,
          highSeverity: highSeverityPatterns,
          upwardTrend: upwardTrendPatterns,
          recentlyCreated: recentPatterns,
        },
        complaints: {
          total: totalComplaints,
          inPeriod: complaintsInPeriod,
          generated: generatedComplaints,
        },
        topManufacturers: complaintsByMake.map((item) => ({
          make: item.make,
          count: item._count.make,
        })),
      },
      period,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
