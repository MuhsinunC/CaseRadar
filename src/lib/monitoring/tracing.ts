/**
 * Request Tracing
 * P2-2 Implementation
 *
 * Provides distributed tracing with correlation IDs for tracking
 * requests across service boundaries.
 */

import crypto from 'crypto';

/**
 * Trace context containing IDs for distributed tracing
 */
export interface TraceContext {
  /** Unique identifier for the entire trace (32 hex chars) */
  traceId: string;
  /** Unique identifier for this span (16 hex chars) */
  spanId: string;
  /** Parent span ID if this is a child span */
  parentSpanId?: string;
  /** Start time of this span in milliseconds */
  startTime: number;
}

/**
 * Options for creating a new tracing context
 */
export interface TracingOptions {
  traceId?: string;
  parentSpanId?: string;
}

// Thread-local storage for trace context (simplified implementation)
let currentContext: TraceContext | null = null;

/**
 * Generate a unique trace ID (32 hex characters)
 *
 * @returns 32-character hex string
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a unique span ID (16 hex characters)
 *
 * @returns 16-character hex string
 */
export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Extract trace context from incoming request headers
 *
 * @param headers - Request headers
 * @returns Trace context (with new IDs if not present in headers)
 */
export function getTraceContext(headers: Headers): TraceContext {
  const traceId = headers.get('x-trace-id') || generateTraceId();
  const parentSpanId = headers.get('x-span-id') || undefined;
  const spanId = generateSpanId();

  return {
    traceId,
    spanId,
    parentSpanId,
    startTime: Date.now(),
  };
}

/**
 * Execute a function with tracing context
 *
 * @param fn - Async function to execute with trace context
 * @param options - Optional trace options for propagation
 * @returns Result of the function
 */
export async function withTracing<T>(
  fn: (context: TraceContext) => Promise<T>,
  options?: TracingOptions
): Promise<T> {
  const context: TraceContext = {
    traceId: options?.traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: options?.parentSpanId,
    startTime: Date.now(),
  };

  // Store context for this execution
  const previousContext = currentContext;
  currentContext = context;

  try {
    return await fn(context);
  } finally {
    // Restore previous context
    currentContext = previousContext;
  }
}

/**
 * Get the current trace context (if any)
 *
 * @returns Current trace context or null if not in a traced context
 */
export function getCurrentTraceContext(): TraceContext | null {
  return currentContext;
}

/**
 * Generate headers for propagating trace context to outgoing requests
 *
 * @param context - Trace context to propagate
 * @returns Headers object for outgoing requests
 */
export function propagateTraceHeaders(
  context: TraceContext
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-trace-id': context.traceId,
    'x-span-id': context.spanId,
  };

  if (context.parentSpanId) {
    headers['x-parent-span-id'] = context.parentSpanId;
  }

  return headers;
}

/**
 * Create a child span from the current context
 *
 * @returns New trace context with same traceId but new spanId
 */
export function createChildSpan(): TraceContext | null {
  if (!currentContext) {
    return null;
  }

  return {
    traceId: currentContext.traceId,
    spanId: generateSpanId(),
    parentSpanId: currentContext.spanId,
    startTime: Date.now(),
  };
}

/**
 * Format trace context for logging
 *
 * @param context - Trace context to format
 * @returns Formatted string for logging
 */
export function formatTraceContext(context: TraceContext): string {
  const parts = [`trace=${context.traceId}`, `span=${context.spanId}`];

  if (context.parentSpanId) {
    parts.push(`parent=${context.parentSpanId}`);
  }

  return parts.join(' ');
}

/**
 * Calculate span duration
 *
 * @param context - Trace context with start time
 * @returns Duration in milliseconds
 */
export function getSpanDuration(context: TraceContext): number {
  return Date.now() - context.startTime;
}
