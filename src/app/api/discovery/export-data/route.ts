/**
 * e-Discovery Export API
 * GET /api/discovery/export-data
 *
 * Exports organizational data for legal discovery purposes.
 * Requires active legal hold and ADMIN role.
 * Includes chain of custody hash for data integrity verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

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

    // 2. Check ADMIN role
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/403',
          title: 'Forbidden',
          status: 403,
          detail: 'e-Discovery exports require ADMIN privileges',
        },
        { status: 403 }
      );
    }

    // 3. Validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const matterId = searchParams.get('matterId');
    const format = searchParams.get('format') || 'json';
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const includePatterns = searchParams.get('includePatterns') === 'true';

    if (!matterId) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'matterId parameter is required',
        },
        { status: 400 }
      );
    }

    // Validate date formats
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (startDateStr) {
      startDate = new Date(startDateStr);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json(
          {
            type: 'https://httpstatuses.com/400',
            title: 'Bad Request',
            status: 400,
            detail: 'Invalid startDate format. Use ISO date format (YYYY-MM-DD)',
          },
          { status: 400 }
        );
      }
    }

    if (endDateStr) {
      endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            type: 'https://httpstatuses.com/400',
            title: 'Bad Request',
            status: 400,
            detail: 'Invalid endDate format. Use ISO date format (YYYY-MM-DD)',
          },
          { status: 400 }
        );
      }
      // Set to end of day
      endDate.setHours(23, 59, 59, 999);
    }

    // Validate format
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

    // 4. Verify active legal hold exists for matter
    const legalHold = await prisma.legalHold.findFirst({
      where: {
        matterName: matterId,
        status: 'ACTIVE',
        organizationId: user.organizationId!,
      },
    });

    if (!legalHold) {
      return NextResponse.json(
        {
          type: 'https://httpstatuses.com/404',
          title: 'Not Found',
          status: 404,
          detail: `No active legal hold found for matter: ${matterId}`,
        },
        { status: 404 }
      );
    }

    // 5. Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    // 6. Query data within scope
    const [complaints, patterns, auditLogs] = await Promise.all([
      // Get generated complaints under legal hold
      prisma.generatedComplaint.findMany({
        where: {
          organizationId: user.organizationId!,
          legalHold: true,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
        select: {
          id: true,
          title: true,
          status: true,
          content: true,
          version: true,
          contentHash: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Get related patterns if requested
      includePatterns
        ? prisma.pattern.findMany({
            where: {
              organizationId: user.organizationId,
            },
            select: {
              id: true,
              name: true,
              description: true,
              make: true,
              model: true,
              component: true,
              severityScore: true,
              complaintCount: true,
              firstSeen: true,
              lastUpdated: true,
            },
            orderBy: { severityScore: 'desc' },
          })
        : [],
      // Get audit trail for chain of custody
      prisma.auditLog.findMany({
        where: {
          organizationId: user.organizationId!,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          userId: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10000, // Limit to prevent massive exports
      }),
    ]);

    // 7. Format complaint and audit data
    const formattedComplaints = complaints.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      content: c.content,
      version: c.version,
      contentHash: c.contentHash,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt?.toISOString(),
      createdBy: c.createdBy,
    }));

    const formattedPatterns = patterns.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      make: p.make,
      model: p.model,
      component: p.component,
      severityScore: p.severityScore,
      complaintCount: p.complaintCount,
      firstSeen: p.firstSeen.toISOString(),
      lastUpdated: p.lastUpdated.toISOString(),
    }));

    const formattedAuditLogs = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      userId: log.userId,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    }));

    // 8. Generate chain of custody hash
    const contentToHash = JSON.stringify({
      generatedComplaints: formattedComplaints,
      patterns: formattedPatterns,
      auditTrail: formattedAuditLogs,
    });

    const exportHash = crypto.createHash('sha256').update(contentToHash).digest('hex');

    const exportedAt = new Date().toISOString();

    // 9. Build response data
    const exportData = {
      legalHold: {
        id: legalHold.id,
        matterName: legalHold.matterName,
        status: legalHold.status,
      },
      generatedComplaints: formattedComplaints,
      patterns: formattedPatterns,
      auditTrail: formattedAuditLogs,
      chainOfCustody: {
        exportHash,
        hashAlgorithm: 'SHA-256',
        exportedAt,
        exportedBy: user.id,
        recordCount: formattedComplaints.length + formattedPatterns.length,
      },
      exportMetadata: {
        matterId,
        format,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        includePatterns,
        organizationId: user.organizationId,
      },
    };

    // 10. Log to audit trail
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'DISCOVERY_EXPORT',
        resource: 'LEGAL_HOLD',
        resourceId: legalHold.id,
        metadata: {
          matterId,
          format,
          recordCount: formattedComplaints.length,
          patternCount: formattedPatterns.length,
          exportHash,
          dateRange: {
            start: startDate?.toISOString(),
            end: endDate?.toISOString(),
          },
        },
      },
    });

    // 11. Return response based on format
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `discovery-export-${matterId}-${timestamp}`;

    if (format === 'csv') {
      const csv = convertToDiscoveryCSV(exportData);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'Cache-Control': 'no-store',
          'X-Export-Hash': exportHash,
        },
      });
    }

    // JSON format
    return NextResponse.json(exportData, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}.json"`,
        'Cache-Control': 'no-store',
        'X-Export-Hash': exportHash,
      },
    });
  } catch (error) {
    console.error('e-Discovery export error:', error);

    return NextResponse.json(
      {
        type: 'https://httpstatuses.com/500',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to export discovery data. Please try again later.',
      },
      { status: 500 }
    );
  }
}

/**
 * Convert export data to CSV format for e-Discovery
 */
function convertToDiscoveryCSV(data: Record<string, unknown>): string {
  const rows: string[] = [];

  // Header
  rows.push('type,id,title,status,created_at,created_by,content_hash');

  // Complaints
  const complaints = data.generatedComplaints as Array<Record<string, unknown>>;
  complaints.forEach((c) => {
    rows.push(
      `complaint,${escapeCSV(String(c.id))},${escapeCSV(String(c.title))},${escapeCSV(String(c.status))},${escapeCSV(String(c.createdAt))},${escapeCSV(String(c.createdBy))},${escapeCSV(String(c.contentHash || ''))}`
    );
  });

  // Patterns
  const patterns = data.patterns as Array<Record<string, unknown>>;
  patterns.forEach((p) => {
    rows.push(
      `pattern,${escapeCSV(String(p.id))},${escapeCSV(String(p.name))},-,${escapeCSV(String(p.firstSeen))},-,-`
    );
  });

  // Chain of custody footer
  const coc = data.chainOfCustody as Record<string, unknown>;
  rows.push('');
  rows.push('# Chain of Custody');
  rows.push(`export_hash,${coc.exportHash}`);
  rows.push(`hash_algorithm,${coc.hashAlgorithm}`);
  rows.push(`exported_at,${coc.exportedAt}`);
  rows.push(`exported_by,${coc.exportedBy}`);
  rows.push(`record_count,${coc.recordCount}`);

  return rows.join('\n');
}

/**
 * Escape CSV special characters
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
