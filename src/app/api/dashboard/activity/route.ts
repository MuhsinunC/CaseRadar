/**
 * Dashboard Activity API
 * GET /api/dashboard/activity - Get recent activity feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface ActivityItem {
  id: string;
  type: 'pattern_created' | 'pattern_updated' | 'complaint_generated' | 'complaint_finalized';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');

    // Fetch recent patterns and generated complaints
    const [recentPatterns, recentGenerated] = await Promise.all([
      prisma.pattern.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          make: true,
          model: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.generatedComplaint.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          pattern: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    // Build activity feed
    const activities: ActivityItem[] = [];

    // Add pattern activities
    for (const pattern of recentPatterns) {
      const isNew = pattern.createdAt.getTime() === pattern.updatedAt.getTime();
      activities.push({
        id: `pattern-${pattern.id}`,
        type: isNew ? 'pattern_created' : 'pattern_updated',
        title: isNew ? 'Pattern Created' : 'Pattern Updated',
        description: `${pattern.name}${pattern.make ? ` - ${pattern.make}` : ''}${pattern.model ? ` ${pattern.model}` : ''}`,
        timestamp: pattern.updatedAt,
        metadata: { patternId: pattern.id },
      });
    }

    // Add generated complaint activities
    for (const complaint of recentGenerated) {
      activities.push({
        id: `complaint-${complaint.id}`,
        type: complaint.status === 'FINALIZED' ? 'complaint_finalized' : 'complaint_generated',
        title: complaint.status === 'FINALIZED' ? 'Complaint Finalized' : 'Complaint Generated',
        description: `${complaint.title}${complaint.pattern ? ` from ${complaint.pattern.name}` : ''}`,
        timestamp: complaint.createdAt,
        metadata: { complaintId: complaint.id },
      });
    }

    // Sort by timestamp descending
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Return limited results
    return NextResponse.json({
      activities: activities.slice(0, limit),
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
