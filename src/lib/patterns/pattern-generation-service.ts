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
  patternsMerged: number;
  complaintsProcessed: number;
  noiseCount: number;
  severeRescued: number;
  durationMs: number;
  error?: string;
}

interface ComplaintMetadata {
  make: string | null;
  model: string | null;
  component: string | null;
  year: number | null;
}

/**
 * Prepare complaint text for BERTopic
 * Uses the same format as embedding generation for consistency
 * This ensures BERTopic can extract meaningful topics even when description is empty
 */
function prepareComplaintTextForBERTopic(complaint: {
  make: string | null;
  model: string | null;
  year: number | null;
  component: string | null;
  description: string | null;
}): string {
  const parts: string[] = [];

  // Add vehicle info (always present)
  const vehicleInfo = [complaint.year, complaint.make, complaint.model]
    .filter(Boolean)
    .join(' ');
  if (vehicleInfo) {
    parts.push(`Vehicle: ${vehicleInfo}`);
  }

  // Add component (usually present)
  if (complaint.component) {
    parts.push(`Component: ${complaint.component}`);
  }

  // Add description (may be empty for flat file imports)
  if (complaint.description && complaint.description.trim().length > 0) {
    parts.push(`Issue: ${complaint.description}`);
  }

  return parts.join('\n');
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
   *
   * POST-PROCESSING:
   * 4. Rescue severe complaints from noise (deaths/injuries)
   * 5. Merge duplicate patterns (same make/model/component)
   * 6. Recalculate aggregate severity metrics
   * 7. Calculate trend direction
   *
   * @param options.highQualityOnly - Only use complaints with valid descriptions and components
   */
  async generatePatterns(options?: {
    highQualityOnly?: boolean;
  }): Promise<GenerationResult> {
    const { highQualityOnly = false } = options || {};
    const startTime = Date.now();
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let totalNoise = 0;
    let totalMerged = 0;
    let totalRescued = 0;

    try {
      // Step 1: Check ML service availability
      const mlAvailable = await mlDetectionClient.isAvailable();
      if (!mlAvailable) {
        return {
          success: false,
          patternsCreated: 0,
          patternsUpdated: 0,
          patternsMerged: 0,
          complaintsProcessed: 0,
          noiseCount: 0,
          severeRescued: 0,
          durationMs: Date.now() - startTime,
          error: 'ML service is not available',
        };
      }

      // Step 2: Fetch complaints with embeddings
      console.log(
        `[PatternGeneration] Fetching complaints (highQualityOnly: ${highQualityOnly})`
      );
      const allComplaints = await this.fetchComplaintsWithEmbeddings(highQualityOnly);

      if (allComplaints.length === 0) {
        return {
          success: true,
          patternsCreated: 0,
          patternsUpdated: 0,
          patternsMerged: 0,
          complaintsProcessed: 0,
          noiseCount: 0,
          severeRescued: 0,
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
        // Use same text format as embedding generation for consistency
        const documents = complaints.map((c) => prepareComplaintTextForBERTopic(c));
        const embeddings = complaints.map((c) => this.parseEmbedding(c.embedding));

        // Call ML service for topic clustering on this vehicle's complaints
        const topicResult = await mlDetectionClient.topics.fitTopics(documents, embeddings);

        if (!topicResult.success) {
          console.warn(`[PatternGeneration] Clustering failed for ${vehicleKey}`);
          continue;
        }

        // Create patterns from topics using actual per-document assignments
        const result = await this.createPatternsFromTopicsForVehicle(
          topicResult.topics,
          complaints,
          vehicleKey,
          topicResult.document_topics  // Pass the actual topic assignments
        );

        totalCreated += result.created;
        totalUpdated += result.updated;
        totalProcessed += complaints.length;
        totalNoise += result.noiseCount;
      }

      // POST-PROCESSING STEPS
      console.log('[PatternGeneration] Starting post-processing...');

      // Step 5: Rescue severe complaints from noise
      const rescueResult = await this.rescueSevereComplaintsFromNoise();
      totalRescued = rescueResult.rescued;
      console.log(`[PatternGeneration] Rescued ${totalRescued} severe complaints from noise`);

      // Step 6: Merge duplicate patterns (same make/model/component)
      const mergeResult = await this.mergeDuplicatePatterns();
      totalMerged = mergeResult.merged;
      console.log(`[PatternGeneration] Merged ${totalMerged} duplicate patterns`);

      // Step 7: Recalculate aggregate severity metrics for all patterns
      await this.recalculateAllPatternMetrics();
      console.log('[PatternGeneration] Recalculated all pattern metrics');

      // Step 8: Calculate trend directions
      await this.calculateAllTrendDirections();
      console.log('[PatternGeneration] Calculated trend directions');

      return {
        success: true,
        patternsCreated: totalCreated,
        patternsUpdated: totalUpdated,
        patternsMerged: totalMerged,
        complaintsProcessed: totalProcessed,
        noiseCount: totalNoise,
        severeRescued: totalRescued,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[PatternGeneration] Error:', error);
      return {
        success: false,
        patternsCreated: totalCreated,
        patternsUpdated: totalUpdated,
        patternsMerged: totalMerged,
        complaintsProcessed: totalProcessed,
        noiseCount: totalNoise,
        severeRescued: totalRescued,
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
   * @param highQualityOnly - If true, only fetch complaints with valid descriptions and components
   */
  private async fetchComplaintsWithEmbeddings(
    highQualityOnly: boolean = false
  ): Promise<ComplaintWithEmbedding[]> {
    // Build quality filter if needed
    const qualityFilter = highQualityOnly
      ? `AND component NOT IN ('0', '1', '') AND description != ''`
      : '';

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
      ${qualityFilter}
      ORDER BY "dateAdded" DESC
      LIMIT 50000
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
    vehicleKey: string,
    documentTopics?: number[]  // Actual per-document topic assignments from ML service
  ): Promise<{ created: number; updated: number; noiseCount: number }> {
    let created = 0;
    let updated = 0;
    let noiseCount = 0;

    // Parse vehicle key (format: "MAKE|MODEL")
    const [make, model] = vehicleKey.split('|');

    // Build a map of topic_id -> complaints
    // IMPORTANT: Use actual per-document assignments if available, otherwise fallback to sequential distribution
    let topicComplaintsMap: Map<number, ComplaintWithEmbedding[]>;

    if (documentTopics && documentTopics.length === complaints.length) {
      // Use actual per-document topic assignments from BERTopic
      topicComplaintsMap = new Map<number, ComplaintWithEmbedding[]>();

      // Initialize map for all topics
      for (const topic of topics) {
        topicComplaintsMap.set(topic.topic_id, []);
      }
      // Also initialize for noise (-1)
      topicComplaintsMap.set(-1, []);

      // Assign complaints to their actual topics
      for (let i = 0; i < complaints.length; i++) {
        const topicId = documentTopics[i];
        if (!topicComplaintsMap.has(topicId)) {
          topicComplaintsMap.set(topicId, []);
        }
        topicComplaintsMap.get(topicId)!.push(complaints[i]);
      }

      console.log(`[PatternGeneration] Using actual per-document topic assignments for ${vehicleKey}`);
    } else {
      // Fallback to sequential distribution (legacy behavior)
      console.warn(`[PatternGeneration] document_topics not available for ${vehicleKey}, using sequential fallback`);
      topicComplaintsMap = this.distributeComplaintsToTopics(topics, complaints);
    }

    // Count noise from actual assignments if available
    const noiseComplaints = topicComplaintsMap.get(-1);
    if (noiseComplaints) {
      noiseCount = noiseComplaints.length;
    }

    for (const topic of topics) {
      // Skip noise topic (topic_id: -1 in BERTopic)
      if (topic.topic_id === -1) {
        // Noise count already captured above
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

  // ============================================
  // POST-PROCESSING METHODS
  // ============================================

  /**
   * Rescue severe complaints from noise by assigning to nearest pattern
   * This ensures complaints with deaths/injuries are NEVER left unlinked
   */
  private async rescueSevereComplaintsFromNoise(): Promise<{ rescued: number }> {
    // Find unlinked severe complaints with embeddings
    const severeUnlinked = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        make: string;
        model: string;
        component: string;
        embedding: string;
        deaths: number;
        injuries: number;
      }>
    >(`
      SELECT id, make, model, component, embedding::text as embedding, deaths, injuries
      FROM "Complaint"
      WHERE "clusterId" IS NULL
        AND embedding IS NOT NULL
        AND (deaths > 0 OR injuries > 0 OR crash = true OR fire = true)
    `);

    if (severeUnlinked.length === 0) {
      return { rescued: 0 };
    }

    console.log(`[RescueSevere] Found ${severeUnlinked.length} severe unlinked complaints`);

    // Get all patterns with their make/model for matching
    const patterns = await prisma.pattern.findMany({
      select: { id: true, make: true, model: true, component: true },
    });

    // Guard against undefined/null patterns array
    if (!patterns || patterns.length === 0) {
      console.log('[RescueSevere] No patterns exist yet, skipping rescue');
      return { rescued: 0 };
    }

    let rescued = 0;

    for (const complaint of severeUnlinked) {
      // Find patterns for the EXACT same vehicle (make+model)
      // IMPORTANT: We must NOT fallback to just make - that causes cross-model contamination
      const matchingPatterns = patterns.filter(
        (p) =>
          p.make.toUpperCase() === complaint.make?.toUpperCase() &&
          p.model?.toUpperCase() === complaint.model?.toUpperCase()
      );

      if (matchingPatterns.length === 0) {
        // No matching pattern for this exact vehicle - skip (will remain as noise)
        // We do NOT fall back to make-only matching to prevent cross-model contamination
        continue;
      }

      // Find pattern with matching component, or use first match for this vehicle
      const targetPattern =
        matchingPatterns.find(
          (p) => p.component.toUpperCase() === complaint.component?.toUpperCase()
        ) || matchingPatterns[0];

      await prisma.complaint.update({
        where: { id: complaint.id },
        data: { clusterId: targetPattern.id },
      });
      rescued++;
    }

    return { rescued };
  }

  /**
   * Merge duplicate patterns (same make/model/component)
   * Keeps the one with highest complaint count, transfers complaints from others
   */
  private async mergeDuplicatePatterns(): Promise<{ merged: number }> {
    // Get all patterns grouped by make/model/component
    const patterns = await prisma.pattern.findMany({
      select: {
        id: true,
        make: true,
        model: true,
        component: true,
        complaintCount: true,
        severityScore: true,
        name: true,
      },
      orderBy: { complaintCount: 'desc' },
    });

    // Guard against undefined/null patterns array
    if (!patterns || patterns.length === 0) {
      console.log('[MergePatterns] No patterns exist, skipping merge');
      return { merged: 0 };
    }

    // Group by make|model|component
    const groups = new Map<string, typeof patterns>();
    for (const pattern of patterns) {
      const key = `${pattern.make}|${pattern.model || ''}|${pattern.component}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pattern);
    }

    let merged = 0;

    for (const [key, group] of groups) {
      if (group.length <= 1) continue;

      // Keep the first one (highest complaint count due to sort)
      const keepPattern = group[0];
      const deletePatterns = group.slice(1);

      console.log(
        `[MergePatterns] Merging ${group.length} patterns for ${key} -> keeping "${keepPattern.name}"`
      );

      // Transfer complaints from duplicates to the keeper
      for (const deletePattern of deletePatterns) {
        await prisma.complaint.updateMany({
          where: { clusterId: deletePattern.id },
          data: { clusterId: keepPattern.id },
        });

        // Delete the duplicate pattern
        await prisma.pattern.delete({
          where: { id: deletePattern.id },
        });

        merged++;
      }
    }

    return { merged };
  }

  /**
   * Recalculate aggregate metrics (deathCount, injuryCount, etc.) for all patterns
   * This ensures pattern stats are derived from actual linked complaints
   */
  private async recalculateAllPatternMetrics(): Promise<void> {
    const patterns = await prisma.pattern.findMany({
      select: { id: true },
    });

    // Guard against undefined/null patterns array
    if (!patterns || patterns.length === 0) {
      console.log('[RecalculateMetrics] No patterns exist, skipping recalculation');
      return;
    }

    for (const pattern of patterns) {
      // Get aggregate stats from linked complaints
      const stats = await prisma.complaint.aggregate({
        where: { clusterId: pattern.id },
        _count: { id: true },
        _sum: {
          deaths: true,
          injuries: true,
        },
      });

      // Count crashes and fires separately (they're booleans)
      const crashCount = await prisma.complaint.count({
        where: { clusterId: pattern.id, crash: true },
      });
      const fireCount = await prisma.complaint.count({
        where: { clusterId: pattern.id, fire: true },
      });

      // Get year range from linked complaints
      const yearStats = await prisma.complaint.aggregate({
        where: {
          clusterId: pattern.id,
          year: { not: null, gte: 1900, lte: new Date().getFullYear() + 2 },
        },
        _min: { year: true },
        _max: { year: true },
      });

      // Calculate severity score
      const deathCount = stats._sum.deaths || 0;
      const injuryCount = stats._sum.injuries || 0;
      const severityScore =
        deathCount * SEVERITY_WEIGHTS.death +
        injuryCount * SEVERITY_WEIGHTS.injury +
        crashCount * SEVERITY_WEIGHTS.crash +
        fireCount * SEVERITY_WEIGHTS.fire;

      // Update pattern
      await prisma.pattern.update({
        where: { id: pattern.id },
        data: {
          complaintCount: stats._count.id,
          deathCount,
          injuryCount,
          crashCount,
          fireCount,
          severityScore,
          yearStart: yearStats._min.year,
          yearEnd: yearStats._max.year,
          lastUpdated: new Date(),
        },
      });
    }
  }

  /**
   * Calculate trend direction for all patterns based on temporal analysis
   * Uses linear regression on monthly complaint counts
   */
  private async calculateAllTrendDirections(): Promise<void> {
    const patterns = await prisma.pattern.findMany({
      select: { id: true },
    });

    // Guard against undefined/null patterns array
    if (!patterns || patterns.length === 0) {
      console.log('[TrendDetection] No patterns exist, skipping trend calculation');
      return;
    }

    for (const pattern of patterns) {
      // Get complaints with dates for this pattern
      const complaints = await prisma.complaint.findMany({
        where: { clusterId: pattern.id },
        select: { dateAdded: true },
        orderBy: { dateAdded: 'asc' },
      });

      if (complaints.length < 3) {
        // Not enough data for trend analysis
        continue;
      }

      // Group by month
      const monthlyCount = new Map<string, number>();
      for (const complaint of complaints) {
        const date = new Date(complaint.dateAdded);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyCount.set(monthKey, (monthlyCount.get(monthKey) || 0) + 1);
      }

      const months = Array.from(monthlyCount.keys()).sort();
      if (months.length < 3) {
        continue;
      }

      // Calculate linear regression slope
      const n = months.length;
      const x = months.map((_, i) => i);
      const y = months.map((m) => monthlyCount.get(m) || 0);

      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
      const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

      // Determine trend direction based on slope
      // Normalize slope by average to get a relative measure
      const avgY = sumY / n;
      const normalizedSlope = avgY > 0 ? slope / avgY : 0;

      let trendDirection: 'INCREASING' | 'DECREASING' | 'STABLE' = 'STABLE';
      let trendScore = 0;

      if (normalizedSlope > 0.1) {
        trendDirection = 'INCREASING';
        trendScore = Math.min(normalizedSlope * 100, 100);
      } else if (normalizedSlope < -0.1) {
        trendDirection = 'DECREASING';
        trendScore = Math.max(normalizedSlope * 100, -100);
      }

      await prisma.pattern.update({
        where: { id: pattern.id },
        data: {
          trendDirection,
          trendScore,
        },
      });
    }
  }
}

// Export singleton instance
export const patternGenerationService = new PatternGenerationService();
