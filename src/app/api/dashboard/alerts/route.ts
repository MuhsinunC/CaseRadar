/**
 * Dashboard Alerts API
 * GET /api/dashboard/alerts - Get system alerts and notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkPlanLimit } from '@/lib/billing';

interface Alert {
  id: string;
  type: 'warning' | 'info' | 'critical';
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const alerts: Alert[] = [];

    // Check plan limits
    const [patternsLimit, complaintsLimit] = await Promise.all([
      checkPlanLimit({
        organizationId: user.organizationId,
        resource: 'patterns',
      }),
      checkPlanLimit({
        organizationId: user.organizationId,
        resource: 'complaintsPerMonth',
      }),
    ]);

    // Pattern limit alert
    if (patternsLimit.limit && patternsLimit.current) {
      const usage = patternsLimit.current / patternsLimit.limit;
      if (usage >= 0.9) {
        alerts.push({
          id: 'pattern-limit-critical',
          type: 'critical',
          title: 'Pattern Limit Almost Reached',
          message: `You've used ${patternsLimit.current} of ${patternsLimit.limit} patterns (${Math.round(usage * 100)}%)`,
          action: {
            label: 'Upgrade Plan',
            href: '/settings/billing',
          },
        });
      } else if (usage >= 0.75) {
        alerts.push({
          id: 'pattern-limit-warning',
          type: 'warning',
          title: 'Pattern Limit Warning',
          message: `You've used ${patternsLimit.current} of ${patternsLimit.limit} patterns (${Math.round(usage * 100)}%)`,
          action: {
            label: 'View Usage',
            href: '/settings/billing',
          },
        });
      }
    }

    // Monthly complaint limit alert
    if (complaintsLimit.limit && complaintsLimit.current) {
      const usage = complaintsLimit.current / complaintsLimit.limit;
      if (usage >= 0.9) {
        alerts.push({
          id: 'complaint-limit-critical',
          type: 'critical',
          title: 'Monthly Complaint Limit Almost Reached',
          message: `You've generated ${complaintsLimit.current} of ${complaintsLimit.limit} complaints this month`,
          action: {
            label: 'Upgrade Plan',
            href: '/settings/billing',
          },
        });
      } else if (usage >= 0.75) {
        alerts.push({
          id: 'complaint-limit-warning',
          type: 'warning',
          title: 'Monthly Complaint Limit Warning',
          message: `You've generated ${complaintsLimit.current} of ${complaintsLimit.limit} complaints this month`,
        });
      }
    }

    // Check for high-severity patterns needing attention
    const highSeverityPatterns = await prisma.pattern.findMany({
      where: {
        organizationId: user.organizationId,
        severityScore: { gte: 8 },
        trendDirection: 'INCREASING',
      },
      select: {
        id: true,
        name: true,
        severityScore: true,
      },
      take: 5,
    });

    if (highSeverityPatterns.length > 0) {
      alerts.push({
        id: 'high-severity-patterns',
        type: 'warning',
        title: 'High-Severity Patterns Trending Up',
        message: `${highSeverityPatterns.length} pattern(s) with severity ≥8 are showing upward trends`,
        action: {
          label: 'View Patterns',
          href: '/patterns?minSeverity=8&trend=UP',
        },
      });
    }

    // Check for draft complaints needing attention
    const draftComplaints = await prisma.generatedComplaint.count({
      where: {
        organizationId: user.organizationId,
        status: 'DRAFT',
      },
    });

    if (draftComplaints > 5) {
      alerts.push({
        id: 'draft-complaints',
        type: 'info',
        title: 'Draft Complaints Pending',
        message: `You have ${draftComplaints} draft complaints awaiting review`,
        action: {
          label: 'Review Drafts',
          href: '/generator?status=DRAFT',
        },
      });
    }

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}
