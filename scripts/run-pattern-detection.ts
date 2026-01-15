#!/usr/bin/env npx tsx
/**
 * Run Pattern Detection
 * Directly calls PatternGenerationService with all post-processing fixes
 */

import { patternGenerationService } from '../src/lib/patterns/pattern-generation-service';
import { prisma } from '../src/lib/db';

async function main() {
  console.log('Starting pattern detection with post-processing fixes...\n');

  // Clear existing patterns first for a clean run
  console.log('Clearing existing patterns...');
  await prisma.complaint.updateMany({
    where: { clusterId: { not: null } },
    data: { clusterId: null },
  });
  await prisma.generatedComplaint.deleteMany({});
  await prisma.pattern.deleteMany({});
  console.log('Cleared existing patterns\n');

  const startTime = Date.now();

  try {
    const result = await patternGenerationService.generatePatterns();

    const duration = (Date.now() - startTime) / 1000;

    console.log('\n=== Pattern Detection Complete ===');
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Success: ${result.success}`);
    console.log(`Patterns Created: ${result.patternsCreated}`);
    console.log(`Patterns Updated: ${result.patternsUpdated}`);
    console.log(`Patterns Merged: ${result.patternsMerged || 0}`);
    console.log(`Complaints Processed: ${result.complaintsProcessed}`);
    console.log(`Noise Count: ${result.noiseCount}`);
    console.log(`Severe Rescued: ${result.severeRescued || 0}`);

    if (result.error) {
      console.error(`Error: ${result.error}`);
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Pattern detection failed:', error);
    process.exit(1);
  }
}

main();
