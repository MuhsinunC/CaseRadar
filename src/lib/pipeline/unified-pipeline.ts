/**
 * Unified Data Pipeline
 *
 * Single-function orchestration system that processes the entire data pipeline
 * from NHTSA complaint ingestion through to lead generation.
 *
 * Stages:
 * 1. Ingest - Fetch new complaints from NHTSA
 * 2. Embed - Generate embeddings for complaints without them
 * 3. Patterns - Detect patterns using ML clustering
 * 4. Leads - Generate leads from high-severity patterns
 */

import { prisma } from '@/lib/db';
import { PipelineStatus } from '@prisma/client';
import { nhtsaSyncService } from '@/lib/nhtsa/sync';
import { complaintEmbedder } from '@/lib/embeddings/complaint-embedder';
import { patternGenerationService } from '@/lib/patterns/pattern-generation-service';
import {
  emitPipelineEvent,
  pipelineEvents,
  type PipelineCompletePayload,
} from './events';

// ============================================
// Types
// ============================================

export interface PipelineOptions {
  // What to process
  mode: 'full' | 'incremental';

  // Stage control (all enabled by default)
  stages?: {
    ingest?: boolean;
    embed?: boolean;
    patterns?: boolean;
    leads?: boolean;
  };

  // Filtering
  filters?: {
    since?: Date;
    make?: string;
    highQualityOnly?: boolean;
  };

  // Execution
  dryRun?: boolean;
  concurrency?: number;
  batchSize?: number;
  continueOnError?: boolean;

  // Trigger source
  triggeredBy?: 'cron' | 'api' | 'manual';
}

export interface StageResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  duration: number;
  errors: string[];
}

export interface PipelineResult {
  success: boolean;
  runId: string;
  stages: {
    ingest: StageResult;
    embed: StageResult;
    patterns: StageResult;
    leads: StageResult;
  };
  totalDuration: number;
  recordsProcessed: number;
  errors: PipelineError[];
}

export interface PipelineError {
  stage: string;
  message: string;
  recoverable: boolean;
}

// Default stage result
const defaultStageResult = (): StageResult => ({
  success: true,
  recordsProcessed: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  duration: 0,
  errors: [],
});

// ============================================
// Stage Implementations
// ============================================

/**
 * Stage 1: Ingest - Fetch new NHTSA complaints
 */
