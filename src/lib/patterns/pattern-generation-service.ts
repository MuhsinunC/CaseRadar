/**
 * Pattern Generation Service
 *
 * ML-powered pattern generation pipeline that:
 * 1. Fetches complaints with embeddings from database
 * 2. Calls Python ML service for BERTopic clustering
 * 3. Transforms clusters into Pattern records
 * 4. Enriches patterns with metadata from complaints
 * 5. Calculates severity scores
 * 6. Links complaints to their patterns
 *
 * This is the core algorithm that powers the patterns page.
 */

import { prisma } from '@/lib/db';
import { mlDetectionClient, TopicResult } from '@/lib/patterns/ml-detection-client';

// Severity weights based on architecture document
const SEVERITY_WEIGHTS = {
  death: 100,
  injury: 10,
  crash: 25,
  fire: 25,
};

// Types
interface ComplaintWithEmbedding {
  id: string;
  description: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  component: string | null;
  deaths: number;
  injuries: number;
  crash: boolean;
  fire: boolean;
  dateAdded: Date;
  embedding: string;
}

interface PatternMetadata {
  make: string;
  model: string | null;
  component: string;
  yearStart: number | null;
  yearEnd: number | null;
}

interface SeverityInput {
  deaths: number;
  injuries: number;
  crash: boolean;
  fire: boolean;
}

export interface GenerationResult {
  success: boolean;
  patternsCreated: number;
  patternsUpdated: number;
  complaintsProcessed: number;
  noiseCount: number;
  durationMs: number;
  error?: string;
}

interface ComplaintMetadata {
  make: string | null;
  model: string | null;
  component: string | null;
  year: number | null;
}

export class PatternGenerationService {
  // Minimum complaints needed per vehicle to run clustering
  private static MIN_COMPLAINTS_FOR_CLUSTERING = 10;

