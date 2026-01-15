/**
 * Run Pattern Generation with High-Quality Complaints Only
 * Uses only complaints with valid descriptions AND component names
 */

import { prisma } from '../src/lib/db';
import { PatternGenerationService } from '../src/lib/patterns/pattern-generation-service';

async function runHighQualityPatterns() {
  console.log('=== High-Quality Pattern Generation ===\n');

  // First, clear existing patterns to start fresh
  console.log('Clearing existing patterns...');
  await prisma.complaint.updateMany({
    where: { clusterId: { not: null } },
    data: { clusterId: null },
  });
  await prisma.pattern.deleteMany({});
  console.log('Patterns cleared.\n');

  // Run pattern generation with high-quality filter
  console.log('Starting pattern generation (high-quality only)...\n');
  const service = new PatternGenerationService();
  const result = await service.generatePatterns({ highQualityOnly: true });

  console.log('\n=== Results ===');
  console.log('Success:', result.success);
  console.log('Patterns Created:', result.patternsCreated);
  console.log('Patterns Updated:', result.patternsUpdated);
  console.log('Patterns Merged:', result.patternsMerged);
  console.log('Complaints Processed:', result.complaintsProcessed);
  console.log('Noise Count:', result.noiseCount);
  console.log('Severe Rescued:', result.severeRescued);
  console.log('Duration:', Math.round(result.durationMs / 1000), 'seconds');
  if (result.error) {
    console.log('Error:', result.error);
  }

  // Print pattern summary
  console.log('\n=== Pattern Summary ===');
  const patterns = await prisma.pattern.findMany({
    orderBy: { severityScore: 'desc' },
    take: 15,
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

  for (const p of patterns) {
    console.log(
      `  [${p.severityScore}] ${p.make} ${p.model || ''} - ${p.component}: ${p.complaintCount} complaints (${p.deathCount}D/${p.injuryCount}I)`
    );
  }

  // Print component distribution
  console.log('\n=== Component Distribution ===');
  const componentDist = await prisma.pattern.groupBy({
    by: ['component'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  });

  for (const c of componentDist) {
    console.log(`  ${c.component}: ${c._count.id} patterns`);
  }

  await prisma.$disconnect();
}

runHighQualityPatterns().catch(console.error);
