/**
 * AI Service Health Checks API
 * GET /api/health/services - Check health of all external services
 *
 * P1-2 Implementation
 *
 * Services checked:
 * - OpenAI (embeddings API)
 * - Anthropic (messages API)
 * - Clerk (authentication)
 * - Stripe (payments)
 * - Sentry (error tracking)
 */

import { NextRequest, NextResponse } from 'next/server';
import { openai, isOpenAIConfigured } from '@/lib/ai/openai';
import { anthropic, isAnthropicConfigured } from '@/lib/ai/anthropic';

/**
 * Service health status
 */
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual service health result
 */
interface ServiceHealth {
  status: HealthStatus;
  latencyMs: number;
  lastChecked: string;
  error?: string;
  configured?: boolean;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  services: {
    openai: ServiceHealth;
    anthropic: ServiceHealth;
    clerk: ServiceHealth;
    stripe: ServiceHealth;
    sentry: ServiceHealth;
  };
  overall: HealthStatus;
  cached: boolean;
  timestamp: string;
}

/**
 * Simple in-memory cache for health check results
 */
let healthCache: {
  data: HealthCheckResponse | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 30000; // 30 seconds
const LATENCY_DEGRADED_THRESHOLD_MS = 2000; // 2 seconds

/**
 * Check if cache is valid
 */
function isCacheValid(): boolean {
  return (
    healthCache.data !== null &&
    Date.now() - healthCache.timestamp < CACHE_TTL_MS
  );
}

/**
 * Check OpenAI health by making a small embeddings request
 */
async function checkOpenAI(): Promise<ServiceHealth> {
  const startTime = Date.now();
  const lastChecked = new Date().toISOString();

  if (!isOpenAIConfigured()) {
    return {
      status: 'unhealthy',
      latencyMs: 0,
      lastChecked,
      error: 'OpenAI API key not configured',
      configured: false,
    };
  }

  try {
    await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'health check',
    });

    const latencyMs = Date.now() - startTime;
    const status: HealthStatus =
      latencyMs > LATENCY_DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy';

    return {
      status,
      latencyMs,
      lastChecked,
      configured: true,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      lastChecked,
      error: error instanceof Error ? error.message : 'Unknown error',
      configured: true,
    };
  }
}

/**
 * Check Anthropic health by making a minimal messages request
 */
async function checkAnthropic(): Promise<ServiceHealth> {
  const startTime = Date.now();
  const lastChecked = new Date().toISOString();

  if (!isAnthropicConfigured()) {
    return {
      status: 'unhealthy',
      latencyMs: 0,
      lastChecked,
      error: 'Anthropic API key not configured',
      configured: false,
    };
  }

  try {
    await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });

    const latencyMs = Date.now() - startTime;
    const status: HealthStatus =
      latencyMs > LATENCY_DEGRADED_THRESHOLD_MS ? 'degraded' : 'healthy';

    return {
      status,
      latencyMs,
      lastChecked,
      configured: true,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      lastChecked,
      error: error instanceof Error ? error.message : 'Unknown error',
      configured: true,
    };
  }
}

/**
 * Check Clerk configuration (we don't make API calls, just verify config)
 */
async function checkClerk(): Promise<ServiceHealth> {
  const lastChecked = new Date().toISOString();
  const configured = !!process.env.CLERK_SECRET_KEY;

  return {
    status: configured ? 'healthy' : 'unhealthy',
    latencyMs: 0,
    lastChecked,
    configured,
    error: configured ? undefined : 'Clerk secret key not configured',
  };
}

/**
 * Check Stripe configuration
 */
async function checkStripe(): Promise<ServiceHealth> {
  const lastChecked = new Date().toISOString();
  const configured = !!process.env.STRIPE_SECRET_KEY;

  return {
    status: configured ? 'healthy' : 'unhealthy',
    latencyMs: 0,
    lastChecked,
    configured,
    error: configured ? undefined : 'Stripe secret key not configured',
  };
}

/**
 * Check Sentry configuration
 */
async function checkSentry(): Promise<ServiceHealth> {
  const lastChecked = new Date().toISOString();
  const configured = !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    status: configured ? 'healthy' : 'unhealthy',
    latencyMs: 0,
    lastChecked,
    configured,
    error: configured ? undefined : 'Sentry DSN not configured',
  };
}

/**
 * Calculate overall status from individual service statuses
 * - AI services (OpenAI, Anthropic) are critical
 * - Other services being unhealthy only causes degraded status
 */
function calculateOverallStatus(
  services: HealthCheckResponse['services']
): HealthStatus {
  // Check critical AI services
  const criticalServices = [services.openai, services.anthropic];
  const hasCriticalUnhealthy = criticalServices.some(
    (s) => s.status === 'unhealthy'
  );

  if (hasCriticalUnhealthy) {
    return 'unhealthy';
  }

  // Check if any service is unhealthy (non-critical)
  const allServices = Object.values(services);
  const hasAnyUnhealthy = allServices.some((s) => s.status === 'unhealthy');
  const hasAnyDegraded = allServices.some((s) => s.status === 'degraded');

  if (hasAnyUnhealthy || hasAnyDegraded) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * GET /api/health/services
 * Check health of all external services
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const force = request.nextUrl.searchParams.get('force') === 'true';

  // Return cached result if valid and not forced
  if (!force && isCacheValid()) {
    return NextResponse.json({
      ...healthCache.data,
      cached: true,
    });
  }

  // Run health checks in parallel with timeout
  const [
    openaiResult,
    anthropicResult,
    clerkResult,
    stripeResult,
    sentryResult,
  ] = await Promise.all([
    Promise.race([
      checkOpenAI(),
      new Promise<ServiceHealth>((resolve) =>
        setTimeout(
          () =>
            resolve({
              status: 'unhealthy',
              latencyMs: 5000,
              lastChecked: new Date().toISOString(),
              error: 'Timeout',
            }),
          5000
        )
      ),
    ]),
    Promise.race([
      checkAnthropic(),
      new Promise<ServiceHealth>((resolve) =>
        setTimeout(
          () =>
            resolve({
              status: 'unhealthy',
              latencyMs: 5000,
              lastChecked: new Date().toISOString(),
              error: 'Timeout',
            }),
          5000
        )
      ),
    ]),
    checkClerk(),
    checkStripe(),
    checkSentry(),
  ]);

  const services = {
    openai: openaiResult,
    anthropic: anthropicResult,
    clerk: clerkResult,
    stripe: stripeResult,
    sentry: sentryResult,
  };

  const overall = calculateOverallStatus(services);
  const timestamp = new Date().toISOString();

  const response: HealthCheckResponse = {
    services,
    overall,
    cached: false,
    timestamp,
  };

  // Cache results
  healthCache = {
    data: response,
    timestamp: Date.now(),
  };

  return NextResponse.json(response, {
    status: overall === 'unhealthy' ? 503 : 200,
  });
}

export const runtime = 'nodejs';
