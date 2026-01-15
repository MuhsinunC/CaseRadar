/**
 * Leads API
 * GET /api/leads - Get patterns ranked by lead potential
 *
 * Leads are patterns that:
 * - Have no matching recalls (high priority)
 * - Have low semantic match with existing recalls
 * - Have high complaint count and severity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Problems } from '@/lib/api/rfc7807-errors';
import { calculateLeadScore, rankLeads, PatternInput } from '@/lib/patterns/lead-scoring';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to view leads');
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    // Filters
    const minLeadScore = parseFloat(searchParams.get('minLeadScore') || '30');
    const minComplaintCount = parseInt(searchParams.get('minComplaintCount') || '10');
    const maxSemanticMatch = parseFloat(searchParams.get('maxSemanticMatch') || '0.7');

    // Fetch patterns with their recall match scores
    const patterns = await prisma.pattern.findMany({
      where: {
        OR: [
          { organizationId: user.organizationId },
          { organizationId: null }, // Global patterns
        ],
        complaintCount: { gte: minComplaintCount },
      },
      include: {
        recalls: {
          select: {
            matchScore: true,
          },
        },
        _count: {
          select: {
            complaints: true,
            recalls: true,
          },
        },
      },
      orderBy: { severityScore: 'desc' },
      take: 200, // Fetch more than limit since we'll filter
    });

    // Transform patterns for lead scoring
    const patternsWithScores: PatternInput[] = patterns.map((p) => {
      const avgSemanticMatch = p.recalls.length > 0
        ? p.recalls.reduce((sum, r) => sum + r.matchScore, 0) / p.recalls.length
        : -1; // -1 indicates no recalls linked

      return {
        id: p.id,
        name: p.name,
        complaintCount: p.complaintCount,
        severityScore: p.severityScore,
        avgSemanticMatch,
        trendScore: p.trendScore,
      };
    });

    // Rank leads using the lead scoring algorithm (get all first for total count)
    const allRankedLeads = rankLeads(patternsWithScores, {
      minScore: minLeadScore,
      maxSemanticMatch,
      minComplaintCount,
      top: 1000, // Get all matching leads
    });

    // Apply pagination
    const totalCount = allRankedLeads.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const rankedLeads = allRankedLeads.slice(offset, offset + pageSize);

    // Enrich with full pattern data
    const enrichedLeads = rankedLeads.map((lead) => {
      const fullPattern = patterns.find((p) => p.id === lead.pattern.id);
      return {
        ...lead,
        pattern: {
          id: fullPattern!.id,
          name: fullPattern!.name,
          description: fullPattern!.description,
          make: fullPattern!.make,
          model: fullPattern!.model,
          yearStart: fullPattern!.yearStart,
          yearEnd: fullPattern!.yearEnd,
          component: fullPattern!.component,
          complaintCount: fullPattern!.complaintCount,
          severityScore: fullPattern!.severityScore,
          trendDirection: fullPattern!.trendDirection,
          crashCount: fullPattern!.crashCount,
          fireCount: fullPattern!.fireCount,
          injuryCount: fullPattern!.injuryCount,
          deathCount: fullPattern!.deathCount,
          recallCount: fullPattern!._count.recalls,
          hasRecall: fullPattern!._count.recalls > 0,
          avgSemanticMatch: lead.pattern.avgSemanticMatch === -1 ? null : lead.pattern.avgSemanticMatch,
        },
      };
    });

    return NextResponse.json({
      leads: enrichedLeads,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        minLeadScore,
        minComplaintCount,
        maxSemanticMatch,
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return Problems.internalError('Failed to fetch leads');
  }
}
