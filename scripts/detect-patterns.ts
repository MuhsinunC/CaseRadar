#!/usr/bin/env npx tsx
/**
 * Pattern Detection Script
 * Analyzes NHTSA complaints to detect real patterns without requiring embeddings
 * Groups by make/model/component and calculates severity scores
 *
 * Run with: npx tsx scripts/detect-patterns.ts
 */

import { PrismaClient, TrendDirection } from '@prisma/client';

const prisma = new PrismaClient();

interface PatternCandidate {
  make: string;
  model: string;
  component: string;
  yearStart: number;
  yearEnd: number;
  complaintCount: number;
  totalDeaths: number;
  totalInjuries: number;
  crashCount: number;
  fireCount: number;
  complaintIds: string[];
  firstSeen: Date;
  lastSeen: Date;
}

// Minimum thresholds for a pattern to be significant
const MIN_COMPLAINTS = 10;
const MIN_SEVERITY_SCORE = 20;

function calculateSeverityScore(pattern: PatternCandidate): number {
  // Severity formula:
  // - Deaths: 100 points each
  // - Injuries: 10 points each
  // - Crashes: 5 points each
  // - Fires: 8 points each
  // - Base: 1 point per complaint
  return (
    pattern.totalDeaths * 100 +
    pattern.totalInjuries * 10 +
    pattern.crashCount * 5 +
    pattern.fireCount * 8 +
    pattern.complaintCount
  );
}

function calculateTrend(dates: Date[]): { direction: TrendDirection; score: number } {
  if (dates.length < 5) {
    return { direction: 'STABLE', score: 0 };
  }

  // Sort dates and split into halves
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  // Compare complaint rates
  const firstHalfDays = (firstHalf[firstHalf.length - 1].getTime() - firstHalf[0].getTime()) / (1000 * 60 * 60 * 24) || 1;
  const secondHalfDays = (secondHalf[secondHalf.length - 1].getTime() - secondHalf[0].getTime()) / (1000 * 60 * 60 * 24) || 1;

  const firstRate = firstHalf.length / firstHalfDays;
  const secondRate = secondHalf.length / secondHalfDays;

  const changeRatio = secondRate / firstRate;

  if (changeRatio > 1.5) {
    return { direction: 'INCREASING', score: Math.min((changeRatio - 1) * 100, 100) };
  } else if (changeRatio < 0.67) {
    return { direction: 'DECREASING', score: Math.min((1 - changeRatio) * 100, 100) };
  }
  return { direction: 'STABLE', score: 0 };
}

