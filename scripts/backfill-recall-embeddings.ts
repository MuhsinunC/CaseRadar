/**
 * Backfill embeddings for recalls that don't have them
 * Usage: npx tsx scripts/backfill-recall-embeddings.ts [limit]
 */

import { prisma } from '../src/lib/db';
import { generateEmbedding, formatEmbeddingForPgvector, checkEmbeddingService, getModelInfo } from '../src/lib/embeddings';
import { getRecallEmbeddingText } from '../src/lib/patterns/semantic-matching';

async function backfillRecallEmbeddings(limit: number = 500) {
  console.log('Checking embedding service...');

  const available = await checkEmbeddingService();
  if (!available) {
    console.error('Embedding service not available. Make sure Ollama is running.');
    process.exit(1);
  }

  const info = getModelInfo();
  console.log(`Using ${info.provider}/${info.model} (${info.dimensions} dimensions)`);

  // Count recalls without embeddings
  const withoutEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Recall" WHERE embedding IS NULL
  `;
  const total = Number(withoutEmbeddings[0].count);
  console.log(`Found ${total} recalls without embeddings`);

  if (total === 0) {
    console.log('All recalls have embeddings!');
    return;
  }

  // Get batch of recalls without embeddings
  const recalls = await prisma.$queryRaw<Array<{
    id: string;
    nhtsaCampaignNumber: string;
    manufacturer: string;
    make: string;
    model: string;
    year: number;
    component: string;
    summary: string;
    consequence: string;
    remedy: string;
    notes: string | null;
    reportReceivedDate: Date;
    parkIt: boolean;
    parkOutside: boolean;
  }>>`
    SELECT id, "nhtsaCampaignNumber", manufacturer, make, model, year, component,
           summary, consequence, remedy, notes, "reportReceivedDate", "parkIt", "parkOutside"
    FROM "Recall"
    WHERE embedding IS NULL
    LIMIT ${limit}
  `;

  console.log(`Processing ${recalls.length} recalls...`);

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  for (const recall of recalls) {
    try {
      const text = getRecallEmbeddingText({
        nhtsaCampaignNumber: recall.nhtsaCampaignNumber,
        manufacturer: recall.manufacturer,
        make: recall.make,
        model: recall.model,
        year: recall.year,
        component: recall.component,
        summary: recall.summary,
        consequence: recall.consequence,
        remedy: recall.remedy,
        notes: recall.notes,
        reportReceivedDate: recall.reportReceivedDate,
        parkIt: recall.parkIt,
        parkOutside: recall.parkOutside,
      });

      const embedding = await generateEmbedding(text);
      const vectorStr = formatEmbeddingForPgvector(embedding);

      await prisma.$executeRaw`
        UPDATE "Recall"
        SET embedding = ${vectorStr}::vector
        WHERE id = ${recall.id}
      `;

      processed++;

      if (processed % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = recalls.length - processed;
        const eta = remaining / rate;
        console.log(`Progress: ${processed}/${recalls.length} | Rate: ${rate.toFixed(1)}/s | ETA: ${eta.toFixed(0)}s`);
      }
    } catch (error) {
      errors++;
      console.warn(`Error processing ${recall.nhtsaCampaignNumber}:`, error);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n=== Completed ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${totalTime.toFixed(1)}s`);
  console.log(`Rate: ${(processed / totalTime).toFixed(1)} embeddings/s`);
  console.log(`Remaining: ${total - processed} recalls without embeddings`);
}

const limit = parseInt(process.argv[2] || '500');
console.log(`Backfilling embeddings for up to ${limit} recalls...\n`);

backfillRecallEmbeddings(limit)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
