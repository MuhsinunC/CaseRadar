/**
 * NHTSA Recalls Sync Service
 * Handles synchronization of NHTSA recall data with our database
 * and cross-referencing with detected patterns
 *
 * Cost: FREE (public API)
 */

import { prisma } from '@/lib/db';
import { recallsClient } from './recalls-client';
import { RecallSyncStatus, TransformedRecall, RecallsByVehicleParams } from './types';
import { generateEmbedding, formatEmbeddingForPgvector, checkEmbeddingService } from '@/lib/embeddings';
import { getRecallEmbeddingText } from '@/lib/patterns/semantic-matching';

// Rate limiting delay (ms)
const REQUEST_DELAY = 250;

// Embedding service availability
let embeddingsEnabled = false;

/**
 * Initialize embedding service check
 */
async function initEmbeddingService(): Promise<boolean> {
  try {
    embeddingsEnabled = await checkEmbeddingService();
    if (embeddingsEnabled) {
      console.log('Embedding service available - recalls will include embeddings');
    } else {
      console.warn('Embedding service not available - recalls will be inserted without embeddings');
    }
    return embeddingsEnabled;
  } catch {
    console.warn('Embedding service check failed - continuing without embeddings');
    return false;
  }
}

/**
 * Sleep helper
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * NHTSA Recalls Sync Service
 */