async function detectPatterns() {
  console.log('Starting pattern detection...\n');

  // Get all complaints grouped by make/model/component
  const complaints = await prisma.complaint.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      component: true,
      year: true,
      deaths: true,
      injuries: true,
      crash: true,
      fire: true,
      dateAdded: true,
    },
  });

  console.log(`Analyzing ${complaints.length} complaints...\n`);

  // Group complaints into pattern candidates
  const patternMap = new Map<string, PatternCandidate>();

  for (const c of complaints) {
    // Create a key for grouping (make + model + component)
    const key = `${c.make}|${c.model}|${c.component}`;

    if (!patternMap.has(key)) {
      patternMap.set(key, {
        make: c.make,
        model: c.model || 'Unknown',
        component: c.component,
        yearStart: c.year,
        yearEnd: c.year,
        complaintCount: 0,
        totalDeaths: 0,
        totalInjuries: 0,
        crashCount: 0,
        fireCount: 0,
        complaintIds: [],
        firstSeen: c.dateAdded,
        lastSeen: c.dateAdded,
      });
    }

    const pattern = patternMap.get(key)!;
    pattern.complaintCount++;
    pattern.totalDeaths += c.deaths;
    pattern.totalInjuries += c.injuries;
    pattern.crashCount += c.crash ? 1 : 0;
    pattern.fireCount += c.fire ? 1 : 0;
    pattern.complaintIds.push(c.id);
    pattern.yearStart = Math.min(pattern.yearStart, c.year);
    pattern.yearEnd = Math.max(pattern.yearEnd, c.year);
    if (c.dateAdded < pattern.firstSeen) pattern.firstSeen = c.dateAdded;
    if (c.dateAdded > pattern.lastSeen) pattern.lastSeen = c.dateAdded;
  }

  console.log(`Found ${patternMap.size} unique make/model/component combinations\n`);

  // Filter and score patterns
  const significantPatterns: Array<PatternCandidate & { severityScore: number; trend: { direction: TrendDirection; score: number } }> = [];

  for (const pattern of patternMap.values()) {
    if (pattern.complaintCount < MIN_COMPLAINTS) continue;

    const severityScore = calculateSeverityScore(pattern);
    if (severityScore < MIN_SEVERITY_SCORE) continue;

    // Get dates for trend calculation
    const patternComplaints = complaints.filter(c =>
      c.make === pattern.make &&
      c.model === pattern.model &&
      c.component === pattern.component
    );
    const dates = patternComplaints.map(c => c.dateAdded);
    const trend = calculateTrend(dates);

    significantPatterns.push({
      ...pattern,
      severityScore,
      trend,
    });
  }

  // Sort by severity score
  significantPatterns.sort((a, b) => b.severityScore - a.severityScore);

  console.log(`Found ${significantPatterns.length} significant patterns\n`);
  console.log('Top 20 patterns by severity:\n');

  // Show top 20
  for (let i = 0; i < Math.min(20, significantPatterns.length); i++) {
    const p = significantPatterns[i];
    console.log(`${i + 1}. ${p.make} ${p.model} - ${p.component}`);
    console.log(`   Complaints: ${p.complaintCount} | Deaths: ${p.totalDeaths} | Injuries: ${p.totalInjuries}`);
    console.log(`   Crashes: ${p.crashCount} | Fires: ${p.fireCount} | Severity: ${p.severityScore}`);
    console.log(`   Years: ${p.yearStart}-${p.yearEnd} | Trend: ${p.trend.direction}`);
    console.log('');
  }

  // Clear existing patterns and create new ones
  console.log('\nClearing existing patterns...');

  // First, disconnect complaints from patterns
  await prisma.complaint.updateMany({
    where: { clusterId: { not: null } },
    data: { clusterId: null },
  });

  // Delete generated complaints that reference patterns
  await prisma.generatedComplaint.deleteMany({});

  // Now delete patterns
  await prisma.pattern.deleteMany({});

  console.log('Creating new patterns in database...\n');

  let created = 0;
  for (const p of significantPatterns) {
    // Generate a descriptive name
    const name = `${p.make} ${p.model} ${p.component} Issues`;

    // Generate description based on severity
    let description = `Pattern detected across ${p.complaintCount} complaints`;
    if (p.totalDeaths > 0) description += ` with ${p.totalDeaths} reported deaths`;
    if (p.totalInjuries > 0) description += ` and ${p.totalInjuries} injuries`;
    if (p.fireCount > 0) description += `. ${p.fireCount} fire incidents reported`;
    if (p.crashCount > 0) description += `. ${p.crashCount} crash incidents reported`;
    description += `.`;

    await prisma.pattern.create({
      data: {
        name,
        description,
        make: p.make,
        model: p.model,
        component: p.component,
        yearStart: p.yearStart,
        yearEnd: p.yearEnd,
        severityScore: p.severityScore,
        complaintCount: p.complaintCount,
        trendDirection: p.trend.direction,
        trendScore: p.trend.score,
        firstSeen: p.firstSeen,
        lastUpdated: p.lastSeen,
        isActive: true,
        complaints: {
          connect: p.complaintIds.slice(0, 100).map(id => ({ id })), // Connect up to 100 complaints per pattern
        },
      },
    });
    created++;
  }

  // Final stats
  const totalPatterns = await prisma.pattern.count();
  const highSeverity = await prisma.pattern.count({ where: { severityScore: { gte: 100 } } });
  const increasing = await prisma.pattern.count({ where: { trendDirection: 'INCREASING' } });

  console.log('\n=== Pattern Detection Complete ===');
  console.log(`Total patterns created: ${totalPatterns}`);
  console.log(`High severity (100+): ${highSeverity}`);
  console.log(`Increasing trend: ${increasing}`);
  console.log(`\nTop 5 most severe patterns:`);

  const topPatterns = await prisma.pattern.findMany({
    orderBy: { severityScore: 'desc' },
    take: 5,
    select: {
      name: true,
      severityScore: true,
      complaintCount: true,
      trendDirection: true,
    },
  });

  for (const p of topPatterns) {
    console.log(`  - ${p.name}: ${p.severityScore} severity, ${p.complaintCount} complaints, ${p.trendDirection}`);
  }

  return { totalPatterns, highSeverity, increasing };
}

async function main() {
  try {
    await detectPatterns();
  } catch (error) {
    console.error('Pattern detection failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
