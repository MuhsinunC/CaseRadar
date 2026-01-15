/**
 * NHTSA Data Sync Service
 * Handles synchronization of NHTSA complaint data with our database
 * Includes embedding generation for semantic search and clustering
 */

import { prisma } from '@/lib/db';
import { nhtsaClient } from './client';
import { transformSODARecords, calculateSeverityScore } from './transformer';
import { SyncStatus, TransformedComplaint } from './types';
import {
  generateResilientEmbedding,
  formatEmbeddingForPgvector,
  getModelInfo,
  getEmbeddingHealth,
} from '@/lib/embeddings';

// Batch size for database inserts
const BATCH_SIZE = 50; // Smaller batches for embedding generation

// Check if embeddings are enabled (scalable service or fallback)
let embeddingsEnabled = false;

/**
 * Initialize embedding service check using resilient client
 */
async function initEmbeddingService(): Promise<boolean> {
  try {
    const health = await getEmbeddingHealth();
    embeddingsEnabled = health.scalable.healthy || health.fallback.healthy;

    if (embeddingsEnabled) {
      const info = getModelInfo();
      const preferredService = health.scalable.healthy ? 'scalable' : 'fallback';
      console.log(`Embedding service ready: ${preferredService} (${info.dimensions} dims)`);
      console.log(`  Scalable: ${health.scalable.healthy ? 'healthy' : 'unavailable'} (circuit: ${health.scalable.circuitState})`);
      console.log(`  Fallback: ${health.fallback.healthy ? 'healthy' : 'unavailable'}`);
    } else {
      console.warn('No embedding service available - complaints will be inserted without embeddings');
    }
    return embeddingsEnabled;
  } catch {
    console.warn('Embedding service check failed - continuing without embeddings');
    return false;
  }
}

/**
 * Generate embedding text for a complaint
 */
function getEmbeddingText(complaint: TransformedComplaint): string {
  return [
    complaint.description,
    `Vehicle: ${complaint.make} ${complaint.model} ${complaint.year}`,
    `Component: ${complaint.component}`,
    complaint.crash ? 'Crash reported' : '',
    complaint.fire ? 'Fire reported' : '',
    complaint.injuries > 0 ? `${complaint.injuries} injuries` : '',
    complaint.deaths > 0 ? `${complaint.deaths} deaths` : '',
  ].filter(Boolean).join(' | ');
}

/**
 * NHTSA Sync Service
 */