export const recallsSyncService = {
  /**
   * Get the last recall sync date
   */
  async getLastSyncDate(): Promise<Date | null> {
    const lastRecall = await prisma.recall.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return lastRecall?.createdAt ?? null;
  },

  /**
   * Get total recall count
   */
  async getRecallCount(): Promise<number> {
    return prisma.recall.count();
  },

  /**
   * Sync recalls for all unique vehicles in our complaints database
   * This is the main sync function that should be called periodically
   */
  async syncRecallsFromComplaints(): Promise<RecallSyncStatus> {
    const status: RecallSyncStatus = {
      lastSyncDate: null,
      totalRecalls: 0,
      newRecalls: 0,
      errors: [],
      inProgress: true,
    };

    try {
      status.lastSyncDate = await this.getLastSyncDate();

      // Get unique make/model/year combinations from complaints
      const uniqueVehicles = await prisma.complaint.groupBy({
        by: ['make', 'model', 'year'],
        _count: true,
        orderBy: { _count: { year: 'desc' } },
      });

      console.log(`Found ${uniqueVehicles.length} unique vehicle combinations`);

      let totalFetched = 0;
      let newInserted = 0;

      for (const vehicle of uniqueVehicles) {
        try {
          const recalls = await recallsClient.getTransformedRecallsByVehicle({
            make: vehicle.make,
            model: vehicle.model,
            modelYear: vehicle.year,
          });

          totalFetched += recalls.length;

          if (recalls.length > 0) {
            const result = await this.insertRecalls(recalls);
            newInserted += result.inserted;
          }

          // Rate limiting
          await sleep(REQUEST_DELAY);
        } catch (error) {
          const msg = `Failed to sync recalls for ${vehicle.make} ${vehicle.model} ${vehicle.year}: ${error}`;
          status.errors.push(msg);
          console.warn(msg);
        }
      }

      status.totalRecalls = totalFetched;
      status.newRecalls = newInserted;

      console.log(`Recalls sync complete: ${newInserted} new recalls inserted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.errors.push(`Recalls sync failed: ${message}`);
      console.error('Recalls sync error:', error);
    }

    status.inProgress = false;
    return status;
  },

  /**
   * Sync recalls for a specific vehicle
   */
  async syncRecallsForVehicle(
    params: RecallsByVehicleParams
  ): Promise<{ fetched: number; inserted: number; errors: string[] }> {
    const errors: string[] = [];

    try {
      const recalls = await recallsClient.getTransformedRecallsByVehicle(params);
      const result = await this.insertRecalls(recalls);

      return {
        fetched: recalls.length,
        inserted: result.inserted,
        errors,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
      return { fetched: 0, inserted: 0, errors };
    }
  },

  /**
   * Insert recalls into database (upsert) with embedding generation
   */
  async insertRecalls(
    recalls: TransformedRecall[]
  ): Promise<{ inserted: number; skipped: number; embeddingsGenerated: number }> {
    let inserted = 0;
    let skipped = 0;
    let embeddingsGenerated = 0;

    // Check embedding service on first call
    if (!embeddingsEnabled) {
      await initEmbeddingService();
    }

    for (const recall of recalls) {
      try {
        // Generate embedding if service is available
        let embeddingVector: string | null = null;
        if (embeddingsEnabled) {
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
            embeddingVector = formatEmbeddingForPgvector(embedding);
            embeddingsGenerated++;
          } catch (embErr) {
            console.warn(`Failed to generate embedding for recall ${recall.nhtsaCampaignNumber}:`, embErr);
          }
        }

        // Upsert recall with or without embedding
        if (embeddingVector) {
          await prisma.$executeRaw`
            INSERT INTO "Recall" (
              id, "nhtsaCampaignNumber", manufacturer, make, model, year, component,
              summary, consequence, remedy, notes, "reportReceivedDate", "parkIt", "parkOutside",
              embedding, "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid()::text, ${recall.nhtsaCampaignNumber}, ${recall.manufacturer},
              ${recall.make}, ${recall.model}, ${recall.year}, ${recall.component},
              ${recall.summary}, ${recall.consequence}, ${recall.remedy}, ${recall.notes},
              ${recall.reportReceivedDate}, ${recall.parkIt}, ${recall.parkOutside},
              ${embeddingVector}::vector, NOW(), NOW()
            )
            ON CONFLICT ("nhtsaCampaignNumber") DO UPDATE SET
              summary = EXCLUDED.summary,
              consequence = EXCLUDED.consequence,
              remedy = EXCLUDED.remedy,
              notes = EXCLUDED.notes,
              embedding = EXCLUDED.embedding,
              "updatedAt" = NOW()
          `;
        } else {
          await prisma.recall.upsert({
            where: { nhtsaCampaignNumber: recall.nhtsaCampaignNumber },
            create: {
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
            },
            update: {
              summary: recall.summary,
              consequence: recall.consequence,
              remedy: recall.remedy,
              notes: recall.notes,
            },
          });
        }
        inserted++;
      } catch (error) {
        // Log but continue
        if (error instanceof Error && !error.message.includes('Unique constraint')) {
          console.warn(`Error inserting recall ${recall.nhtsaCampaignNumber}:`, error);
        }
        skipped++;
      }
    }

    return { inserted, skipped, embeddingsGenerated };
  },

  /**
   * Cross-reference patterns with recalls
   * This is the core function that identifies which patterns have related recalls
   */
  async crossReferencePatterns(): Promise<{
    patternsChecked: number;
    patternsWithRecalls: number;
    linksCreated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let patternsChecked = 0;
    let patternsWithRecalls = 0;
    let linksCreated = 0;

    try {
      // Get all active patterns
      const patterns = await prisma.pattern.findMany({
        where: { isActive: true },
        select: {
          id: true,
          make: true,
          model: true,
          component: true,
          yearStart: true,
          yearEnd: true,
        },
      });

      // Get all recalls
      const recalls = await prisma.recall.findMany();
      const transformedRecalls: TransformedRecall[] = recalls.map((r) => ({
        nhtsaCampaignNumber: r.nhtsaCampaignNumber,
        manufacturer: r.manufacturer,
        make: r.make,
        model: r.model,
        year: r.year,
        component: r.component,
        summary: r.summary,
        consequence: r.consequence,
        remedy: r.remedy,
        notes: r.notes,
        reportReceivedDate: r.reportReceivedDate,
        parkIt: r.parkIt,
        parkOutside: r.parkOutside,
      }));

      console.log(`Cross-referencing ${patterns.length} patterns with ${recalls.length} recalls`);

      for (const pattern of patterns) {
        patternsChecked++;

        const relatedRecalls = recallsClient.findRelatedRecalls(
          pattern.make,
          pattern.model,
          pattern.component,
          pattern.yearStart,
          pattern.yearEnd,
          transformedRecalls
        );

        if (relatedRecalls.length > 0) {
          patternsWithRecalls++;

          // Create pattern-recall links
          for (const match of relatedRecalls) {
            try {
              // Get recall ID from database
              const recallRecord = await prisma.recall.findUnique({
                where: { nhtsaCampaignNumber: match.recall.nhtsaCampaignNumber },
                select: { id: true },
              });

              if (recallRecord) {
                // Upsert the link
                await prisma.patternRecall.upsert({
                  where: {
                    patternId_recallId: {
                      patternId: pattern.id,
                      recallId: recallRecord.id,
                    },
                  },
                  create: {
                    patternId: pattern.id,
                    recallId: recallRecord.id,
                    matchScore: match.matchScore,
                    matchReason: match.matchReason,
                  },
                  update: {
                    matchScore: match.matchScore,
                    matchReason: match.matchReason,
                  },
                });
                linksCreated++;
              }
            } catch (error) {
              const msg = `Failed to link pattern ${pattern.id} to recall ${match.recall.nhtsaCampaignNumber}: ${error}`;
              errors.push(msg);
            }
          }
        }
      }

      console.log(
        `Cross-reference complete: ${patternsWithRecalls}/${patternsChecked} patterns have related recalls, ${linksCreated} links created`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Cross-reference failed: ${message}`);
      console.error('Cross-reference error:', error);
    }

    return {
      patternsChecked,
      patternsWithRecalls,
      linksCreated,
      errors,
    };
  },

  /**
   * Get patterns without any related recalls (high-value leads!)
   * These are patterns that may represent unaddressed defects
   */
  async getPatternsWithoutRecalls(): Promise<
    Array<{
      id: string;
      name: string;
      make: string;
      model: string | null;
      component: string;
      complaintCount: number;
      severityScore: number;
    }>
  > {
    const patternsWithRecalls = await prisma.patternRecall.findMany({
      select: { patternId: true },
      distinct: ['patternId'],
    });

    const patternIdsWithRecalls = new Set(patternsWithRecalls.map((pr) => pr.patternId));

    const allPatterns = await prisma.pattern.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        make: true,
        model: true,
        component: true,
        complaintCount: true,
        severityScore: true,
      },
      orderBy: { severityScore: 'desc' },
    });

    return allPatterns.filter((p) => !patternIdsWithRecalls.has(p.id));
  },

  /**
   * Get recall statistics
   */
  async getRecallStats(): Promise<{
    totalRecalls: number;
    lastSyncDate: Date | null;
    recallsByYear: { year: number; count: number }[];
    topMakes: { make: string; count: number }[];
    patternsWithRecalls: number;
    patternsWithoutRecalls: number;
  }> {
    const [
      totalRecalls,
      lastSyncDate,
      recallsByYear,
      topMakes,
      totalPatterns,
      patternsWithRecalls,
    ] = await Promise.all([
      prisma.recall.count(),
      this.getLastSyncDate(),
      prisma.recall.groupBy({
        by: ['year'],
        _count: true,
        orderBy: { year: 'desc' },
        take: 20,
      }),
      prisma.recall.groupBy({
        by: ['make'],
        _count: true,
        orderBy: { _count: { make: 'desc' } },
        take: 10,
      }),
      prisma.pattern.count({ where: { isActive: true } }),
      prisma.patternRecall.findMany({
        select: { patternId: true },
        distinct: ['patternId'],
      }),
    ]);

    return {
      totalRecalls,
      lastSyncDate,
      recallsByYear: recallsByYear.map((r) => ({
        year: r.year,
        count: r._count,
      })),
      topMakes: topMakes.map((r) => ({
        make: r.make,
        count: r._count,
      })),
      patternsWithRecalls: patternsWithRecalls.length,
      patternsWithoutRecalls: totalPatterns - patternsWithRecalls.length,
    };
  },
};

export default recallsSyncService;
