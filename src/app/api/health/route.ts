/**
 * Health Check Endpoint
 * Returns application health status
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  };

  const responseTime = Date.now() - startTime;

  return NextResponse.json(
    {
      ...health,
      responseTime: `${responseTime}ms`,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export const runtime = 'nodejs';
