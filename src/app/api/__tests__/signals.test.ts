/**
 * Signals API Tests
 * Tests for safety signal detection endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock auth middleware
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

// Mock ML detection client
vi.mock('@/lib/patterns/ml-detection-client', () => ({
  mlDetectionClient: {
    signals: {
      scan: vi.fn(),
      getStrongSignals: vi.fn(),
      getWatchList: vi.fn(),
    },
    isAvailable: vi.fn(),
  },
}));

// Mock Prisma for complaint data
vi.mock('@/lib/db', () => ({
  prisma: {
    complaint: {
      findMany: vi.fn(),
    },
  },
}));

describe('Signals API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/signals', () => {
    it('should return 401 if unauthenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      // Import dynamically to ensure mocks are applied
      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return signals list with default filter (all)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([
        { component: 'BRAKE', make: 'TOYOTA', model: 'CAMRY', year: 2020 },
        { component: 'ENGINE', make: 'FORD', model: 'F150', year: 2021 },
      ] as any);

      vi.mocked(mlDetectionClient.signals.scan).mockResolvedValue({
        success: true,
        total_components: 2,
        strong_signals: 1,
        weak_signals: 1,
        results: [
          {
            component: 'BRAKE',
            prr: 3.5,
            ci_lower: 1.2,
            count: 10,
            signal_strength: 'strong_signal',
            recommendation: 'ALERT: Strong signal detected',
          },
          {
            component: 'ENGINE',
            prr: 2.1,
            ci_lower: 0.8,
            count: 5,
            signal_strength: 'weak_signal',
            recommendation: 'WATCH: Monitor this component',
          },
        ],
      });

      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.signals).toHaveLength(2);
      expect(data.meta.strongSignals).toBe(1);
      expect(data.meta.weakSignals).toBe(1);
    });

    it('should filter signals by strength (strong only)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);

      vi.mocked(mlDetectionClient.signals.getStrongSignals).mockResolvedValue({
        success: true,
        count: 1,
        signals: [
          {
            component: 'BRAKE',
            prr: 3.5,
            ci_lower: 1.2,
            count: 10,
            signal_strength: 'strong_signal',
            recommendation: 'ALERT: Strong signal detected',
          },
        ],
      });

      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals?strength=strong');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mlDetectionClient.signals.getStrongSignals).toHaveBeenCalled();
    });

    it('should filter signals by strength (weak only)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);

      vi.mocked(mlDetectionClient.signals.getWatchList).mockResolvedValue({
        success: true,
        count: 1,
        signals: [
          {
            component: 'ENGINE',
            prr: 2.1,
            ci_lower: 0.8,
            count: 5,
            signal_strength: 'weak_signal',
            recommendation: 'WATCH: Monitor this component',
          },
        ],
      });

      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals?strength=weak');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mlDetectionClient.signals.getWatchList).toHaveBeenCalled();
    });

    it('should handle Python service errors gracefully', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(mlDetectionClient.signals.scan).mockRejectedValue(new Error('ML Service unavailable'));

      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals');
      const response = await GET(request);

      expect(response.status).toBe(503);
    });

    it('should return correct response schema', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.complaint.findMany).mockResolvedValue([]);
      vi.mocked(mlDetectionClient.signals.scan).mockResolvedValue({
        success: true,
        total_components: 1,
        strong_signals: 1,
        weak_signals: 0,
        results: [
          {
            component: 'BRAKE',
            prr: 3.5,
            ci_lower: 1.2,
            count: 10,
            signal_strength: 'strong_signal',
            recommendation: 'ALERT',
          },
        ],
      });

      const { GET } = await import('../signals/route');

      const request = new NextRequest('http://localhost:3000/api/signals');
      const response = await GET(request);
      const data = await response.json();

      // Verify response structure matches API schema
      expect(data).toHaveProperty('signals');
      expect(data).toHaveProperty('meta');
      expect(Array.isArray(data.signals)).toBe(true);

      if (data.signals.length > 0) {
        expect(data.signals[0]).toHaveProperty('component');
        expect(data.signals[0]).toHaveProperty('prr');
        expect(data.signals[0]).toHaveProperty('signalStrength');
        expect(data.signals[0]).toHaveProperty('recommendation');
      }
    });
  });
});
