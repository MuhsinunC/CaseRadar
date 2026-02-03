import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Get approximate row count for a table using PostgreSQL statistics.
 * This is nearly instant (<1ms) vs exact COUNT(*) which takes 1-2 seconds on 2M+ rows.
 *
 * Note: The estimate is updated after VACUUM/ANALYZE and may be slightly off
 * (usually within 1-2%) but is accurate enough for pagination totals.
 *
 * @param tableName - The table name (case-sensitive, e.g., "Complaint")
 * @returns Approximate row count
 */
export async function getApproximateCount(tableName: string): Promise<number> {
  const result = await prisma.$queryRaw<{ approximate_count: bigint }[]>`
    SELECT reltuples::bigint AS approximate_count
    FROM pg_class
    WHERE relname = ${tableName}
  `;

  return Number(result[0]?.approximate_count ?? 0);
}

/**
 * Get exact count with a fast path for known large tables.
 * Uses approximate count for Complaint table (2M+ rows) and exact count for others.
 */
export async function getSmartCount(
  model: 'Complaint' | 'Pattern' | 'GeneratedComplaint' | 'User' | 'Organization',
  where?: object
): Promise<number> {
  // For filtered queries, always use exact count (indexes help)
  if (where && Object.keys(where).length > 0) {
    switch (model) {
      case 'Complaint':
        return prisma.complaint.count({ where: where as Prisma.ComplaintWhereInput });
      case 'Pattern':
        return prisma.pattern.count({ where: where as Prisma.PatternWhereInput });
      case 'GeneratedComplaint':
        return prisma.generatedComplaint.count({ where: where as Prisma.GeneratedComplaintWhereInput });
      case 'User':
        return prisma.user.count({ where: where as Prisma.UserWhereInput });
      case 'Organization':
        return prisma.organization.count({ where: where as Prisma.OrganizationWhereInput });
    }
  }

  // For Complaint table without filters, use approximate count (instant)
  if (model === 'Complaint') {
    return getApproximateCount('Complaint');
  }

  // For smaller tables, exact count is fine
  switch (model) {
    case 'Pattern':
      return prisma.pattern.count();
    case 'GeneratedComplaint':
      return prisma.generatedComplaint.count();
    case 'User':
      return prisma.user.count();
    case 'Organization':
      return prisma.organization.count();
  }
}

export default prisma;
