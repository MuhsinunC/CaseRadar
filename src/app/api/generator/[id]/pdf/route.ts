/**
 * PDF Download API
 * GET /api/generator/[id]/pdf - Download generated complaint as PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generatePDF } from '@/lib/pdf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

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

    // Rate limiting - PDF generation is CPU intensive (20 req/min)
    const rateLimitKey = `pdf:${user.organizationId}:${user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.pdf);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          type: 'https://api.caseradar.com/errors/rate-limited',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: `PDF export rate limit exceeded. Please wait ${Math.ceil((rateCheck.resetAt - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: rateCheck.headers,
        }
      );
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

    // Parse stored content (includes court and plaintiffInfo)
    const content = JSON.parse(complaint.content as string);

    // Generate PDF
    const pdfBuffer = await generatePDF({
      title: complaint.title,
      content,
      court: content.court,
      plaintiffInfo: content.plaintiffInfo,
      pattern: complaint.pattern,
    });

    // Return PDF with proper headers
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(pdfBuffer);
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${complaint.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
