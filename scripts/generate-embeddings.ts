/**
 * Embedding Generation Script
 *
 * Run with: npx tsx scripts/generate-embeddings.ts [count]
 *
 * Generates embeddings for complaints without them, bypassing API authentication.
 */

import { prisma } from '../src/lib/db';
import { complaintEmbedder } from '../src/lib/embeddings/complaint-embedder';

const DEFAULT_COUNT = 5000;

async function main() {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);

  console.log(`\n=== Embedding Generation Script ===`);
  console.log(`Target: ${count} embeddings\n`);

  // Get current stats
  const stats = await complaintEmbedder.getStats();
  console.log(`Current state:`);
  console.log(`  Total complaints: ${stats.total.toLocaleString()}`);
  console.log(`  With embeddings: ${stats.withEmbedding.toLocaleString()} (${stats.percentComplete}%)`);
  console.log(`  Without embeddings: ${stats.withoutEmbedding.toLocaleString()}\n`);

  if (stats.withoutEmbedding === 0) {
    console.log('✓ All complaints already have embeddings!');
    await prisma.$disconnect();
    return;
  }

  const toGenerate = Math.min(count, stats.withoutEmbedding);
  console.log(`Generating ${toGenerate} embeddings...\n`);

  const startTime = Date.now();
  const batchSize = 100;
  let totalProcessed = 0;
  let totalErrors = 0;

  for (let i = 0; i < toGenerate; i += batchSize) {
    const currentBatch = Math.min(batchSize, toGenerate - i);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(toGenerate / batchSize);

    process.stdout.write(`\rBatch ${batchNum}/${totalBatches}: Processing ${currentBatch} complaints... `);

    try {
      const result = await complaintEmbedder.embedMissingComplaints(currentBatch);
      totalProcessed += result.processed;
      totalErrors += result.errors.length;

      if (result.processed === 0) {
        console.log('\nNo more complaints to process.');
        break;
      }

      // Progress info
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalProcessed / elapsed;
      const remaining = toGenerate - totalProcessed;
      const eta = remaining / rate;

      process.stdout.write(`Done. Rate: ${rate.toFixed(1)}/s, ETA: ${Math.round(eta)}s`);

      // Rate limiting between batches
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`\nBatch ${batchNum} failed:`, error);
      totalErrors++;
    }
  }

  console.log('\n');

  // Final stats
  const finalStats = await complaintEmbedder.getStats();
  const duration = (Date.now() - startTime) / 1000;

  console.log(`=== Complete ===`);
  console.log(`Duration: ${duration.toFixed(1)} seconds`);
  console.log(`Embeddings generated: ${totalProcessed.toLocaleString()}`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`\nFinal state:`);
  console.log(`  With embeddings: ${finalStats.withEmbedding.toLocaleString()} (${finalStats.percentComplete}%)`);
  console.log(`  Without embeddings: ${finalStats.withoutEmbedding.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Script failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
