/**
 * Recalls API
 * GET /api/recalls - List recalls with filtering
 * POST /api/recalls/sync - Trigger recalls sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Problems } from '@/lib/api/rfc7807-errors';
import { recallsSyncService } from '@/lib/nhtsa/recalls-sync';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view recalls');
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Filters
    const make = searchParams.get('make');
    const model = searchParams.get('model');
    const year = searchParams.get('year');
    const component = searchParams.get('component');

    // Build where clause
    const where: {
      make?: { contains: string; mode: 'insensitive' };
      model?: { contains: string; mode: 'insensitive' };
      year?: number;
      component?: { contains: string; mode: 'insensitive' };
    } = {};

    if (make) where.make = { contains: make, mode: 'insensitive' };
    if (model) where.model = { contains: model, mode: 'insensitive' };
    if (year) where.year = parseInt(year);
    if (component) where.component = { contains: component, mode: 'insensitive' };

    const [recalls, total] = await Promise.all([
      prisma.recall.findMany({
        where,
        orderBy: { reportReceivedDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.recall.count({ where }),
    ]);

    return NextResponse.json({
      recalls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching recalls:', error);
    return Problems.internalError('Failed to fetch recalls');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to sync recalls');
    }

    // Only allow admins to trigger sync
    if (user.role !== 'ADMIN') {
      return Problems.forbidden('Only admins can trigger recalls sync');
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'sync';

    if (action === 'sync') {
      // Sync recalls from NHTSA
      const status = await recallsSyncService.syncRecallsFromComplaints();
      return NextResponse.json({ status });
    }

    if (action === 'crossReference') {
      // Cross-reference patterns with recalls
      const result = await recallsSyncService.crossReferencePatterns();
      return NextResponse.json({ result });
    }

    if (action === 'stats') {
      // Get recall statistics
      const stats = await recallsSyncService.getRecallStats();
      return NextResponse.json({ stats });
    }

    if (action === 'patternsWithoutRecalls') {
      // Get patterns without recalls (high-value leads)
      const patterns = await recallsSyncService.getPatternsWithoutRecalls();
      return NextResponse.json({
        patterns,
        count: patterns.length,
        message: 'These patterns have no related recalls - potential leads for lawsuits',
      });
    }

    return Problems.validationError(
      { action: 'Invalid action' },
      'Valid actions: sync, crossReference, stats, patternsWithoutRecalls'
    );
  } catch (error) {
    console.error('Error in recalls POST:', error);
    return Problems.internalError('Failed to process recalls request');
  }
}
