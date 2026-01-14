/**
 * Legal Hold Scope Delete API
 * DELETE /api/legal-holds/[id]/scopes/[scopeId] - Remove a scope from a legal hold
 *
 * Only ADMIN users can manage scopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string; scopeId: string }>;
}

/**
 * DELETE /api/legal-holds/[id]/scopes/[scopeId]
 * Remove a scope from a legal hold
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id, scopeId } = await params;

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
          detail: 'Cannot modify scopes of a released legal hold.',
        },
        { status: 400 }
      );
    }

    // 5. Find the scope
    const scope = await prisma.legalHoldScope.findUnique({
      where: { id: scopeId },
    });

    if (!scope) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: 'Scope not found.',
        },
        { status: 404 }
      );
    }

    // 6. Verify scope belongs to the specified legal hold
    if (scope.legalHoldId !== id) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: 'Scope not found on this legal hold.',
        },
        { status: 404 }
      );
    }

    // 7. Delete the scope
    await prisma.legalHoldScope.delete({
      where: { id: scopeId },
    });

    // 8. Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'LEGAL_HOLD_SCOPE_REMOVED',
        resource: 'LEGAL_HOLD',
        resourceId: id,
        metadata: {
          scopeId: scope.id,
          resourceType: scope.resourceType,
          resourceId: scope.resourceId,
        },
      },
    });

    return NextResponse.json({
      message: 'Scope removed successfully.',
    });
  } catch (error) {
    console.error('Legal hold scope deletion error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to remove scope from legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}