export const nhtsaSyncService = {
  /**
   * Get the last sync date from the database
   */
  async getLastSyncDate(): Promise<Date | null> {
    const lastComplaint = await prisma.complaint.findFirst({
      orderBy: { dateAdded: 'desc' },
      select: { dateAdded: true },
    });
    return lastComplaint?.dateAdded ?? null;
  },

  /**
   * Sync new complaints since the last sync
   */
  async syncNewComplaints(): Promise<SyncStatus> {
    const status: SyncStatus = {
      lastSyncDate: null,
      totalComplaints: 0,
      newComplaints: 0,
      errors: [],
      inProgress: true,
    };

    try {
      // Get last sync date
      const lastSync = await this.getLastSyncDate();
      status.lastSyncDate = lastSync;

      // Determine start date (default to 7 days ago if no previous sync)
      const startDate = lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      console.log(`Syncing complaints since ${startDate.toISOString()}`);

      // Fetch new complaints from NHTSA
      const rawRecords = await nhtsaClient.getComplaintsSince(startDate);
      status.totalComplaints = rawRecords.length;

      if (rawRecords.length === 0) {
        console.log('No new complaints found');
        status.inProgress = false;
        return status;
      }

      // Transform records
      const { transformed, errors } = transformSODARecords(rawRecords);
      status.errors.push(...errors);

      // Insert in batches
      let inserted = 0;
      for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
        const batch = transformed.slice(i, i + BATCH_SIZE);
        const result = await this.insertBatch(batch);
        inserted += result.count;
      }

      status.newComplaints = inserted;
      console.log(`Inserted ${inserted} new complaints`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.errors.push(`Sync failed: ${message}`);
      console.error('Sync error:', error);
    }

    status.inProgress = false;
    return status;
  },

  /**
   * Insert a batch of complaints with embeddings
   */
  async insertBatch(
    complaints: TransformedComplaint[]
  ): Promise<{ count: number }> {
    // Check embedding service on first call
    if (!embeddingsEnabled) {
      await initEmbeddingService();
    }

    let count = 0;

    for (const c of complaints) {
      try {
        // Check if complaint already exists
        const existing = await prisma.complaint.findFirst({
          where: { nhtsaId: c.nhtsaId },
          select: { id: true },
        });

        if (existing) continue;

        // Generate embedding if service is available
        let embeddingVector: string | null = null;
        if (embeddingsEnabled) {
          try {
            const text = getEmbeddingText(c);
            const embedding = await generateResilientEmbedding(text);
            embeddingVector = formatEmbeddingForPgvector(embedding);
          } catch (error) {
            console.warn(`Embedding failed for complaint ${c.nhtsaId}:`, error);
          }
        }

        // Insert with embedding using raw SQL for pgvector support
        if (embeddingVector) {
          await prisma.$executeRaw`
            INSERT INTO "Complaint" (
              id, "nhtsaId", "odiNumber", manufacturer, make, model, year,
              component, description, crash, fire, injuries, deaths,
              "failDate", "dateAdded", embedding, "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid(),
              ${c.nhtsaId},
              ${c.odiNumber},
              ${c.manufacturer},
              ${c.make},
              ${c.model},
              ${c.year},
              ${c.component},
              ${c.description},
              ${c.crash},
              ${c.fire},
              ${c.injuries},
              ${c.deaths},
              ${c.failDate},
              ${c.dateAdded},
              ${embeddingVector}::vector,
              NOW(),
              NOW()
            )
            ON CONFLICT ("nhtsaId") DO NOTHING
          `;
        } else {
          // Insert without embedding
          await prisma.complaint.create({
            data: {
              nhtsaId: c.nhtsaId,
              odiNumber: c.odiNumber,
              manufacturer: c.manufacturer,
              make: c.make,
              model: c.model,
              year: c.year,
              component: c.component,
              description: c.description,
              crash: c.crash,
              fire: c.fire,
              injuries: c.injuries,
              deaths: c.deaths,
              failDate: c.failDate,
              dateAdded: c.dateAdded,
            },
          });
        }

        count++;
      } catch (error) {
        // Skip duplicates and other errors
        if (!(error instanceof Error) || !error.message.includes('Unique constraint')) {
          console.warn(`Error inserting complaint ${c.nhtsaId}:`, error);
        }
      }
    }

    return { count };
  },

  /**
   * Backfill historical data for a specific make/model
   */
  async backfillByVehicle(
    make: string,
    model: string,
    yearStart: number,
    yearEnd: number
  ): Promise<SyncStatus> {
    const status: SyncStatus = {
      lastSyncDate: null,
      totalComplaints: 0,
      newComplaints: 0,
      errors: [],
      inProgress: true,
    };

    try {
      for (let year = yearStart; year <= yearEnd; year++) {
        console.log(`Fetching ${make} ${model} ${year}...`);

        const response = await nhtsaClient.getComplaintsByVehicle({
          make,
          model,
          modelYear: year,
        });

        status.totalComplaints += response.count;

        if (response.results.length > 0) {
          // Transform API response format
          const transformed: TransformedComplaint[] = response.results
            .filter((r) => r.products?.[0])
            .map((r) => ({
              nhtsaId: r.odiNumber,
              odiNumber: r.odiNumber,
              manufacturer: r.manufacturer,
              make: make.toUpperCase(),
              model: model,
              year: year,
              component: r.components.split(':')[0] || 'UNKNOWN',
              description: r.summary,
              crash: r.crash.toLowerCase() === 'yes',
              fire: r.fire.toLowerCase() === 'yes',
              injuries: r.numberOfInjured,
              deaths: r.numberOfDeaths,
              failDate: r.dateOfIncident ? new Date(r.dateOfIncident) : null,
              dateAdded: r.dateComplaintFiled
                ? new Date(r.dateComplaintFiled)
                : new Date(),
            }));

          const result = await this.insertBatch(transformed);
          status.newComplaints += result.count;
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.errors.push(`Backfill failed: ${message}`);
      console.error('Backfill error:', error);
    }

    status.inProgress = false;
    return status;
  },

  /**
   * Sync high-severity complaints (prioritized)
   */
  async syncHighSeverityComplaints(limit: number = 500): Promise<SyncStatus> {
    const status: SyncStatus = {
      lastSyncDate: null,
      totalComplaints: 0,
      newComplaints: 0,
      errors: [],
      inProgress: true,
    };

    try {
      const rawRecords = await nhtsaClient.getHighSeverityComplaints(limit);
      status.totalComplaints = rawRecords.length;

      const { transformed, errors } = transformSODARecords(rawRecords);
      status.errors.push(...errors);

      // Insert
      const result = await this.insertBatch(transformed);
      status.newComplaints = result.count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.errors.push(`High-severity sync failed: ${message}`);
    }

    status.inProgress = false;
    return status;
  },

  /**
   * Backfill embeddings for existing complaints without them
   */
  async backfillEmbeddings(limit: number = 1000): Promise<{
    processed: number;
    errors: number;
    remaining: number;
  }> {
    // Initialize embedding service
    await initEmbeddingService();

    if (!embeddingsEnabled) {
      throw new Error('Embedding service not available. Ensure Ollama is running: ollama serve');
    }

    // Count complaints without embeddings
    const withoutEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    const total = Number(withoutEmbeddings[0].count);

    console.log(`Found ${total} complaints without embeddings`);

    if (total === 0) {
      return { processed: 0, errors: 0, remaining: 0 };
    }

    // Get batch of complaints
    const complaints = await prisma.complaint.findMany({
      where: {},
      select: {
        id: true,
        description: true,
        make: true,
        model: true,
        year: true,
        component: true,
        crash: true,
        fire: true,
        injuries: true,
        deaths: true,
      },
      take: limit,
    });

    // Filter to only those without embeddings using raw query
    const idsWithoutEmbeddings = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Complaint" WHERE embedding IS NULL LIMIT ${limit}
    `;
    const idsSet = new Set(idsWithoutEmbeddings.map(r => r.id));
    const toProcess = complaints.filter(c => idsSet.has(c.id));

    let processed = 0;
    let errors = 0;

    for (const c of toProcess) {
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

        const embedding = await generateResilientEmbedding(text);
        const vectorStr = formatEmbeddingForPgvector(embedding);

        await prisma.$executeRaw`
          UPDATE "Complaint"
          SET embedding = ${vectorStr}::vector
          WHERE id = ${c.id}
        `;

        processed++;

        if (processed % 100 === 0) {
          console.log(`Backfill progress: ${processed}/${toProcess.length}`);
        }
      } catch (error) {
        errors++;
        console.warn(`Embedding backfill failed for ${c.id}:`, error);
      }
    }

    return {
      processed,
      errors,
      remaining: total - processed,
    };
  },

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<{
    totalComplaints: number;
    lastSyncDate: Date | null;
    complaintsByYear: { year: number; count: number }[];
    topMakes: { make: string; count: number }[];
  }> {
    const [totalComplaints, lastSyncDate, complaintsByYear, topMakes] =
      await Promise.all([
        prisma.complaint.count(),
        this.getLastSyncDate(),
        prisma.complaint.groupBy({
          by: ['year'],
          _count: true,
          orderBy: { year: 'desc' },
          take: 20,
        }),
        prisma.complaint.groupBy({
          by: ['make'],
          _count: true,
          orderBy: { _count: { make: 'desc' } },
          take: 10,
        }),
      ]);

    return {
      totalComplaints,
      lastSyncDate,
      complaintsByYear: complaintsByYear.map((r) => ({
        year: r.year,
        count: r._count,
      })),
      topMakes: topMakes.map((r) => ({
        make: r.make,
        count: r._count,
      })),
    };
  },
};

export default nhtsaSyncService;
