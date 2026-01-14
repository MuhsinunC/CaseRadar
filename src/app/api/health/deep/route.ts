/**
 * Deep Health Check Endpoint
 * Full system health verification including write capability
 * Based on architecture documentation: docs/architecture/12-reliability-scalability.md
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAllCircuitStates } from '@/lib/resilience';

interface ComponentStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  responseTime?: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Check database read capability
 */
async function checkDatabaseRead(): Promise<ComponentStatus> {
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    return {
      name: 'database_read',
      status: 'healthy',
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      name: 'database_read',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check database write capability using a test record
 */
async function checkDatabaseWrite(): Promise<ComponentStatus> {
  const startTime = Date.now();
  const testId = `health_check_${Date.now()}`;

  try {
    // Create a temporary audit log entry for the health check
    const created = await prisma.auditLog.create({
      data: {
        action: 'READ',
        resource: 'SETTINGS',
        resourceId: testId,
        metadata: { type: 'health_check' },
      },
    });

    // Delete the test record
    await prisma.auditLog.delete({
      where: { id: created.id },
    });

    const responseTime = Date.now() - startTime;

    return {
      name: 'database_write',
      status: 'healthy',
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      name: 'database_write',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check external service connectivity
 */
async function checkExternalService(
  name: string,
  url: string,
  headers?: Record<string, string>
): Promise<ComponentStatus> {
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    const responseTime = Date.now() - startTime;

    // Accept 200-299 and 401 (auth error means service is reachable)
    if (response.ok || response.status === 401) {
      return {
        name,
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        details: { httpStatus: response.status },
      };
    }

    return {
      name,
      status: 'degraded',
      responseTime: `${responseTime}ms`,
      details: { httpStatus: response.status },
    };
  } catch (error) {
    return {
      name,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check circuit breaker states
 */
function checkCircuitBreakers(): ComponentStatus {
  try {
    const states = getAllCircuitStates();
    const openCircuits = Object.entries(states)
      .filter(([, state]) => state.state === 'OPEN')
      .map(([name]) => name);

    if (openCircuits.length > 0) {
      return {
        name: 'circuit_breakers',
        status: 'degraded',
        details: {
          openCircuits,
          message: `${openCircuits.length} circuit(s) open`,
        },
      };
    }

    return {
      name: 'circuit_breakers',
      status: 'healthy',
      details: {
        allCircuits: Object.keys(states),
        states: Object.fromEntries(
          Object.entries(states).map(([name, state]) => [name, state.state])
        ),
      },
    };
  } catch (error) {
    return {
      name: 'circuit_breakers',
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check memory usage
 */
function checkMemoryUsage(): ComponentStatus {
  try {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (usagePercent > 90) {
      status = 'unhealthy';
    } else if (usagePercent > 75) {
      status = 'degraded';
    }

    return {
      name: 'memory',
      status,
      details: {
        heapUsedMB,
        heapTotalMB,
        usagePercent: `${usagePercent}%`,
        rssMB: Math.round(used.rss / 1024 / 1024),
      },
    };
  } catch (error) {
    return {
      name: 'memory',
      status: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const startTime = Date.now();

  // Run all health checks in parallel
  const [
    dbRead,
    dbWrite,
    nhtsa,
    clerk,
    stripe,
    circuitBreakers,
    memory,
  ] = await Promise.all([
    checkDatabaseRead(),
    checkDatabaseWrite(),
    checkExternalService(
      'nhtsa',
      'https://api.nhtsa.gov/products/vehicle/makes?modelYear=2024'
    ),
    checkExternalService(
      'clerk',
      'https://api.clerk.dev/v1/users?limit=1',
      process.env.CLERK_SECRET_KEY
        ? { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` }
        : undefined
    ),
    checkExternalService(
      'stripe',
      'https://api.stripe.com/v1/balance',
      process.env.STRIPE_SECRET_KEY
        ? { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
        : undefined
    ),
    Promise.resolve(checkCircuitBreakers()),
    Promise.resolve(checkMemoryUsage()),
  ]);

  const components: ComponentStatus[] = [
    dbRead,
    dbWrite,
    nhtsa,
    clerk,
    stripe,
    circuitBreakers,
    memory,
  ];

  const totalTime = Date.now() - startTime;

  // Determine overall status
  const unhealthyCount = components.filter((c) => c.status === 'unhealthy').length;
  const degradedCount = components.filter((c) => c.status === 'degraded').length;

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  let httpStatus: number;

  if (unhealthyCount > 0) {
    // If any core component is unhealthy, system is unhealthy
    const coreUnhealthy = ['database_read', 'database_write'].some(
      (name) => components.find((c) => c.name === name)?.status === 'unhealthy'
    );
    overallStatus = coreUnhealthy ? 'unhealthy' : 'degraded';
    httpStatus = coreUnhealthy ? 503 : 200;
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
    httpStatus = 200;
  } else {
    overallStatus = 'healthy';
    httpStatus = 200;
  }

  return NextResponse.json(
    {
      status: overallStatus,
      components,
      summary: {
        healthy: components.filter((c) => c.status === 'healthy').length,
        degraded: degradedCount,
        unhealthy: unhealthyCount,
        unknown: components.filter((c) => c.status === 'unknown').length,
      },
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || 'unknown',
      totalResponseTime: `${totalTime}ms`,
      timestamp: new Date().toISOString(),
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export const runtime = 'nodejs';
