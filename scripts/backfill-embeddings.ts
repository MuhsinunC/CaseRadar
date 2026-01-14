/**
 * Backfill embeddings for complaints that don't have them
 * Usage: npx tsx scripts/backfill-embeddings.ts [limit]
 */

import { prisma } from '../src/lib/db';
import { generateEmbedding, formatEmbeddingForPgvector, checkEmbeddingService, getModelInfo } from '../src/lib/embeddings';

async function backfillEmbeddings(limit: number = 500) {
  console.log('Checking embedding service...');

  const available = await checkEmbeddingService();
  if (!available) {
    console.error('Embedding service not available. Make sure Ollama is running.');
    process.exit(1);
  }

  const info = getModelInfo();
  console.log(`Using ${info.provider}/${info.model} (${info.dimensions} dimensions)`);

  // Count complaints without embeddings
  const withoutEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
  `;
  const total = Number(withoutEmbeddings[0].count);
  console.log(`Found ${total} complaints without embeddings`);

  if (total === 0) {
    console.log('All complaints have embeddings!');
    return;
  }

  // Get batch of complaints without embeddings
  const complaints = await prisma.$queryRaw<Array<{
    id: string;
    description: string;
    make: string;
    model: string;
    year: number;
    component: string;
    crash: boolean;
    fire: boolean;
    injuries: number;
    deaths: number;
  }>>`
    SELECT id, description, make, model, year, component, crash, fire, injuries, deaths
    FROM "Complaint"
    WHERE embedding IS NULL
    LIMIT ${limit}
  `;

  console.log(`Processing ${complaints.length} complaints...`);

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  for (const c of complaints) {
    try {
      const text = [
        c.description,
        `Vehicle: ${c.make} ${c.model} ${c.year}`,
        `Component: ${c.component}`,
        c.crash ? 'Crash reported' : '',
        c.fire ? 'Fire reported' : '',
        c.injuries > 0 ? `${c.injuries} injuries` : '',
        c.deaths > 0 ? `${c.deaths} deaths` : '',
      ].filter(Boolean).join(' | ');

      const embedding = await generateEmbedding(text);
      const vectorStr = formatEmbeddingForPgvector(embedding);

      await prisma.$executeRaw`
        UPDATE "Complaint"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${c.id}
      `;

      processed++;

      if (processed % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = complaints.length - processed;
        const eta = remaining / rate;
        console.log(`Progress: ${processed}/${complaints.length} | Rate: ${rate.toFixed(1)}/s | ETA: ${eta.toFixed(0)}s`);
      }
    } catch (error) {
      errors++;
      console.warn(`Error processing ${c.id}:`, error);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n=== Completed ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${totalTime.toFixed(1)}s`);
  console.log(`Rate: ${(processed / totalTime).toFixed(1)} embeddings/s`);
  console.log(`Remaining: ${total - processed} complaints without embeddings`);
}

const limit = parseInt(process.argv[2] || '500');
console.log(`Backfilling embeddings for up to ${limit} complaints...\n`);

backfillEmbeddings(limit)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
