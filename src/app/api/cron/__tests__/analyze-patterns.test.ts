/**
 * Pattern Analysis Cron Job Tests
 * TDD tests for ML-powered pattern generation cron job
 *
 * Tests the cron job that:
 * 1. Authenticates via CRON_SECRET
 * 2. Calls PatternGenerationService to run ML clustering
 * 3. Returns results summary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the pattern generation service
vi.mock('@/lib/patterns/pattern-generation-service', () => ({
  patternGenerationService: {
    generatePatterns: vi.fn(),
  },
}));

describe('GET /api/cron/analyze-patterns', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'test-cron-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  /**
   * Create authenticated cron request
   */
  function authenticatedCronRequest(): NextRequest {
    return new NextRequest('http://localhost/api/cron/analyze-patterns', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
  }

  /**
   * Create unauthenticated cron request
   */
  function unauthenticatedCronRequest(): NextRequest {
    return new NextRequest('http://localhost/api/cron/analyze-patterns', {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
  }

  it('should return 401 for unauthenticated requests', async () => {
    const { GET } = await import('../analyze-patterns/route');

    const response = await GET(unauthenticatedCronRequest());

    expect(response.status).toBe(401);
  });

  it('should call PatternGenerationService when authenticated', async () => {
    const { patternGenerationService } = await import(
      '@/lib/patterns/pattern-generation-service'
    );
    vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
      success: true,
      patternsCreated: 5,
      patternsUpdated: 0,
      complaintsProcessed: 100,
      noiseCount: 10,
      durationMs: 1500,
    });

    const { GET } = await import('../analyze-patterns/route');

    const response = await GET(authenticatedCronRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(patternGenerationService.generatePatterns).toHaveBeenCalled();
    expect(data.success).toBe(true);
    expect(data.patternsCreated).toBe(5);
  });

  it('should return success: false when ML service fails', async () => {
    const { patternGenerationService } = await import(
      '@/lib/patterns/pattern-generation-service'
    );
    vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
      success: false,
      patternsCreated: 0,
      patternsUpdated: 0,
      complaintsProcessed: 0,
      noiseCount: 0,
      durationMs: 100,
      error: 'ML service is not available',
    });

    const { GET } = await import('../analyze-patterns/route');

    const response = await GET(authenticatedCronRequest());
    const data = await response.json();

    expect(response.status).toBe(200); // Cron job itself succeeded
    expect(data.success).toBe(false);
    expect(data.error).toContain('ML service');
  });

  it('should return duration and pattern counts in response', async () => {
    const { patternGenerationService } = await import(
      '@/lib/patterns/pattern-generation-service'
    );
    vi.mocked(patternGenerationService.generatePatterns).mockResolvedValue({
      success: true,
      patternsCreated: 10,
      patternsUpdated: 2,
      complaintsProcessed: 500,
      noiseCount: 50,
      durationMs: 3000,
    });

    const { GET } = await import('../analyze-patterns/route');

    const response = await GET(authenticatedCronRequest());
    const data = await response.json();

    expect(data.patternsCreated).toBe(10);
    expect(data.patternsUpdated).toBe(2);
    expect(data.complaintsProcessed).toBe(500);
    expect(data.noiseCount).toBe(50);
    expect(data.duration).toBeDefined();
  });

  it('should handle service exceptions gracefully', async () => {
    const { patternGenerationService } = await import(
      '@/lib/patterns/pattern-generation-service'
    );
    vi.mocked(patternGenerationService.generatePatterns).mockRejectedValue(
      new Error('Unexpected error')
    );

    const { GET } = await import('../analyze-patterns/route');

    const response = await GET(authenticatedCronRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unexpected error');
  });
});
