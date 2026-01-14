/**
 * Legal Holds Management API
 * GET /api/legal-holds - List legal holds
 * POST /api/legal-holds - Create new legal hold
 *
 * Required for e-Discovery compliance and data preservation.
 * Only ADMIN users can access these endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/legal-holds
 * List all legal holds for the organization
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/401',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // 2. Check ADMIN role
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail: 'Legal holds management requires ADMIN privileges',
        },
        { status: 403 }
      );
    }

    // 3. Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const matterName = searchParams.get('matterName');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    // 4. Build where clause
    const where: Record<string, unknown> = {
      organizationId: user.organizationId,
    };

    if (status) {
      where.status = status;
    }

    if (matterName) {
      where.matterName = {
        contains: matterName,
        mode: 'insensitive',
      };
    }

    // 5. Query legal holds with pagination
    const [legalHolds, total] = await Promise.all([
      prisma.legalHold.findMany({
        where,
        include: {
          _count: {
            select: { scopes: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.legalHold.count({ where }),
    ]);

    // 6. Format response
    const formattedHolds = legalHolds.map((hold) => ({
      id: hold.id,
      matterName: hold.matterName,
      description: hold.description,
      status: hold.status,
      issuedAt: hold.issuedAt.toISOString(),
      issuedBy: hold.issuedBy,
      releasedAt: hold.releasedAt?.toISOString(),
      releasedBy: hold.releasedBy,
      createdAt: hold.createdAt.toISOString(),
      updatedAt: hold.updatedAt.toISOString(),
      _count: hold._count,
    }));

    return NextResponse.json({
      legalHolds: formattedHolds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Legal holds list error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to retrieve legal holds. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/legal-holds
 * Create a new legal hold
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/401',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // 2. Check ADMIN role
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail: 'Legal holds management requires ADMIN privileges',
        },
        { status: 403 }
      );
    }

    // 3. Parse request body
    let body: {
      matterName?: string;
      description?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid request body.',
        },
        { status: 400 }
      );
    }

    // 4. Validate required fields
    if (!body.matterName || body.matterName.trim() === '') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'matterName is required.',
        },
        { status: 400 }
      );
    }

    // 5. Create legal hold with ISSUED status
    const legalHold = await prisma.legalHold.create({
      data: {
        organizationId: user.organizationId!,
        matterName: body.matterName.trim(),
        description: body.description?.trim(),
        status: 'ISSUED',
        issuedBy: user.id,
      },
    });

    // 6. Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'LEGAL_HOLD_CREATED',
        resource: 'LEGAL_HOLD',
        resourceId: legalHold.id,
        metadata: {
          matterName: legalHold.matterName,
          description: legalHold.description,
        },
      },
    });

    // 7. Return created hold
    return NextResponse.json(
      {
        legalHold: {
          id: legalHold.id,
          matterName: legalHold.matterName,
          description: legalHold.description,
          status: legalHold.status,
          issuedAt: legalHold.issuedAt.toISOString(),
          issuedBy: legalHold.issuedBy,
          createdAt: legalHold.createdAt.toISOString(),
          updatedAt: legalHold.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Legal hold creation error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to create legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}
