#!/usr/bin/env npx tsx
/**
 * Verify 100% Embedding SLA
 *
 * Checks that ALL complaints have embeddings.
 * Run this after any bulk import or sync operation.
 *
 * Usage:
 *   npx tsx scripts/verify-embedding-sla.ts
 *
 * Exit codes:
 *   0 - 100% SLA met
 *   1 - SLA violation (missing embeddings)
 */

import { prisma } from '../src/lib/db';

async function main() {
  console.log('=== Embedding SLA Verification ===\n');

  try {
    // Get counts
    const totalCount = await prisma.complaint.count();

    if (totalCount === 0) {
      console.log('No complaints in database. Nothing to verify.');
      process.exit(0);
    }

    const withEmbeddingResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `;
    const withEmbedding = Number(withEmbeddingResult[0].count);

    const withoutEmbeddingResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    const withoutEmbedding = Number(withoutEmbeddingResult[0].count);

    const coverage = (withEmbedding / totalCount) * 100;

    console.log(`Total complaints:     ${totalCount.toLocaleString()}`);
    console.log(`With embedding:       ${withEmbedding.toLocaleString()}`);
    console.log(`Without embedding:    ${withoutEmbedding.toLocaleString()}`);
    console.log(`Coverage:             ${coverage.toFixed(4)}%`);

    if (withoutEmbedding > 0) {
      console.error(`\n❌ SLA VIOLATION: ${withoutEmbedding.toLocaleString()} complaints missing embeddings!`);

      // Sample some missing ones
      const samples = await prisma.$queryRaw<Array<{ id: string; nhtsaId: string; make: string; model: string }>>`
        SELECT id, "nhtsaId", make, model
        FROM "Complaint"
        WHERE embedding IS NULL
        LIMIT 5
      `;

      if (samples.length > 0) {
        console.log('\nSample complaints missing embeddings:');
        samples.forEach((s, i) => {
          console.log(`  ${i + 1}. ${s.nhtsaId} - ${s.make} ${s.model}`);
        });
      }

      console.log('\nTo fix, run: npx tsx scripts/run-embeddings.ts');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log('\n✅ 100% SLA MET - All complaints have embeddings');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
