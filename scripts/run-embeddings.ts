#!/usr/bin/env npx tsx
/**
 * Run Embedding Generation Script
 *
 * Generates embeddings for all complaints without embeddings.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." EMBEDDING_SERVICE_URL="http://localhost:8080" npx tsx scripts/run-embeddings.ts
 *
 * For K8s (with port-forward active):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/caseradar" npx tsx scripts/run-embeddings.ts
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

    // Verify final count
    const finalResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `;
    const finalCount = Number(finalResult[0].count);
    console.log(`\nFinal embedding count: ${finalCount.toLocaleString()} / ${totalCount.toLocaleString()}`);

    await prisma.$disconnect();
    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('\nEmbedding generation failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
