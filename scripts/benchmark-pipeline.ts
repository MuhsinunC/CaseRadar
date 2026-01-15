/**
 * Benchmark: Sequential vs Pipelined Embedding Generation
 *
 * Run with: npx tsx scripts/benchmark-pipeline.ts [count]
 *
 * Compares throughput between:
 * 1. Sequential: Read → Embed → Write (waits for each stage)
 * 2. Pipelined: Reader, Embedder, Writer run concurrently
 */

import { prisma } from '../src/lib/db';
import { complaintEmbedder } from '../src/lib/embeddings/complaint-embedder';
import { runPipelinedEmbedding, PipelineStats } from '../src/lib/embeddings/pipelined-embedder';
import { destroyEmbeddingClient } from '../src/lib/embeddings/resilient-client';

const DEFAULT_COUNT = 1000; // Small batch for quick comparison

interface BenchmarkResult {
  name: string;
  count: number;
  duration: number;
  rate: number;
  errors: number;
}

async function clearTestEmbeddings(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  // Clear embeddings to allow re-testing
  await prisma.$executeRaw`
    UPDATE "Complaint"
    SET embedding = NULL
    WHERE id = ANY(${ids}::text[])
  `;
}

async function getTestIds(count: number): Promise<string[]> {
  // Get IDs of complaints that have embeddings (so we can test multiple times)
  const complaints = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Complaint"
    WHERE embedding IS NOT NULL
    LIMIT ${count}
  `;
  return complaints.map(c => c.id);
}

async function benchmarkSequential(count: number): Promise<BenchmarkResult> {
  console.log(`\n--- Sequential Benchmark (${count} embeddings) ---`);

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  const batchSize = 500;

  while (processed < count) {
    const batchCount = Math.min(batchSize, count - processed);

    try {
      const result = await complaintEmbedder.embedMissingComplaints(batchCount);
      processed += result.processed;
      errors += result.errors.length;

      if (result.processed === 0) break;

      process.stdout.write(`\r  Sequential: ${processed}/${count} (${((processed / count) * 100).toFixed(1)}%)`);
    } catch (error) {
      console.error('\n  Batch error:', error);
      errors++;
      break;
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  const rate = processed / duration;

  console.log(`\n  Completed: ${processed} in ${duration.toFixed(1)}s = ${rate.toFixed(0)}/s`);

  return { name: 'Sequential', count: processed, duration, rate, errors };
}

async function benchmarkPipelined(count: number): Promise<BenchmarkResult> {
  console.log(`\n--- Pipelined Benchmark (${count} embeddings) ---`);

  const startTime = Date.now();
  let lastWritten = 0;

  const stats = await runPipelinedEmbedding(count, (progress: PipelineStats) => {
    if (progress.written !== lastWritten) {
      process.stdout.write(`\r  Pipelined: ${progress.written}/${count} (${((progress.written / count) * 100).toFixed(1)}%)`);
      lastWritten = progress.written;
    }
  });

  const duration = (Date.now() - startTime) / 1000;
  const rate = stats.written / duration;

  console.log(`\n  Completed: ${stats.written} in ${duration.toFixed(1)}s = ${rate.toFixed(0)}/s`);

  return { name: 'Pipelined', count: stats.written, duration, rate, errors: stats.errors };
}

async function main() {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);

  console.log(`\n=== Pipeline Benchmark ===`);
  console.log(`Target: ${count.toLocaleString()} embeddings per run\n`);

  // Check available complaints without embeddings (use raw SQL since embedding not in Prisma schema)
  const [stats] = await prisma.$queryRaw<Array<{ total: bigint; with_embedding: bigint }>>`
    SELECT COUNT(*) as total, COUNT(embedding) as with_embedding FROM "Complaint"
  `;
  const total = Number(stats.total);
  const withoutEmbedding = total - Number(stats.with_embedding);

  console.log(`Database state:`);
  console.log(`  Total complaints: ${total.toLocaleString()}`);
  console.log(`  Without embeddings: ${withoutEmbedding.toLocaleString()}`);

  if (withoutEmbedding < count * 2) {
    // Need to clear some embeddings for fair comparison
    console.log(`\nNeed ${count * 2} complaints without embeddings for fair comparison.`);
    console.log(`Clearing embeddings from ${count * 2} complaints...`);

    const testIds = await getTestIds(count * 2);
    if (testIds.length < count * 2) {
      console.log(`Only ${testIds.length} complaints available. Adjusting test size.`);
    }
    await clearTestEmbeddings(testIds);
    console.log(`Cleared ${testIds.length} embeddings for testing.`);
  }

  // Run sequential benchmark first
  const sequentialResult = await benchmarkSequential(count);

  // Clear embeddings for pipelined test
  console.log(`\nClearing embeddings for pipelined test...`);
  const testIds = await getTestIds(count);
  await clearTestEmbeddings(testIds);

  // Run pipelined benchmark
  const pipelinedResult = await benchmarkPipelined(count);

  // Results comparison
  console.log(`\n\n=== BENCHMARK RESULTS ===\n`);
  console.log(`                Sequential    Pipelined    Improvement`);
  console.log(`  Count:        ${sequentialResult.count.toString().padStart(10)}    ${pipelinedResult.count.toString().padStart(10)}`);
  console.log(`  Duration:     ${sequentialResult.duration.toFixed(1).padStart(10)}s   ${pipelinedResult.duration.toFixed(1).padStart(10)}s`);
  console.log(`  Rate:         ${sequentialResult.rate.toFixed(0).padStart(10)}/s   ${pipelinedResult.rate.toFixed(0).padStart(10)}/s   ${((pipelinedResult.rate / sequentialResult.rate - 1) * 100).toFixed(1)}%`);
  console.log(`  Errors:       ${sequentialResult.errors.toString().padStart(10)}    ${pipelinedResult.errors.toString().padStart(10)}`);

  const improvement = ((pipelinedResult.rate / sequentialResult.rate) - 1) * 100;

  console.log(`\n=== VERDICT ===`);
  if (improvement >= 30) {
    console.log(`✅ Pipelined approach achieved ${improvement.toFixed(1)}% improvement (target: 30%+)`);
  } else if (improvement >= 20) {
    console.log(`⚠️  Pipelined approach achieved ${improvement.toFixed(1)}% improvement (close to 30% target)`);
  } else if (improvement > 0) {
    console.log(`⚠️  Pipelined approach achieved only ${improvement.toFixed(1)}% improvement (below 30% target)`);
  } else {
    console.log(`❌ Pipelined approach was slower by ${Math.abs(improvement).toFixed(1)}%`);
  }

  // Cleanup
  destroyEmbeddingClient();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Benchmark failed:', error);
  destroyEmbeddingClient();
  await prisma.$disconnect();
  process.exit(1);
});
