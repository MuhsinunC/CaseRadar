/**
 * External Services Health Check Endpoint
 * Verifies connectivity to external services
 */

import { NextResponse } from 'next/server';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: string;
  error?: string;
}

async function checkService(
  name: string,
  checkFn: () => Promise<void>
): Promise<ServiceStatus> {
  const startTime = Date.now();

  try {
    await checkFn();
    const responseTime = Date.now() - startTime;

    return {
      name,
      status: 'healthy',
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const startTime = Date.now();

  const services: ServiceStatus[] = await Promise.all([
    // Check NHTSA API
    checkService('nhtsa', async () => {
      const response = await fetch(
        'https://api.nhtsa.gov/products/vehicle/makes?modelYear=2024',
        { signal: AbortSignal.timeout(5000) }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }),

    // Check Clerk (if configured)
    checkService('clerk', async () => {
      const key = process.env.CLERK_SECRET_KEY;
      if (!key) return; // Skip if not configured

      const response = await fetch('https://api.clerk.dev/v1/users?limit=1', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 401) {
        throw new Error(`HTTP ${response.status}`);
      }
    }),

    // Check Stripe (if configured)
    checkService('stripe', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return; // Skip if not configured

      const response = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 401) {
        throw new Error(`HTTP ${response.status}`);
      }
    }),
  ]);

  const totalTime = Date.now() - startTime;
  const allHealthy = services.every(
    (s) => s.status === 'healthy' || s.status === 'unknown'
  );

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      services,
      totalResponseTime: `${totalTime}ms`,
      timestamp: new Date().toISOString(),
    },
    {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export const runtime = 'nodejs';
