/**
 * Generator API
 * POST /api/generator - Generate legal complaint from pattern
 * GET /api/generator - List generated complaints
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkPlanLimit } from '@/lib/billing';
import { generateComplaintDocument } from '@/lib/complaint';
import { generateContentHash } from '@/lib/security/content-hash';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { ComplaintStatus } from '@prisma/client';

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

interface GeneratedWhereClause {
  organizationId: string;
  status?: ComplaintStatus;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting - generation is expensive (10 req/min)
    const rateLimitKey = `generation:${user.organizationId}:${user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.generation);
    if (!rateCheck.allowed) {
      return addRateLimitHeaders(
        NextResponse.json(
          {
            type: 'https://api.caseradar.com/errors/rate-limited',
            title: 'Rate Limit Exceeded',
            status: 429,
            detail: `Generation rate limit exceeded. Please wait ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`,
            retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
          },
          { status: 429 }
        ),
        rateCheck.headers
      );
    }

    // Check feature access
    const featureCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      feature: 'complaintGeneration',
    });

    if (!featureCheck.allowed) {
      return NextResponse.json(
        { error: 'Complaint generation not available on your plan' },
        { status: 403 }
      );
    }

    // Check monthly limit
    const limitCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      resource: 'complaintsPerMonth',
    });

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Monthly complaint limit reached (${limitCheck.current}/${limitCheck.limit})`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.patternId) {
      return NextResponse.json(
        { error: 'patternId is required' },
        { status: 400 }
      );
    }

    // Get pattern
    const pattern = await prisma.pattern.findUnique({
      where: { id: body.patternId },
      include: {
        complaints: {
          take: 50, // Include sample complaints for generation
          select: {
            id: true,
            description: true,
            make: true,
            model: true,
            year: true,
            deaths: true,
            injuries: true,
          },
        },
      },
    });

    if (!pattern) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    // Tenant isolation
    if (pattern.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Generate complaint document
    const yearRange = pattern.yearStart && pattern.yearEnd
      ? `${pattern.yearStart}-${pattern.yearEnd}`
      : pattern.yearStart
        ? `${pattern.yearStart}+`
        : '';

    const generatedDoc = await generateComplaintDocument({
      pattern: {
        name: pattern.name,
        make: pattern.make || '',
        model: pattern.model || '',
        yearRange,
        severity: pattern.severityScore,
        complaintCount: pattern.complaints.length,
      },
      complaints: pattern.complaints,
      plaintiffInfo: body.plaintiffInfo,
      court: body.court,
      defendant: body.defendant || `${pattern.make} Motor Corporation`,
    });

    // Serialize content and compute integrity hash
    const contentString = JSON.stringify(generatedDoc);
    const contentHash = generateContentHash(contentString);

    // Save to database - plaintiffInfo and court are stored in content JSON
    const complaint = await prisma.generatedComplaint.create({
      data: {
        title: generatedDoc.title,
        content: contentString,
        contentHash, // SHA-256 hash for document integrity verification
        status: 'DRAFT',
        patternId: pattern.id,
        organizationId: user.organizationId,
        createdBy: user.id,
      },
    });

    return addRateLimitHeaders(
      NextResponse.json({ complaint }, { status: 201 }),
      rateCheck.headers
    );
  } catch (error) {
    console.error('Error generating complaint:', error);
    return NextResponse.json(
      { error: 'Failed to generate complaint' },
      { status: 500 }
    );
  }
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

    // Build where clause
    const where: GeneratedWhereClause = {
      organizationId: user.organizationId,
    };

    // Status filter
    const status = searchParams.get('status');
    if (status) {
      where.status = status as ComplaintStatus;
    }

    const [complaints, total] = await Promise.all([
      prisma.generatedComplaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          pattern: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.generatedComplaint.count({ where }),
    ]);

    return NextResponse.json({
      complaints,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching generated complaints:', error);
    return NextResponse.json(
      { error: 'Failed to fetch complaints' },
      { status: 500 }
    );
  }
}
