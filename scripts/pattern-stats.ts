/**
 * Pattern Detection Results Statistics
 */

import { prisma } from '../src/lib/db';

async function stats() {
  // Pattern stats
  const patternCount = await prisma.pattern.count();

  // Complaint stats with embeddings (using raw SQL for pgvector)
  const embeddingStats = await prisma.$queryRaw<[{ with_embeddings: bigint }]>`
    SELECT COUNT(*) as with_embeddings FROM "Complaint" WHERE embedding IS NOT NULL
  `;

  // Complaints assigned to patterns
  const assignedComplaints = await prisma.complaint.count({
    where: { clusterId: { not: null } },
  });

  // Pattern severity distribution
  const severityDist = await prisma.pattern.aggregate({
    _sum: {
      severityScore: true,
      complaintCount: true,
      deathCount: true,
      injuryCount: true,
      crashCount: true,
      fireCount: true,
    },
    _avg: { severityScore: true, complaintCount: true },
    _max: { severityScore: true, complaintCount: true },
  });

  // Top 10 patterns by severity
  const topPatterns = await prisma.pattern.findMany({
    orderBy: { severityScore: 'desc' },
    take: 10,
    select: {
      name: true,
      make: true,
      model: true,
      component: true,
      severityScore: true,
      complaintCount: true,
      deathCount: true,
      injuryCount: true,
    },
  });

  // Pattern distribution by component
  const componentDist = await prisma.pattern.groupBy({
    by: ['component'],
    _count: { id: true },
    _sum: { severityScore: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  });

  console.log('=== PATTERN DETECTION RESULTS ===');
  console.log('');
  console.log('Total Patterns:', patternCount);
  console.log(
    'Total Complaints with Embeddings:',
    Number(embeddingStats[0].with_embeddings)
  );
  console.log('Complaints Assigned to Patterns:', assignedComplaints);
  console.log('');
  console.log('=== AGGREGATE METRICS ===');
  console.log('Total Complaints in Patterns:', severityDist._sum.complaintCount);
  console.log('Total Deaths:', severityDist._sum.deathCount);
  console.log('Total Injuries:', severityDist._sum.injuryCount);
  console.log('Total Crashes:', severityDist._sum.crashCount);
  console.log('Total Fires:', severityDist._sum.fireCount);
  console.log('Avg Severity Score:', Math.round(severityDist._avg.severityScore || 0));
  console.log(
    'Avg Complaints per Pattern:',
    Math.round(severityDist._avg.complaintCount || 0)
  );
  console.log('Max Severity Score:', severityDist._max.severityScore);
  console.log('Max Complaints in Pattern:', severityDist._max.complaintCount);
  console.log('');
  console.log('=== TOP 10 PATTERNS BY SEVERITY ===');
  for (const p of topPatterns) {
    console.log(
      `  [${p.severityScore}] ${p.make} ${p.model || ''} - ${p.component}: ${p.complaintCount} complaints (${p.deathCount}D/${p.injuryCount}I)`
    );
  }
  console.log('');
  console.log('=== PATTERN DISTRIBUTION BY COMPONENT (Top 15) ===');
  for (const c of componentDist) {
    console.log(
      `  ${c.component}: ${c._count.id} patterns (total severity: ${c._sum.severityScore})`
    );
  }

  await prisma.$disconnect();
}

stats().catch(console.error);
