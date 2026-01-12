import { prisma } from '@/lib/db';
import { Pattern, Prisma } from '@prisma/client';

export type CreatePatternInput = {
  name: string;
  description?: string;
  make: string;
  model?: string;
  yearStart?: number;
  yearEnd?: number;
  component: string;
  complaintCount?: number;
  crashCount?: number;
  fireCount?: number;
  injuryCount?: number;
  deathCount?: number;
  severityScore?: number;
  trendScore?: number;
  firstSeen: Date;
  lastUpdated: Date;
  isActive?: boolean;
  organizationId?: string;
};

export type UpdatePatternInput = Partial<Omit<CreatePatternInput, 'firstSeen'>>;

export type PatternFilters = {
  make?: string;
  model?: string;
  component?: string;
  isActive?: boolean;
  organizationId?: string | null;
  minSeverityScore?: number;
  minTrendScore?: number;
};

export type PatternSortOptions = {
  orderBy?: 'severityScore' | 'trendScore' | 'complaintCount' | 'createdAt';
  orderDir?: 'asc' | 'desc';
};

export const patternRepository = {
  /**
   * Create a new pattern
   */
  async create(data: CreatePatternInput): Promise<Pattern> {
    return prisma.pattern.create({
      data: {
        name: data.name,
        description: data.description,
        make: data.make,
        model: data.model,
        yearStart: data.yearStart,
        yearEnd: data.yearEnd,
        component: data.component,
        complaintCount: data.complaintCount ?? 0,
        crashCount: data.crashCount ?? 0,
        fireCount: data.fireCount ?? 0,
        injuryCount: data.injuryCount ?? 0,
        deathCount: data.deathCount ?? 0,
        severityScore: data.severityScore ?? 0,
        trendScore: data.trendScore ?? 0,
        firstSeen: data.firstSeen,
        lastUpdated: data.lastUpdated,
        isActive: data.isActive ?? true,
        organizationId: data.organizationId,
      },
    });
  },

  /**
   * Find pattern by ID
   */
  async findById(id: string): Promise<Pattern | null> {
    return prisma.pattern.findUnique({
      where: { id },
    });
  },

  /**
   * Find patterns with filters
   */
  async findMany(
    filters: PatternFilters = {},
    sort: PatternSortOptions = {},
    limit?: number
  ): Promise<Pattern[]> {
    const { orderBy = 'severityScore', orderDir = 'desc' } = sort;

    const where: Prisma.PatternWhereInput = {};

    if (filters.make) {
      where.make = { equals: filters.make, mode: 'insensitive' };
    }
    if (filters.model) {
      where.model = { equals: filters.model, mode: 'insensitive' };
    }
    if (filters.component) {
      where.component = { contains: filters.component, mode: 'insensitive' };
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.organizationId !== undefined) {
      where.organizationId = filters.organizationId;
    }
    if (filters.minSeverityScore !== undefined) {
      where.severityScore = { gte: filters.minSeverityScore };
    }
    if (filters.minTrendScore !== undefined) {
      where.trendScore = { gte: filters.minTrendScore };
    }

    return prisma.pattern.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      take: limit,
    });
  },

  /**
   * Update a pattern
   */
  async update(id: string, data: UpdatePatternInput): Promise<Pattern> {
    return prisma.pattern.update({
      where: { id },
      data: {
        ...data,
        lastUpdated: new Date(),
      },
    });
  },

  /**
   * Delete a pattern
   */
  async delete(id: string): Promise<Pattern> {
    return prisma.pattern.delete({
      where: { id },
    });
  },

  /**
   * Get pattern with associated complaints
   */
  async findWithComplaints(id: string, limit: number = 50) {
    return prisma.pattern.findUnique({
      where: { id },
      include: {
        complaints: {
          take: limit,
          orderBy: { dateAdded: 'desc' },
        },
      },
    });
  },

  /**
   * Get top patterns by severity
   */
  async getTopBySeverity(limit: number = 10, organizationId?: string | null) {
    return prisma.pattern.findMany({
      where: {
        isActive: true,
        ...(organizationId !== undefined && { organizationId }),
      },
      orderBy: { severityScore: 'desc' },
      take: limit,
    });
  },

  /**
   * Get trending patterns (by trend score)
   */
  async getTrending(limit: number = 10, organizationId?: string | null) {
    return prisma.pattern.findMany({
      where: {
        isActive: true,
        ...(organizationId !== undefined && { organizationId }),
      },
      orderBy: { trendScore: 'desc' },
      take: limit,
    });
  },

  /**
   * Update pattern statistics from its complaints
   */
  async recalculateStats(id: string): Promise<Pattern> {
    const stats = await prisma.complaint.aggregate({
      where: { clusterId: id },
      _count: true,
      _sum: {
        injuries: true,
        deaths: true,
      },
    });

    const crashCount = await prisma.complaint.count({
      where: { clusterId: id, crash: true },
    });

    const fireCount = await prisma.complaint.count({
      where: { clusterId: id, fire: true },
    });

    return prisma.pattern.update({
      where: { id },
      data: {
        complaintCount: stats._count,
        crashCount,
        fireCount,
        injuryCount: stats._sum.injuries ?? 0,
        deathCount: stats._sum.deaths ?? 0,
        lastUpdated: new Date(),
      },
    });
  },

  /**
   * Mark pattern as inactive
   */
  async deactivate(id: string): Promise<Pattern> {
    return prisma.pattern.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Get global patterns (not organization-specific)
   */
  async getGlobalPatterns(limit: number = 20): Promise<Pattern[]> {
    return prisma.pattern.findMany({
      where: {
        organizationId: null,
        isActive: true,
      },
      orderBy: { severityScore: 'desc' },
      take: limit,
    });
  },
};
