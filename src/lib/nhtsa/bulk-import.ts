/**
 * Bulk Import Service
 * Handles importing large numbers of complaints from NHTSA flat file
 * Uses streaming and batching for memory efficiency
 *
 * Auto-triggers when database has < 100,000 complaints
 */

import { Readable } from 'stream';
import { prisma } from '@/lib/db';
import { parseFlatFileStream, mapFlatFileToComplaint, FlatFileRecord, isQualityComplaint } from './flat-file-parser';
import { TransformedComplaint } from './types';
import { downloadAndExtract, getFlatFileStream } from './flat-file-downloader';
import path from 'path';
import os from 'os';
import { rm } from 'fs/promises';

/**
 * Minimum complaint threshold - if below this, trigger bulk import
 */
const MIN_COMPLAINT_THRESHOLD = 100000;

/**
 * Import progress information
 */
export interface ImportProgress {
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsRejected: number;  // Records rejected due to data quality issues
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
  recordsRejected: number;  // Records rejected due to data quality issues
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
      recordsRejected: 0,
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

          // Data quality validation - reject bad records
          if (!isQualityComplaint(complaint)) {
            this.currentProgress.recordsRejected++;
            this.currentProgress.recordsProcessed++;
            continue;
          }

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
        recordsRejected: this.currentProgress.recordsRejected,
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
        recordsRejected: this.currentProgress.recordsRejected,
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

/**
 * Check if bulk import is needed based on complaint count
 * @returns true if complaint count is below threshold
 */
export async function isBulkImportNeeded(): Promise<boolean> {
  try {
    const count = await prisma.complaint.count();
    console.log(`[BulkImport] Current complaint count: ${count.toLocaleString()}`);
    return count < MIN_COMPLAINT_THRESHOLD;
  } catch (error) {
    console.error('[BulkImport] Error checking complaint count:', error);
    return false;
  }
}

/**
 * Global state for tracking import status
 */
let isImportRunning = false;
let currentImportProgress: ImportProgress | null = null;
let currentImportResult: ImportResult | null = null;

/**
 * Get current import status
 */
export function getImportStatus(): {
  isRunning: boolean;
  progress: ImportProgress | null;
  result: ImportResult | null;
} {
  return {
    isRunning: isImportRunning,
    progress: currentImportProgress,
    result: currentImportResult,
  };
}

/**
 * Run bulk import automatically if needed
 * This should be called on app startup or from cron jobs
 */
export async function runBulkImportIfNeeded(): Promise<ImportResult | null> {
  // Check if already running
  if (isImportRunning) {
    console.log('[BulkImport] Import already in progress, skipping');
    return null;
  }

  // Check if import is needed
  const needed = await isBulkImportNeeded();
  if (!needed) {
    console.log('[BulkImport] Database has sufficient complaints, skipping bulk import');
    return null;
  }

  console.log('[BulkImport] Database under-populated, starting automatic bulk import...');
  return runBulkImport();
}

/**
 * Run the bulk import process
 */
export async function runBulkImport(): Promise<ImportResult> {
  if (isImportRunning) {
    throw new Error('Import already in progress');
  }

  isImportRunning = true;
  currentImportResult = null;
  const workDir = path.join(os.tmpdir(), 'nhtsa-bulk-import');

  try {
    const service = new BulkImportService();

    // Download and extract flat file
    console.log('[BulkImport] Downloading NHTSA flat file...');
    const flatFilePath = await downloadAndExtract(workDir, {
      onProgress: (progress) => {
        if (progress.percentage % 10 === 0) {
          console.log(`[BulkImport] Download progress: ${progress.percentage}%`);
        }
      },
    });

    console.log('[BulkImport] Starting import from flat file...');
    const stream = getFlatFileStream(flatFilePath);

    const result = await service.importFromStream(stream, {
      onProgress: (progress) => {
        currentImportProgress = progress;
        // Log every 100,000 records
        if (progress.recordsProcessed % 100000 === 0) {
          console.log(
            `[BulkImport] Progress: ${progress.recordsProcessed.toLocaleString()} records ` +
            `(${progress.percentComplete}%) - ${progress.recordsPerSecond} rec/sec`
          );
        }
      },
    });

    currentImportResult = result;

    console.log('[BulkImport] Import complete:', {
      recordsProcessed: result.recordsProcessed.toLocaleString(),
      recordsInserted: result.recordsInserted.toLocaleString(),
      recordsSkipped: result.recordsSkipped.toLocaleString(),
      recordsRejected: result.recordsRejected.toLocaleString(),
      recordsErrored: result.recordsErrored.toLocaleString(),
      durationMs: result.durationMs,
    });

    // Cleanup
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    return result;
  } catch (error) {
    console.error('[BulkImport] Import failed:', error);
    const errorResult: ImportResult = {
      success: false,
      recordsProcessed: currentImportProgress?.recordsProcessed || 0,
      recordsInserted: currentImportProgress?.recordsInserted || 0,
      recordsSkipped: currentImportProgress?.recordsSkipped || 0,
      recordsRejected: currentImportProgress?.recordsRejected || 0,
      recordsErrored: currentImportProgress?.recordsErrored || 0,
      durationMs: currentImportProgress?.elapsedMs || 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
    currentImportResult = errorResult;

    // Cleanup on error
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  } finally {
    isImportRunning = false;
  }
}

export default BulkImportService;
