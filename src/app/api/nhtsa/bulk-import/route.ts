/**
 * NHTSA Bulk Import API
 * POST /api/nhtsa/bulk-import - Start bulk import from NHTSA flat file
 * GET /api/nhtsa/bulk-import - Get import status/progress
 * DELETE /api/nhtsa/bulk-import - Cancel import
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { BulkImportService, ImportProgress, ImportResult } from '@/lib/nhtsa/bulk-import';
import { downloadAndExtract, getFlatFileStream } from '@/lib/nhtsa/flat-file-downloader';
import { rm } from 'fs/promises';
import path from 'path';
import os from 'os';

// Global import state (in production, use Redis or database)
let currentImport: {
  service: BulkImportService;
  status: 'downloading' | 'extracting' | 'importing' | 'complete' | 'cancelled' | 'error';
  progress: ImportProgress | null;
  result: ImportResult | null;
  startedAt: Date;
  error?: string;
} | null = null;

/**
 * GET /api/nhtsa/bulk-import
 * Get current import status and progress
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!currentImport) {
      return NextResponse.json({
        status: 'idle',
        message: 'No import in progress',
      });
    }

    const progress = currentImport.progress || (await currentImport.service.getProgress());

    return NextResponse.json({
      status: currentImport.status,
      progress,
      result: currentImport.result,
      startedAt: currentImport.startedAt,
      error: currentImport.error,
    });
  } catch (error) {
    console.error('Error getting import status:', error);
    return NextResponse.json(
      { error: 'Failed to get import status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nhtsa/bulk-import
 * Start a new bulk import from NHTSA flat file
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if import already in progress
    if (currentImport && !['complete', 'cancelled', 'error'].includes(currentImport.status)) {
      return NextResponse.json(
        { error: 'Import already in progress', status: currentImport.status },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize || 1000;

    // Initialize import state
    const service = new BulkImportService({ batchSize });
    currentImport = {
      service,
      status: 'downloading',
      progress: null,
      result: null,
      startedAt: new Date(),
    };

    // Run import in background
    runImportInBackground(service).catch((error) => {
      if (currentImport) {
        currentImport.status = 'error';
        currentImport.error = error instanceof Error ? error.message : String(error);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Bulk import started',
      status: 'downloading',
    });
  } catch (error) {
    console.error('Error starting bulk import:', error);
    return NextResponse.json(
      { error: 'Failed to start bulk import', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nhtsa/bulk-import
 * Cancel the current import
 */
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!currentImport) {
      return NextResponse.json({
        success: false,
        message: 'No import in progress',
      });
    }

    currentImport.service.cancel();
    currentImport.status = 'cancelled';

    return NextResponse.json({
      success: true,
      message: 'Import cancelled',
    });
  } catch (error) {
    console.error('Error cancelling import:', error);
    return NextResponse.json(
      { error: 'Failed to cancel import' },
      { status: 500 }
    );
  }
}

/**
 * Run the import process in the background
 */
async function runImportInBackground(service: BulkImportService): Promise<void> {
  const workDir = path.join(os.tmpdir(), 'nhtsa-bulk-import');

  try {
    // Download and extract flat file
    if (currentImport) {
      currentImport.status = 'downloading';
    }

    console.log('Starting NHTSA flat file download...');
    const flatFilePath = await downloadAndExtract(workDir, {
      onProgress: (progress) => {
        console.log(`Download progress: ${progress.percentage}%`);
      },
    });

    console.log('Flat file extracted:', flatFilePath);

    // Start import
    if (currentImport) {
      currentImport.status = 'importing';
    }

    console.log('Starting bulk import...');
    const stream = getFlatFileStream(flatFilePath);

    const result = await service.importFromStream(stream, {
      onProgress: (progress) => {
        if (currentImport) {
          currentImport.progress = progress;
        }
        // Log progress every 10,000 records
        if (progress.recordsProcessed % 10000 === 0) {
          console.log(
            `Import progress: ${progress.recordsProcessed.toLocaleString()} records ` +
            `(${progress.percentComplete}%) - ${progress.recordsPerSecond} rec/sec`
          );
        }
      },
    });

    // Update final state
    if (currentImport) {
      currentImport.status = 'complete';
      currentImport.result = result;
    }

    console.log('Bulk import complete:', {
      recordsProcessed: result.recordsProcessed.toLocaleString(),
      recordsInserted: result.recordsInserted.toLocaleString(),
      recordsSkipped: result.recordsSkipped.toLocaleString(),
      recordsErrored: result.recordsErrored.toLocaleString(),
      durationMs: result.durationMs,
    });

    // Cleanup
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.error('Bulk import error:', error);
    if (currentImport) {
      currentImport.status = 'error';
      currentImport.error = error instanceof Error ? error.message : String(error);
    }

    // Cleanup on error
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}
