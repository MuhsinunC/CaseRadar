/**
 * Patterns API
 * GET /api/patterns - List patterns for organization
 * POST /api/patterns - Create new pattern
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { checkPlanLimit } from '@/lib/billing';
import { TrendDirection } from '@prisma/client';
import { logDataModification } from '@/lib/security/audit-logging';

interface PatternWhereClause {
  organizationId: string;
  severityScore?: { gte: number };
  trendDirection?: TrendDirection;
  make?: { contains: string; mode: 'insensitive' };
}

// Demo patterns shown when no real patterns exist
const demoPatterns = [
  {
    id: 'demo-1',
    name: 'Ford F-150 Engine Stalling',
    description: 'Multiple reports of sudden engine stalling while driving at highway speeds. Pattern detected across 2019-2022 models with EcoBoost engines.',
    make: 'FORD',
    model: 'F-150',
    yearStart: 2019,
    yearEnd: 2022,
    component: 'ENGINE',
    severityScore: 8.5,
    trendDirection: 'INCREASING' as TrendDirection,
    complaintCount: 127,
    deathCount: 2,
    injuryCount: 15,
    crashCount: 34,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10'),
  },
  {
    id: 'demo-2',
    name: 'Tesla Model 3 Phantom Braking',
    description: 'Unexpected automatic emergency braking activations on highways without obstacles present. Concentrated in vehicles with vision-only autopilot.',
    make: 'TESLA',
    model: 'MODEL 3',
    yearStart: 2021,
    yearEnd: 2024,
    component: 'FORWARD COLLISION AVOIDANCE',
    severityScore: 7.2,
    trendDirection: 'STABLE' as TrendDirection,
    complaintCount: 89,
    deathCount: 0,
    injuryCount: 8,
    crashCount: 23,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-12'),
  },
  {
    id: 'demo-3',
    name: 'Toyota Camry Fuel Pump Failure',
    description: 'Fuel pump assemblies failing prematurely causing engine hesitation and stalling. Pattern matches known recall but incidents continue.',
    make: 'TOYOTA',
    model: 'CAMRY',
    yearStart: 2018,
    yearEnd: 2020,
    component: 'FUEL SYSTEM',
    severityScore: 6.8,
    trendDirection: 'DECREASING' as TrendDirection,
    complaintCount: 156,
    deathCount: 1,
    injuryCount: 12,
    crashCount: 28,
    createdAt: new Date('2023-11-15'),
    updatedAt: new Date('2024-01-08'),
  },
  {
    id: 'demo-4',
    name: 'Chevrolet Silverado Transmission Shudder',
    description: 'Harsh shifting and transmission shudder during acceleration, particularly between 1st and 2nd gear. 8-speed automatic transmission affected.',
    make: 'CHEVROLET',
    model: 'SILVERADO',
    yearStart: 2019,
    yearEnd: 2023,
    component: 'POWER TRAIN',
    severityScore: 5.4,
    trendDirection: 'INCREASING' as TrendDirection,
    complaintCount: 203,
    deathCount: 0,
    injuryCount: 3,
    crashCount: 11,
    createdAt: new Date('2023-12-01'),
    updatedAt: new Date('2024-01-11'),
  },
  {
    id: 'demo-5',
    name: 'Honda CR-V Oil Dilution',
    description: 'Engine oil becoming diluted with fuel, leading to engine damage. Cold weather operation exacerbates the issue in 1.5L turbo engines.',
    make: 'HONDA',
    model: 'CR-V',
    yearStart: 2017,
    yearEnd: 2019,
    component: 'ENGINE',
    severityScore: 6.1,
    trendDirection: 'DECREASING' as TrendDirection,
    complaintCount: 178,
    deathCount: 0,
    injuryCount: 2,
    crashCount: 8,
    createdAt: new Date('2023-10-20'),
    updatedAt: new Date('2024-01-05'),
  },
  {
    id: 'demo-6',
    name: 'Hyundai Kona EV Battery Fire Risk',
    description: 'Battery thermal runaway events resulting in vehicle fires. High-voltage battery cell manufacturing defects identified.',
    make: 'HYUNDAI',
    model: 'KONA ELECTRIC',
    yearStart: 2019,
    yearEnd: 2021,
    component: 'ELECTRICAL SYSTEM',
    severityScore: 9.2,
    trendDirection: 'DECREASING' as TrendDirection,
    complaintCount: 45,
    deathCount: 0,
    injuryCount: 6,
    crashCount: 15,
    createdAt: new Date('2023-09-10'),
    updatedAt: new Date('2024-01-03'),
  },
];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    // Return demo patterns if user is not fully set up
    if (!user?.organizationId) {
      const searchParams = request.nextUrl.searchParams;
      const minSeverity = searchParams.get('minSeverity');
      const search = searchParams.get('search')?.toLowerCase();

      let filteredPatterns = [...demoPatterns];

      if (minSeverity) {
        const min = parseFloat(minSeverity);
        filteredPatterns = filteredPatterns.filter(p => p.severityScore >= min);
      }

      if (search) {
        filteredPatterns = filteredPatterns.filter(p =>
          p.name.toLowerCase().includes(search) ||
          p.make.toLowerCase().includes(search) ||
          p.model.toLowerCase().includes(search)
        );
      }

      return NextResponse.json({
        patterns: filteredPatterns,
        pagination: {
          page: 1,
          limit: 20,
          total: filteredPatterns.length,
          totalPages: 1,
        },
        isDemo: true,
      });
    }

    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build where clause with tenant isolation
    const where: PatternWhereClause = {
      organizationId: user.organizationId,
    };

    // Severity filter
    const minSeverity = searchParams.get('minSeverity');
    if (minSeverity) {
      where.severityScore = { gte: parseFloat(minSeverity) };
    }

    // Trend filter
    const trend = searchParams.get('trend');
    if (trend) {
      where.trendDirection = trend as TrendDirection;
    }

    // Make filter
    const make = searchParams.get('make');
    if (make) {
      where.make = { contains: make, mode: 'insensitive' };
    }

    // Sorting - default by severityScore descending
    const sortBy = searchParams.get('sortBy') || 'severityScore';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const orderBy = { [sortBy]: sortOrder };

    const [patterns, total] = await Promise.all([
      prisma.pattern.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          _count: {
            select: { complaints: true },
          },
        },
      }),
      prisma.pattern.count({ where }),
    ]);

    // If no patterns exist in the database, return demo patterns
    if (patterns.length === 0 && page === 1) {
      const search = searchParams.get('search')?.toLowerCase();
      let filteredPatterns = [...demoPatterns];

      if (minSeverity) {
        const min = parseFloat(minSeverity);
        filteredPatterns = filteredPatterns.filter(p => p.severityScore >= min);
      }

      if (search) {
        filteredPatterns = filteredPatterns.filter(p =>
          p.name.toLowerCase().includes(search) ||
          p.make.toLowerCase().includes(search) ||
          p.model.toLowerCase().includes(search)
        );
      }

      return NextResponse.json({
        patterns: filteredPatterns,
        pagination: {
          page: 1,
          limit: 20,
          total: filteredPatterns.length,
          totalPages: 1,
        },
        isDemo: true,
      });
    }

    return NextResponse.json({
      patterns: patterns.map((p) => ({
        ...p,
        complaintCount: p._count.complaints,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patterns' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check plan limits
    const limitCheck = await checkPlanLimit({
      organizationId: user.organizationId,
      resource: 'patterns',
    });

    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Pattern limit reached (${limitCheck.current}/${limitCheck.limit})`,
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const pattern = await prisma.pattern.create({
      data: {
        name: body.name,
        description: body.description,
        make: body.make || 'Unknown',
        model: body.model,
        yearStart: body.yearStart,
        yearEnd: body.yearEnd,
        component: body.component || 'Unknown',
        severityScore: body.severityScore || 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        organizationId: user.organizationId,
        complaints: body.complaintIds
          ? {
              connect: body.complaintIds.map((id: string) => ({ id })),
            }
          : undefined,
      },
    });

    // Audit log: pattern created
    await logDataModification(
      user.id,
      user.organizationId,
      'PATTERN',
      pattern.id,
      'CREATE',
      { after: { name: pattern.name, make: pattern.make, model: pattern.model } }
    );

    return NextResponse.json({ pattern }, { status: 201 });
  } catch (error) {
    console.error('Error creating pattern:', error);
    return NextResponse.json(
      { error: 'Failed to create pattern' },
      { status: 500 }
    );
  }
}
