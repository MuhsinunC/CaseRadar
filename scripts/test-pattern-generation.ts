/**
 * Test Pattern Generation Script
 *
 * Run with: npx tsx scripts/test-pattern-generation.ts
 *
 * Tests the pattern generation with the per-document topic assignment fix.
 */

import { patternGenerationService } from '../src/lib/patterns/pattern-generation-service';
import { prisma } from '../src/lib/db';
import { mlDetectionClient } from '../src/lib/patterns/ml-detection-client';

async function main() {
  console.log(`\n=== Pattern Generation Test ===\n`);

  // Check ML service
  const mlAvailable = await mlDetectionClient.isAvailable();
  console.log(`ML Service: ${mlAvailable ? '✓ Available' : '✗ Not available'}`);

  if (!mlAvailable) {
    console.error('ML service is not available. Please start it with:');
    console.error('  cd services/pattern-detection && uv run uvicorn main:app --host 0.0.0.0 --port 8000');
    await prisma.$disconnect();
    process.exit(1);
  }

  // Get embedding stats
  const embeddingStats = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
  `;
  const embeddingCount = Number(embeddingStats[0].count);
  console.log(`Complaints with embeddings: ${embeddingCount.toLocaleString()}`);

  // Get current pattern count
  const patternCount = await prisma.pattern.count();
  console.log(`Current patterns: ${patternCount}`);

  console.log('\n--- Testing ML Service document_topics ---');

  // Test with a small sample to verify document_topics is returned
  const sampleComplaints = await prisma.$queryRawUnsafe<
    Array<{ id: string; description: string; embedding: string }>
  >(`
    SELECT id, description, embedding::text as embedding
    FROM "Complaint"
    WHERE embedding IS NOT NULL
    LIMIT 100
  `);

  if (sampleComplaints.length < 10) {
    console.log('Not enough complaints with embeddings for test');
    await prisma.$disconnect();
    return;
  }

  const documents = sampleComplaints.map(c => c.description || '');
  const embeddings = sampleComplaints.map(c => JSON.parse(c.embedding));

  console.log(`Testing with ${documents.length} documents...`);

  try {
    const result = await mlDetectionClient.topics.fitTopics(documents, embeddings);

    console.log(`\nML Service Response:`);
    console.log(`  success: ${result.success}`);
    console.log(`  topic_count: ${result.topic_count}`);
    console.log(`  document_topics: ${result.document_topics ? `✓ Present (${result.document_topics.length} assignments)` : '✗ Missing'}`);

    if (result.document_topics) {
      const topicCounts = new Map<number, number>();
      for (const topicId of result.document_topics) {
        topicCounts.set(topicId, (topicCounts.get(topicId) || 0) + 1);
      }
      console.log(`\n  Topic Distribution:`);
      for (const [topicId, count] of Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1])) {
        const topicName = topicId === -1 ? 'Noise' : result.topics.find(t => t.topic_id === topicId)?.name || `Topic ${topicId}`;
        console.log(`    ${topicName}: ${count} documents`);
      }
    }
  } catch (error) {
    console.error('ML Service test failed:', error);
  }

  console.log('\n--- Running Full Pattern Generation ---');

  // Now run the full pattern generation
  console.log('Starting pattern generation...');
  const startTime = Date.now();

  try {
    const genResult = await patternGenerationService.generatePatterns();
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\nPattern Generation Result:`);
    console.log(`  Success: ${genResult.success}`);
    console.log(`  Duration: ${duration.toFixed(1)}s`);
    console.log(`  Patterns Created: ${genResult.patternsCreated}`);
    console.log(`  Patterns Updated: ${genResult.patternsUpdated}`);
    console.log(`  Patterns Merged: ${genResult.patternsMerged}`);
    console.log(`  Complaints Processed: ${genResult.complaintsProcessed.toLocaleString()}`);
    console.log(`  Noise Count: ${genResult.noiseCount.toLocaleString()}`);
    console.log(`  Severe Rescued: ${genResult.severeRescued}`);

    if (genResult.error) {
      console.error(`  Error: ${genResult.error}`);
    }
  } catch (error) {
    console.error('Pattern generation failed:', error);
  }

  // Get final stats
  const finalPatternCount = await prisma.pattern.count();
  console.log(`\nFinal pattern count: ${finalPatternCount}`);

  // Get pattern distribution
  const patternDist = await prisma.$queryRaw<
    Array<{ make: string; count: number }>
  >`
    SELECT make, COUNT(*) as count
    FROM "Pattern"
    GROUP BY make
    ORDER BY count DESC
    LIMIT 10
  `;
  console.log('\nPatterns by Make:');
  for (const { make, count } of patternDist) {
    console.log(`  ${make}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Script failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
