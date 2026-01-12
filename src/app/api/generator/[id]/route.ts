/**
 * Generated Complaint by ID API
 * GET /api/generator/[id] - Get generated complaint
 * DELETE /api/generator/[id] - Delete generated complaint
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

    const complaint = await prisma.generatedComplaint.findUnique({
      where: { id },
      include: {
        pattern: {
          select: {
            id: true,
            name: true,
            make: true,
            model: true,
          },
        },
      },
    });

    if (!complaint) {
      return NextResponse.json(
        { error: 'Generated complaint not found' },
        { status: 404 }
      );
    }

    // Tenant isolation
    if (complaint.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({ complaint });
  } catch (error) {
    console.error('Error fetching generated complaint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch complaint' },
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

    const { id } = await params;

    const complaint = await prisma.generatedComplaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      return NextResponse.json(
        { error: 'Generated complaint not found' },
        { status: 404 }
      );
    }

    // Tenant isolation
    if (complaint.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Prevent deleting finalized complaints
    if (complaint.status === 'FINALIZED') {
      return NextResponse.json(
        { error: 'Cannot delete finalized complaints' },
        { status: 400 }
      );
    }

    await prisma.generatedComplaint.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting generated complaint:', error);
    return NextResponse.json(
      { error: 'Failed to delete complaint' },
      { status: 500 }
    );
  }
}
