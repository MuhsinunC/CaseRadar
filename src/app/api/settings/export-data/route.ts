/**
 * GDPR Data Export API
 * GET /api/settings/export-data
 *
 * Implements GDPR Article 20 - Data Portability
 * Allows users to export all their personal data in JSON or CSV format.
 *
 * Rate limited to 1 request per hour per user.
 * All exports are logged to the audit log.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Rate limit: 1 export per hour (3600000ms)
const RATE_LIMIT_MS = 60 * 60 * 1000;

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

    if (!user.organizationId) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail: 'Organization membership required',
        },
        { status: 403 }
      );
    }

    // 2. Check rate limit
    const recentExport = await prisma.dataExportLog.findFirst({
      where: {
        userId: user.id,
        createdAt: {
          gte: new Date(Date.now() - RATE_LIMIT_MS),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentExport) {
      const retryAfter = Math.ceil(
        (RATE_LIMIT_MS - (Date.now() - recentExport.createdAt.getTime())) / 1000
      );

      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/429',
          title: 'Too Many Requests',
          status: 429,
          detail: 'Data export rate limit exceeded. You can export data once per hour.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    // 3. Get format from query params
    const format = request.nextUrl.searchParams.get('format') || 'json';

    if (!['json', 'csv'].includes(format)) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Invalid format. Supported formats: json, csv',
        },
        { status: 400 }
      );
    }

    // 4. Gather all user data
    const [userData, orgData, complaints, auditLogs, legalHold] = await Promise.all([
      // User profile
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          clerkUserId: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Organization membership
      prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: {
          id: true,
          name: true,
          plan: true,
          createdAt: true,
        },
      }),
      // User's generated complaints (through organization)
      prisma.generatedComplaint.findMany({
        where: { organizationId: user.organizationId },
        select: {
          id: true,
          status: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Audit logs for user
      prisma.auditLog.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Limit to last 1000 entries
      }),
      // Check for legal holds
      prisma.legalHold.findFirst({
        where: {
          status: 'ACTIVE',
          organizationId: user.organizationId,
        },
        select: {
          id: true,
          matterName: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    // 5. Build export data
    const exportData: Record<string, unknown> = {
      user: userData
        ? {
            id: userData.id,
            email: userData.email,
            clerkUserId: userData.clerkUserId,
            role: userData.role,
            createdAt: userData.createdAt.toISOString(),
            updatedAt: userData.updatedAt?.toISOString(),
          }
        : null,
      organization: orgData
        ? {
            id: orgData.id,
            name: orgData.name,
            plan: orgData.plan,
            joinedAt: orgData.createdAt.toISOString(),
          }
        : null,
      generatedComplaints: complaints.map((c) => ({
        id: c.id,
        status: c.status,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt?.toISOString(),
      })),
      auditLog: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        format,
        version: '1.0',
        requestedBy: user.id,
      },
    };

    // 6. Add legal hold notice if applicable
    if (legalHold) {
      exportData.legalHoldNotice = {
        active: true,
        message:
          'Your data is currently subject to a legal hold. Data deletion requests may be restricted.',
        holdName: legalHold.matterName,
        holdCreatedAt: legalHold.createdAt.toISOString(),
      };
    }

    // 7. Log the export
    await Promise.all([
      prisma.dataExportLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          format,
          status: 'COMPLETED',
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: 'DATA_EXPORT',
          resource: 'USER_DATA',
          resourceId: user.id,
          metadata: {
            format,
            recordCount: {
              complaints: complaints.length,
              auditLogs: auditLogs.length,
            },
          },
        },
      }),
    ]);

    // 8. Return response based on format
    if (format === 'csv') {
      const csv = convertToCSV(exportData);
      const timestamp = new Date().toISOString().split('T')[0];

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="caseradar-data-export-${timestamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // JSON format
    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="caseradar-data-export-${new Date().toISOString().split('T')[0]}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Data export error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to export data. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * Convert export data to CSV format
 */
function convertToCSV(data: Record<string, unknown>): string {
  const rows: string[] = ['section,field,value'];

  // User data
  if (data.user && typeof data.user === 'object') {
    const user = data.user as Record<string, unknown>;
    Object.entries(user).forEach(([key, value]) => {
      rows.push(`user,${key},"${escapeCSV(String(value))}"`);
    });
  }

  // Organization data
  if (data.organization && typeof data.organization === 'object') {
    const org = data.organization as Record<string, unknown>;
    Object.entries(org).forEach(([key, value]) => {
      rows.push(`organization,${key},"${escapeCSV(String(value))}"`);
    });
  }

  // Generated complaints
  if (Array.isArray(data.generatedComplaints)) {
    data.generatedComplaints.forEach((complaint, index) => {
      Object.entries(complaint as Record<string, unknown>).forEach(([key, value]) => {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        rows.push(`complaint_${index},${key},"${escapeCSV(valueStr)}"`);
      });
    });
  }

  // Audit logs
  if (Array.isArray(data.auditLog)) {
    data.auditLog.forEach((log, index) => {
      Object.entries(log as Record<string, unknown>).forEach(([key, value]) => {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        rows.push(`auditLog_${index},${key},"${escapeCSV(valueStr)}"`);
      });
    });
  }

  // Export metadata
  if (data.exportMetadata && typeof data.exportMetadata === 'object') {
    const meta = data.exportMetadata as Record<string, unknown>;
    Object.entries(meta).forEach(([key, value]) => {
      rows.push(`exportMetadata,${key},"${escapeCSV(String(value))}"`);
    });
  }

  return rows.join('\n');
}

/**
 * Escape CSV special characters
 */
function escapeCSV(value: string): string {
  return value.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
}
