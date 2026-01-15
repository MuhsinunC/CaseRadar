/**
 * Pipelined Embedding Generation Script
 *
 * Run with: npx tsx scripts/generate-embeddings-pipelined.ts [count]
 *
 * Uses async pipeline architecture for maximum throughput:
 * - Reader, Embedder, Writer run concurrently
 * - Expected 30%+ improvement over sequential approach
 *
 * Sequential: ~461/s (sum of all stage times)
 * Pipelined: ~622/s (limited by slowest stage)
 */

import { prisma } from '../src/lib/db';
import { runPipelinedEmbedding, PipelineStats } from '../src/lib/embeddings/pipelined-embedder';
import { destroyEmbeddingClient } from '../src/lib/embeddings/resilient-client';

const DEFAULT_COUNT = 500000;

async function main() {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);

  console.log(`\n=== Pipelined Embedding Generation ===`);
  console.log(`Target: ${count.toLocaleString()} embeddings\n`);

  // Get current stats (use raw SQL since embedding not in Prisma schema)
  const [dbStats] = await prisma.$queryRaw<Array<{ total: bigint; with_embedding: bigint }>>`
    SELECT COUNT(*) as total, COUNT(embedding) as with_embedding FROM "Complaint"
  `;
  const total = Number(dbStats.total);
  const withEmbedding = Number(dbStats.with_embedding);
  const withoutEmbedding = total - withEmbedding;

  console.log(`Current state:`);
  console.log(`  Total complaints: ${total.toLocaleString()}`);
  console.log(`  With embeddings: ${withEmbedding.toLocaleString()} (${((withEmbedding / total) * 100).toFixed(1)}%)`);
  console.log(`  Without embeddings: ${withoutEmbedding.toLocaleString()}\n`);

  if (withoutEmbedding === 0) {
    console.log('✓ All complaints already have embeddings!');
    destroyEmbeddingClient();
    await prisma.$disconnect();
    return;
  }

  const toGenerate = Math.min(count, withoutEmbedding);
  console.log(`Generating ${toGenerate.toLocaleString()} embeddings with pipelined approach...\n`);

  const startTime = Date.now();
  let lastPrint = Date.now();

  // Run pipelined generation with progress callback
  const stats = await runPipelinedEmbedding(toGenerate, (progress: PipelineStats) => {
    const now = Date.now();
    // Print progress every 2 seconds
    if (now - lastPrint >= 2000) {
      const elapsed = (now - startTime) / 1000;
      const rate = progress.written / elapsed;
      const remaining = toGenerate - progress.written;
      const eta = remaining > 0 ? remaining / rate : 0;

      process.stdout.write(
        `\rProgress: ${progress.written.toLocaleString()}/${toGenerate.toLocaleString()} ` +
        `(${((progress.written / toGenerate) * 100).toFixed(1)}%) ` +
        `| Rate: ${rate.toFixed(0)}/s | ETA: ${formatTime(eta)} ` +
        `| Queue: R=${progress.read - progress.embedded}, W=${progress.embedded - progress.written}`
      );
      lastPrint = now;
    }
  });

  console.log('\n\n');

  // Final stats
  const duration = (Date.now() - startTime) / 1000;
  const rate = stats.written / duration;

  console.log(`=== Complete ===`);
  console.log(`Duration: ${formatTime(duration)}`);
  console.log(`Embeddings generated: ${stats.written.toLocaleString()}`);
  console.log(`Overall rate: ${rate.toFixed(0)}/s`);
  console.log(`Errors: ${stats.errors}`);

  console.log(`\n=== Stage Breakdown ===`);
  const totalStageTime = stats.readTime + stats.embedTime + stats.writeTime;
  console.log(`Read:   ${stats.readTime}ms (${((stats.readTime / totalStageTime) * 100).toFixed(1)}%) - ${Math.round(stats.read * 1000 / Math.max(1, stats.readTime))}/s`);
  console.log(`Embed:  ${stats.embedTime}ms (${((stats.embedTime / totalStageTime) * 100).toFixed(1)}%) - ${Math.round(stats.embedded * 1000 / Math.max(1, stats.embedTime))}/s`);
  console.log(`Write:  ${stats.writeTime}ms (${((stats.writeTime / totalStageTime) * 100).toFixed(1)}%) - ${Math.round(stats.written * 1000 / Math.max(1, stats.writeTime))}/s`);

  console.log(`\n=== Pipeline Efficiency ===`);
  const sequentialTime = stats.readTime + stats.embedTime + stats.writeTime;
  const actualTime = duration * 1000;
  const overlap = sequentialTime - actualTime;
  const efficiency = (overlap / sequentialTime) * 100;
  console.log(`Sequential would take: ${formatTime(sequentialTime / 1000)}`);
  console.log(`Pipelined took: ${formatTime(duration)}`);
  console.log(`Time saved by pipelining: ${formatTime(overlap / 1000)} (${efficiency.toFixed(1)}% overlap)`);

  // Get final DB stats
  const [finalStats] = await prisma.$queryRaw<Array<{ total: bigint; with_embedding: bigint }>>`
    SELECT COUNT(*) as total, COUNT(embedding) as with_embedding FROM "Complaint"
  `;
  const finalWithEmbedding = Number(finalStats.with_embedding);
  const finalTotal = Number(finalStats.total);
  console.log(`\nFinal state:`);
  console.log(`  With embeddings: ${finalWithEmbedding.toLocaleString()} (${((finalWithEmbedding / finalTotal) * 100).toFixed(1)}%)`);
  console.log(`  Without embeddings: ${(finalTotal - finalWithEmbedding).toLocaleString()}`);

  // Cleanup
  destroyEmbeddingClient();
  await prisma.$disconnect();
}

function formatTime(seconds: number): string {
  if (seconds < 0) return '0s';
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
