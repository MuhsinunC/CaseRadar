/**
 * Complaints API
 * GET /api/complaints - Search and list NHTSA complaints
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { Problems } from '@/lib/api/rfc7807-errors';
import { buildHybridPaginationResponse } from '@/lib/api/cursor-pagination';

/**
 * Add rate limit headers to a NextResponse
 */
function addRateLimitHeaders(
  response: NextResponse,
  headers: Record<string, string>
): NextResponse {
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

interface WhereClause {
  make?: { contains: string; mode: 'insensitive' };
  model?: { contains: string; mode: 'insensitive' };
  year?: { gte?: number; lte?: number };
  component?: { contains: string; mode: 'insensitive' };
  crash?: boolean;
  deaths?: { gt: number };
  injuries?: { gt: number };
  fire?: boolean;
  OR?: Array<{ [key: string]: { contains: string; mode: 'insensitive' } }>;
}

export async function GET(request: NextRequest) {
  try {
    // Get current user (for future org-specific filtering if needed)
    const user = await getCurrentUser();

    // Rate limiting - search is expensive (60 req/min)
    // Use IP address if user not authenticated, otherwise use user ID
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimitKey = `search:${user?.id || clientIP}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.search);
    if (!rateCheck.allowed) {
      return addRateLimitHeaders(
        NextResponse.json(
          {
            type: 'https://api.caseradar.com/errors/rate-limited',
            title: 'Rate Limit Exceeded',
            status: 429,
            detail: `Search rate limit exceeded. Please wait ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`,
            retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
          },
          { status: 429 }
        ),
        rateCheck.headers
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return Problems.validationError(
        {
          ...(page < 1 && { page: 'Page must be at least 1' }),
          ...(limit < 1 && { limit: 'Limit must be at least 1' }),
          ...(limit > 100 && { limit: 'Limit cannot exceed 100' }),
        },
        'Invalid pagination parameters'
      );
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where: WhereClause = {};

    // Make filter
    const make = searchParams.get('make');
    if (make) {
      where.make = { contains: make, mode: 'insensitive' };
    }

    // Model filter
    const model = searchParams.get('model');
    if (model) {
      where.model = { contains: model, mode: 'insensitive' };
    }

    // Year range filter
    const yearFrom = searchParams.get('yearFrom');
    const yearTo = searchParams.get('yearTo');
    if (yearFrom || yearTo) {
      where.year = {};
      if (yearFrom) where.year.gte = parseInt(yearFrom);
      if (yearTo) where.year.lte = parseInt(yearTo);
    }

    // Component filter
    const component = searchParams.get('component');
    if (component) {
      where.component = { contains: component, mode: 'insensitive' };
    }

    // Severity filters
    const hasCrash = searchParams.get('hasCrash');
    if (hasCrash === 'true') {
      where.crash = true;
    }

    const hasDeath = searchParams.get('hasDeath');
    if (hasDeath === 'true') {
      where.deaths = { gt: 0 };
    }

    const hasInjury = searchParams.get('hasInjury');
    if (hasInjury === 'true') {
      where.injuries = { gt: 0 };
    }

    const hasFire = searchParams.get('hasFire');
    if (hasFire === 'true') {
      where.fire = true;
    }

    // Text search
    const search = searchParams.get('search');
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { component: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Sorting
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const orderBy = { [sortBy]: sortOrder };

    // Determine search type
    const semanticSearch = searchParams.get('semanticSearch');
    const searchType = semanticSearch ? 'semantic' : search ? 'keyword' : 'none';

    // Execute queries
    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          nhtsaId: true,
          make: true,
          model: true,
          year: true,
                    component: true,
          crash: true,
          fire: true,
          injuries: true,
          deaths: true,
          createdAt: true,
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    // Include stats if requested
    const includeStats = searchParams.get('includeStats') === 'true';
    let stats = undefined;

    if (includeStats) {
      const [totalComplaints, topMakes, severityStats] = await Promise.all([
        prisma.complaint.count(),
        prisma.complaint.groupBy({
          by: ['make'],
          _count: true,
          orderBy: { _count: { make: 'desc' } },
          take: 10,
        }),
        Promise.all([
          prisma.complaint.count({ where: { deaths: { gt: 0 } } }),
          prisma.complaint.count({ where: { injuries: { gt: 0 } } }),
          prisma.complaint.count({ where: { crash: true } }),
          prisma.complaint.count({ where: { fire: true } }),
        ]),
      ]);

      stats = {
        totalComplaints,
        topMakes: topMakes.map((m) => ({ make: m.make, count: m._count })),
        severityBreakdown: {
          withDeaths: severityStats[0],
          withInjuries: severityStats[1],
          withCrash: severityStats[2],
          withFire: severityStats[3],
        },
      };
    }

    // Build hybrid pagination response (supports both cursor and offset)
    const pagination = buildHybridPaginationResponse(
      complaints as Array<{ id: string }>,
      page,
      limit,
      total
    );

    return addRateLimitHeaders(
      NextResponse.json({
        complaints,
        pagination,
        searchType,
        ...(stats && { stats }),
      }),
      rateCheck.headers
    );
  } catch (error) {
    console.error('Error fetching complaints:', error);
    return Problems.internalError('Failed to fetch complaints');
  }
}
