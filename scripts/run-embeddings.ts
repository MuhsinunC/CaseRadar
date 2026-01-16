#!/usr/bin/env npx tsx
/**
 * Run Embedding Generation Script
 *
 * Generates embeddings for all complaints without embeddings.
 * ENFORCES 100% SLA - will retry until all complaints have embeddings.
 *
 * Architecture:
 *   - Primary: GPU generation (MPS on Mac, CUDA on Linux)
 *   - Fallback: Multi-threaded CPU generation
 *
 * Usage:
 *   npx tsx scripts/run-embeddings.ts
 *
 * NOTE: The K8s embedding service is DEPRECATED and blocked.
 *       Always use the local GPU/CPU service (localhost:8080).
 */

import { runPipelinedEmbedding, PipelineStats } from '../src/lib/embeddings/pipelined-embedder';
import { prisma } from '../src/lib/db';

async function main() {
  console.log('=== Embedding Generation ===\n');

  // Check database connection
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const embeddingUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8080';
  console.log(`Embedding service: ${embeddingUrl}`);

  // Count complaints without embeddings
  console.log('\nChecking embedding status...');
  const totalCount = await prisma.complaint.count();

  // Use raw query to count non-null embeddings since Prisma doesn't support vector type
  const withEmbeddingResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
  `;
  const withEmbedding = Number(withEmbeddingResult[0].count);
  const withoutEmbedding = totalCount - withEmbedding;

  console.log(`Total complaints:     ${totalCount.toLocaleString()}`);
  console.log(`With embedding:       ${withEmbedding.toLocaleString()}`);
  console.log(`Without embedding:    ${withoutEmbedding.toLocaleString()}`);

  if (withoutEmbedding === 0) {
    console.log('\nAll complaints already have embeddings. Nothing to do.');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\nStarting embedding generation for ${withoutEmbedding.toLocaleString()} complaints...`);
  console.log('This may take a while. Estimated time: 30-60 minutes for 2M records.\n');

  const startTime = Date.now();
  let lastReportTime = startTime;

  try {
    const stats = await runPipelinedEmbedding(
      withoutEmbedding, // Process all without embeddings
      (progress: PipelineStats) => {
        const now = Date.now();
        // Report every 5 seconds
        if (now - lastReportTime >= 5000) {
          const elapsed = (now - startTime) / 1000;
          const rate = progress.written / elapsed;
          const remaining = withoutEmbedding - progress.written;
          const eta = remaining / rate / 60;

          console.log(
            `Progress: ${progress.written.toLocaleString()} / ${withoutEmbedding.toLocaleString()} ` +
            `(${((progress.written / withoutEmbedding) * 100).toFixed(1)}%) ` +
            `- ${rate.toFixed(0)} emb/s ` +
            `- ETA: ${eta.toFixed(1)} min`
          );
          lastReportTime = now;
        }
      }
    );

    const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const rate = (stats.written / ((Date.now() - startTime) / 1000)).toFixed(0);

    console.log('\n=== Embedding Generation Complete ===\n');
    console.log(`Records processed:    ${stats.written.toLocaleString()}`);
    console.log(`Errors:               ${stats.errors}`);
    console.log(`Duration:             ${durationMin} minutes`);
    console.log(`Average rate:         ${rate} embeddings/second`);

    // Verify final count - ENFORCE 100% SLA
    const finalResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `;
    const finalCount = Number(finalResult[0].count);
    const missingCount = totalCount - finalCount;
    const coverage = (finalCount / totalCount) * 100;

    console.log(`\n=== SLA Verification ===`);
    console.log(`Final embedding count: ${finalCount.toLocaleString()} / ${totalCount.toLocaleString()}`);
    console.log(`Coverage: ${coverage.toFixed(2)}%`);
    console.log(`Missing: ${missingCount.toLocaleString()}`);

    // ENFORCE 100% SLA
    if (missingCount > 0) {
      console.error(`\n❌ SLA VIOLATION: ${missingCount.toLocaleString()} complaints missing embeddings!`);
      console.error('100% embedding coverage is REQUIRED. Re-run this script to retry failed embeddings.');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log('\n✅ 100% SLA MET - All complaints have embeddings');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\nEmbedding generation failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
