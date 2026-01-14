/**
 * Legal Hold Scopes API
 * POST /api/legal-holds/[id]/scopes - Add scope(s) to a legal hold
 *
 * Scopes define what resources are covered by the legal hold.
 * Only ADMIN users can manage scopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ScopeInput {
  resourceType: string;
  resourceId?: string;
  custodianId?: string;
}

/**
 * POST /api/legal-holds/[id]/scopes
 * Add one or more scopes to a legal hold
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    // 3. Find legal hold with tenant isolation
    const legalHold = await prisma.legalHold.findFirst({
      where: {
        id,
        organizationId: user.organizationId!,
      },
    });

    if (!legalHold) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: 'Legal hold not found.',
        },
        { status: 404 }
      );
    }

    // 4. Check hold is not released
    if (legalHold.status === 'RELEASED') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Cannot add scopes to a released legal hold.',
        },
        { status: 400 }
      );
    }

    // 5. Parse request body
    let body: {
      resourceType?: string;
      resourceId?: string;
      custodianId?: string;
      scopes?: ScopeInput[];
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

    // 6. Handle batch scope addition
    if (body.scopes && Array.isArray(body.scopes)) {
      const scopesToCreate = body.scopes.map((scope) => ({
        legalHoldId: id,
        resourceType: scope.resourceType,
        resourceId: scope.resourceId || null,
        custodianId: scope.custodianId || null,
      }));

      const result = await prisma.legalHoldScope.createMany({
        data: scopesToCreate,
        skipDuplicates: true,
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: 'LEGAL_HOLD_SCOPES_ADDED',
          resource: 'LEGAL_HOLD',
          resourceId: id,
          metadata: {
            scopesAdded: result.count,
            scopes: JSON.parse(JSON.stringify(body.scopes)),
          },
        },
      });

      return NextResponse.json(
        {
          message: 'Scopes added successfully.',
          scopesAdded: result.count,
        },
        { status: 201 }
      );
    }

    // 7. Handle single scope addition
    if (!body.resourceType) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'resourceType is required.',
        },
        { status: 400 }
      );
    }

    // 8. Check for duplicate scope
    const existingScope = await prisma.legalHoldScope.findFirst({
      where: {
        legalHoldId: id,
        resourceType: body.resourceType,
        resourceId: body.resourceId || null,
      },
    });

    if (existingScope) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/409',
          title: 'Conflict',
          status: 409,
          detail: 'This scope already exists on the legal hold.',
        },
        { status: 409 }
      );
    }

    // 9. Create the scope
    const scope = await prisma.legalHoldScope.create({
      data: {
        legalHoldId: id,
        resourceType: body.resourceType,
        resourceId: body.resourceId || null,
        custodianId: body.custodianId || null,
      },
    });

    // 10. Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'LEGAL_HOLD_SCOPE_ADDED',
        resource: 'LEGAL_HOLD',
        resourceId: id,
        metadata: {
          scopeId: scope.id,
          resourceType: scope.resourceType,
          resourceId: scope.resourceId,
        },
      },
    });

    return NextResponse.json(
      {
        message: 'Scope added successfully.',
        scope: {
          id: scope.id,
          legalHoldId: scope.legalHoldId,
          resourceType: scope.resourceType,
          resourceId: scope.resourceId,
          custodianId: scope.custodianId,
          createdAt: scope.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Legal hold scope creation error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to add scope to legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}
