/**
 * NHTSA Data Sync Service
 * Handles synchronization of NHTSA complaint data with our database
 */

import { prisma } from '@/lib/db';
import { nhtsaClient } from './client';
import { transformSODARecords, calculateSeverityScore } from './transformer';
import { SyncStatus, TransformedComplaint } from './types';

// Batch size for database inserts
const BATCH_SIZE = 100;

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
   * Insert a batch of complaints
   */
  async insertBatch(
    complaints: TransformedComplaint[]
  ): Promise<{ count: number }> {
    return prisma.complaint.createMany({
      data: complaints.map((c) => ({
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
      })),
      skipDuplicates: true,
    });
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
