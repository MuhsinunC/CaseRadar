/**
 * NHTSA Bulk Import API
 * POST /api/nhtsa/bulk-import - Start bulk import from NHTSA flat file
 * GET /api/nhtsa/bulk-import - Get import status/progress
 * DELETE /api/nhtsa/bulk-import - Cancel import
 *
 * Note: Bulk import now auto-triggers via cron when database has < 100,000 complaints.
 * This API is provided for manual triggering and monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getImportStatus,
  runBulkImport,
  isBulkImportNeeded,
} from '@/lib/nhtsa/bulk-import';

// Track the cancel function for manual imports
let cancelCurrentImport: (() => void) | null = null;

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

    const status = getImportStatus();

    if (!status.isRunning && !status.result) {
      // Check if import is needed
      const needed = await isBulkImportNeeded();
      return NextResponse.json({
        status: 'idle',
        message: 'No import in progress',
        importNeeded: needed,
      });
    }

    return NextResponse.json({
      status: status.isRunning ? 'running' : 'complete',
      progress: status.progress,
      result: status.result,
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
    const status = getImportStatus();
    if (status.isRunning) {
      return NextResponse.json(
        { error: 'Import already in progress' },
        { status: 409 }
      );
    }

    // Parse body for optional force flag
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    // Check if import is actually needed
    if (!force) {
      const needed = await isBulkImportNeeded();
      if (!needed) {
        return NextResponse.json({
          success: false,
          message: 'Database already has sufficient complaints. Use force=true to override.',
        });
      }
    }

    // Run import in background
    runBulkImport().catch((error) => {
      console.error('[API] Bulk import failed:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Bulk import started',
      status: 'running',
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

    const status = getImportStatus();
    if (!status.isRunning) {
      return NextResponse.json({
        success: false,
        message: 'No import in progress',
      });
    }

    // Note: The BulkImportService doesn't expose a cancel function through getImportStatus
    // For now, inform the user that cancellation isn't supported mid-stream
    return NextResponse.json({
      success: false,
      message: 'Import cancellation not supported. The import will complete on its own.',
    });
  } catch (error) {
    console.error('Error cancelling import:', error);
    return NextResponse.json(
      { error: 'Failed to cancel import' },
      { status: 500 }
    );
  }
}
