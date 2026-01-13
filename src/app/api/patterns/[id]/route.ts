/**
 * Pattern by ID API
 * GET /api/patterns/[id] - Get pattern details
 * PATCH /api/patterns/[id] - Update pattern
 * DELETE /api/patterns/[id] - Delete pattern
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { TrendDirection } from '@prisma/client';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// Demo patterns for when database is empty
const demoPatterns: Record<string, {
  id: string;
  name: string;
  description: string;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  component: string;
  severityScore: number;
  trendDirection: TrendDirection;
  complaintCount: number;
  deathCount: number;
  injuryCount: number;
  crashCount: number;
  createdAt: Date;
  updatedAt: Date;
}> = {
  'demo-1': {
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
  'demo-2': {
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
  'demo-3': {
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
  'demo-4': {
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
  'demo-5': {
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
  'demo-6': {
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
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Handle demo patterns
    if (id.startsWith('demo-')) {
      const demoPattern = demoPatterns[id];
      if (demoPattern) {
        return NextResponse.json({ pattern: demoPattern, isDemo: true });
      }
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pattern = await prisma.pattern.findUnique({
      where: { id },
      include: {
        complaints: {
          select: {
            id: true,
            description: true,
            make: true,
            model: true,
            year: true,
          },
          take: 100,
        },
      },
    });

    if (!pattern) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    // Tenant isolation check
    if (pattern.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({ pattern });
  } catch (error) {
    console.error('Error fetching pattern:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pattern' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - need ANALYST or ADMIN
    if (user.role === 'VIEWER') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check pattern exists and belongs to org
    const existing = await prisma.pattern.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    if (existing.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const pattern = await prisma.pattern.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        make: body.make,
        model: body.model,
        yearStart: body.yearStart,
        yearEnd: body.yearEnd,
        severityScore: body.severityScore,
      },
    });

    return NextResponse.json({ pattern });
  } catch (error) {
    console.error('Error updating pattern:', error);
    return NextResponse.json(
      { error: 'Failed to update pattern' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - need ADMIN
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check pattern exists and belongs to org
    const existing = await prisma.pattern.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Pattern not found' },
        { status: 404 }
      );
    }

    if (existing.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    await prisma.pattern.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting pattern:', error);
    return NextResponse.json(
      { error: 'Failed to delete pattern' },
      { status: 500 }
    );
  }
}
