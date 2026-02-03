/**
 * Dashboard Stats API
 * GET /api/dashboard/stats - Get dashboard statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getApproximateCount } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { cacheAside, getCacheStats, getCachedValue } from '@/lib/cache/cache-aside';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '30d';

    // Cache the entire stats response per organization (5 minutes)
    // This dramatically improves dashboard load times after first visit
    // Stats don't need to be real-time - 5 min cache is acceptable
    const STATS_CACHE_TTL = 300; // 5 minutes - better cache hit rate
    const cacheKey = `dashboard:stats:${user.organizationId}:${period}`;

    // Debug: Check if value is already cached
    const cachedValue = getCachedValue(cacheKey);
    const cacheStats = await getCacheStats();
    console.log(`[CACHE DEBUG] Key: ${cacheKey}, Cached: ${!!cachedValue}, Stats: hits=${cacheStats.hits}, misses=${cacheStats.misses}, size=${cacheStats.size}`);

    const stats = await cacheAside(
      cacheKey,
      async () => {
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

        // Fetch all stats in parallel
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
          prisma.pattern.count({
            where: {
              OR: [
                { organizationId: user.organizationId },
                { organizationId: null },
              ],
            },
          }),
          prisma.pattern.count({
            where: {
              OR: [
                { organizationId: user.organizationId },
                { organizationId: null },
              ],
              severityScore: { gte: 7 },
            },
          }),
          prisma.pattern.count({
            where: {
              OR: [
                { organizationId: user.organizationId },
                { organizationId: null },
              ],
              trendDirection: 'INCREASING',
            },
          }),
          prisma.pattern.count({
            where: {
              OR: [
                { organizationId: user.organizationId },
                { organizationId: null },
              ],
              createdAt: { gte: startDate },
            },
          }),
          // Use approximate count for 2M+ row table - instant vs 1.5s
          getApproximateCount('Complaint'),
          prisma.complaint.count({
            where: {
              dateAdded: { gte: startDate },
            },
          }),
          prisma.generatedComplaint.count({
            where: { organizationId: user.organizationId },
          }),
          prisma.complaint.groupBy({
            by: ['make'],
            _count: { make: true },
            orderBy: { _count: { make: 'desc' } },
            take: 10,
          }),
        ]);

        return {
          totalComplaints,
          complaintsChange: 0,
          activePatterns: totalPatterns,
          patternsChange: 0,
          generatedComplaints,
          generatedChange: 0,
          highSeverityPatterns,
          severityChange: 0,
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
        };
      },
      { ttl: STATS_CACHE_TTL }
    );

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
