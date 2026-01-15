/**
 * Pipeline Event System
 *
 * Event emitter for coordinating pipeline stages and external notifications.
 * Supports both synchronous (within pipeline) and asynchronous (webhook) handlers.
 */

import { EventEmitter } from 'events';

// Create pipeline event emitter
export const pipelineEvents = new EventEmitter();

// Increase max listeners for production use
pipelineEvents.setMaxListeners(20);

// ============================================
// Event Types
// ============================================

export type PipelineEvent =
  | 'complaints:ingested'
  | 'embeddings:generated'
  | 'patterns:detected'
  | 'leads:generated'
  | 'pipeline:started'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'stage:started'
  | 'stage:complete'
  | 'stage:error';

// ============================================
// Event Payloads
// ============================================

export interface ComplaintsIngestedPayload {
  count: number;
  complaintIds: string[];
  source: 'api' | 'flatfile' | 'both';
  duration: number;
}

export interface EmbeddingsGeneratedPayload {
  count: number;
  complaintIds: string[];
  duration: number;
  remaining: number;
}

export interface PatternsDetectedPayload {
  count: number;
  patternIds: string[];
  complaintsLinked: number;
  patternsCreated: number;
  patternsUpdated: number;
  duration: number;
}

export interface LeadsGeneratedPayload {
  count: number;
  leadIds: string[];
  highPriorityCount: number;
  duration: number;
}

export interface PipelineStartedPayload {
  runId: string;
  mode: 'full' | 'incremental';
  triggeredBy: string;
  stages: {
    ingest: boolean;
    embed: boolean;
    patterns: boolean;
    leads: boolean;
  };
}

export interface PipelineCompletePayload {
  runId: string;
  success: boolean;
  totalRecords: number;
  totalDuration: number;
  stages: {
    ingest?: { success: boolean; records: number };
    embed?: { success: boolean; records: number };
    patterns?: { success: boolean; records: number };
    leads?: { success: boolean; records: number };
  };
}

export interface PipelineErrorPayload {
  runId: string;
  stage: string;
  error: string;
  recoverable: boolean;
}

export interface StageStartedPayload {
  runId: string;
  stage: 'ingest' | 'embed' | 'patterns' | 'leads';
}

export interface StageCompletePayload {
  runId: string;
  stage: 'ingest' | 'embed' | 'patterns' | 'leads';
  success: boolean;
  recordsProcessed: number;
  duration: number;
}

export interface StageErrorPayload {
  runId: string;
  stage: 'ingest' | 'embed' | 'patterns' | 'leads';
  error: string;
}

// ============================================
// Typed Event Emitter
// ============================================

export function emitPipelineEvent(
  event: 'complaints:ingested',
  payload: ComplaintsIngestedPayload
): void;
export function emitPipelineEvent(
  event: 'embeddings:generated',
  payload: EmbeddingsGeneratedPayload
): void;
export function emitPipelineEvent(
  event: 'patterns:detected',
  payload: PatternsDetectedPayload
): void;
export function emitPipelineEvent(
  event: 'leads:generated',
  payload: LeadsGeneratedPayload
): void;
export function emitPipelineEvent(
  event: 'pipeline:started',
  payload: PipelineStartedPayload
): void;
export function emitPipelineEvent(
  event: 'pipeline:complete',
  payload: PipelineCompletePayload
): void;
export function emitPipelineEvent(
  event: 'pipeline:error',
  payload: PipelineErrorPayload
): void;
export function emitPipelineEvent(
  event: 'stage:started',
  payload: StageStartedPayload
): void;
export function emitPipelineEvent(
  event: 'stage:complete',
  payload: StageCompletePayload
): void;
export function emitPipelineEvent(
  event: 'stage:error',
  payload: StageErrorPayload
): void;
export function emitPipelineEvent(event: PipelineEvent, payload: unknown): void {
  pipelineEvents.emit(event, payload);
}

// ============================================
// Default Event Handlers (Logging)
// ============================================

// Log all pipeline events
pipelineEvents.on('pipeline:started', (payload: PipelineStartedPayload) => {
  console.log(`[Pipeline] Started run ${payload.runId} (${payload.mode} mode, triggered by ${payload.triggeredBy})`);
});

pipelineEvents.on('pipeline:complete', (payload: PipelineCompletePayload) => {
  console.log(
    `[Pipeline] Complete: ${payload.totalRecords} records in ${payload.totalDuration}ms (success: ${payload.success})`
  );
});

pipelineEvents.on('pipeline:error', (payload: PipelineErrorPayload) => {
  console.error(`[Pipeline] Error in ${payload.stage}: ${payload.error}`);
});

pipelineEvents.on('stage:started', (payload: StageStartedPayload) => {
  console.log(`[Pipeline] Stage ${payload.stage} started`);
});

pipelineEvents.on('stage:complete', (payload: StageCompletePayload) => {
  console.log(
    `[Pipeline] Stage ${payload.stage} complete: ${payload.recordsProcessed} records in ${payload.duration}ms`
  );
});

pipelineEvents.on('complaints:ingested', (payload: ComplaintsIngestedPayload) => {
  console.log(`[Pipeline] Ingested ${payload.count} complaints from ${payload.source}`);
});

pipelineEvents.on('embeddings:generated', (payload: EmbeddingsGeneratedPayload) => {
  console.log(`[Pipeline] Generated ${payload.count} embeddings (${payload.remaining} remaining)`);
});

pipelineEvents.on('patterns:detected', (payload: PatternsDetectedPayload) => {
  console.log(
    `[Pipeline] Detected ${payload.count} patterns (${payload.patternsCreated} new, ${payload.patternsUpdated} updated)`
  );
});

pipelineEvents.on('leads:generated', (payload: LeadsGeneratedPayload) => {
  console.log(`[Pipeline] Generated ${payload.count} leads (${payload.highPriorityCount} high priority)`);
});
