/**
 * Pattern Detection using Embeddings
 * Clusters similar complaints using vector similarity
 * Usage: npx tsx scripts/detect-patterns-embeddings.ts [minClusterSize] [similarityThreshold]
 */

import { prisma } from '../src/lib/db';
import { cosineSimilarity } from '../src/lib/embeddings';

interface ComplaintWithEmbedding {
  id: string;
  make: string;
  model: string;
  year: number;
  component: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
  description: string;
  embedding: number[];
}

interface Cluster {
  complaintIds: string[];
  embeddings: number[][];
  complaints: ComplaintWithEmbedding[];
}

/**
 * Parse embedding string to number array
 */
function parseEmbedding(embeddingStr: string): number[] {
  try {
    const cleaned = embeddingStr.replace(/[\[\]()]/g, '');
    return cleaned.split(',').map(Number);
  } catch {
    return [];
  }
}

/**
 * Calculate centroid from multiple embeddings
 */
function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Get most common value in an array
 */
function getMostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let maxCount = 0;
  let mostCommon = arr[0];
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = item;
    }
  }
  return mostCommon;
}

/**
 * Calculate severity score for a cluster
 */
function calculateSeverityScore(complaints: ComplaintWithEmbedding[]): number {
  let score = 0;
  for (const c of complaints) {
    score += c.deaths * 100;
    score += c.injuries * 10;
    score += c.crash ? 5 : 0;
    score += c.fire ? 8 : 0;
  }
  // Add complaint count factor
  score += complaints.length;
  return score;
}

/**
 * Determine trend direction based on complaint dates
 */
function determineTrend(complaints: ComplaintWithEmbedding[]): 'INCREASING' | 'DECREASING' | 'STABLE' {
  // For now, return STABLE - could be improved with actual date analysis
  return 'STABLE';
}

