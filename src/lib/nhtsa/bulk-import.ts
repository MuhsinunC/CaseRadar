/**
 * Bulk Import Service
 * Handles importing large numbers of complaints from NHTSA flat file
 * Uses streaming and batching for memory efficiency
 */

import { Readable } from 'stream';
import { prisma } from '@/lib/db';
import { parseFlatFileStream, mapFlatFileToComplaint, FlatFileRecord } from './flat-file-parser';
import { TransformedComplaint } from './types';

/**
 * Import progress information
 */
export interface ImportProgress {
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsErrored: number;
  batchNumber: number;
  estimatedTotal: number;
  percentComplete: number;
  startTime: Date;
  elapsedMs: number;
  recordsPerSecond: number;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsErrored: number;
  durationMs: number;
  errors: string[];
}

/**
 * Import options
 */
export interface ImportOptions {
  batchSize?: number;
  onProgress?: (progress: ImportProgress) => void;
  skipDuplicates?: boolean;
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  batchSize?: number;
}

/**
 * Default batch size for database inserts
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Estimated total records in NHTSA database
 */
const ESTIMATED_TOTAL_RECORDS = 2200000;

/**
 * Bulk Import Service
 * Manages the import of large datasets from NHTSA flat files
 */
export class BulkImportService {
  private batchSize: number;
  private cancelled: boolean = false;
  private currentProgress: ImportProgress;

  constructor(config: ServiceConfig = {}) {
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.currentProgress = this.createInitialProgress();
  }

  /**
   * Create initial progress object
   */
  private createInitialProgress(): ImportProgress {
    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
      recordsErrored: 0,
      batchNumber: 0,
      estimatedTotal: ESTIMATED_TOTAL_RECORDS,
      percentComplete: 0,
      startTime: new Date(),
      elapsedMs: 0,
      recordsPerSecond: 0,
    };
  }

  /**
   * Import records from a readable stream
   * @param stream - Readable stream containing flat file data
   * @param options - Import options
   * @returns Import result with statistics
   */
  async importFromStream(
    stream: Readable,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const { batchSize = this.batchSize, onProgress, skipDuplicates = true } = options;

    this.cancelled = false;
    this.currentProgress = this.createInitialProgress();
    const startTime = Date.now();
    const errors: string[] = [];

    let batch: TransformedComplaint[] = [];

    try {
      // Parse records from the stream
      for await (const record of parseFlatFileStream(stream)) {
        if (this.cancelled) {
          break;
        }

        try {
          // Map flat file record to complaint
          const complaint = mapFlatFileToComplaint(record);

          // Check for duplicates if enabled
          if (skipDuplicates) {
            const existing = await prisma.complaint.findFirst({
              where: { nhtsaId: complaint.nhtsaId },
              select: { id: true },
            });

            if (existing) {
              this.currentProgress.recordsSkipped++;
              this.currentProgress.recordsProcessed++;
              continue;
            }
          }

          batch.push(complaint);

          // Process batch when full
          if (batch.length >= batchSize) {
            await this.processBatch(batch);
            batch = [];
            this.currentProgress.batchNumber++;

            // Update progress
            this.updateProgress(startTime);

            if (onProgress) {
              onProgress({ ...this.currentProgress });
            }
          }
        } catch (error) {
          this.currentProgress.recordsErrored++;
          errors.push(`Error processing record: ${error instanceof Error ? error.message : String(error)}`);
        }

        this.currentProgress.recordsProcessed++;
      }

      // Process remaining records
      if (batch.length > 0) {
        await this.processBatch(batch);
        this.currentProgress.batchNumber++;
      }

      // Final progress update
      this.updateProgress(startTime);

      if (onProgress) {
        onProgress({ ...this.currentProgress });
      }

      return {
        success: true,
        recordsProcessed: this.currentProgress.recordsProcessed,
        recordsInserted: this.currentProgress.recordsInserted,
        recordsSkipped: this.currentProgress.recordsSkipped,
        recordsErrored: this.currentProgress.recordsErrored,
        durationMs: Date.now() - startTime,
        errors,
      };
    } catch (error) {
      errors.push(`Import failed: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        recordsProcessed: this.currentProgress.recordsProcessed,
        recordsInserted: this.currentProgress.recordsInserted,
        recordsSkipped: this.currentProgress.recordsSkipped,
        recordsErrored: this.currentProgress.recordsErrored,
        durationMs: Date.now() - startTime,
        errors,
      };
    }
  }

  /**
   * Process a batch of complaints
   * @param batch - Array of complaints to insert
   */
  private async processBatch(batch: TransformedComplaint[]): Promise<void> {
    if (batch.length === 0) return;

    try {
      // Use createMany for efficient bulk insert
      const result = await prisma.complaint.createMany({
        data: batch.map((complaint) => ({
          nhtsaId: complaint.nhtsaId,
          odiNumber: complaint.odiNumber,
          manufacturer: complaint.manufacturer,
          make: complaint.make,
          model: complaint.model,
          year: complaint.year,
          component: complaint.component,
          description: complaint.description,
          crash: complaint.crash,
          fire: complaint.fire,
          injuries: complaint.injuries,
          deaths: complaint.deaths,
          failDate: complaint.failDate,
          dateAdded: complaint.dateAdded,
        })),
        skipDuplicates: true,
      });

      this.currentProgress.recordsInserted += result.count;
    } catch (error) {
      // If batch insert fails, try individual inserts
      for (const complaint of batch) {
        try {
          await prisma.complaint.create({
            data: {
              nhtsaId: complaint.nhtsaId,
              odiNumber: complaint.odiNumber,
              manufacturer: complaint.manufacturer,
              make: complaint.make,
              model: complaint.model,
              year: complaint.year,
              component: complaint.component,
              description: complaint.description,
              crash: complaint.crash,
              fire: complaint.fire,
              injuries: complaint.injuries,
              deaths: complaint.deaths,
              failDate: complaint.failDate,
              dateAdded: complaint.dateAdded,
            },
          });
          this.currentProgress.recordsInserted++;
        } catch {
          this.currentProgress.recordsErrored++;
        }
      }
    }
  }

  /**
   * Update progress calculations
   */
  private updateProgress(startTime: number): void {
    const elapsedMs = Date.now() - startTime;
    this.currentProgress.elapsedMs = elapsedMs;

    if (elapsedMs > 0) {
      this.currentProgress.recordsPerSecond = Math.round(
        (this.currentProgress.recordsProcessed / elapsedMs) * 1000
      );
    }

    if (this.currentProgress.estimatedTotal > 0) {
      this.currentProgress.percentComplete = Math.min(
        100,
        Math.round(
          (this.currentProgress.recordsProcessed / this.currentProgress.estimatedTotal) * 100
        )
      );
    }
  }

  /**
   * Get current import progress
   * @returns Current progress snapshot
   */
  async getProgress(): Promise<ImportProgress> {
    return { ...this.currentProgress };
  }

  /**
   * Cancel an in-progress import
   */
  cancel(): void {
    this.cancelled = true;
  }
}

export default BulkImportService;
