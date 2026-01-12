import { prisma } from '@/lib/db';
import { Complaint, Prisma } from '@prisma/client';

export type CreateComplaintInput = {
  nhtsaId: string;
  odiNumber: string;
  manufacturer: string;
  make: string;
  model: string;
  year: number;
  component: string;
  description: string;
  crash?: boolean;
  fire?: boolean;
  injuries?: number;
  deaths?: number;
  failDate?: Date;
  dateAdded: Date;
};

export type ComplaintFilters = {
  make?: string;
  model?: string;
  year?: number;
  yearStart?: number;
  yearEnd?: number;
  component?: string;
  hasCrash?: boolean;
  hasFire?: boolean;
  hasInjuries?: boolean;
  hasDeaths?: boolean;
  dateAddedStart?: Date;
  dateAddedEnd?: Date;
  search?: string;
};

export type PaginationOptions = {
  page?: number;
  pageSize?: number;
  orderBy?: 'dateAdded' | 'year' | 'createdAt';
  orderDir?: 'asc' | 'desc';
};

export const complaintRepository = {
  /**
   * Create a new complaint
   */
  async create(data: CreateComplaintInput): Promise<Complaint> {
    return prisma.complaint.create({
      data: {
        nhtsaId: data.nhtsaId,
        odiNumber: data.odiNumber,
        manufacturer: data.manufacturer,
        make: data.make,
        model: data.model,
        year: data.year,
        component: data.component,
        description: data.description,
        crash: data.crash ?? false,
        fire: data.fire ?? false,
        injuries: data.injuries ?? 0,
        deaths: data.deaths ?? 0,
        failDate: data.failDate,
        dateAdded: data.dateAdded,
      },
    });
  },

  /**
   * Create multiple complaints (for batch import)
   */
  async createMany(data: CreateComplaintInput[]): Promise<{ count: number }> {
    return prisma.complaint.createMany({
      data: data.map((d) => ({
        nhtsaId: d.nhtsaId,
        odiNumber: d.odiNumber,
        manufacturer: d.manufacturer,
        make: d.make,
        model: d.model,
        year: d.year,
        component: d.component,
        description: d.description,
        crash: d.crash ?? false,
        fire: d.fire ?? false,
        injuries: d.injuries ?? 0,
        deaths: d.deaths ?? 0,
        failDate: d.failDate,
        dateAdded: d.dateAdded,
      })),
      skipDuplicates: true,
    });
  },

  /**
   * Find complaint by ID
   */
  async findById(id: string): Promise<Complaint | null> {
    return prisma.complaint.findUnique({
      where: { id },
    });
  },

  /**
   * Find complaint by NHTSA ID
   */
  async findByNhtsaId(nhtsaId: string): Promise<Complaint | null> {
    return prisma.complaint.findUnique({
      where: { nhtsaId },
    });
  },

  /**
   * Find complaints with filters and pagination
   */
  async findMany(
    filters: ComplaintFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<{ complaints: Complaint[]; total: number }> {
    const { page = 1, pageSize = 20, orderBy = 'dateAdded', orderDir = 'desc' } = pagination;

    const where: Prisma.ComplaintWhereInput = {};

    if (filters.make) {
      where.make = { equals: filters.make, mode: 'insensitive' };
    }
    if (filters.model) {
      where.model = { equals: filters.model, mode: 'insensitive' };
    }
    if (filters.year) {
      where.year = filters.year;
    }
    if (filters.yearStart || filters.yearEnd) {
      where.year = {
        ...(filters.yearStart && { gte: filters.yearStart }),
        ...(filters.yearEnd && { lte: filters.yearEnd }),
      };
    }
    if (filters.component) {
      where.component = { contains: filters.component, mode: 'insensitive' };
    }
    if (filters.hasCrash !== undefined) {
      where.crash = filters.hasCrash;
    }
    if (filters.hasFire !== undefined) {
      where.fire = filters.hasFire;
    }
    if (filters.hasInjuries !== undefined) {
      where.injuries = filters.hasInjuries ? { gt: 0 } : { equals: 0 };
    }
    if (filters.hasDeaths !== undefined) {
      where.deaths = filters.hasDeaths ? { gt: 0 } : { equals: 0 };
    }
    if (filters.dateAddedStart || filters.dateAddedEnd) {
      where.dateAdded = {
        ...(filters.dateAddedStart && { gte: filters.dateAddedStart }),
        ...(filters.dateAddedEnd && { lte: filters.dateAddedEnd }),
      };
    }
    if (filters.search) {
      where.description = { contains: filters.search, mode: 'insensitive' };
    }

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { [orderBy]: orderDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.complaint.count({ where }),
    ]);

    return { complaints, total };
  },

  /**
   * Get unique makes
   */
  async getUniqueMakes(): Promise<string[]> {
    const makes = await prisma.complaint.findMany({
      select: { make: true },
      distinct: ['make'],
      orderBy: { make: 'asc' },
    });
    return makes.map((m) => m.make);
  },

  /**
   * Get unique models for a make
   */
  async getModelsForMake(make: string): Promise<string[]> {
    const models = await prisma.complaint.findMany({
      where: { make: { equals: make, mode: 'insensitive' } },
      select: { model: true },
      distinct: ['model'],
      orderBy: { model: 'asc' },
    });
    return models.map((m) => m.model);
  },

  /**
   * Get complaints with severity indicators
   */
  async findWithSeverity(filters: ComplaintFilters = {}, limit: number = 100) {
    const where: Prisma.ComplaintWhereInput = {
      OR: [{ crash: true }, { fire: true }, { injuries: { gt: 0 } }, { deaths: { gt: 0 } }],
    };

    if (filters.make) {
      where.make = { equals: filters.make, mode: 'insensitive' };
    }
    if (filters.model) {
      where.model = { equals: filters.model, mode: 'insensitive' };
    }

    return prisma.complaint.findMany({
      where,
      orderBy: [{ deaths: 'desc' }, { injuries: 'desc' }, { crash: 'desc' }],
      take: limit,
    });
  },

  /**
   * Update complaint cluster assignment
   */
  async updateCluster(id: string, clusterId: string | null): Promise<Complaint> {
    return prisma.complaint.update({
      where: { id },
      data: { clusterId },
    });
  },

  /**
   * Get complaint statistics for a make/model/year
   */
  async getStatistics(make: string, model?: string, year?: number) {
    const where: Prisma.ComplaintWhereInput = {
      make: { equals: make, mode: 'insensitive' },
    };
    if (model) {
      where.model = { equals: model, mode: 'insensitive' };
    }
    if (year) {
      where.year = year;
    }

    const [total, crashes, fires, injuries, deaths] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.count({ where: { ...where, crash: true } }),
      prisma.complaint.count({ where: { ...where, fire: true } }),
      prisma.complaint.aggregate({ where, _sum: { injuries: true } }),
      prisma.complaint.aggregate({ where, _sum: { deaths: true } }),
    ]);

    return {
      total,
      crashes,
      fires,
      injuries: injuries._sum.injuries ?? 0,
      deaths: deaths._sum.deaths ?? 0,
    };
  },

  /**
   * Get most recent complaint date
   */
  async getLatestComplaintDate(): Promise<Date | null> {
    const result = await prisma.complaint.findFirst({
      orderBy: { dateAdded: 'desc' },
      select: { dateAdded: true },
    });
    return result?.dateAdded ?? null;
  },

  /**
   * Count complaints added since a specific date
   */
  async countSince(date: Date): Promise<number> {
    return prisma.complaint.count({
      where: { dateAdded: { gte: date } },
    });
  },
};
