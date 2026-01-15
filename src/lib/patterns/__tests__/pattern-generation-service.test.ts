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

// Helper to generate mock complaints for a vehicle (Option A requires 10+ per vehicle)
function generateMockComplaints(
  count: number,
  overrides: Partial<{
    make: string;
    model: string;
    component: string;
    year: number;
    deaths: number;
    injuries: number;
    crash: boolean;
    fire: boolean;
  }> = {}
) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    description: `Complaint ${i} description`,
    make: overrides.make ?? 'HONDA',
    model: overrides.model ?? 'CIVIC',
    year: overrides.year ?? 2020,
    component: overrides.component ?? 'STEERING',
    deaths: overrides.deaths ?? 0,
    injuries: overrides.injuries ?? 0,
    crash: overrides.crash ?? false,
    fire: overrides.fire ?? false,
    dateAdded: new Date(),
    embedding: `[${0.1 + i * 0.01},${0.2 + i * 0.01}]`,
  }));
}

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

      // Option A requires 10+ complaints per vehicle group
      const mockComplaints = generateMockComplaints(12, { make: 'TOYOTA', model: 'CAMRY', component: 'BRAKE' });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [
          { topic_id: 0, name: 'brake_issue', count: 12, words: ['brake'], scores: [0.9] },
        ],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'p1',
        name: 'test',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        severityScore: 0,
        complaintCount: 12,
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
      expect(mlDetectionClient.topics.fitTopics).toHaveBeenCalled();
      const callArgs = vi.mocked(mlDetectionClient.topics.fitTopics).mock.calls[0];
      expect(callArgs[0]).toHaveLength(12); // 12 documents
      expect(callArgs[1]).toHaveLength(12); // 12 embeddings
    });

    it('should create Pattern records from ML clusters', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      // Option A requires 10+ complaints per vehicle group
      const mockComplaints = generateMockComplaints(12, { make: 'TOYOTA', model: 'CAMRY', component: 'BRAKE', injuries: 2, crash: true });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'brake_failure_driving',
          count: 12,
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
        complaintCount: 12,
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

      // Option A requires at least 10 complaints per vehicle
      const mockComplaints = generateMockComplaints(12, { make: 'HONDA', model: 'CIVIC', component: 'STEERING' });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'steering_issue',
          count: 12,
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
        complaintCount: 12,
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

      // Option A requires 10+ complaints per vehicle group
      // Create 12 complaints with severe data: 2 deaths, 5 injuries, crash, fire
      const mockComplaints = generateMockComplaints(12, {
        make: 'FORD',
        model: 'F150',
        component: 'BRAKE',
        deaths: 2,
        injuries: 5,
        crash: true,
        fire: true,
      });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'severe_crash_pattern',
          count: 12,
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
      // Expected per complaint: deaths(2)*100 + injuries(5)*10 + crash(1)*25 + fire(1)*25 = 300
      // With 12 complaints: 12 * 300 = 3600
      expect(upsertCall.create.severityScore).toBe(3600);
    });

    it('should link complaints to their patterns via clusterId', async () => {
      const { prisma } = await import('@/lib/db');
      const { mlDetectionClient } = await import('@/lib/patterns/ml-detection-client');

      // Option A requires 10+ complaints per vehicle group
      const mockComplaints = generateMockComplaints(12, { make: 'BMW', model: 'X5', component: 'ENGINE' });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [{
          topic_id: 0,
          name: 'engine_pattern',
          count: 12,
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
        complaintCount: 12,
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
      // With 12 complaints, all should be linked
      expect(prisma.complaint.updateMany).toHaveBeenCalled();
      const updateCall = vi.mocked(prisma.complaint.updateMany).mock.calls[0][0];
      expect(updateCall.where.id.in).toHaveLength(12);
      expect(updateCall.data.clusterId).toBe('pattern_123');
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

      // Option A requires 10+ complaints per vehicle group
      const mockComplaints = generateMockComplaints(12, { make: 'TOYOTA', model: 'CAMRY', component: 'BRAKE' });
      vi.mocked(mlDetectionClient.isAvailable).mockResolvedValue(true);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue(mockComplaints);
      // BERTopic returns topic_id: -1 for noise/outliers (some complaints are noise)
      vi.mocked(mlDetectionClient.topics.fitTopics).mockResolvedValue({
        success: true,
        topic_count: 1,
        topics: [
          { topic_id: 0, name: 'brake_topic', count: 10, words: ['brake'], scores: [0.9] },
          { topic_id: -1, name: 'outlier', count: 2, words: [], scores: [] },
        ],
      });
      vi.mocked(prisma.pattern.upsert).mockResolvedValue({
        id: 'p1',
        name: 'brake_topic',
        make: 'TOYOTA',
        model: 'CAMRY',
        component: 'BRAKE',
        severityScore: 0,
        complaintCount: 10,
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
      expect(result.noiseCount).toBe(2);
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
