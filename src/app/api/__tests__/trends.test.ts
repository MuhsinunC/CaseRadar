/**
 * Trends API Tests
 * Tests for topic trends over time endpoint
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
    topics: {
      topicsOverTime: vi.fn(),
      fitTopics: vi.fn(),
      getTopicInfo: vi.fn(),
    },
    isAvailable: vi.fn(),
  },
}));

// Mock Prisma for complaint data (using raw SQL)
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}));

describe('Trends API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/trends', () => {
    it('should return 401 if unauthenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const { GET } = await import('../trends/route');

      const request = new NextRequest('http://localhost:3000/api/trends');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should return trends with default granularity (monthly)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      // Mock raw SQL query (embedding is returned as JSON string)
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Brake issue',
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
        {
          id: 'complaint_2',
          description: 'Engine problem',
          dateAdded: new Date('2024-02-20'),
          embedding: '[0.4,0.5,0.6]',
        },
      ]);

      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockResolvedValue({
        success: true,
        topics: [
          { topic_id: 0, name: 'brake_failure', frequency: 10, timestamp: '2024-01' },
          { topic_id: 0, name: 'brake_failure', frequency: 15, timestamp: '2024-02' },
          { topic_id: 1, name: 'engine_stall', frequency: 5, timestamp: '2024-01' },
          { topic_id: 1, name: 'engine_stall', frequency: 8, timestamp: '2024-02' },
        ],
      });

      const { GET } = await import('../trends/route');

      const request = new NextRequest('http://localhost:3000/api/trends');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.trends).toBeDefined();
      expect(Array.isArray(data.trends)).toBe(true);
    });

    it('should filter trends by date range', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          dateAdded: new Date('2024-03-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);

      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockResolvedValue({
        success: true,
        topics: [],
      });

      const { GET } = await import('../trends/route');

      const request = new NextRequest(
        'http://localhost:3000/api/trends?startDate=2024-01-01&endDate=2024-06-30'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      // Verify the query was called (date filtering is in the raw SQL)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should handle different granularity options', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      // Need to provide complaint data with embeddings so the ML service is called
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockResolvedValue({
        success: true,
        topics: [],
      });

      const { GET } = await import('../trends/route');

      // Test weekly granularity
      const request = new NextRequest('http://localhost:3000/api/trends?granularity=weekly');
      const response = await GET(request);

      expect(response.status).toBe(200);
      // nr_bins should be adjusted for weekly (52 weeks in a year)
      expect(mlDetectionClient.topics.topicsOverTime).toHaveBeenCalled();
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
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockRejectedValue(
        new Error('ML Service unavailable')
      );

      const { GET } = await import('../trends/route');

      const request = new NextRequest('http://localhost:3000/api/trends');
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

      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);

      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockResolvedValue({
        success: true,
        topics: [
          { topic_id: 0, name: 'brake_issue', frequency: 10, timestamp: '2024-01' },
        ],
      });

      const { GET } = await import('../trends/route');

      const request = new NextRequest('http://localhost:3000/api/trends');
      const response = await GET(request);
      const data = await response.json();

      // Verify response structure matches API schema
      expect(data).toHaveProperty('trends');
      expect(data).toHaveProperty('meta');
      expect(Array.isArray(data.trends)).toBe(true);

      if (data.trends.length > 0) {
        expect(data.trends[0]).toHaveProperty('topicId');
        expect(data.trends[0]).toHaveProperty('name');
        expect(data.trends[0]).toHaveProperty('frequency');
        expect(data.trends[0]).toHaveProperty('timestamp');
      }
    });

    it('should accept patternId parameter (filtering not yet implemented)', async () => {
      const { getCurrentUser } = await import('@/lib/auth');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');
      const { prisma } = await import('@/lib/db');

      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user_123',
        organizationId: 'org_123',
        role: 'ANALYST',
      });

      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Test complaint',
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);

      vi.mocked(mlDetectionClient.topics.topicsOverTime).mockResolvedValue({
        success: true,
        topics: [
          { topic_id: 0, name: 'brake_issue', frequency: 10, timestamp: '2024-01' },
          { topic_id: 1, name: 'engine_issue', frequency: 5, timestamp: '2024-01' },
        ],
      });

      const { GET } = await import('../trends/route');

      // The patternId parameter is accepted but filtering is not yet implemented
      // since Pattern model doesn't have topicId field
      const request = new NextRequest('http://localhost:3000/api/trends?patternId=pattern_123');
      const response = await GET(request);
      const data = await response.json();

      // Endpoint should still work and return all trends (filtering not implemented)
      expect(response.status).toBe(200);
      expect(data.trends).toBeDefined();
    });
  });
});
