/**
 * Patterns API
 * GET /api/patterns - List patterns for organization
 * POST /api/patterns - Create new pattern
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkPlanLimit } from '@/lib/billing';
import { TrendDirection } from '@prisma/client';

interface PatternWhereClause {
  organizationId: string;
  severityScore?: { gte: number };
  trendDirection?: TrendDirection;
  make?: { contains: string; mode: 'insensitive' };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const where: PatternWhereClause = {
      organizationId: user.organizationId,
    };

    // Severity filter
    const minSeverity = searchParams.get('minSeverity');
    if (minSeverity) {
      where.severityScore = { gte: parseFloat(minSeverity) };
    }

    // Trend filter
    const trend = searchParams.get('trend');
    if (trend) {
      where.trendDirection = trend as TrendDirection;
    }

    // Make filter
    const make = searchParams.get('make');
    if (make) {
      where.make = { contains: make, mode: 'insensitive' };
    }

    // Sorting - default by severityScore descending
    const sortBy = searchParams.get('sortBy') || 'severityScore';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [patterns, total] = await Promise.all([
      prisma.pattern.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: { complaints: true },
          },
        },
      }),
      prisma.pattern.count({ where }),
    ]);

    return NextResponse.json({
      patterns: patterns.map((p) => ({
        ...p,
        complaintCount: p._count.complaints,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patterns' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check plan limits
    const limitCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      resource: 'patterns',
    });

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Pattern limit reached (${limitCheck.current}/${limitCheck.limit})`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const pattern = await prisma.pattern.create({
      data: {
        name: body.name,
        description: body.description,
        make: body.make || 'Unknown',
        model: body.model,
        yearStart: body.yearStart,
        yearEnd: body.yearEnd,
        component: body.component || 'Unknown',
        severityScore: body.severityScore || 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        organizationId: user.organizationId,
        complaints: body.complaintIds
          ? {
              connect: body.complaintIds.map((id: string) => ({ id })),
            }
          : undefined,
      },
    });

    return NextResponse.json({ pattern }, { status: 201 });
  } catch (error) {
    console.error('Error creating pattern:', error);
    return NextResponse.json(
      { error: 'Failed to create pattern' },
      { status: 500 }
    );
  }
}