async function ingestStage(options: PipelineOptions): Promise<StageResult> {
  const startTime = Date.now();
  const result = defaultStageResult();

  try {
    if (options.dryRun) {
      // In dry run, just count what would be synced
      const lastSync = await nhtsaSyncService.getLastSyncDate();
      console.log(`[Ingest] Dry run - would sync from ${lastSync?.toISOString() || '7 days ago'}`);
      result.duration = Date.now() - startTime;
      return result;
    }

    // Run NHTSA sync based on mode
    const syncResult = options.mode === 'full'
      ? await nhtsaSyncService.syncHighSeverityComplaints(10000)
      : await nhtsaSyncService.syncNewComplaints();

    result.recordsProcessed = syncResult.totalComplaints;
    result.recordsCreated = syncResult.newComplaints;
    result.errors = syncResult.errors;
    result.success = syncResult.errors.length === 0;

    emitPipelineEvent('complaints:ingested', {
      count: syncResult.newComplaints,
      complaintIds: [], // Would need to track IDs from sync
      source: 'api',
      duration: Date.now() - startTime,
    });
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Stage 2: Embed - Generate embeddings for complaints
 */
async function embedStage(options: PipelineOptions): Promise<StageResult> {
  const startTime = Date.now();
  const result = defaultStageResult();

  try {
    // Get count of complaints without embeddings
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    const totalWithout = Number(countResult[0].count);

    if (options.dryRun) {
      console.log(`[Embed] Dry run - would embed ${totalWithout} complaints`);
      result.recordsProcessed = totalWithout;
      result.duration = Date.now() - startTime;
      return result;
    }

    // Process based on mode
    const limit = options.mode === 'full' ? 50000 : options.batchSize || 1000;

    const embedResult = await complaintEmbedder.embedMissingComplaints(limit);
    result.recordsProcessed = embedResult.processed;
    result.recordsCreated = embedResult.processed;
    result.errors = embedResult.errors;
    result.success = embedResult.errors.length === 0;

    // Get remaining count
    const remainingResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    const remaining = Number(remainingResult[0].count);

    emitPipelineEvent('embeddings:generated', {
      count: embedResult.processed,
      complaintIds: [],
      duration: Date.now() - startTime,
      remaining,
    });
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Stage 3: Patterns - Detect patterns using ML clustering
 */
async function patternStage(options: PipelineOptions): Promise<StageResult> {
  const startTime = Date.now();
  const result = defaultStageResult();

  try {
    if (options.dryRun) {
      const embeddedCount = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
      `;
      console.log(`[Patterns] Dry run - would analyze ${Number(embeddedCount[0].count)} complaints`);
      result.recordsProcessed = Number(embeddedCount[0].count);
      result.duration = Date.now() - startTime;
      return result;
    }

    const patternResult = await patternGenerationService.generatePatterns({
      highQualityOnly: options.filters?.highQualityOnly,
    });

    result.success = patternResult.success;
    result.recordsProcessed = patternResult.complaintsProcessed;
    result.recordsCreated = patternResult.patternsCreated;
    result.recordsUpdated = patternResult.patternsUpdated;

    if (patternResult.error) {
      result.errors.push(patternResult.error);
    }

    emitPipelineEvent('patterns:detected', {
      count: patternResult.patternsCreated + patternResult.patternsUpdated,
      patternIds: [],
      complaintsLinked: patternResult.complaintsProcessed - patternResult.noiseCount,
      patternsCreated: patternResult.patternsCreated,
      patternsUpdated: patternResult.patternsUpdated,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Stage 4: Leads - Generate leads from high-severity patterns
 */
async function leadStage(options: PipelineOptions): Promise<StageResult> {
  const startTime = Date.now();
  const result = defaultStageResult();

  try {
    // Find patterns that meet lead criteria
    const minSeverity = 50; // At least some severity
    const minComplaints = 5; // At least 5 complaints

    const eligiblePatterns = await prisma.pattern.findMany({
      where: {
        isActive: true,
        severityScore: { gte: minSeverity },
        complaintCount: { gte: minComplaints },
      },
      include: {
        leads: true,
      },
    });

    if (options.dryRun) {
      console.log(`[Leads] Dry run - would process ${eligiblePatterns.length} patterns`);
      result.recordsProcessed = eligiblePatterns.length;
      result.duration = Date.now() - startTime;
      return result;
    }

    let leadsCreated = 0;
    let leadsUpdated = 0;
    const highPriorityLeads: string[] = [];

    for (const pattern of eligiblePatterns) {
      // Check if lead already exists for this pattern
      const existingLead = pattern.leads[0];

      // Calculate priority score (0-1 range)
      // Based on severity, complaints, and trend
      const priorityScore = calculatePriorityScore(pattern);

      const leadData = {
        title: `${pattern.make} ${pattern.model || ''} ${pattern.component} Safety Issue`,
        description: pattern.description || `Pattern of ${pattern.complaintCount} complaints involving ${pattern.component}`,
        make: pattern.make,
        model: pattern.model,
        component: pattern.component,
        yearStart: pattern.yearStart,
        yearEnd: pattern.yearEnd,
        severityScore: Math.round(pattern.severityScore),
        confidenceScore: Math.min(pattern.complaintCount / 100, 1), // More complaints = higher confidence
        priorityScore,
        complaintCount: pattern.complaintCount,
        deathCount: pattern.deathCount,
        injuryCount: pattern.injuryCount,
        crashCount: pattern.crashCount,
        fireCount: pattern.fireCount,
      };

      // Try to match with a recall
      const matchedRecallId = await findMatchingRecall(pattern);

      if (existingLead) {
        // Update existing lead
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            ...leadData,
            matchedRecallId,
          },
        });
        leadsUpdated++;

        if (priorityScore >= 0.7) {
          highPriorityLeads.push(existingLead.id);
        }
      } else {
        // Create new lead
        const newLead = await prisma.lead.create({
          data: {
            ...leadData,
            patternId: pattern.id,
            matchedRecallId,
          },
        });
        leadsCreated++;

        if (priorityScore >= 0.7) {
          highPriorityLeads.push(newLead.id);
        }
      }
    }

    result.success = true;
    result.recordsProcessed = eligiblePatterns.length;
    result.recordsCreated = leadsCreated;
    result.recordsUpdated = leadsUpdated;

    emitPipelineEvent('leads:generated', {
      count: leadsCreated + leadsUpdated,
      leadIds: highPriorityLeads,
      highPriorityCount: highPriorityLeads.length,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Find a matching recall for a pattern based on make, model, component, and year
 */
async function findMatchingRecall(pattern: {
  make: string;
  model: string | null;
  component: string;
  yearStart: number | null;
  yearEnd: number | null;
}): Promise<string | null> {
  // Build where clause for matching recalls
  const whereClause: {
    make: string;
    model?: string;
    component: { contains: string; mode: 'insensitive' };
    year?: { gte?: number; lte?: number };
  } = {
    make: pattern.make,
    component: { contains: pattern.component, mode: 'insensitive' },
  };

  // Match model if available
  if (pattern.model) {
    whereClause.model = pattern.model;
  }

  // Match year range if available
  if (pattern.yearStart || pattern.yearEnd) {
    whereClause.year = {};
    if (pattern.yearStart) {
      whereClause.year.gte = pattern.yearStart;
    }
    if (pattern.yearEnd) {
      whereClause.year.lte = pattern.yearEnd;
    }
  }

  // Find the most recent matching recall
  const matchingRecall = await prisma.recall.findFirst({
    where: whereClause,
    orderBy: { reportReceivedDate: 'desc' },
    select: { id: true },
  });

  return matchingRecall?.id || null;
}

/**
 * Calculate priority score for a pattern (0-1 range)
 */
function calculatePriorityScore(pattern: {
  severityScore: number;
  complaintCount: number;
  trendDirection: string;
  trendScore: number;
  deathCount: number;
  injuryCount: number;
}): number {
  let score = 0;

  // Severity component (0-0.4)
  // Deaths are highest priority
  if (pattern.deathCount > 0) {
    score += 0.4;
  } else if (pattern.injuryCount > 0) {
    score += 0.25;
  } else {
    score += Math.min(pattern.severityScore / 500, 0.2);
  }

  // Volume component (0-0.3)
  score += Math.min(pattern.complaintCount / 500, 0.3);

  // Trend component (0-0.3)
  if (pattern.trendDirection === 'INCREASING') {
    score += 0.2 + Math.min(pattern.trendScore / 100, 0.1);
  } else if (pattern.trendDirection === 'STABLE') {
    score += 0.1;
  }
  // DECREASING patterns get no trend bonus

  return Math.min(score, 1);
}

// ============================================
// Main Pipeline Function
// ============================================

/**
 * Process the unified data pipeline
 *
 * @param options Pipeline configuration options
 * @returns Pipeline result with statistics for all stages
 */
export async function processPipeline(
  options: PipelineOptions = { mode: 'incremental' }
): Promise<PipelineResult> {
  const startTime = Date.now();
  const triggeredBy = options.triggeredBy || 'manual';

  // Determine which stages to run (all by default)
  const stages = {
    ingest: options.stages?.ingest ?? true,
    embed: options.stages?.embed ?? true,
    patterns: options.stages?.patterns ?? true,
    leads: options.stages?.leads ?? true,
  };

  // Create pipeline run record
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      mode: options.mode,
      triggeredBy,
      status: PipelineStatus.RUNNING,
    },
  });

  const runId = pipelineRun.id;

  // Initialize result
  const result: PipelineResult = {
    success: true,
    runId,
    stages: {
      ingest: defaultStageResult(),
      embed: defaultStageResult(),
      patterns: defaultStageResult(),
      leads: defaultStageResult(),
    },
    totalDuration: 0,
    recordsProcessed: 0,
    errors: [],
  };

  // Emit pipeline started event
  emitPipelineEvent('pipeline:started', {
    runId,
    mode: options.mode,
    triggeredBy,
    stages,
  });

  try {
    // Stage 1: Ingest
    if (stages.ingest) {
      emitPipelineEvent('stage:started', { runId, stage: 'ingest' });
      result.stages.ingest = await ingestStage(options);
      emitPipelineEvent('stage:complete', {
        runId,
        stage: 'ingest',
        success: result.stages.ingest.success,
        recordsProcessed: result.stages.ingest.recordsProcessed,
        duration: result.stages.ingest.duration,
      });

      if (!result.stages.ingest.success && !options.continueOnError) {
        throw new Error(`Ingest stage failed: ${result.stages.ingest.errors.join(', ')}`);
      }
    }

    // Stage 2: Embed
    if (stages.embed) {
      emitPipelineEvent('stage:started', { runId, stage: 'embed' });
      result.stages.embed = await embedStage(options);
      emitPipelineEvent('stage:complete', {
        runId,
        stage: 'embed',
        success: result.stages.embed.success,
        recordsProcessed: result.stages.embed.recordsProcessed,
        duration: result.stages.embed.duration,
      });

      if (!result.stages.embed.success && !options.continueOnError) {
        throw new Error(`Embed stage failed: ${result.stages.embed.errors.join(', ')}`);
      }
    }

    // Stage 3: Patterns
    if (stages.patterns) {
      emitPipelineEvent('stage:started', { runId, stage: 'patterns' });
      result.stages.patterns = await patternStage(options);
      emitPipelineEvent('stage:complete', {
        runId,
        stage: 'patterns',
        success: result.stages.patterns.success,
        recordsProcessed: result.stages.patterns.recordsProcessed,
        duration: result.stages.patterns.duration,
      });

      if (!result.stages.patterns.success && !options.continueOnError) {
        throw new Error(`Patterns stage failed: ${result.stages.patterns.errors.join(', ')}`);
      }
    }

    // Stage 4: Leads
    if (stages.leads) {
      emitPipelineEvent('stage:started', { runId, stage: 'leads' });
      result.stages.leads = await leadStage(options);
      emitPipelineEvent('stage:complete', {
        runId,
        stage: 'leads',
        success: result.stages.leads.success,
        recordsProcessed: result.stages.leads.recordsProcessed,
        duration: result.stages.leads.duration,
      });

      if (!result.stages.leads.success && !options.continueOnError) {
        throw new Error(`Leads stage failed: ${result.stages.leads.errors.join(', ')}`);
      }
    }

    // Calculate totals
    result.totalDuration = Date.now() - startTime;
    result.recordsProcessed =
      result.stages.ingest.recordsProcessed +
      result.stages.embed.recordsProcessed +
      result.stages.patterns.recordsProcessed +
      result.stages.leads.recordsProcessed;

    // Collect all errors
    for (const [stage, stageResult] of Object.entries(result.stages)) {
      for (const error of stageResult.errors) {
        result.errors.push({ stage, message: error, recoverable: true });
      }
      if (!stageResult.success) {
        result.success = false;
      }
    }

    // Update pipeline run record
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: result.success ? PipelineStatus.COMPLETED : PipelineStatus.FAILED,
        totalRecords: result.recordsProcessed,
        totalDuration: result.totalDuration,
        ingestResult: result.stages.ingest as unknown as object,
        embedResult: result.stages.embed as unknown as object,
        patternResult: result.stages.patterns as unknown as object,
        leadResult: result.stages.leads as unknown as object,
        completedAt: new Date(),
        errorMessage: result.errors.length > 0
          ? result.errors.map(e => `${e.stage}: ${e.message}`).join('; ')
          : null,
      },
    });

    // Emit pipeline complete event
    emitPipelineEvent('pipeline:complete', {
      runId,
      success: result.success,
      totalRecords: result.recordsProcessed,
      totalDuration: result.totalDuration,
      stages: {
        ingest: { success: result.stages.ingest.success, records: result.stages.ingest.recordsProcessed },
        embed: { success: result.stages.embed.success, records: result.stages.embed.recordsProcessed },
        patterns: { success: result.stages.patterns.success, records: result.stages.patterns.recordsProcessed },
        leads: { success: result.stages.leads.success, records: result.stages.leads.recordsProcessed },
      },
    });
  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push({ stage: 'pipeline', message: errorMessage, recoverable: false });

    // Update pipeline run as failed
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: PipelineStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
        totalDuration: Date.now() - startTime,
      },
    });

    emitPipelineEvent('pipeline:error', {
      runId,
      stage: 'pipeline',
      error: errorMessage,
      recoverable: false,
    });
  }

  return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the last pipeline run
 */
export async function getLastPipelineRun() {
  return prisma.pipelineRun.findFirst({
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Get pipeline run history
 */
export async function getPipelineHistory(limit: number = 10) {
  return prisma.pipelineRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats() {
  const [
    totalComplaints,
    complaintsWithEmbeddings,
    totalPatterns,
    totalLeads,
    highPriorityLeads,
    lastRun,
  ] = await Promise.all([
    prisma.complaint.count(),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NOT NULL
    `,
    prisma.pattern.count({ where: { isActive: true } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { priorityScore: { gte: 0.7 } } }),
    getLastPipelineRun(),
  ]);

  const embeddingCoverage = totalComplaints > 0
    ? (Number(complaintsWithEmbeddings[0].count) / totalComplaints) * 100
    : 0;

  return {
    complaints: {
      total: totalComplaints,
      withEmbeddings: Number(complaintsWithEmbeddings[0].count),
      coverage: Math.round(embeddingCoverage * 10) / 10,
    },
    patterns: {
      total: totalPatterns,
    },
    leads: {
      total: totalLeads,
      highPriority: highPriorityLeads,
    },
    lastRun: lastRun ? {
      id: lastRun.id,
      mode: lastRun.mode,
      status: lastRun.status,
      startedAt: lastRun.startedAt,
      completedAt: lastRun.completedAt,
      duration: lastRun.totalDuration,
    } : null,
  };
}

// Export for module access
export { pipelineEvents };
