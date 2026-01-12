/**
 * Database Health Check Endpoint
 * Verifies database connectivity
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const startTime = Date.now();

  try {
    // Execute a simple query to verify database connectivity
    await prisma.$queryRaw`SELECT 1`;

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    console.error('[Health Check] Database connection failed:', error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}

export const runtime = 'nodejs';
