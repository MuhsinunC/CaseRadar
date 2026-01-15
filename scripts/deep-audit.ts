/**
 * Deep Audit Script
 * Look for potential issues the basic audit might miss
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deepAudit() {
  console.log('=== DEEP AUDIT - POTENTIAL ISSUES ===\n');

  // 1. Check the pattern with 0 severity score
  console.log('## 1. Patterns with 0 severity score');
  const zeroSeverity = await prisma.pattern.findMany({
    where: { severityScore: 0 },
    select: { name: true, make: true, model: true, component: true, complaintCount: true },
  });
  console.log('Count:', zeroSeverity.length);
  zeroSeverity.forEach((p) => console.log('  -', p.name, '| Complaints:', p.complaintCount));

  // 2. Check patterns with multiple models
  console.log('\n## 2. Patterns with multiple models in complaints');
  const patternsWithComplaints = await prisma.pattern.findMany({
    include: { complaints: { select: { model: true } } },
  });

  for (const p of patternsWithComplaints) {
    const uniqueModels = [...new Set(p.complaints.map((c) => c.model))];
    if (uniqueModels.length > 1) {
      console.log('  Pattern:', p.name);
      console.log('  Models:', uniqueModels.join(', '));
    }
  }

  // 3. Check UNKNOWN OR OTHER patterns
  console.log('\n## 3. Patterns with UNKNOWN OR OTHER component');
  const unknownPatterns = await prisma.pattern.findMany({
    where: { component: 'UNKNOWN OR OTHER' },
    select: { name: true, complaintCount: true, severityScore: true },
  });
  console.log('Count:', unknownPatterns.length);
  unknownPatterns.forEach((p) =>
    console.log('  -', p.name, '| Complaints:', p.complaintCount, '| Score:', p.severityScore)
  );

  // 4. Check makes with complaints but no patterns
  console.log('\n## 4. Makes with complaints but NO patterns');
  const allMakes = await prisma.complaint.groupBy({
    by: ['make'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const patternMakes = await prisma.pattern.groupBy({
    by: ['make'],
  });
  const patternMakeSet = new Set(patternMakes.map((p) => p.make));

  const missingMakes = allMakes.filter((m) => !patternMakeSet.has(m.make));
  console.log('Makes without patterns:');
  missingMakes.slice(0, 20).forEach((m) => console.log('  -', m.make, ':', m._count.id, 'complaints'));

  // 5. Check noise complaints breakdown
  console.log('\n## 5. Noise complaints breakdown');
  const noiseByMake = await prisma.$queryRaw<Array<{ make: string; count: bigint }>>`
    SELECT make, COUNT(*) as count
    FROM "Complaint"
    WHERE "clusterId" IS NULL
    GROUP BY make
    ORDER BY count DESC
    LIMIT 15
  `;
  console.log('Unlinked complaints by make:');
  noiseByMake.forEach((m) => console.log('  -', m.make, ':', Number(m.count)));

  // 6. Check if any vehicles have both linked and unlinked complaints
  console.log('\n## 6. Vehicles with high unlinked rates');
  const vehicleCoverage = await prisma.$queryRaw<
    Array<{ make: string; model: string; linked: bigint; unlinked: bigint; unlinked_pct: number }>
  >`
    SELECT
      make,
      model,
      COUNT(*) FILTER (WHERE "clusterId" IS NOT NULL) as linked,
      COUNT(*) FILTER (WHERE "clusterId" IS NULL) as unlinked,
      ROUND(COUNT(*) FILTER (WHERE "clusterId" IS NULL)::numeric / COUNT(*)::numeric * 100, 1) as unlinked_pct
    FROM "Complaint"
    GROUP BY make, model
    HAVING COUNT(*) > 100
    ORDER BY unlinked_pct DESC
    LIMIT 15
  `;
  console.log('Vehicles with >100 complaints and high unlinked rate:');
  vehicleCoverage.forEach((v) =>
    console.log(
      '  -',
      v.make,
      v.model,
      ': linked=',
      Number(v.linked),
      'unlinked=',
      Number(v.unlinked),
      '(',
      v.unlinked_pct,
      '% unlinked)'
    )
  );

  // 7. Check components in noise
  console.log('\n## 7. Components in noise (unlinked) complaints');
  const noiseByComponent = await prisma.$queryRaw<Array<{ component: string; count: bigint }>>`
    SELECT component, COUNT(*) as count
    FROM "Complaint"
    WHERE "clusterId" IS NULL
    GROUP BY component
    ORDER BY count DESC
    LIMIT 15
  `;
  console.log('Unlinked complaints by component:');
  noiseByComponent.forEach((c) => console.log('  -', c.component, ':', Number(c.count)));

  // 8. Sample some noise complaints to understand why they're unlinked
  console.log('\n## 8. Sample noise complaints (first 100 chars of description)');
  const sampleNoise = await prisma.complaint.findMany({
    where: { clusterId: null },
    select: { make: true, model: true, component: true, description: true },
    take: 5,
  });
  sampleNoise.forEach((c) => {
    console.log('  -', c.make, c.model, '|', c.component);
    console.log('    ', c.description?.substring(0, 100) + '...');
  });

  // 9. Check if there are complaints without embeddings
  console.log('\n## 9. Complaints without embeddings');
  const noEmbedding = await prisma.complaint.count({
    where: { embedding: null },
  });
  const totalComplaints = await prisma.complaint.count();
  console.log('Without embedding:', noEmbedding, '/', totalComplaints);

  // 10. Check pattern size distribution
  console.log('\n## 10. Pattern size distribution');
  const smallPatterns = await prisma.pattern.count({
    where: { complaintCount: { lt: 50 } },
  });
  const medPatterns = await prisma.pattern.count({
    where: { complaintCount: { gte: 50, lt: 200 } },
  });
  const largePatterns = await prisma.pattern.count({
    where: { complaintCount: { gte: 200, lt: 500 } },
  });
  const veryLargePatterns = await prisma.pattern.count({
    where: { complaintCount: { gte: 500 } },
  });
  console.log('  Small (<50):', smallPatterns);
  console.log('  Medium (50-199):', medPatterns);
  console.log('  Large (200-499):', largePatterns);
  console.log('  Very large (500+):', veryLargePatterns);

  // 11. Check fireCount aggregation
  console.log('\n## 11. Fire incidents check');
  const totalFiresInComplaints = await prisma.complaint.count({
    where: { fire: true },
  });
  const totalFiresLinked = await prisma.complaint.count({
    where: { fire: true, clusterId: { not: null } },
  });
  console.log('Total fire complaints:', totalFiresInComplaints);
  console.log('Fire complaints linked:', totalFiresLinked);
  console.log('Fire complaints in noise:', totalFiresInComplaints - totalFiresLinked);

  await prisma.$disconnect();
}

deepAudit().catch(console.error);
