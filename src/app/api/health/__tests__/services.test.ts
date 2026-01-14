/**
 * AI Service Health Checks Tests
 * P1-2 Implementation - TDD
 *
 * Tests for health checks of OpenAI, Anthropic, Clerk, Stripe, and Sentry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../services/route';
import { NextRequest } from 'next/server';

// Mock configuration check functions
const mockIsOpenAIConfigured = vi.fn();
const mockIsAnthropicConfigured = vi.fn();

// Mock external services
vi.mock('@/lib/ai/openai', () => ({
  openai: {
    embeddings: {
      create: vi.fn(),
    },
  },
  isOpenAIConfigured: () => mockIsOpenAIConfigured(),
}));

vi.mock('@/lib/ai/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
  isAnthropicConfigured: () => mockIsAnthropicConfigured(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(() => ({
    users: {
      getCount: vi.fn(),
    },
  })),
}));

vi.mock('stripe', () => {
  return {
    default: vi.fn(() => ({
      balance: {
        retrieve: vi.fn(),
      },
    })),
  };
});

// Import mocked modules
import { openai } from '@/lib/ai/openai';
import { anthropic } from '@/lib/ai/anthropic';

describe('GET /api/health/services', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      CLERK_SECRET_KEY: 'test-clerk-key',
      STRIPE_SECRET_KEY: 'test-stripe-key',
      NEXT_PUBLIC_SENTRY_DSN: 'https://test@sentry.io/123',
    };

    // Default: APIs are configured
    mockIsOpenAIConfigured.mockReturnValue(true);
    mockIsAnthropicConfigured.mockReturnValue(true);

    // Default successful responses
    vi.mocked(openai.embeddings.create).mockResolvedValue({
      data: [{ embedding: [0.1, 0.2], index: 0, object: 'embedding' }],
      model: 'text-embedding-3-small',
      object: 'list',
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });

    vi.mocked(anthropic.messages.create).mockResolvedValue({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-3-haiku-20240307',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('OpenAI Health Check', () => {
    it('should check OpenAI API connectivity', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.openai).toBeDefined();
      expect(data.services.openai).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        latencyMs: expect.any(Number),
        lastChecked: expect.any(String),
      });
    });

    it('should return healthy when OpenAI responds normally', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.openai.status).toBe('healthy');
    });

    it('should return unhealthy if OpenAI errors', async () => {
      vi.mocked(openai.embeddings.create).mockRejectedValue(
        new Error('API Error')
      );

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.openai.status).toBe('unhealthy');
      expect(data.services.openai.error).toBeDefined();
    });

    it('should return unhealthy if OpenAI API key is missing', async () => {
      mockIsOpenAIConfigured.mockReturnValue(false);

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.openai.status).toBe('unhealthy');
    });
  });

  describe('Anthropic Health Check', () => {
    it('should check Anthropic API connectivity', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.anthropic).toBeDefined();
      expect(data.services.anthropic).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        latencyMs: expect.any(Number),
        lastChecked: expect.any(String),
      });
    });

    it('should return healthy when Anthropic responds normally', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.anthropic.status).toBe('healthy');
    });

    it('should return unhealthy if Anthropic errors', async () => {
      vi.mocked(anthropic.messages.create).mockRejectedValue(
        new Error('API Error')
      );

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.anthropic.status).toBe('unhealthy');
    });

    it('should return unhealthy if Anthropic API key is missing', async () => {
      mockIsAnthropicConfigured.mockReturnValue(false);

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.anthropic.status).toBe('unhealthy');
    });
  });

  describe('Sentry Health Check', () => {
    it('should verify Sentry DSN is configured', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.sentry).toBeDefined();
      expect(data.services.sentry.configured).toBe(true);
      expect(data.services.sentry.status).toBe('healthy');
    });

    it('should return unhealthy if Sentry DSN is missing', async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.sentry.configured).toBe(false);
      expect(data.services.sentry.status).toBe('unhealthy');
    });
  });

  describe('Clerk Health Check', () => {
    it('should check Clerk configuration', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.clerk).toBeDefined();
      expect(data.services.clerk.status).toMatch(/healthy|degraded|unhealthy/);
    });

    it('should return unhealthy if Clerk key is missing', async () => {
      delete process.env.CLERK_SECRET_KEY;

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.clerk.status).toBe('unhealthy');
    });
  });

  describe('Stripe Health Check', () => {
    it('should check Stripe configuration', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.stripe).toBeDefined();
      expect(data.services.stripe.status).toMatch(/healthy|degraded|unhealthy/);
    });

    it('should return unhealthy if Stripe key is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services.stripe.status).toBe('unhealthy');
    });
  });

  describe('Overall Status', () => {
    it('should return overall healthy if all services healthy', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.overall).toBe('healthy');
      expect(response.status).toBe(200);
    });

    it('should return overall unhealthy if critical AI service down', async () => {
      vi.mocked(anthropic.messages.create).mockRejectedValue(new Error('Down'));
      vi.mocked(openai.embeddings.create).mockRejectedValue(new Error('Down'));

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.overall).toBe('unhealthy');
      expect(response.status).toBe(503);
    });

    it('should return degraded if non-critical service down', async () => {
      // Only Sentry is down (non-critical)
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.overall).toBe('degraded');
      expect(response.status).toBe(200);
    });
  });

  describe('Caching', () => {
    it('should include cached status in response', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data).toHaveProperty('cached');
    });

    it('should bypass cache with force=true', async () => {
      // First call
      await GET(new NextRequest('http://localhost/api/health/services?force=true'));

      // Second call with force
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.cached).toBe(false);
    });
  });

  describe('Response Structure', () => {
    it('should include timestamp in response', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
    });

    it('should include all service statuses', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/health/services?force=true')
      );
      const data = await response.json();

      expect(data.services).toHaveProperty('openai');
      expect(data.services).toHaveProperty('anthropic');
      expect(data.services).toHaveProperty('clerk');
      expect(data.services).toHaveProperty('stripe');
      expect(data.services).toHaveProperty('sentry');
    });
  });
});
