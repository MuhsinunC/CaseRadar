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
import { logDataModification } from '@/lib/security/audit-logging';
import { Problems } from '@/lib/api/rfc7807-errors';
import { buildHybridPaginationResponse } from '@/lib/api/cursor-pagination';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';
import { ComplaintStatus } from '@prisma/client';

interface GeneratedWhereClause {
  organizationId: string;
  status?: ComplaintStatus;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to generate complaints');
    }

    // Check idempotency key first
    const idempotencyKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const cachedResponse = checkIdempotencyKey(idempotencyKey, user.organizationId);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Rate limiting - generation is expensive (10 req/min)
    const rateLimitKey = `generation:${user.organizationId}:${user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.generation);
    if (!rateCheck.allowed) {
      const retryAfter = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
      const response = Problems.rateLimited(
        retryAfter,
        `Generation rate limit exceeded. Please wait ${retryAfter} seconds.`
      );
      // Add additional rate limit headers
      Object.entries(rateCheck.headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Check feature access
    const featureCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      feature: 'complaintGeneration',
    });

    if (!featureCheck.allowed) {
      return Problems.forbidden('Complaint generation is not available on your current plan. Upgrade to access this feature.');
    }

    // Check monthly limit
    const limitCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      resource: 'complaintsPerMonth',
    });

    if (!limitCheck.allowed) {
      return Problems.forbidden(
        `Monthly complaint limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan for more complaints.`
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.patternId) {
      return Problems.validationError(
        { patternId: 'Pattern ID is required' },
        'A pattern must be specified to generate a complaint'
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
      return Problems.notFound('pattern', `Pattern ${body.patternId} not found`);
    }

    // Tenant isolation
    if (pattern.organizationId !== user.organizationId) {
      return Problems.forbidden('You do not have access to this pattern');
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
      // Map complaints to convert null years to undefined (Prisma uses null, interface expects undefined)
      complaints: pattern.complaints.map(c => ({
        ...c,
        year: c.year ?? undefined,
      })),
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

    // Audit log: generated complaint created
    await logDataModification(
      user.id,
      user.organizationId,
      'GENERATED_COMPLAINT',
      complaint.id,
      'CREATE',
      { after: { title: complaint.title, patternId: pattern.id } }
    );

    const response = NextResponse.json({ complaint }, { status: 201 });
    // Add rate limit headers
    Object.entries(rateCheck.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Store idempotency result if key was provided
    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, user.organizationId, response);
    }

    return response;
  } catch (error) {
    console.error('Error generating complaint:', error);
    return Problems.internalError('Failed to generate complaint');
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to list generated complaints');
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

    // Build hybrid pagination response (supports both cursor and offset)
    const pagination = buildHybridPaginationResponse(
      complaints as Array<{ id: string }>,
      page,
      limit,
      total
    );

    return NextResponse.json({
      complaints,
      pagination,
    });
  } catch (error) {
    console.error('Error fetching generated complaints:', error);
    return Problems.internalError('Failed to fetch generated complaints');
  }
}
