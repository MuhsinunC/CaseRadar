/**
 * Embedding Generation Script
 *
 * Run with: npx tsx scripts/generate-embeddings.ts [count]
 *
 * Generates embeddings for complaints without them, bypassing API authentication.
 *
 * Performance optimizations:
 * - Batch API: 1000 texts per call = 58,489 emb/s (vs 100 = 922 emb/s)
 * - Batch DB UPDATE using UNNEST: ~50,000 writes/s (vs individual = 2,000/s)
 */

import { prisma } from '../src/lib/db';
import { complaintEmbedder } from '../src/lib/embeddings/complaint-embedder';
import { destroyEmbeddingClient } from '../src/lib/embeddings/resilient-client';

// Optimized for maximum throughput
// DB writes now use batch UPDATE with UNNEST (50k writes/s vs 2k/s)
const DEFAULT_COUNT = 500000;  // Default to 500k per run
const BATCH_SIZE = 1000;       // Process 1000 at a time (matches API batch size)

async function main() {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);

  console.log(`\n=== Embedding Generation Script ===`);
  console.log(`Target: ${count.toLocaleString()} embeddings\n`);

  // Get current stats
  const stats = await complaintEmbedder.getStats();
  console.log(`Current state:`);
  console.log(`  Total complaints: ${stats.total.toLocaleString()}`);
  console.log(`  With embeddings: ${stats.withEmbedding.toLocaleString()} (${stats.percentComplete}%)`);
  console.log(`  Without embeddings: ${stats.withoutEmbedding.toLocaleString()}\n`);

  if (stats.withoutEmbedding === 0) {
    console.log('✓ All complaints already have embeddings!');
    destroyEmbeddingClient();
    await prisma.$disconnect();
    return;
  }

  const toGenerate = Math.min(count, stats.withoutEmbedding);
  console.log(`Generating ${toGenerate.toLocaleString()} embeddings...\n`);

  const startTime = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;
  let batchNum = 0;
  const totalBatches = Math.ceil(toGenerate / BATCH_SIZE);

  // Process batches sequentially (safer for batch DB writes, avoids row-locking)
  while (totalProcessed < toGenerate) {
    const remainingToProcess = toGenerate - totalProcessed;
    const currentBatchSize = Math.min(BATCH_SIZE, remainingToProcess);

    batchNum++;
    process.stdout.write(`\rBatch ${batchNum}/${totalBatches}... `);

    try {
      const result = await complaintEmbedder.embedMissingComplaints(currentBatchSize);

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
      const eta = remaining > 0 ? remaining / rate : 0;

      process.stdout.write(
        `+${result.processed} embeddings. ` +
        `Total: ${totalProcessed.toLocaleString()}/${toGenerate.toLocaleString()}. ` +
        `Rate: ${rate.toFixed(0)}/s, ETA: ${formatTime(eta)}`
      );
      console.log('');

    } catch (error) {
      console.error(`\nBatch ${batchNum} failed:`, error);
      totalErrors++;
      // Continue despite errors
    }
  }

  console.log('\n');

  // Final stats
  const finalStats = await complaintEmbedder.getStats();
  const duration = (Date.now() - startTime) / 1000;

  console.log(`=== Complete ===`);
  console.log(`Duration: ${formatTime(duration)}`);
  console.log(`Embeddings generated: ${totalProcessed.toLocaleString()}`);
  console.log(`Rate: ${(totalProcessed / duration).toFixed(0)}/s`);
  console.log(`Errors: ${totalErrors}`);
  console.log(`\nFinal state:`);
  console.log(`  With embeddings: ${finalStats.withEmbedding.toLocaleString()} (${finalStats.percentComplete}%)`);
  console.log(`  Without embeddings: ${finalStats.withoutEmbedding.toLocaleString()}`);

  // Cleanup to prevent hanging
  destroyEmbeddingClient();
  await prisma.$disconnect();
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

main().catch(async (error) => {
  console.error('Script failed:', error);
  destroyEmbeddingClient();
  await prisma.$disconnect();
  process.exit(1);
});
