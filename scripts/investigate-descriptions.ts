/**
 * Investigate why complaint descriptions are empty
 */

import { prisma } from '../src/lib/db';

async function investigate() {
  console.log('=== Description Investigation ===\n');

  // Use raw SQL since embedding is a pgvector column
  const stats = await prisma.$queryRaw<Array<{
    total_with_embeddings: bigint;
    null_descriptions: bigint;
    empty_descriptions: bigint;
    valid_descriptions: bigint;
  }>>`
    SELECT
      COUNT(*) as total_with_embeddings,
      SUM(CASE WHEN description IS NULL THEN 1 ELSE 0 END) as null_descriptions,
      SUM(CASE WHEN description = '' THEN 1 ELSE 0 END) as empty_descriptions,
      SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END) as valid_descriptions
    FROM "Complaint"
    WHERE embedding IS NOT NULL
  `;

  console.log('Total with embeddings:', Number(stats[0].total_with_embeddings));
  console.log('NULL descriptions:', Number(stats[0].null_descriptions));
  console.log('Empty string descriptions:', Number(stats[0].empty_descriptions));
  console.log('Valid descriptions:', Number(stats[0].valid_descriptions));
  console.log('');

  // Check description lengths for a sample by make
  const sample = await prisma.$queryRaw<Array<{
    make: string;
    count: bigint;
    avg_desc_length: number | null;
    null_count: bigint;
    empty_count: bigint;
  }>>`
    SELECT
      make,
      COUNT(*) as count,
      AVG(LENGTH(COALESCE(description, '')))::numeric as avg_desc_length,
      SUM(CASE WHEN description IS NULL THEN 1 ELSE 0 END) as null_count,
      SUM(CASE WHEN description = '' THEN 1 ELSE 0 END) as empty_count
    FROM "Complaint"
    WHERE embedding IS NOT NULL
    GROUP BY make
    ORDER BY count DESC
    LIMIT 15
  `;

  console.log('=== By Make (top 15) ===');
  console.table(sample.map(s => ({
    make: s.make?.substring(0, 25) || 'null',
    count: Number(s.count),
    avg_desc_length: s.avg_desc_length ? Math.round(s.avg_desc_length) : 0,
    null_count: Number(s.null_count),
    empty_count: Number(s.empty_count)
  })));

  // Sample some actual descriptions with valid content
  console.log('\n=== Sample Complaints with Valid Descriptions ===');
  const sampleValid = await prisma.$queryRaw<Array<{
    nhtsaId: string;
    make: string;
    description: string;
    summary: string | null;
  }>>`
    SELECT "nhtsaId", make, description, summary
    FROM "Complaint"
    WHERE embedding IS NOT NULL
      AND description != ''
    LIMIT 5
  `;

  for (const c of sampleValid) {
    console.log(`[${c.nhtsaId}] ${c.make}:`);
    console.log(`  desc: "${c.description.substring(0, 80)}..."`);
    console.log(`  summary: "${(c.summary || 'NULL').substring(0, 60)}..."`);
  }

  // Sample some with empty descriptions
  console.log('\n=== Sample Complaints with Empty Descriptions ===');
  const sampleEmpty = await prisma.$queryRaw<Array<{
    nhtsaId: string;
    make: string;
    description: string;
    summary: string | null;
    component: string | null;
  }>>`
    SELECT "nhtsaId", make, description, summary, component
    FROM "Complaint"
    WHERE embedding IS NOT NULL
      AND description = ''
    LIMIT 5
  `;

  for (const c of sampleEmpty) {
    console.log(`[${c.nhtsaId}] ${c.make} - ${c.component}:`);
    console.log(`  desc: "${c.description || 'EMPTY'}"`);
    console.log(`  summary: "${(c.summary || 'NULL').substring(0, 80)}..."`);
  }

  // Check what text was used to generate embeddings
  console.log('\n=== Key Question: What was used to generate embeddings? ===');
  console.log('Checking embedding generation function...');

  await prisma.$disconnect();
}

investigate().catch(console.error);
