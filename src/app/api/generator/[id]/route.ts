/**
 * Generated Complaint by ID API
 * GET /api/generator/[id] - Get generated complaint
 * DELETE /api/generator/[id] - Delete generated complaint
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logDataModification } from '@/lib/security/audit-logging';
import { Problems } from '@/lib/api/rfc7807-errors';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view generated complaints');
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
      return Problems.notFound('generated complaint', `Generated complaint ${id} not found`);
    }

    // Tenant isolation
    if (complaint.organizationId !== user.organizationId) {
      return Problems.forbidden('You do not have access to this generated complaint');
    }

    return NextResponse.json({ complaint });
  } catch (error) {
    console.error('Error fetching generated complaint:', error);
    return Problems.internalError('Failed to fetch generated complaint');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to delete generated complaints');
    }

    const { id } = await params;

    const complaint = await prisma.generatedComplaint.findUnique({
      where: { id },
    });

    if (!complaint) {
      return Problems.notFound('generated complaint', `Generated complaint ${id} not found`);
    }

    // Tenant isolation
    if (complaint.organizationId !== user.organizationId) {
      return Problems.forbidden('You do not have access to this generated complaint');
    }

    // Prevent deleting finalized complaints
    if (complaint.status === 'FINALIZED') {
      return Problems.conflict(
        'Cannot delete finalized complaints. Finalized documents are immutable for legal compliance.',
        { complaintStatus: complaint.status }
      );
    }

    // Check for legal hold - documents under legal hold cannot be deleted
    if (complaint.legalHold) {
      return Problems.conflict(
        'Cannot delete complaints under legal hold. Contact your administrator to release the hold.',
        { legalHoldActive: true }
      );
    }

    await prisma.generatedComplaint.delete({
      where: { id },
    });

    // Audit log: generated complaint deleted
    await logDataModification(
      user.id,
      user.organizationId,
      'GENERATED_COMPLAINT',
      id,
      'DELETE',
      { before: { title: complaint.title, status: complaint.status } }
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting generated complaint:', error);
    return Problems.internalError('Failed to delete generated complaint');
  }
}
