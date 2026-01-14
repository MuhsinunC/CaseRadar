/**
 * Complaint by ID API
 * GET /api/complaints/[id] - Get single complaint details
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Problems } from '@/lib/api/rfc7807-errors';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await getCurrentUser();

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includePatterns = searchParams.get('include')?.includes('patterns');

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: {
        cluster: includePatterns
          ? {
              select: {
                id: true,
                name: true,
                severityScore: true,
              },
            }
          : false,
      },
    });

    if (!complaint) {
      return Problems.notFound('complaint', `Complaint ${id} not found`);
    }

    return NextResponse.json({ complaint });
  } catch (error) {
    console.error('Error fetching complaint:', error);
    return Problems.internalError('Failed to fetch complaint');
  }
}
