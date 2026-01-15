/**
 * Pattern Generation Service Tests
 * TDD tests for ML-powered pattern generation pipeline
 *
 * Tests the complete flow:
 * 1. Fetch complaints with embeddings
 * 2. Call Python ML service for BERTopic clustering
 * 3. Transform clusters into Pattern records
 * 4. Enrich patterns with metadata from complaints
 * 5. Calculate severity scores
 * 6. Detect trends
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
    pattern: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    complaint: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    clusteringRun: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/patterns/ml-detection-client', () => ({
  mlDetectionClient: {
    topics: {
      fitTopics: vi.fn(),
      healthCheck: vi.fn(),
    },
    isAvailable: vi.fn(),
  },
}));

describe('PatternGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('generatePatterns', () => {
    it('should fetch complaints with embeddings from database', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      // Setup mocks
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'complaint_1',
          description: 'Brake failure while driving',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          deaths: 0,
          injuries: 1,
          crash: true,
          fire: false,
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'brake_failure',
          count: 1,
          words: ['brake', 'failure'],
          scores: [0.9, 0.8],
        }],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'pattern_1',
        name: 'brake_failure',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        severityScore: 0,
        complaintCount: 1,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      await service.generatePatterns();

      // Verify complaints were fetched with embeddings
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const query = vi.mocked(prisma.$queryRawUnsafe).mock.calls[0][0] as string;
      expect(query).toContain('embedding');
      expect(query).toContain('Complaint');
    });

    it('should call ML service with documents and embeddings', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Brake issue',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.1,0.2,0.3]',
        },
        {
          id: 'c2',
          description: 'Engine stall',
          make: 'FORD',
          model: 'F150',
          year: 2021,
          component: 'ENGINE',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.4,0.5,0.6]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 2,
        topics: [
          { topic_id: 0, name: 'brake_issue', count: 1, words: ['brake'], scores: [0.9] },
          { topic_id: 1, name: 'engine_stall', count: 1, words: ['engine'], scores: [0.8] },
        ],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'p1',
        name: 'test',
        make: 'TOYOTA',
        model: null,
        component: 'BRAKE',
        severityScore: 0,
        complaintCount: 1,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      await service.generatePatterns();

      // Verify ML service was called with documents and embeddings
      expect(mlDetectionClient.topics.fitTopics).toHaveBeenCalledWith(
        ['Brake issue', 'Engine stall'],
        [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
      );
    });

    it('should create Pattern records from ML clusters', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Brake failure',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          deaths: 0,
          injuries: 2,
          crash: true,
          fire: false,
          dateAdded: new Date('2024-01-15'),
          embedding: '[0.1,0.2,0.3]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'brake_failure_driving',
          count: 1,
          words: ['brake', 'failure', 'driving'],
          scores: [0.9, 0.85, 0.7],
        }],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'pattern_1',
        name: 'brake_failure_driving',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        severityScore: 25,
        complaintCount: 1,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const result = await service.generatePatterns();

      // Verify Pattern was created
      expect(prisma.pattern.upsert).toHaveBeenCalled();
      expect(result.patternsCreated).toBeGreaterThanOrEqual(1);
    });

    it('should enrich patterns with make/model/component from complaints', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Test',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2019,
          component: 'STEERING',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.1,0.2]',
        },
        {
          id: 'c2',
          description: 'Test 2',
          make: 'HONDA',
          model: 'CIVIC',
          year: 2020,
          component: 'STEERING',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.3,0.4]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'steering_issue',
          count: 2,
          words: ['steering'],
          scores: [0.9],
        }],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'p1',
        name: 'steering_issue',
        make: 'HONDA',
        model: 'CIVIC',
        component: 'STEERING',
        severityScore: 0,
        complaintCount: 2,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: 2019,
        yearEnd: 2020,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      await service.generatePatterns();

      // Verify pattern was enriched with make/model/component from complaints
      const upsertCall = vi.mocked(prisma.pattern.upsert).mock.calls[0][0];
      expect(upsertCall.create.make).toBe('HONDA');
      expect(upsertCall.create.model).toBe('CIVIC');
      expect(upsertCall.create.component).toBe('STEERING');
    });

    it('should calculate severity score from deaths, injuries, crashes, fires', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Severe crash',
          make: 'FORD',
          model: 'F150',
          year: 2022,
          component: 'BRAKE',
          deaths: 2,       // 2 * 100 = 200
          injuries: 5,     // 5 * 10 = 50
          crash: true,     // 1 * 25 = 25
          fire: true,      // 1 * 25 = 25
          dateAdded: new Date(),
          embedding: '[0.1,0.2]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'severe_crash_pattern',
          count: 1,
          words: ['crash', 'severe'],
          scores: [0.9, 0.8],
        }],
      });
      vi.mocked(prisma.pattern.upsert).mockImplementation(async (args) => ({
        id: 'p1',
        name: args.create.name,
        make: args.create.make,
        model: args.create.model || null,
        component: args.create.component,
        severityScore: args.create.severityScore,
        complaintCount: args.create.complaintCount,
        trendDirection: args.create.trendDirection,
        trendScore: args.create.trendScore,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      }));

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      await service.generatePatterns();

      // Verify severity score calculation
      const upsertCall = vi.mocked(prisma.pattern.upsert).mock.calls[0][0];
      // Expected: deaths(2)*100 + injuries(5)*10 + crash(1)*25 + fire(1)*25 = 300
      expect(upsertCall.create.severityScore).toBe(300);
    });

    it('should link complaints to their patterns via clusterId', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Test',
          make: 'BMW',
          model: 'X5',
          year: 2021,
          component: 'ENGINE',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.1,0.2]',
        },
      ]);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'engine_pattern',
          count: 1,
          words: ['engine'],
          scores: [0.9],
        }],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'pattern_123',
        name: 'engine_pattern',
        make: 'BMW',
        model: 'X5',
        component: 'ENGINE',
        severityScore: 0,
        complaintCount: 1,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      await service.generatePatterns();

      // Verify complaints were linked to pattern
      expect(prisma.complaint.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c1'] } },
        data: { clusterId: 'pattern_123' },
      });
    });

    it('should handle ML service unavailability gracefully', async () => {
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(false);

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const result = await service.generatePatterns();

      expect(result.success).toBe(false);
      expect(result.error).toContain('ML service');
    });

    it('should return empty result when no complaints have embeddings', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([]);

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const result = await service.generatePatterns();

      expect(result.success).toBe(true);
      expect(result.patternsCreated).toBe(0);
      expect(result.complaintsProcessed).toBe(0);
    });

    it('should use topic_id -1 complaints as noise (not create patterns for them)', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        {
          id: 'c1',
          description: 'Normal complaint',
          make: 'TOYOTA',
          model: 'CAMRY',
          year: 2020,
          component: 'BRAKE',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.1,0.2]',
        },
        {
          id: 'noise_complaint',
          description: 'Random noise',
          make: 'OTHER',
          model: 'UNKNOWN',
          year: 2020,
          component: 'OTHER',
          deaths: 0,
          injuries: 0,
          crash: false,
          fire: false,
          dateAdded: new Date(),
          embedding: '[0.9,0.9]',
        },
      ]);
      // BERTopic returns topic_id: -1 for noise/outliers
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [
          { topic_id: 0, name: 'brake_topic', count: 1, words: ['brake'], scores: [0.9] },
          { topic_id: -1, name: 'outlier', count: 1, words: [], scores: [] },
        ],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'p1',
        name: 'brake_topic',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        severityScore: 0,
        complaintCount: 1,
        trendDirection: 'STABLE',
        trendScore: 0,
        firstSeen: new Date(),
        lastUpdated: new Date(),
        isActive: true,
        organizationId: null,
        description: null,
        yearStart: null,
        yearEnd: null,
        clusteringRunId: null,
      });

      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const result = await service.generatePatterns();

      // Should only create 1 pattern (not for noise topic_id: -1)
      expect(prisma.pattern.upsert).toHaveBeenCalledTimes(1);
      expect(result.noiseCount).toBe(1);
    });
  });

  describe('getPatternMetadata', () => {
    it('should determine dominant make from complaints in cluster', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { make: 'TOYOTA', model: 'CAMRY', component: 'BRAKE', year: 2020 },
        { make: 'TOYOTA', model: 'COROLLA', component: 'BRAKE', year: 2021 },
        { make: 'HONDA', model: 'CIVIC', component: 'BRAKE', year: 2020 },
      ];

      const metadata = service.getPatternMetadata(complaints);

      expect(metadata.make).toBe('TOYOTA'); // Most common make
    });

    it('should determine dominant component from complaints in cluster', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { make: 'FORD', model: 'F150', component: 'ENGINE', year: 2020 },
        { make: 'FORD', model: 'F150', component: 'ENGINE', year: 2021 },
        { make: 'FORD', model: 'F250', component: 'BRAKE', year: 2020 },
      ];

      const metadata = service.getPatternMetadata(complaints);

      expect(metadata.component).toBe('ENGINE'); // Most common component
    });

    it('should calculate year range from complaints', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { make: 'BMW', model: 'X5', component: 'STEERING', year: 2018 },
        { make: 'BMW', model: 'X5', component: 'STEERING', year: 2022 },
        { make: 'BMW', model: 'X5', component: 'STEERING', year: 2020 },
      ];

      const metadata = service.getPatternMetadata(complaints);

      expect(metadata.yearStart).toBe(2018);
      expect(metadata.yearEnd).toBe(2022);
    });
  });

  describe('calculateSeverityScore', () => {
    it('should weight deaths highest (100 points each)', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { deaths: 1, injuries: 0, crash: false, fire: false },
        { deaths: 2, injuries: 0, crash: false, fire: false },
      ];

      const score = service.calculateSeverityScore(complaints);

      expect(score).toBe(300); // 3 deaths * 100
    });

    it('should weight injuries at 10 points each', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { deaths: 0, injuries: 5, crash: false, fire: false },
        { deaths: 0, injuries: 3, crash: false, fire: false },
      ];

      const score = service.calculateSeverityScore(complaints);

      expect(score).toBe(80); // 8 injuries * 10
    });

    it('should weight crashes at 25 points each', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { deaths: 0, injuries: 0, crash: true, fire: false },
        { deaths: 0, injuries: 0, crash: true, fire: false },
        { deaths: 0, injuries: 0, crash: false, fire: false },
      ];

      const score = service.calculateSeverityScore(complaints);

      expect(score).toBe(50); // 2 crashes * 25
    });

    it('should weight fires at 25 points each', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { deaths: 0, injuries: 0, crash: false, fire: true },
        { deaths: 0, injuries: 0, crash: false, fire: true },
      ];

      const score = service.calculateSeverityScore(complaints);

      expect(score).toBe(50); // 2 fires * 25
    });

    it('should combine all severity factors', async () => {
      const { PatternGenerationService } = await import('../pattern-generation-service');
      const service = new PatternGenerationService();

      const complaints = [
        { deaths: 1, injuries: 2, crash: true, fire: true },
      ];

      const score = service.calculateSeverityScore(complaints);

      // 1 death * 100 + 2 injuries * 10 + 1 crash * 25 + 1 fire * 25 = 170
      expect(score).toBe(170);
    });
  });
});
