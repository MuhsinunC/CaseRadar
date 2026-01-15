/**
 * Profile the embedding pipeline to identify bottlenecks
 */

import { prisma } from '../src/lib/db';
import { getResilientClient, destroyEmbeddingClient, formatEmbeddingForPgvector } from '../src/lib/embeddings/resilient-client';

async function profile() {
  const client = getResilientClient();
  const BATCH = 500;

  console.log('=== PIPELINE PROFILE (500 embeddings) ===\n');

  // Stage 1: DB Read
  let start = Date.now();
  const complaints = await prisma.$queryRaw<Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    component: string;
    description: string;
  }>>`
    SELECT id, make, model, year, component, description
    FROM "Complaint"
    WHERE embedding IS NULL
    LIMIT ${BATCH}
  `;
  const dbReadTime = Date.now() - start;
  console.log(`1. DB Read:     ${dbReadTime}ms (${Math.round(BATCH * 1000 / dbReadTime)}/s)`);

  // Stage 2: Text preparation
  start = Date.now();
  const texts = complaints.map(c =>
    `Vehicle: ${c.year ?? 'Unknown'} ${c.make} ${c.model}\nComponent: ${c.component}\nIssue: ${c.description}`
  );
  const prepTime = Date.now() - start;
  console.log(`2. Text Prep:   ${prepTime}ms (${Math.round(BATCH * 1000 / Math.max(1, prepTime))}/s)`);

  // Stage 3: Embedding generation
  start = Date.now();
  const embeddings = await client.embedBatch(texts);
  const embeddingTime = Date.now() - start;
  console.log(`3. Embed API:   ${embeddingTime}ms (${Math.round(BATCH * 1000 / embeddingTime)}/s)`);

  // Stage 4: Format for pgvector
  start = Date.now();
  const ids = complaints.map(c => c.id);
  const embeddingStrs = embeddings.map(e => formatEmbeddingForPgvector(e));
  const formatTime = Date.now() - start;
  console.log(`4. Format:      ${formatTime}ms (${Math.round(BATCH * 1000 / Math.max(1, formatTime))}/s)`);

  // Stage 5: DB Write with UNNEST
  start = Date.now();
  await prisma.$executeRaw`
    UPDATE "Complaint" c
    SET embedding = data.embedding::vector
    FROM (
      SELECT
        unnest(${ids}::text[]) as id,
        unnest(${embeddingStrs}::text[]) as embedding
    ) data
    WHERE c.id = data.id
  `;
  const dbWriteTime = Date.now() - start;
  console.log(`5. DB Write:    ${dbWriteTime}ms (${Math.round(BATCH * 1000 / dbWriteTime)}/s)`);

  const total = dbReadTime + prepTime + embeddingTime + formatTime + dbWriteTime;
  console.log(`\n=== TOTAL: ${total}ms = ${Math.round(BATCH * 1000 / total)}/s ===`);

  // Identify bottleneck
  const stages = [
    { name: 'DB Read', time: dbReadTime },
    { name: 'Text Prep', time: prepTime },
    { name: 'Embed API', time: embeddingTime },
    { name: 'Format', time: formatTime },
    { name: 'DB Write', time: dbWriteTime },
  ].sort((a, b) => b.time - a.time);

  console.log(`\nBottleneck: ${stages[0].name} (${Math.round(stages[0].time / total * 100)}% of time)`);

  destroyEmbeddingClient();
  await prisma.$disconnect();
}

profile().catch(e => {
  console.error(e);
  destroyEmbeddingClient();
  prisma.$disconnect();
  process.exit(1);
});
