import { prisma } from '@/lib/db';
import { User, Role } from '@prisma/client';

export type CreateUserInput = {
  clerkUserId: string;
  email: string;
  organizationId: string;
  role?: Role;
};

export type UpdateUserInput = Partial<Pick<CreateUserInput, 'email' | 'role'>>;

export const userRepository = {
  /**
   * Create a new user
   */
  async create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        clerkUserId: data.clerkUserId,
        email: data.email,
        organizationId: data.organizationId,
        role: data.role ?? Role.VIEWER,
      },
    });
  },

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Find user by Clerk user ID
   */
  async findByClerkUserId(clerkUserId: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { clerkUserId },
    });
  },

  /**
   * Find users by organization ID
   */
  async findByOrganizationId(organizationId: string): Promise<User[]> {
    return prisma.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Update a user
   */
  async update(id: string, data: UpdateUserInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  /**
   * Delete a user
   */
  async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  },

  /**
   * Find user with organization
   */
  async findWithOrganization(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
      },
    });
  },

  /**
   * Count users by organization
   */
  async countByOrganization(organizationId: string): Promise<number> {
    return prisma.user.count({
      where: { organizationId },
    });
  },

  /**
   * Check if user has specific role
   */
  async hasRole(id: string, role: Role): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    return user?.role === role;
  },

  /**
   * Update user role
   */
  async updateRole(id: string, role: Role): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { role },
    });
  },
};
