/**
 * Legal Hold Detail API
 * GET /api/legal-holds/[id] - Get hold details
 * PATCH /api/legal-holds/[id] - Update hold
 * DELETE /api/legal-holds/[id] - Release hold
 *
 * Only ADMIN users can access these endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  ISSUED: ['ACTIVE', 'RELEASED'],
  ACTIVE: ['SUSPENDED', 'RELEASED'],
  SUSPENDED: ['ACTIVE', 'RELEASED'],
  RELEASED: [], // Terminal state - no transitions allowed
};

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/legal-holds/[id]
 * Get details of a specific legal hold
 */
export async function GET(
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
      include: {
        scopes: true,
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

    // 4. Return hold details
    return NextResponse.json({
      legalHold: {
        id: legalHold.id,
        matterName: legalHold.matterName,
        description: legalHold.description,
        status: legalHold.status,
        issuedAt: legalHold.issuedAt.toISOString(),
        issuedBy: legalHold.issuedBy,
        releasedAt: legalHold.releasedAt?.toISOString(),
        releasedBy: legalHold.releasedBy,
        createdAt: legalHold.createdAt.toISOString(),
        updatedAt: legalHold.updatedAt.toISOString(),
        scopes: legalHold.scopes.map((scope) => ({
          id: scope.id,
          resourceType: scope.resourceType,
          resourceId: scope.resourceId,
          custodianId: scope.custodianId,
          createdAt: scope.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('Legal hold detail error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to retrieve legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/legal-holds/[id]
 * Update a legal hold (status, description)
 */
export async function PATCH(
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

    // 3. Find existing hold
    const existingHold = await prisma.legalHold.findFirst({
      where: {
        id,
        organizationId: user.organizationId!,
      },
    });

    if (!existingHold) {
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

    // 4. Parse request body
    let body: {
      status?: string;
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

    // 5. Validate status transition if status is being changed
    if (body.status && body.status !== existingHold.status) {
      const validTransitions = VALID_TRANSITIONS[existingHold.status] || [];

      if (!validTransitions.includes(body.status)) {
        return NextResponse.json(
          {
            type: 'https://httpstatuses.com/400',
            title: 'Bad Request',
            status: 400,
            detail: `Invalid status transition from ${existingHold.status} to ${body.status}. Valid transitions: ${validTransitions.join(', ') || 'none'}`,
          },
          { status: 400 }
        );
      }
    }

    // 6. Build update data
    const updateData: Record<string, unknown> = {};

    if (body.status) {
      updateData.status = body.status;
    }

    if (body.description !== undefined) {
      updateData.description = body.description;
    }

    // 7. Update the hold
    const updatedHold = await prisma.legalHold.update({
      where: { id },
      data: updateData,
    });

    // 8. Create audit log for status changes
    if (body.status && body.status !== existingHold.status) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: 'LEGAL_HOLD_STATUS_CHANGED',
          resource: 'LEGAL_HOLD',
          resourceId: id,
          metadata: {
            previousStatus: existingHold.status,
            newStatus: body.status,
          },
        },
      });
    }

    // 9. Return updated hold
    return NextResponse.json({
      legalHold: {
        id: updatedHold.id,
        matterName: updatedHold.matterName,
        description: updatedHold.description,
        status: updatedHold.status,
        issuedAt: updatedHold.issuedAt.toISOString(),
        issuedBy: updatedHold.issuedBy,
        releasedAt: updatedHold.releasedAt?.toISOString(),
        releasedBy: updatedHold.releasedBy,
        createdAt: updatedHold.createdAt.toISOString(),
        updatedAt: updatedHold.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Legal hold update error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to update legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/legal-holds/[id]
 * Release a legal hold (soft release, not hard delete)
 */
export async function DELETE(
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

    // 3. Find existing hold
    const existingHold = await prisma.legalHold.findFirst({
      where: {
        id,
        organizationId: user.organizationId!,
      },
    });

    if (!existingHold) {
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

    // 4. Parse request body for release reason
    let body: { releaseReason?: string };

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (!body.releaseReason || body.releaseReason.trim() === '') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'releaseReason is required to release a legal hold.',
        },
        { status: 400 }
      );
    }

    // 5. Check if already released
    if (existingHold.status === 'RELEASED') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Legal hold has already been released.',
        },
        { status: 400 }
      );
    }

    // 6. Release the hold (soft release)
    const releasedHold = await prisma.legalHold.update({
      where: { id },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        releasedBy: user.id,
      },
    });

    // 7. Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'LEGAL_HOLD_RELEASED',
        resource: 'LEGAL_HOLD',
        resourceId: id,
        metadata: {
          previousStatus: existingHold.status,
          releaseReason: body.releaseReason.trim(),
          releasedAt: releasedHold.releasedAt?.toISOString(),
        },
      },
    });

    // 8. Return success
    return NextResponse.json({
      message: 'Legal hold has been released.',
      legalHold: {
        id: releasedHold.id,
        matterName: releasedHold.matterName,
        status: releasedHold.status,
        releasedAt: releasedHold.releasedAt?.toISOString(),
        releasedBy: releasedHold.releasedBy,
      },
    });
  } catch (error) {
    console.error('Legal hold release error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to release legal hold. Please try again later.',
      },
      { status: 500 }
    );
  }
}
