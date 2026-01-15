/**
 * Pattern Filter Options API
 * GET /api/patterns/options - Get unique makes, models, and components for filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Problems } from '@/lib/api/rfc7807-errors';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      return Problems.unauthorized('Authentication required to get filter options');
    }

    // Get unique makes, models, and components from patterns
    const [makes, models, components] = await Promise.all([
      prisma.pattern.groupBy({
        by: ['make'],
        where: {
          OR: [
            { organizationId: user.organizationId },
            { organizationId: null },
          ],
        },
        orderBy: { make: 'asc' },
      }),
      prisma.pattern.groupBy({
        by: ['model'],
        where: {
          OR: [
            { organizationId: user.organizationId },
            { organizationId: null },
          ],
          model: { not: null },
        },
        orderBy: { model: 'asc' },
      }),
      prisma.pattern.groupBy({
        by: ['component'],
        where: {
          OR: [
            { organizationId: user.organizationId },
            { organizationId: null },
          ],
        },
        orderBy: { component: 'asc' },
      }),
    ]);

    return NextResponse.json({
      makes: makes.map((m) => m.make).filter(Boolean),
      models: models.map((m) => m.model).filter(Boolean),
      components: components.map((c) => c.component).filter(Boolean),
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    return Problems.internalError('Failed to fetch filter options');
  }
}
