/**
 * Pattern by ID API
 * GET /api/patterns/[id] - Get pattern details
 * PATCH /api/patterns/[id] - Update pattern
 * DELETE /api/patterns/[id] - Delete pattern
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includeTrend = searchParams.get('include')?.includes('trend');

    const pattern = await prisma.pattern.findUnique({
      where: { id },
      include: {
        complaints: {
          select: {
            id: true,
            description: true,
            make: true,
            model: true,
            year: true,
          },
          take: 100,
        },
      },
    });

    if (!pattern) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    // Tenant isolation check
    if (pattern.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({ pattern });
  } catch (error) {
    console.error('Error fetching pattern:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pattern' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - need ANALYST or ADMIN
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check pattern exists and belongs to org
    const existing = await prisma.pattern.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    if (existing.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const pattern = await prisma.pattern.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        make: body.make,
        model: body.model,
        yearStart: body.yearStart,
        yearEnd: body.yearEnd,
        severityScore: body.severityScore,
      },
    });

    return NextResponse.json({ pattern });
  } catch (error) {
    console.error('Error updating pattern:', error);
    return NextResponse.json(
      { error: 'Failed to update pattern' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - need ADMIN
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check pattern exists and belongs to org
    const existing = await prisma.pattern.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    if (existing.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    await prisma.pattern.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting pattern:', error);
    return NextResponse.json(
      { error: 'Failed to delete pattern' },
      { status: 500 }
    );
  }
}
