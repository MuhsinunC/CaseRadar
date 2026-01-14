/**
 * NHTSA Sync API
 * POST /api/nhtsa/sync - Trigger NHTSA data sync
 * GET /api/nhtsa/sync - Get sync status/stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { nhtsaSyncService } from '@/lib/nhtsa/sync';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await nhtsaSyncService.getSyncStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error getting sync stats:', error);
    return NextResponse.json(
      { error: 'Failed to get sync stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const syncType = body.type || 'high-severity';
    const limit = body.limit || 1000;

    let result;

    switch (syncType) {
      case 'new':
        console.log('Starting sync of new complaints...');
        result = await nhtsaSyncService.syncNewComplaints();
        break;

      case 'high-severity':
        console.log(`Starting sync of ${limit} high-severity complaints...`);
        result = await nhtsaSyncService.syncHighSeverityComplaints(limit);
        break;

      case 'backfill':
        if (!body.make || !body.model) {
          return NextResponse.json(
            { error: 'Make and model required for backfill' },
            { status: 400 }
          );
        }
        console.log(`Starting backfill for ${body.make} ${body.model}...`);
        result = await nhtsaSyncService.backfillByVehicle(
          body.make,
          body.model,
          body.yearStart || 2015,
          body.yearEnd || 2024
        );
        break;

      case 'backfill-embeddings':
        console.log(`Starting embedding backfill for ${limit} complaints...`);
        result = await nhtsaSyncService.backfillEmbeddings(limit);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid sync type. Use: new, high-severity, backfill, or backfill-embeddings' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      syncType,
      result,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
