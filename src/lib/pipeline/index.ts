/**
 * Pipeline Module
 *
 * Unified data pipeline for processing NHTSA complaints through
 * embedding generation, pattern detection, and lead generation.
 */

// Unified Pipeline (recommended)
export {
  processPipeline,
  getLastPipelineRun,
  getPipelineHistory,
  getPipelineStats,
  pipelineEvents,
  type PipelineOptions,
  type PipelineResult,
  type StageResult,
  type PipelineError,
} from './unified-pipeline';

// Event System
export {
  emitPipelineEvent,
  type PipelineEvent,
  type ComplaintsIngestedPayload,
  type EmbeddingsGeneratedPayload,
  type PatternsDetectedPayload,
  type LeadsGeneratedPayload,
  type PipelineStartedPayload,
  type PipelineCompletePayload,
  type PipelineErrorPayload,
  type StageStartedPayload,
  type StageCompletePayload,
  type StageErrorPayload,
} from './events';

// Legacy Pipeline (for backwards compatibility)
export {
  ComplaintPipeline,
  complaintPipeline,
  getPipelineProgress,
  type PipelineResult as LegacyPipelineResult,
  type PipelineProgress,
} from './complaint-pipeline';
