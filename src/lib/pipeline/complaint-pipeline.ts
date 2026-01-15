/**
 * Automated Complaint Processing Pipeline
 *
 * End-to-end pipeline that processes new complaints through:
 * 1. Embedding generation
 * 2. Pattern detection
 * 3. Lead scoring
 *
 * Can be triggered manually or via cron job.
 */

import { prisma } from '@/lib/db';
import { complaintEmbedder } from '@/lib/embeddings/complaint-embedder';
import { patternGenerationService } from '@/lib/patterns/pattern-generation-service';

// Pipeline configuration
const EMBEDDING_BATCH_SIZE = 100; // Process 100 complaints per embedding batch
const EMBEDDING_DELAY_MS = 500; // Delay between batches to avoid rate limits
const MAX_EMBEDDINGS_PER_RUN = 10000; // Max embeddings to generate per pipeline run

export interface PipelineResult {
  success: boolean;
  stage: string;
  embeddings: {
    processed: number;
    remaining: number;
    errors: string[];
  };
  patterns: {
    created: number;
    updated: number;
    merged: number;
    complaintsProcessed: number;
    noiseCount: number;
  };
  durationMs: number;
  error?: string;
}

export interface PipelineProgress {
  stage: 'idle' | 'embeddings' | 'patterns' | 'complete' | 'error';
  progress: number;
  message: string;
  startedAt?: Date;
  completedAt?: Date;
}

// Track current pipeline progress
let currentProgress: PipelineProgress = {
  stage: 'idle',
  progress: 0,
  message: 'Ready',
};

/**
 * Get current pipeline progress
 */
export function getPipelineProgress(): PipelineProgress {
  return { ...currentProgress };
}

/**
 * Update pipeline progress
 */
function updateProgress(update: Partial<PipelineProgress>) {
  currentProgress = { ...currentProgress, ...update };
  console.log(`[Pipeline] ${currentProgress.stage}: ${currentProgress.message} (${currentProgress.progress}%)`);
}

/**
 * Complaint Processing Pipeline
 * Processes complaints through embedding generation, pattern detection, and lead scoring
 */
export class ComplaintPipeline {
  /**
   * Run the full pipeline
   * @param options Configuration options
   * @returns Pipeline result with statistics
   */
  async runFullPipeline(options: {
    maxEmbeddings?: number;
    skipEmbeddings?: boolean;
    skipPatterns?: boolean;
  } = {}): Promise<PipelineResult> {
    const startTime = Date.now();
    const maxEmbeddings = options.maxEmbeddings || MAX_EMBEDDINGS_PER_RUN;

    const result: PipelineResult = {
      success: true,
      stage: 'complete',
      embeddings: {
        processed: 0,
        remaining: 0,
        errors: [],
      },
      patterns: {
        created: 0,
        updated: 0,
        merged: 0,
        complaintsProcessed: 0,
        noiseCount: 0,
      },
      durationMs: 0,
    };

    try {
      updateProgress({
        stage: 'embeddings',
        progress: 0,
        message: 'Starting embedding generation...',
        startedAt: new Date(),
      });

      // Stage 1: Generate embeddings for complaints without them
      if (!options.skipEmbeddings) {
        const embeddingResult = await this.generateEmbeddings(maxEmbeddings);
        result.embeddings = embeddingResult;

        if (embeddingResult.errors.length > 0) {
          console.warn(`[Pipeline] ${embeddingResult.errors.length} embedding errors`);
        }
      }

      updateProgress({
        stage: 'patterns',
        progress: 50,
        message: 'Starting pattern detection...',
      });

      // Stage 2: Generate patterns from embedded complaints
      if (!options.skipPatterns) {
        const patternResult = await this.generatePatterns();
        result.patterns = patternResult;

        if (!patternResult.created && !patternResult.updated) {
          console.log('[Pipeline] No patterns generated (may need ML service)');
        }
      }

      updateProgress({
        stage: 'complete',
        progress: 100,
        message: 'Pipeline complete',
        completedAt: new Date(),
      });

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      updateProgress({
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      result.success = false;
      result.stage = 'error';
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.durationMs = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Generate embeddings for complaints without them
   */
  private async generateEmbeddings(maxEmbeddings: number): Promise<{
    processed: number;
    remaining: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let totalProcessed = 0;

    // Get count of complaints without embeddings
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;
    const totalWithout = Number(countResult[0].count);

    console.log(`[Pipeline] ${totalWithout} complaints need embeddings`);

    // Process in batches
    let remaining = Math.min(totalWithout, maxEmbeddings);
    let batchNum = 0;

    while (remaining > 0 && totalProcessed < maxEmbeddings) {
      const batchSize = Math.min(EMBEDDING_BATCH_SIZE, remaining);

      updateProgress({
        stage: 'embeddings',
        progress: Math.floor((totalProcessed / maxEmbeddings) * 50),
        message: `Processing batch ${batchNum + 1} (${totalProcessed}/${maxEmbeddings} embeddings)`,
      });

      try {
        const batchResult = await complaintEmbedder.embedMissingComplaints(batchSize);
        totalProcessed += batchResult.processed;
        errors.push(...batchResult.errors);
        remaining -= batchResult.processed;

        if (batchResult.processed === 0) {
          // No more complaints to process
          break;
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, EMBEDDING_DELAY_MS));
      } catch (error) {
        errors.push(`Batch ${batchNum} failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      batchNum++;
    }

    // Get updated remaining count
    const finalCountResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Complaint" WHERE embedding IS NULL
    `;

    return {
      processed: totalProcessed,
      remaining: Number(finalCountResult[0].count),
      errors,
    };
  }

  /**
   * Generate patterns from embedded complaints
   */
  private async generatePatterns(): Promise<{
    created: number;
    updated: number;
    merged: number;
    complaintsProcessed: number;
    noiseCount: number;
  }> {
    const result = await patternGenerationService.generatePatterns();

    return {
      created: result.patternsCreated,
      updated: result.patternsUpdated,
      merged: result.patternsMerged,
      complaintsProcessed: result.complaintsProcessed,
      noiseCount: result.noiseCount,
    };
  }

  /**
   * Get pipeline statistics
   */
  async getStats(): Promise<{
    complaints: {
      total: number;
      withEmbeddings: number;
      withoutEmbeddings: number;
      percentComplete: number;
    };
    patterns: {
      total: number;
      avgComplaintCount: number;
      avgSeverityScore: number;
    };
    pipelineStatus: PipelineProgress;
  }> {
    const embeddingStats = await complaintEmbedder.getStats();

    const patternStats = await prisma.pattern.aggregate({
      _count: { id: true },
      _avg: {
        complaintCount: true,
        severityScore: true,
      },
    });

    return {
      complaints: {
        total: embeddingStats.total,
        withEmbeddings: embeddingStats.withEmbedding,
        withoutEmbeddings: embeddingStats.withoutEmbedding,
        percentComplete: embeddingStats.percentComplete,
      },
      patterns: {
        total: patternStats._count.id,
        avgComplaintCount: patternStats._avg.complaintCount || 0,
        avgSeverityScore: patternStats._avg.severityScore || 0,
      },
      pipelineStatus: getPipelineProgress(),
    };
  }
}

// Export singleton instance
export const complaintPipeline = new ComplaintPipeline();
export default complaintPipeline;
