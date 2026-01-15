import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== PATTERN QUALITY DEEP DIVE ===\n');

  // 1. Get all patterns
  const allPatterns = await prisma.pattern.findMany({
    select: {
      id: true,
      name: true,
      make: true,
      model: true,
      component: true,
      yearStart: true,
      yearEnd: true,
      complaintCount: true,
      severityScore: true,
    },
    orderBy: { complaintCount: 'desc' },
  });

  console.log('Total patterns:', allPatterns.length);

  // 2. Find duplicate patterns (same make/model/component)
  const grouped: Record<string, typeof allPatterns> = {};
  allPatterns.forEach((p) => {
    const key = `${p.make}|${p.model}|${p.component}`;
    if (grouped[key] === undefined) grouped[key] = [];
    grouped[key].push(p);
  });

  const duplicates = Object.entries(grouped).filter(([, v]) => v.length > 1);
  console.log('\n=== DUPLICATE PATTERNS (same make/model/component) ===');
  console.log('Number of duplicate groups:', duplicates.length);

  duplicates.forEach(([key, patterns]) => {
    console.log(`\n${key} (${patterns.length} duplicates):`);
    patterns.forEach((p) => {
      console.log(`  - ${p.name} (${p.yearStart}-${p.yearEnd}, ${p.complaintCount} complaints)`);
    });
  });

  // 3. Analyze BERTopic raw patterns vs enriched patterns
  const bertopicPatterns = allPatterns.filter((p) => /^\d+_/.test(p.name));
  const enrichedPatterns = allPatterns.filter((p) => p.name.includes('Issues'));
  const otherPatterns = allPatterns.filter(
    (p) => !/^\d+_/.test(p.name) && !p.name.includes('Issues')
  );

  console.log('\n=== PATTERN NAME TYPES ===');
  console.log('BERTopic raw patterns (e.g., "155_ac_evaporator..."):', bertopicPatterns.length);
  console.log('Enriched patterns (e.g., "TESLA MODEL 3...Issues"):', enrichedPatterns.length);
  console.log('Other patterns:', otherPatterns.length);

  // 4. Year range analysis
  console.log('\n=== YEAR RANGE DISTRIBUTION ===');
  const yearRanges = allPatterns.map((p) => ({
    name: p.name,
    range: (p.yearEnd ?? 0) - (p.yearStart ?? 0),
    yearStart: p.yearStart,
    yearEnd: p.yearEnd,
  }));

  const rangeDistribution = {
    '0-2 years': yearRanges.filter((r) => r.range <= 2).length,
    '3-5 years': yearRanges.filter((r) => r.range > 2 && r.range <= 5).length,
    '6-10 years': yearRanges.filter((r) => r.range > 5 && r.range <= 10).length,
    '11-20 years': yearRanges.filter((r) => r.range > 10 && r.range <= 20).length,
    '>20 years (suspicious)': yearRanges.filter((r) => r.range > 20).length,
  };

  Object.entries(rangeDistribution).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} patterns`);
  });

  // 5. Sample complaints from top patterns to check quality
  console.log('\n=== COMPLAINT SAMPLING FROM TOP 5 PATTERNS ===');

  for (const pattern of allPatterns.slice(0, 5)) {
    console.log(`\n--- ${pattern.name} ---`);
    console.log(`Make: ${pattern.make}, Model: ${pattern.model}`);
    console.log(`Years: ${pattern.yearStart}-${pattern.yearEnd}`);
    console.log(`Component: ${pattern.component}`);
    console.log(`Complaints: ${pattern.complaintCount}`);

    // Get sample complaints using clusterId (complaints link to patterns via clusterId)
    const complaints = await prisma.complaint.findMany({
      where: { clusterId: pattern.id },
      take: 5,
      select: {
        make: true,
        model: true,
        year: true,
        component: true,
        description: true,
      },
    });

    console.log(`\nSample complaints (${complaints.length} found):`);
    complaints.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.year} ${c.make} ${c.model} - ${c.component}`);
      console.log(`     "${c.description?.slice(0, 120)}..."`);
    });

    // Check if complaints actually match the pattern
    const mismatchedMakes = complaints.filter(
      (c) => c.make?.toUpperCase() !== pattern.make.toUpperCase()
    );
    const mismatchedModels = complaints.filter(
      (c) => c.model?.toUpperCase() !== pattern.model?.toUpperCase()
    );

    if (mismatchedMakes.length > 0) {
      console.log(`  ⚠️ WARNING: ${mismatchedMakes.length}/${complaints.length} complaints have DIFFERENT MAKE!`);
      mismatchedMakes.forEach((c) => console.log(`     - ${c.make} ${c.model}`));
    }
    if (mismatchedModels.length > 0) {
      console.log(`  ⚠️ WARNING: ${mismatchedModels.length}/${complaints.length} complaints have DIFFERENT MODEL!`);
    }
  }

  // 6. Check for cross-make patterns (CRITICAL ISSUE)
  console.log('\n=== CHECKING FOR CROSS-MAKE PATTERN CONTAMINATION ===');

  let crossMakeCount = 0;
  let multiModelCount = 0;

  for (const pattern of allPatterns) {
    const complaints = await prisma.complaint.findMany({
      where: { clusterId: pattern.id },
      select: { make: true, model: true },
    });

    if (complaints.length === 0) continue;

    const uniqueMakes = [...new Set(complaints.map((c) => c.make?.toUpperCase()).filter(Boolean))];
    const uniqueModels = [...new Set(complaints.map((c) => c.model?.toUpperCase()).filter(Boolean))];

    if (uniqueMakes.length > 1) {
      crossMakeCount++;
      console.log(`\n⚠️ CROSS-MAKE CONTAMINATION: ${pattern.name}`);
      console.log(`   Pattern make: ${pattern.make}`);
      console.log(`   Complaint makes: ${uniqueMakes.join(', ')}`);
      console.log(`   Total complaints: ${complaints.length}`);
    }

    if (uniqueModels.length > 3) {
      multiModelCount++;
      if (uniqueMakes.length === 1) {
        console.log(`\n⚠️ MULTI-MODEL PATTERN: ${pattern.name}`);
        console.log(`   Pattern model: ${pattern.model}`);
        console.log(`   Complaint models: ${uniqueModels.slice(0, 8).join(', ')}${uniqueModels.length > 8 ? '...' : ''}`);
      }
    }
  }

  console.log(`\n=== CONTAMINATION SUMMARY ===`);
  console.log(`Patterns with cross-make contamination: ${crossMakeCount}/${allPatterns.length}`);
  console.log(`Patterns with >3 different models: ${multiModelCount}/${allPatterns.length}`)

  await prisma.$disconnect();
}

main().catch(console.error);
