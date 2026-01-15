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
import { logDataModification } from '@/lib/security/audit-logging';
import { Problems } from '@/lib/api/rfc7807-errors';
import { buildHybridPaginationResponse } from '@/lib/api/cursor-pagination';

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
      return Problems.unauthorized('Authentication required to view patterns');
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build where clause - include both org-specific and global patterns
    const where = {
      OR: [
        { organizationId: user.organizationId },
        { organizationId: null }, // Global patterns
      ],
    } as {
      OR: Array<{ organizationId: string | null }>;
      severityScore?: { gte: number };
      trendDirection?: TrendDirection;
      make?: { contains: string; mode: 'insensitive' };
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

    // Search filter (searches name, make, model, component)
    const search = searchParams.get('search');
    if (search) {
      // Use AND to combine with existing OR clause
      (where as Record<string, unknown>).AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { make: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
            { component: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
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
            select: {
              complaints: true,
              recalls: true, // Count linked recalls
            },
          },
        },
      }),
      prisma.pattern.count({ where }),
    ]);

    // Map patterns to include complaintCount and recallCount
    const mappedPatterns = patterns.map((p) => ({
      ...p,
      complaintCount: p._count.complaints,
      recallCount: p._count.recalls,
      hasRecall: p._count.recalls > 0,
    }));

    // Build hybrid pagination response (supports both cursor and offset)
    const pagination = buildHybridPaginationResponse(
      mappedPatterns as Array<{ id: string }>,
      page,
      limit,
      total
    );

    return NextResponse.json({
      patterns: mappedPatterns,
      pagination,
    });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return Problems.internalError('Failed to fetch patterns');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to create patterns');
    }

    // Check plan limits
    const limitCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      resource: 'patterns',
    });

    if (!limitCheck.allowed) {
      return Problems.forbidden(
        `Pattern limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan for more patterns.`
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return Problems.validationError(
        { name: 'Name is required' },
        'Pattern name must be provided'
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

    // Audit log: pattern created
    await logDataModification(
      user.id,
      user.organizationId,
      'PATTERN',
      pattern.id,
      'CREATE',
      { after: { name: pattern.name, make: pattern.make, model: pattern.model } }
    );

    return NextResponse.json({ pattern }, { status: 201 });
  } catch (error) {
    console.error('Error creating pattern:', error);
    return Problems.internalError('Failed to create pattern');
  }
}
