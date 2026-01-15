/**
 * Anomalies API Tests
 * Tests for anomalous complaints detection endpoint
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
    anomalies: {
      detect: vi.fn(),
      fit: vi.fn(),
      getThreshold: vi.fn(),
    },
    isAvailable: vi.fn(),
  },
}));

// Mock Prisma for complaint data (using raw SQL)
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

describe('Anomalies API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/anomalies', () => {
    it('should return 401 if unauthenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../anomalies/route');

      const request = new NextRequest('http://localhost:3000/api/anomalies');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return anomalies with default minScore (0.8)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      // Mock raw SQL query (embedding is returned as JSON string)
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Unusual brake failure',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          embedding: '[0.1,0.2,0.3]',
        },
        {
          id: 'complaint_2',
          description: 'Normal engine issue',
          make: 'FORD',
          model: 'F150',
          year: 2021,
          component: 'ENGINE',
          embedding: '[0.4,0.5,0.6]',
        },
      ]);

      vi.mocked(mlDetectionClient.anomalies.detect).mockResolvedValue({
        success: true,
        total: 2,
        anomaly_count: 1,
        results: [
          {
            document_id: 'complaint_1',
            anomaly_score: 0.92,
            is_anomaly: true,
            detector_scores: {
              isolation_forest: 0.9,
              local_outlier_factor: 0.95,
              histogram_based: 0.91,
            },
            anomaly_type: 'point',
          },
          {
            document_id: 'complaint_2',
            anomaly_score: 0.3,
            is_anomaly: false,
            detector_scores: {
              isolation_forest: 0.3,
              local_outlier_factor: 0.25,
              histogram_based: 0.35,
            },
            anomaly_type: 'normal',
          },
        ],
      });

      const { GET } = await import('../anomalies/route');

      const request = new NextRequest('http://localhost:3000/api/anomalies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.anomalies).toBeDefined();
      // Should filter by default minScore 0.8
      expect(data.anomalies.every((a: any) => a.anomalyScore >= 0.8)).toBe(true);
    });

    it('should filter anomalies by minScore parameter', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: '1', description: 'Test 1', make: 'TOYOTA', model: 'CAMRY', year: 2020, component: 'BRAKE', embedding: '[0.1,0.2]' },
        { id: '2', description: 'Test 2', make: 'FORD', model: 'F150', year: 2021, component: 'ENGINE', embedding: '[0.3,0.4]' },
        { id: '3', description: 'Test 3', make: 'HONDA', model: 'CIVIC', year: 2022, component: 'TIRE', embedding: '[0.5,0.6]' },
      ]);

      vi.mocked(mlDetectionClient.anomalies.detect).mockResolvedValue({
        success: true,
        total: 3,
        anomaly_count: 2,
        results: [
          { document_id: '1', anomaly_score: 0.95, is_anomaly: true, detector_scores: {}, anomaly_type: 'point' },
          { document_id: '2', anomaly_score: 0.75, is_anomaly: true, detector_scores: {}, anomaly_type: 'contextual' },
          { document_id: '3', anomaly_score: 0.5, is_anomaly: false, detector_scores: {}, anomaly_type: 'normal' },
        ],
      });

      const { GET } = await import('../anomalies/route');

      const request = new NextRequest('http://localhost:3000/api/anomalies?minScore=0.7');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should include complaints with score >= 0.7
      expect(data.anomalies.every((a: any) => a.anomalyScore >= 0.7)).toBe(true);
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

      // Need to provide complaint data with embeddings so the ML service is called
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          embedding: '[0.1,0.2,0.3]',
        },
      ]);
      vi.mocked(mlDetectionClient.anomalies.detect).mockRejectedValue(new Error('ML Service unavailable'));

      const { GET } = await import('../anomalies/route');

      const request = new NextRequest('http://localhost:3000/api/anomalies');
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

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          embedding: '[0.1,0.2,0.3]',
        },
      ]);

      vi.mocked(mlDetectionClient.anomalies.detect).mockResolvedValue({
        success: true,
        total: 1,
        anomaly_count: 1,
        results: [
          {
            document_id: 'complaint_1',
            anomaly_score: 0.9,
            is_anomaly: true,
            detector_scores: { isolation_forest: 0.9 },
            anomaly_type: 'point',
          },
        ],
      });

      const { GET } = await import('../anomalies/route');

      const request = new NextRequest('http://localhost:3000/api/anomalies');
      const response = await GET(request);
      const data = await response.json();

      // Verify response structure matches API schema
      expect(data).toHaveProperty('anomalies');
      expect(data).toHaveProperty('meta');
      expect(Array.isArray(data.anomalies)).toBe(true);

      if (data.anomalies.length > 0) {
        expect(data.anomalies[0]).toHaveProperty('complaintId');
        expect(data.anomalies[0]).toHaveProperty('anomalyScore');
        expect(data.anomalies[0]).toHaveProperty('isAnomaly');
        expect(data.anomalies[0]).toHaveProperty('anomalyType');
      }
    });
  });
});