  /**
   * Main entry point: Generate patterns from complaints using ML clustering
   *
   * OPTION A IMPLEMENTATION:
   * 1. Group complaints by make+model (vehicle)
   * 2. Run BERTopic clustering separately for each vehicle
   * 3. This ensures patterns are vehicle-specific (no cross-make contamination)
   */
  async generatePatterns(): Promise<GenerationResult> {
    const startTime = Date.now();
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let totalNoise = 0;

    try {
      // Step 1: Check ML service availability
      const mlAvailable = await mlDetectionClient.isAvailable();
      if (!mlAvailable) {
        return {
          success: false,
          patternsCreated: 0,
          patternsUpdated: 0,
          complaintsProcessed: 0,
          noiseCount: 0,
          durationMs: Date.now() - startTime,
          error: 'ML service is not available',
        };
      }

      // Step 2: Fetch complaints with embeddings
      const allComplaints = await this.fetchComplaintsWithEmbeddings();

      if (allComplaints.length === 0) {
        return {
          success: true,
          patternsCreated: 0,
          patternsUpdated: 0,
          complaintsProcessed: 0,
          noiseCount: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 3: Group complaints by make+model (OPTION A - pre-filter)
      const vehicleGroups = this.groupComplaintsByVehicle(allComplaints);
      console.log(
        `[PatternGeneration] Grouped ${allComplaints.length} complaints into ${vehicleGroups.size} vehicle groups`
      );

      // Step 4: Process each vehicle group separately
      for (const [vehicleKey, complaints] of vehicleGroups) {
        // Skip groups with too few complaints for meaningful clustering
        if (complaints.length < PatternGenerationService.MIN_COMPLAINTS_FOR_CLUSTERING) {
          console.log(
            `[PatternGeneration] Skipping ${vehicleKey} - only ${complaints.length} complaints (min: ${PatternGenerationService.MIN_COMPLAINTS_FOR_CLUSTERING})`
          );
          continue;
        }

        console.log(`[PatternGeneration] Processing ${vehicleKey} with ${complaints.length} complaints`);

        // Prepare data for ML service
        const documents = complaints.map((c) => c.description || '');
        const embeddings = complaints.map((c) => this.parseEmbedding(c.embedding));

        // Call ML service for topic clustering on this vehicle's complaints
        const topicResult = await mlDetectionClient.topics.fitTopics(documents, embeddings);

        if (!topicResult.success) {
          console.warn(`[PatternGeneration] Clustering failed for ${vehicleKey}`);
          continue;
        }

        // Create patterns from topics (with vehicle-specific metadata already known)
        const result = await this.createPatternsFromTopicsForVehicle(
          topicResult.topics,
          complaints,
          vehicleKey
        );

        totalCreated += result.created;
        totalUpdated += result.updated;
        totalProcessed += complaints.length;
        totalNoise += result.noiseCount;
      }

      return {
        success: true,
        patternsCreated: totalCreated,
        patternsUpdated: totalUpdated,
        complaintsProcessed: totalProcessed,
        noiseCount: totalNoise,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[PatternGeneration] Error:', error);
      return {
        success: false,
        patternsCreated: totalCreated,
        patternsUpdated: totalUpdated,
        complaintsProcessed: totalProcessed,
        noiseCount: totalNoise,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Group complaints by make+model for vehicle-specific clustering
   */
  private groupComplaintsByVehicle(
    complaints: ComplaintWithEmbedding[]
  ): Map<string, ComplaintWithEmbedding[]> {
    const groups = new Map<string, ComplaintWithEmbedding[]>();

    for (const complaint of complaints) {
      const make = complaint.make?.toUpperCase() || 'UNKNOWN';
      const model = complaint.model?.toUpperCase() || 'UNKNOWN';
      const key = `${make}|${model}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(complaint);
    }

    return groups;
  }

  /**
   * Fetch complaints with embeddings from database using raw SQL (pgvector)
   */
  private async fetchComplaintsWithEmbeddings(): Promise<ComplaintWithEmbedding[]> {
    const complaints = await prisma.$queryRawUnsafe<ComplaintWithEmbedding[]>(`
      SELECT
        id,
        description,
        make,
        model,
        year,
        component,
        deaths,
        injuries,
        crash,
        fire,
        "dateAdded",
        embedding::text as embedding
      FROM "Complaint"
      WHERE embedding IS NOT NULL
      ORDER BY "dateAdded" DESC
      LIMIT 10000
    `);

    return complaints;
  }

  /**
   * Parse pgvector text format "[0.1,0.2,...]" to number[]
   */
  private parseEmbedding(text: string): number[] {
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  /**
   * Create or update patterns from ML topic clusters
   */
  private async createPatternsFromTopics(
    topics: TopicResult[],
    complaints: ComplaintWithEmbedding[]
  ): Promise<{ created: number; updated: number; noiseCount: number }> {
    let created = 0;
    let updated = 0;
    let noiseCount = 0;

    // Get topic assignments for each complaint
    // Note: BERTopic assigns documents to topics in order, so we need to track which
    // complaints belong to which topic. For now, we use topic counts and distribute
    // complaints proportionally based on their order and topic sizes.
    // A more accurate approach would be to also get per-document topic assignments
    // from the ML service.

    // Build a map of topic_id -> complaints based on topic counts
    // This is a simplification - in production, the ML service should return
    // per-document topic assignments
    const topicComplaintsMap = this.distributeComplaintsToTopics(topics, complaints);

    for (const topic of topics) {
      // Skip noise topic (topic_id: -1 in BERTopic)
      if (topic.topic_id === -1) {
        noiseCount = topic.count;
        continue;
      }

      const topicComplaints = topicComplaintsMap.get(topic.topic_id) || [];
      if (topicComplaints.length === 0) continue;

      // Get metadata from complaints in this cluster
      const metadata = this.getPatternMetadata(topicComplaints);

      // Calculate severity score
      const severityScore = this.calculateSeverityScore(topicComplaints);

      // Create unique identifier for pattern based on topic name and metadata
      const patternKey = `ml_topic_${topic.topic_id}_${metadata.make}_${metadata.component}`;

      // Upsert pattern (create or update)
      const pattern = await prisma.pattern.upsert({
        where: {
          // Using a composite key approach - find by unique combination
          // Since we don't have a direct unique key, we'll use findFirst + create/update
          id: patternKey, // This will fail the where clause, triggering create
        },
        create: {
          name: topic.name || `Topic ${topic.topic_id}`,
          description: `ML-generated pattern: ${topic.words.slice(0, 5).join(', ')}`,
          make: metadata.make,
          model: metadata.model,
          component: metadata.component,
          yearStart: metadata.yearStart,
          yearEnd: metadata.yearEnd,
          severityScore,
          complaintCount: topicComplaints.length,
          trendDirection: 'STABLE',
          trendScore: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null, // Global patterns
        },
        update: {
          severityScore,
          complaintCount: topicComplaints.length,
          lastUpdated: new Date(),
        },
      });

      // Link complaints to this pattern
      const complaintIds = topicComplaints.map((c) => c.id);
      await prisma.complaint.updateMany({
        where: { id: { in: complaintIds } },
        data: { clusterId: pattern.id },
      });

      created++;
    }

    return { created, updated, noiseCount };
  }

  /**
   * Create patterns from topics for a specific vehicle (OPTION A)
   * This ensures patterns are vehicle-specific with no cross-make contamination
   */
  private async createPatternsFromTopicsForVehicle(
    topics: TopicResult[],
    complaints: ComplaintWithEmbedding[],
    vehicleKey: string
  ): Promise<{ created: number; updated: number; noiseCount: number }> {
    let created = 0;
    let updated = 0;
    let noiseCount = 0;

    // Parse vehicle key (format: "MAKE|MODEL")
    const [make, model] = vehicleKey.split('|');

    // Build a map of topic_id -> complaints based on topic counts
    const topicComplaintsMap = this.distributeComplaintsToTopics(topics, complaints);

    for (const topic of topics) {
      // Skip noise topic (topic_id: -1 in BERTopic)
      if (topic.topic_id === -1) {
        noiseCount = topic.count;
        continue;
      }

      const topicComplaints = topicComplaintsMap.get(topic.topic_id) || [];
      if (topicComplaints.length === 0) continue;

      // Get component and year range from complaints (make/model already known from vehicleKey)
      const componentCounts = new Map<string, number>();
      const years: number[] = [];
      const currentYear = new Date().getFullYear();
      const maxValidYear = currentYear + 2;

      for (const complaint of topicComplaints) {
        if (complaint.component) {
          componentCounts.set(
            complaint.component,
            (componentCounts.get(complaint.component) || 0) + 1
          );
        }
        if (complaint.year && complaint.year >= 1900 && complaint.year <= maxValidYear) {
          years.push(complaint.year);
        }
      }

      // Get most common component
      let component = 'UNKNOWN';
      let maxCount = 0;
      for (const [comp, count] of componentCounts) {
        if (count > maxCount) {
          maxCount = count;
          component = comp;
        }
      }

      const yearStart = years.length > 0 ? Math.min(...years) : null;
      const yearEnd = years.length > 0 ? Math.max(...years) : null;

      // Calculate severity score
      const severityScore = this.calculateSeverityScore(topicComplaints);

      // Create a readable pattern name
      const yearRange = yearStart && yearEnd ? `${yearStart}-${yearEnd}` : '';
      const patternName = `${make} ${model} ${component} Issues${yearRange ? ` (${yearRange})` : ''}`;

      // Create unique identifier for pattern
      const patternKey = `vehicle_${make}_${model}_topic_${topic.topic_id}`;

      // Upsert pattern (create or update)
      const pattern = await prisma.pattern.upsert({
        where: {
          id: patternKey,
        },
        create: {
          name: patternName,
          description: `Vehicle-specific pattern: ${topic.words.slice(0, 5).join(', ')}`,
          make: make,
          model: model,
          component: component,
          yearStart: yearStart,
          yearEnd: yearEnd,
          severityScore,
          complaintCount: topicComplaints.length,
          trendDirection: 'STABLE',
          trendScore: 0,
          firstSeen: new Date(),
          lastUpdated: new Date(),
          isActive: true,
          organizationId: null, // Global patterns
        },
        update: {
          name: patternName,
          severityScore,
          complaintCount: topicComplaints.length,
          lastUpdated: new Date(),
        },
      });

      // Link complaints to this pattern
      const complaintIds = topicComplaints.map((c) => c.id);
      await prisma.complaint.updateMany({
        where: { id: { in: complaintIds } },
        data: { clusterId: pattern.id },
      });

      created++;
    }

    return { created, updated, noiseCount };
  }

  /**
   * Distribute complaints to topics based on topic counts
   * This is a simplified distribution - ideally the ML service would return
   * per-document topic assignments
   */
  private distributeComplaintsToTopics(
    topics: TopicResult[],
    complaints: ComplaintWithEmbedding[]
  ): Map<number, ComplaintWithEmbedding[]> {
    const map = new Map<number, ComplaintWithEmbedding[]>();

    // Initialize map for all topics
    for (const topic of topics) {
      map.set(topic.topic_id, []);
    }

    // Distribute complaints based on topic counts
    // This maintains the order and assigns complaints sequentially to topics
    let complaintIndex = 0;
    for (const topic of topics) {
      const topicComplaints: ComplaintWithEmbedding[] = [];
      for (let i = 0; i < topic.count && complaintIndex < complaints.length; i++) {
        topicComplaints.push(complaints[complaintIndex]);
        complaintIndex++;
      }
      map.set(topic.topic_id, topicComplaints);
    }

    return map;
  }

  /**
   * Extract metadata (make, model, component, year range) from complaints in a cluster
   * Uses mode (most common value) for categorical fields
   */
  getPatternMetadata(complaints: ComplaintMetadata[]): PatternMetadata {
    // Count occurrences of each value
    const makeCounts = new Map<string, number>();
    const modelCounts = new Map<string, number>();
    const componentCounts = new Map<string, number>();
    const years: number[] = [];

    // Get current year for validation
    const currentYear = new Date().getFullYear();
    const maxValidYear = currentYear + 2; // Allow 2 years in future for new models

    for (const complaint of complaints) {
      if (complaint.make) {
        makeCounts.set(complaint.make, (makeCounts.get(complaint.make) || 0) + 1);
      }
      if (complaint.model) {
        modelCounts.set(complaint.model, (modelCounts.get(complaint.model) || 0) + 1);
      }
      if (complaint.component) {
        componentCounts.set(
          complaint.component,
          (componentCounts.get(complaint.component) || 0) + 1
        );
      }
      // Only include valid years (1900-current+2), filter out 9999 and other invalid values
      if (complaint.year && complaint.year >= 1900 && complaint.year <= maxValidYear) {
        years.push(complaint.year);
      }
    }

    // Get most common values
    const getMostCommon = (counts: Map<string, number>, defaultVal: string): string => {
      let maxCount = 0;
      let mostCommon = defaultVal;
      for (const [value, count] of counts) {
        if (count > maxCount) {
          maxCount = count;
          mostCommon = value;
        }
      }
      return mostCommon;
    };

    return {
      make: getMostCommon(makeCounts, 'MULTIPLE'),
      model:
        modelCounts.size === 1
          ? Array.from(modelCounts.keys())[0]
          : modelCounts.size > 0
            ? getMostCommon(modelCounts, 'MULTIPLE')
            : null,
      component: getMostCommon(componentCounts, 'UNKNOWN'),
      yearStart: years.length > 0 ? Math.min(...years) : null,
      yearEnd: years.length > 0 ? Math.max(...years) : null,
    };
  }

  /**
   * Calculate severity score from complaint data
   * Based on architecture document severity weights
   */
  calculateSeverityScore(complaints: SeverityInput[]): number {
    let score = 0;

    for (const complaint of complaints) {
      score += complaint.deaths * SEVERITY_WEIGHTS.death;
      score += complaint.injuries * SEVERITY_WEIGHTS.injury;
      score += complaint.crash ? SEVERITY_WEIGHTS.crash : 0;
      score += complaint.fire ? SEVERITY_WEIGHTS.fire : 0;
    }

    return score;
  }
}

// Export singleton instance
export const patternGenerationService = new PatternGenerationService();
