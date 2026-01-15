/**
 * Test Pattern Detection on High-Quality Complaints
 * Only uses complaints with valid descriptions AND component names
 */

import { prisma } from '../src/lib/db';
import { PatternGenerationService } from '../src/lib/patterns/pattern-generation-service';

async function testQualityComplaints() {
  console.log('=== Testing on High-Quality Complaints ===\n');

  // Count complaints with valid data
  const qualityStats = await prisma.$queryRaw<[{
    total_with_embeddings: bigint;
    with_valid_component: bigint;
    with_valid_description: bigint;
    high_quality: bigint;
  }]>`
    SELECT
      COUNT(*) as total_with_embeddings,
      SUM(CASE WHEN component NOT IN ('0', '1', '') THEN 1 ELSE 0 END) as with_valid_component,
      SUM(CASE WHEN description != '' THEN 1 ELSE 0 END) as with_valid_description,
      SUM(CASE WHEN component NOT IN ('0', '1', '') AND description != '' THEN 1 ELSE 0 END) as high_quality
    FROM "Complaint"
    WHERE embedding IS NOT NULL
  `;

  console.log('Total with Embeddings:', Number(qualityStats[0].total_with_embeddings));
  console.log('With Valid Component:', Number(qualityStats[0].with_valid_component));
  console.log('With Valid Description:', Number(qualityStats[0].with_valid_description));
  console.log('High Quality (both):', Number(qualityStats[0].high_quality));
  console.log('');

  // Get component distribution for high-quality complaints
  const componentDist = await prisma.$queryRaw<Array<{
    component: string;
    count: bigint;
  }>>`
    SELECT component, COUNT(*) as count
    FROM "Complaint"
    WHERE embedding IS NOT NULL
      AND component NOT IN ('0', '1', '')
      AND description != ''
    GROUP BY component
    ORDER BY count DESC
    LIMIT 15
  `;

  console.log('=== Component Distribution (High Quality) ===');
  for (const c of componentDist) {
    console.log(`  ${c.component}: ${Number(c.count)}`);
  }
  console.log('');

  // Get make distribution for high-quality complaints
  const makeDist = await prisma.$queryRaw<Array<{
    make: string;
    model: string;
    count: bigint;
  }>>`
    SELECT make, model, COUNT(*) as count
    FROM "Complaint"
    WHERE embedding IS NOT NULL
      AND component NOT IN ('0', '1', '')
      AND description != ''
    GROUP BY make, model
    ORDER BY count DESC
    LIMIT 10
  `;

  console.log('=== Make/Model Distribution (High Quality) ===');
  for (const m of makeDist) {
    console.log(`  ${m.make} ${m.model}: ${Number(m.count)}`);
  }

  await prisma.$disconnect();
}

testQualityComplaints().catch(console.error);
