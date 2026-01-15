/**
 * Validate Patterns Against Recalls
 * Check if high-severity patterns correlate with known recalls
 */

import { prisma } from '../src/lib/db';

async function validatePatternsAgainstRecalls() {
  console.log('=== Pattern-Recall Validation ===\n');

  // Get recall count and sample
  const recallCount = await prisma.recall.count();
  console.log('Total Recalls:', recallCount);

  // Sample some recalls
  const sampleRecalls = await prisma.recall.findMany({
    take: 5,
    select: {
      nhtsaCampaignNumber: true,
      make: true,
      model: true,
      component: true,
      summary: true,
      year: true,
    },
  });

  console.log('\nSample Recalls:');
  for (const r of sampleRecalls) {
    console.log(`  [${r.nhtsaCampaignNumber}] ${r.year || 'N/A'} ${r.make} ${r.model} - ${r.component}`);
    console.log(`    Summary: ${r.summary?.substring(0, 100) || 'N/A'}...`);
  }

  // Get high-severity patterns (lowered threshold for high-quality patterns)
  const highSeverityPatterns = await prisma.pattern.findMany({
    where: { severityScore: { gte: 500 } },
    orderBy: { severityScore: 'desc' },
    select: {
      id: true,
      make: true,
      model: true,
      component: true,
      severityScore: true,
      complaintCount: true,
      deathCount: true,
    },
    take: 20,
  });

  console.log('\n=== High Severity Pattern - Recall Correlation ===\n');

  let matchingPatterns = 0;
  let totalMatchingRecalls = 0;

  for (const pattern of highSeverityPatterns) {
    // Find recalls that match this pattern's make/model
    const makeSearch = pattern.make?.split(' ').find((w) => w.length > 3) || pattern.make;
    const modelSearch = pattern.model || '';

    // Search for recalls matching the make or model
    const matchingRecalls = await prisma.recall.findMany({
      where: {
        OR: [
          { make: { contains: makeSearch || '', mode: 'insensitive' } },
          { model: { contains: modelSearch, mode: 'insensitive' } },
        ],
      },
      select: {
        nhtsaCampaignNumber: true,
        make: true,
        model: true,
        component: true,
      },
      take: 5,
    });

    if (matchingRecalls.length > 0) {
      matchingPatterns++;
      totalMatchingRecalls += matchingRecalls.length;
    }

    console.log(
      `[${pattern.severityScore}] ${pattern.make} ${pattern.model || ''} - ${pattern.component}`
    );
    console.log(
      `  Complaints: ${pattern.complaintCount}, Deaths: ${pattern.deathCount}`
    );
    console.log(`  Matching Recalls: ${matchingRecalls.length}`);
    if (matchingRecalls.length > 0) {
      for (const r of matchingRecalls.slice(0, 3)) {
        console.log(`    - ${r.nhtsaCampaignNumber}: ${r.make} ${r.model} - ${r.component}`);
      }
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`High Severity Patterns: ${highSeverityPatterns.length}`);
  console.log(`Patterns with Recall Matches: ${matchingPatterns}`);
  console.log(`Match Rate: ${Math.round((matchingPatterns / highSeverityPatterns.length) * 100)}%`);
  console.log(`Total Matching Recalls Found: ${totalMatchingRecalls}`);

  await prisma.$disconnect();
}

validatePatternsAgainstRecalls().catch(console.error);