async function detectPatterns(minClusterSize: number = 5, similarityThreshold: number = 0.75) {
  console.log(`\n=== Embedding-Based Pattern Detection ===`);
  console.log(`Min cluster size: ${minClusterSize}`);
  console.log(`Similarity threshold: ${similarityThreshold}\n`);

  // Fetch complaints with embeddings
  console.log('Fetching complaints with embeddings...');
  const rawComplaints = await prisma.$queryRaw<Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    component: string;
    crash: boolean;
    fire: boolean;
    injuries: number;
    deaths: number;
    description: string;
    embedding: string;
  }>>`
    SELECT id, make, model, year, component, crash, fire, injuries, deaths, description, embedding::text as embedding
    FROM "Complaint"
    WHERE embedding IS NOT NULL
    ORDER BY "dateAdded" DESC
  `;

  console.log(`Found ${rawComplaints.length} complaints with embeddings`);

  if (rawComplaints.length < minClusterSize) {
    console.log('Not enough complaints with embeddings for clustering');
    return;
  }

  // Parse embeddings
  const complaints: ComplaintWithEmbedding[] = rawComplaints
    .map(c => ({
      ...c,
      embedding: parseEmbedding(c.embedding),
    }))
    .filter(c => c.embedding.length > 0);

  console.log(`Parsed ${complaints.length} valid embeddings`);

  // Greedy clustering algorithm
  console.log('\nClustering complaints...');
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];

  for (const complaint of complaints) {
    if (assigned.has(complaint.id)) continue;

    // Try to find an existing cluster this complaint fits into
    let bestCluster = -1;
    let bestSimilarity = 0;

    for (let i = 0; i < clusters.length; i++) {
      const centroid = calculateCentroid(clusters[i].embeddings);
      const similarity = cosineSimilarity(complaint.embedding, centroid);

      if (similarity > similarityThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = i;
      }
    }

    if (bestCluster >= 0) {
      // Add to existing cluster
      clusters[bestCluster].complaintIds.push(complaint.id);
      clusters[bestCluster].embeddings.push(complaint.embedding);
      clusters[bestCluster].complaints.push(complaint);
      assigned.add(complaint.id);
    } else {
      // Start a new cluster
      clusters.push({
        complaintIds: [complaint.id],
        embeddings: [complaint.embedding],
        complaints: [complaint],
      });
      assigned.add(complaint.id);
    }

    // Progress update
    if (assigned.size % 500 === 0) {
      console.log(`  Processed ${assigned.size}/${complaints.length} complaints, ${clusters.length} clusters`);
    }
  }

  console.log(`\nFormed ${clusters.length} initial clusters`);

  // Filter by minimum size and create patterns
  const validClusters = clusters.filter(c => c.complaintIds.length >= minClusterSize);
  console.log(`${validClusters.length} clusters meet minimum size of ${minClusterSize}`);

  // Clear existing patterns and their links
  console.log('\nClearing existing patterns...');
  await prisma.complaint.updateMany({
    where: { clusterId: { not: null } },
    data: { clusterId: null },
  });
  await prisma.generatedComplaint.deleteMany({});
  await prisma.pattern.deleteMany({});
  console.log('Cleared existing patterns');

  // Create patterns for valid clusters
  console.log('\nCreating patterns...');
  let patternsCreated = 0;

  for (const cluster of validClusters) {
    const complaints = cluster.complaints;

    // Extract dominant characteristics
    const dominantMake = getMostCommon(complaints.map(c => c.make));
    const dominantModel = getMostCommon(complaints.map(c => c.model));
    const dominantComponent = getMostCommon(complaints.map(c => c.component.split(':')[0]));
    const years = complaints.map(c => c.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    // Calculate stats
    const totalDeaths = complaints.reduce((sum, c) => sum + c.deaths, 0);
    const totalInjuries = complaints.reduce((sum, c) => sum + c.injuries, 0);
    const totalCrashes = complaints.filter(c => c.crash).length;
    const totalFires = complaints.filter(c => c.fire).length;
    const severityScore = calculateSeverityScore(complaints);
    const trend = determineTrend(complaints);

    // Generate pattern name and description
    const patternName = `${dominantMake} ${dominantModel} ${dominantComponent} Issues`;
    const description = `Pattern detected across ${complaints.length} complaints` +
      (totalDeaths > 0 ? ` with ${totalDeaths} reported deaths` : '') +
      (totalInjuries > 0 ? ` and ${totalInjuries} injuries` : '') +
      (totalFires > 0 ? `. ${totalFires} fire incidents reported` : '') +
      (totalCrashes > 0 ? `. ${totalCrashes} crash incidents reported` : '') +
      '.';

    // Create pattern
    const pattern = await prisma.pattern.create({
      data: {
        name: patternName,
        description: description,
        make: dominantMake,
        model: dominantModel,
        yearStart: minYear,
        yearEnd: maxYear,
        component: dominantComponent,
        severityScore: severityScore,
        trendDirection: trend,
        trendScore: 0,
        complaintCount: complaints.length,
        deathCount: totalDeaths,
        injuryCount: totalInjuries,
        crashCount: totalCrashes,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        organizationId: null, // Global pattern
      },
    });

    // Link complaints to pattern
    await prisma.complaint.updateMany({
      where: { id: { in: cluster.complaintIds } },
      data: { clusterId: pattern.id },
    });

    patternsCreated++;

    if (patternsCreated % 10 === 0) {
      console.log(`  Created ${patternsCreated}/${validClusters.length} patterns`);
    }
  }

  // Summary
  console.log(`\n=== Pattern Detection Complete ===`);
  console.log(`Total complaints processed: ${complaints.length}`);
  console.log(`Initial clusters formed: ${clusters.length}`);
  console.log(`Valid patterns created: ${patternsCreated}`);
  console.log(`Noise complaints (not in any pattern): ${complaints.length - validClusters.reduce((sum, c) => sum + c.complaintIds.length, 0)}`);

  // Show top patterns by severity
  const topPatterns = await prisma.pattern.findMany({
    orderBy: { severityScore: 'desc' },
    take: 10,
    select: {
      name: true,
      severityScore: true,
      complaintCount: true,
      deathCount: true,
      injuryCount: true,
    },
  });

  console.log('\nTop 10 Patterns by Severity:');
  for (const p of topPatterns) {
    console.log(`  ${p.severityScore.toFixed(0)} | ${p.complaintCount} complaints | ${p.deathCount} deaths | ${p.injuryCount} injuries | ${p.name}`);
  }
}

// Parse arguments
const minClusterSize = parseInt(process.argv[2] || '5');
const similarityThreshold = parseFloat(process.argv[3] || '0.75');

detectPatterns(minClusterSize, similarityThreshold)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  });
