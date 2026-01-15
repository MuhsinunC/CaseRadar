/**
 * Semantic Match API
 * POST /api/patterns/[id]/semantic-match - Trigger semantic matching for a pattern
 *
 * Computes semantic similarity between pattern complaints and recalls
 * Updates PatternRecall records with match scores
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Problems } from '@/lib/api/rfc7807-errors';
import { findSemanticRecallMatches } from '@/lib/patterns/semantic-matching';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required');
    }

    const { id: patternId } = await params;

    // Verify pattern exists and user has access
    const pattern = await prisma.pattern.findUnique({
      where: { id: patternId },
      select: {
        id: true,
        organizationId: true,
        name: true,
      },
    });

    if (!pattern) {
      return Problems.notFound(`Pattern ${patternId} not found`);
    }

    // Check access - must be same org or global pattern
    if (pattern.organizationId && pattern.organizationId !== user.organizationId) {
      return Problems.forbidden('Access denied to this pattern');
    }

    // Find semantic recall matches for this pattern
    const matches = await findSemanticRecallMatches(patternId);

    // Update or create PatternRecall records with semantic match scores
    const results = await Promise.all(
      matches.map(async (match) => {
        // Upsert PatternRecall with the semantic match score
        const patternRecall = await prisma.patternRecall.upsert({
          where: {
            patternId_recallId: {
              patternId,
              recallId: match.recallId,
            },
          },
          update: {
            matchScore: match.semanticScore,
            matchReason: `Semantic similarity: ${(match.semanticScore * 100).toFixed(1)}%`,
          },
          create: {
            patternId,
            recallId: match.recallId,
            matchScore: match.semanticScore,
            matchReason: `Semantic similarity: ${(match.semanticScore * 100).toFixed(1)}%`,
          },
        });
        return {
          recallId: match.recallId,
          nhtsaCampaignNumber: match.recall.nhtsaCampaignNumber,
          similarity: match.semanticScore,
          patternRecallId: patternRecall.id,
        };
      })
    );

    return NextResponse.json({
      patternId,
      patternName: pattern.name,
      matchesFound: results.length,
      matches: results,
      message: `Found ${results.length} recall matches for pattern "${pattern.name}"`,
    });
  } catch (error) {
    console.error('Error running semantic matching:', error);
    return Problems.internalError('Failed to run semantic matching');
  }
}

// GET endpoint to retrieve current semantic matches for a pattern
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required');
    }

    const { id: patternId } = await params;

    // Verify pattern exists and user has access
    const pattern = await prisma.pattern.findUnique({
      where: { id: patternId },
      include: {
        recalls: {
          include: {
            recall: {
              select: {
                id: true,
                nhtsaCampaignNumber: true,
                manufacturer: true,
                make: true,
                model: true,
                year: true,
                component: true,
                summary: true,
              },
            },
          },
          orderBy: {
            matchScore: 'desc',
          },
        },
      },
    });

    if (!pattern) {
      return Problems.notFound(`Pattern ${patternId} not found`);
    }

    // Check access
    if (pattern.organizationId && pattern.organizationId !== user.organizationId) {
      return Problems.forbidden('Access denied to this pattern');
    }

    // Calculate average semantic match
    const avgSemanticMatch = pattern.recalls.length > 0
      ? pattern.recalls.reduce((sum, r) => sum + r.matchScore, 0) / pattern.recalls.length
      : null;

    return NextResponse.json({
      patternId,
      patternName: pattern.name,
      totalMatches: pattern.recalls.length,
      avgSemanticMatch,
      matches: pattern.recalls.map((pr) => ({
        patternRecallId: pr.id,
        recallId: pr.recallId,
        matchScore: pr.matchScore,
        matchReason: pr.matchReason,
        recall: pr.recall,
      })),
    });
  } catch (error) {
    console.error('Error fetching semantic matches:', error);
    return Problems.internalError('Failed to fetch semantic matches');
  }
}
