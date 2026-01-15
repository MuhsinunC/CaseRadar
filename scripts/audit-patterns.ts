/**
 * Pattern Audit Script
 * Exploratory data analysis on generated patterns
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('PATTERN DETECTION ALGORITHM AUDIT');
  console.log('='.repeat(60));
  console.log();

  // 1. Basic Statistics
  console.log('## 1. BASIC STATISTICS');
  console.log('-'.repeat(40));

  const patterns = await prisma.pattern.findMany({
    orderBy: { severityScore: 'desc' },
  });

  const totalPatterns = patterns.length;
  const totalComplaints = patterns.reduce((sum, p) => sum + p.complaintCount, 0);
  const avgComplaints = totalComplaints / totalPatterns;
  const minComplaints = Math.min(...patterns.map(p => p.complaintCount));
  const maxComplaints = Math.max(...patterns.map(p => p.complaintCount));
  const totalDeaths = patterns.reduce((sum, p) => sum + p.deathCount, 0);
  const totalInjuries = patterns.reduce((sum, p) => sum + p.injuryCount, 0);
  const totalCrashes = patterns.reduce((sum, p) => sum + p.crashCount, 0);
  const totalFires = patterns.reduce((sum, p) => sum + p.fireCount, 0);
  const highSeverity = patterns.filter(p => p.severityScore > 1000).length;

  console.log(`Total Patterns: ${totalPatterns}`);
  console.log(`Total Linked Complaints: ${totalComplaints}`);
  console.log(`Avg Complaints/Pattern: ${avgComplaints.toFixed(1)}`);
  console.log(`Min/Max Complaints: ${minComplaints} / ${maxComplaints}`);
  console.log(`High Severity (>1000): ${highSeverity}`);
  console.log(`Total Deaths: ${totalDeaths}`);
  console.log(`Total Injuries: ${totalInjuries}`);
  console.log(`Total Crashes: ${totalCrashes}`);
  console.log(`Total Fires: ${totalFires}`);
  console.log();

  // 2. Cross-Make Contamination Check
  console.log('## 2. CROSS-MAKE CONTAMINATION CHECK');
  console.log('-'.repeat(40));

  // For each pattern, check if linked complaints have different makes
  const patternsWithComplaints = await prisma.pattern.findMany({
    include: {
      complaints: {
        select: { make: true, model: true },
      },
    },
  });

  let crossMakeCount = 0;
  let crossModelCount = 0;
  const crossMakePatterns: string[] = [];

  for (const pattern of patternsWithComplaints) {
    if (pattern.complaints.length === 0) continue;

    const uniqueMakes = [...new Set(pattern.complaints.map(c => c.make))];
    const uniqueModels = [...new Set(pattern.complaints.map(c => c.model))];

    if (uniqueMakes.length > 1) {
      crossMakeCount++;
      crossMakePatterns.push(`${pattern.name} (${pattern.make}): ${uniqueMakes.join(', ')}`);
    }
    if (uniqueModels.length > 1) {
      crossModelCount++;
    }
  }

  console.log(`Patterns with cross-make contamination: ${crossMakeCount}/${totalPatterns} (${(crossMakeCount/totalPatterns*100).toFixed(1)}%)`);
  console.log(`Patterns with multiple models: ${crossModelCount}/${totalPatterns} (${(crossModelCount/totalPatterns*100).toFixed(1)}%)`);

  if (crossMakePatterns.length > 0) {
    console.log('\nCross-make patterns:');
    crossMakePatterns.slice(0, 10).forEach(p => console.log(`  - ${p}`));
    if (crossMakePatterns.length > 10) {
      console.log(`  ... and ${crossMakePatterns.length - 10} more`);
    }
  }
  console.log();

  // 3. Year Range Analysis
  console.log('## 3. YEAR RANGE ANALYSIS');
  console.log('-'.repeat(40));

  const yearRanges = patterns.map(p => {
    if (!p.yearStart || !p.yearEnd) return null;
    return p.yearEnd - p.yearStart;
  }).filter(r => r !== null) as number[];

  const avgYearRange = yearRanges.reduce((a, b) => a + b, 0) / yearRanges.length;
  const maxYearRange = Math.max(...yearRanges);
  const minYearRange = Math.min(...yearRanges);

  const wideRangePatterns = patterns.filter(p => p.yearStart && p.yearEnd && (p.yearEnd - p.yearStart) > 10);
  const invalidYearPatterns = patterns.filter(p => p.yearEnd && p.yearEnd > 2030);

  console.log(`Patterns with year data: ${yearRanges.length}/${totalPatterns}`);
  console.log(`Avg Year Range: ${avgYearRange.toFixed(1)} years`);
  console.log(`Min/Max Year Range: ${minYearRange} / ${maxYearRange} years`);
  console.log(`Wide range (>10 years): ${wideRangePatterns.length}`);
  console.log(`Invalid years (>2030): ${invalidYearPatterns.length}`);

  if (wideRangePatterns.length > 0) {
    console.log('\nWide year range patterns (>10 years):');
    wideRangePatterns.slice(0, 10).forEach(p => {
      console.log(`  - ${p.name}: ${p.yearStart}-${p.yearEnd} (${p.yearEnd! - p.yearStart!} years)`);
    });
  }

  // Year range distribution
  const rangeDistribution: Record<string, number> = {
    '0-2 years': 0,
    '3-5 years': 0,
    '6-10 years': 0,
    '11-15 years': 0,
    '16+ years': 0,
  };

  yearRanges.forEach(r => {
    if (r <= 2) rangeDistribution['0-2 years']++;
    else if (r <= 5) rangeDistribution['3-5 years']++;
    else if (r <= 10) rangeDistribution['6-10 years']++;
    else if (r <= 15) rangeDistribution['11-15 years']++;
    else rangeDistribution['16+ years']++;
  });

  console.log('\nYear Range Distribution:');
  Object.entries(rangeDistribution).forEach(([range, count]) => {
    const pct = (count / yearRanges.length * 100).toFixed(1);
    console.log(`  ${range}: ${count} (${pct}%)`);
  });
  console.log();

  // 4. Component Distribution
  console.log('## 4. COMPONENT DISTRIBUTION');
  console.log('-'.repeat(40));

  const componentCounts: Record<string, number> = {};
  patterns.forEach(p => {
    componentCounts[p.component] = (componentCounts[p.component] || 0) + 1;
  });

  const sortedComponents = Object.entries(componentCounts)
    .sort((a, b) => b[1] - a[1]);

  console.log('Top 15 Components:');
  sortedComponents.slice(0, 15).forEach(([comp, count]) => {
    const pct = (count / totalPatterns * 100).toFixed(1);
    console.log(`  ${comp}: ${count} (${pct}%)`);
  });
  console.log(`\nTotal unique components: ${Object.keys(componentCounts).length}`);
  console.log();

  // 5. Make Distribution
  console.log('## 5. MAKE DISTRIBUTION');
  console.log('-'.repeat(40));

  const makeCounts: Record<string, number> = {};
  patterns.forEach(p => {
    makeCounts[p.make] = (makeCounts[p.make] || 0) + 1;
  });

  const sortedMakes = Object.entries(makeCounts)
    .sort((a, b) => b[1] - a[1]);

  console.log('Top 15 Makes:');
  sortedMakes.slice(0, 15).forEach(([make, count]) => {
    const pct = (count / totalPatterns * 100).toFixed(1);
    console.log(`  ${make}: ${count} (${pct}%)`);
  });
  console.log(`\nTotal unique makes: ${Object.keys(makeCounts).length}`);
  console.log();

  // 6. Pattern Name Quality
  console.log('## 6. PATTERN NAME QUALITY');
  console.log('-'.repeat(40));

  const numericPrefixPatterns = patterns.filter(p => /^\d+_/.test(p.name));
  const veryShortNames = patterns.filter(p => p.name.length < 10);
  const veryLongNames = patterns.filter(p => p.name.length > 100);
  const genericNames = patterns.filter(p =>
    p.name.toLowerCase().includes('topic_') ||
    p.name.toLowerCase().includes('cluster_')
  );

  console.log(`Numeric prefix names (e.g., "0_steering"): ${numericPrefixPatterns.length}`);
  console.log(`Very short names (<10 chars): ${veryShortNames.length}`);
  console.log(`Very long names (>100 chars): ${veryLongNames.length}`);
  console.log(`Generic names (topic_/cluster_): ${genericNames.length}`);

  if (numericPrefixPatterns.length > 0) {
    console.log('\nSample numeric prefix names:');
    numericPrefixPatterns.slice(0, 10).forEach(p => {
      console.log(`  - "${p.name}"`);
    });
  }
  console.log();

  // 7. Duplicate Detection
  console.log('## 7. DUPLICATE DETECTION');
  console.log('-'.repeat(40));

  const patternKey = (p: typeof patterns[0]) => `${p.make}|${p.model}|${p.component}`;
  const patternGroups: Record<string, typeof patterns> = {};

  patterns.forEach(p => {
    const key = patternKey(p);
    if (!patternGroups[key]) patternGroups[key] = [];
    patternGroups[key].push(p);
  });

  const duplicateGroups = Object.entries(patternGroups)
    .filter(([_, group]) => group.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Duplicate groups (same make/model/component): ${duplicateGroups.length}`);

  if (duplicateGroups.length > 0) {
    console.log('\nTop duplicate groups:');
    duplicateGroups.slice(0, 10).forEach(([key, group]) => {
      console.log(`  ${key}: ${group.length} patterns`);
      group.forEach(p => {
        console.log(`    - "${p.name}" (${p.complaintCount} complaints, score: ${p.severityScore})`);
      });
    });
  }
  console.log();

  // 8. Severity Score Distribution
  console.log('## 8. SEVERITY SCORE DISTRIBUTION');
  console.log('-'.repeat(40));

  const severityBuckets: Record<string, number> = {
    '0': 0,
    '1-100': 0,
    '101-500': 0,
    '501-1000': 0,
    '1001-5000': 0,
    '5000+': 0,
  };

  patterns.forEach(p => {
    if (p.severityScore === 0) severityBuckets['0']++;
    else if (p.severityScore <= 100) severityBuckets['1-100']++;
    else if (p.severityScore <= 500) severityBuckets['101-500']++;
    else if (p.severityScore <= 1000) severityBuckets['501-1000']++;
    else if (p.severityScore <= 5000) severityBuckets['1001-5000']++;
    else severityBuckets['5000+']++;
  });

  console.log('Severity Score Distribution:');
  Object.entries(severityBuckets).forEach(([bucket, count]) => {
    const pct = (count / totalPatterns * 100).toFixed(1);
    console.log(`  ${bucket}: ${count} (${pct}%)`);
  });

  // Top 10 highest severity
  console.log('\nTop 10 Highest Severity Patterns:');
  patterns.slice(0, 10).forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name} (${p.make} ${p.model})`);
    console.log(`     Score: ${p.severityScore}, Deaths: ${p.deathCount}, Injuries: ${p.injuryCount}, Complaints: ${p.complaintCount}`);
  });
  console.log();

  // 9. Complaint Coverage Analysis
  console.log('## 9. COMPLAINT COVERAGE ANALYSIS');
  console.log('-'.repeat(40));

  const totalDbComplaints = await prisma.complaint.count();
  const linkedComplaints = await prisma.complaint.count({
    where: { clusterId: { not: null } },
  });
  const unlinkedComplaints = totalDbComplaints - linkedComplaints;

  console.log(`Total complaints in DB: ${totalDbComplaints}`);
  console.log(`Linked to patterns: ${linkedComplaints} (${(linkedComplaints/totalDbComplaints*100).toFixed(1)}%)`);
  console.log(`Unlinked (noise/skipped): ${unlinkedComplaints} (${(unlinkedComplaints/totalDbComplaints*100).toFixed(1)}%)`);
  console.log();

  // 10. Patterns with No Linked Complaints
  console.log('## 10. ORPHAN PATTERNS (No Linked Complaints)');
  console.log('-'.repeat(40));

  const orphanPatterns = patternsWithComplaints.filter(p => p.complaints.length === 0);
  console.log(`Patterns with 0 linked complaints: ${orphanPatterns.length}`);

  if (orphanPatterns.length > 0) {
    console.log('\nOrphan patterns:');
    orphanPatterns.slice(0, 10).forEach(p => {
      console.log(`  - "${p.name}" (${p.make} ${p.model}, claimed: ${p.complaintCount})`);
    });
  }
  console.log();

  // 11. Trend Analysis
  console.log('## 11. TREND ANALYSIS');
  console.log('-'.repeat(40));

  const trendCounts = {
    INCREASING: patterns.filter(p => p.trendDirection === 'INCREASING').length,
    DECREASING: patterns.filter(p => p.trendDirection === 'DECREASING').length,
    STABLE: patterns.filter(p => p.trendDirection === 'STABLE').length,
  };

  console.log('Trend Distribution:');
  Object.entries(trendCounts).forEach(([trend, count]) => {
    const pct = (count / totalPatterns * 100).toFixed(1);
    console.log(`  ${trend}: ${count} (${pct}%)`);
  });
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(60));

  const issues: string[] = [];

  if (crossMakeCount > 0) {
    issues.push(`❌ Cross-make contamination: ${crossMakeCount} patterns`);
  } else {
    console.log('✅ No cross-make contamination');
  }

  if (invalidYearPatterns.length > 0) {
    issues.push(`❌ Invalid years (>2030): ${invalidYearPatterns.length} patterns`);
  } else {
    console.log('✅ No invalid year values');
  }

  if (wideRangePatterns.length > 0) {
    issues.push(`⚠️  Wide year ranges (>10 years): ${wideRangePatterns.length} patterns`);
  }

  if (numericPrefixPatterns.length > 0) {
    issues.push(`⚠️  Numeric prefix names: ${numericPrefixPatterns.length} patterns`);
  }

  if (duplicateGroups.length > 0) {
    issues.push(`⚠️  Duplicate patterns (same make/model/component): ${duplicateGroups.length} groups`);
  }

  if (orphanPatterns.length > 0) {
    issues.push(`⚠️  Orphan patterns (no linked complaints): ${orphanPatterns.length}`);
  }

  const coverageRate = linkedComplaints / totalDbComplaints * 100;
  if (coverageRate < 50) {
    issues.push(`⚠️  Low complaint coverage: ${coverageRate.toFixed(1)}%`);
  }

  if (issues.length > 0) {
    console.log('\nIssues Found:');
    issues.forEach(issue => console.log(`  ${issue}`));
  } else {
    console.log('✅ No major issues found');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
