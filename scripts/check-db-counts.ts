import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to database...');

    const complaintCount = await prisma.complaint.count();
    const patternCount = await prisma.pattern.count();
    const leadCount = await prisma.lead.count();
    const recallCount = await prisma.recall.count();

    console.log('\n=== Database Record Counts ===');
    console.log('Complaints:', complaintCount);
    console.log('Patterns:', patternCount);
    console.log('Leads:', leadCount);
    console.log('Recalls:', recallCount);

    // Check complaints with embeddings
    const withEmbeddings = await prisma.$queryRaw<[{count: bigint}]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `;
    console.log('\nComplaints with embeddings:', Number(withEmbeddings[0].count));

    // Check complaints without embeddings
    const withoutEmbeddings = await prisma.$queryRaw<[{count: bigint}]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    console.log('Complaints without embeddings:', Number(withoutEmbeddings[0].count));

    // Check pipeline runs
    const pipelineRuns = await prisma.pipelineRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5
    });

    if (pipelineRuns.length > 0) {
      console.log('\n=== Recent Pipeline Runs ===');
      for (const run of pipelineRuns) {
        console.log(`- ${run.id}: ${run.status} (${run.mode}) - ${run.totalRecords} records, ${run.startedAt}`);
      }
    }

    await prisma.$disconnect();
    console.log('\nDatabase check complete.');
  } catch (e: any) {
    console.error('Database error:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
