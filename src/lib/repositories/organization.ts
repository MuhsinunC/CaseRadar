import { prisma } from '@/lib/db';
import { Organization, Plan, Prisma } from '@prisma/client';

export type CreateOrganizationInput = {
  name: string;
  clerkOrgId: string;
  plan?: Plan;
};

export type UpdateOrganizationInput = Partial<Omit<CreateOrganizationInput, 'clerkOrgId'>>;

export const organizationRepository = {
  /**
   * Create a new organization
   */
  async create(data: CreateOrganizationInput): Promise<Organization> {
    return prisma.organization.create({
      data: {
        name: data.name,
        clerkOrgId: data.clerkOrgId,
        plan: data.plan ?? Plan.FREE,
      },
    });
  },

  /**
   * Find organization by ID
   */
  async findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id },
    });
  },

  /**
   * Find organization by Clerk organization ID
   */
  async findByClerkOrgId(clerkOrgId: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { clerkOrgId },
    });
  },

  /**
   * Update an organization
   */
  async update(id: string, data: UpdateOrganizationInput): Promise<Organization> {
    return prisma.organization.update({
      where: { id },
      data,
    });
  },

  /**
   * Delete an organization (cascades to users, generated complaints, etc.)
   */
  async delete(id: string): Promise<Organization> {
    return prisma.organization.delete({
      where: { id },
    });
  },

  /**
   * Get organization with subscription
   */
  async findWithSubscription(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: true,
      },
    });
  },

  /**
   * Get organization with all users
   */
  async findWithUsers(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });
  },

  /**
   * Count organizations by plan
   */
  async countByPlan(plan: Plan): Promise<number> {
    return prisma.organization.count({
      where: { plan },
    });
  },
};
