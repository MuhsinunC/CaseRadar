/**
 * Request Tracing Tests
 * P2-2 Implementation - TDD
 *
 * Tests for distributed tracing with correlation IDs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  getTraceContext,
  withTracing,
  propagateTraceHeaders,
  getCurrentTraceContext,
  TraceContext,
} from '../tracing';

describe('Request Tracing', () => {
  beforeEach(() => {
    // Clear any existing context
  });

  describe('generateTraceId', () => {
    it('should generate unique trace IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).not.toBe(id2);
    });

    it('should generate valid format (32 hex characters)', () => {
      const id = generateTraceId();
      expect(id).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate consistent length', () => {
      for (let i = 0; i < 10; i++) {
        const id = generateTraceId();
        expect(id.length).toBe(32);
      }
    });
  });

  describe('generateSpanId', () => {
    it('should generate unique span IDs', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();

      expect(id1).not.toBe(id2);
    });

    it('should generate valid format (16 hex characters)', () => {
      const id = generateSpanId();
      expect(id).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('getTraceContext', () => {
    it('should extract trace ID from x-trace-id header', () => {
      const headers = new Headers({
        'x-trace-id': 'abc123def456789012345678901234',
      });

      const context = getTraceContext(headers);
      expect(context.traceId).toBe('abc123def456789012345678901234');
    });

    it('should generate new trace ID if not present', () => {
      const headers = new Headers();

      const context = getTraceContext(headers);
      expect(context.traceId).toBeDefined();
      expect(context.traceId).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate span ID', () => {
      const headers = new Headers();

      const context = getTraceContext(headers);
      expect(context.spanId).toBeDefined();
      expect(context.spanId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should extract parent span ID from x-span-id header', () => {
      const headers = new Headers({
        'x-trace-id': '12345678901234567890123456789012',
        'x-span-id': 'abcdef0123456789',
      });

      const context = getTraceContext(headers);
      expect(context.parentSpanId).toBe('abcdef0123456789');
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const headers = new Headers();
      const context = getTraceContext(headers);
      const after = Date.now();

      expect(context.startTime).toBeGreaterThanOrEqual(before);
      expect(context.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('withTracing', () => {
    it('should add trace context to callback', async () => {
      let capturedContext: TraceContext | undefined;

      await withTracing(async (context) => {
        capturedContext = context;
      });

      expect(capturedContext).toBeDefined();
      expect(capturedContext!.traceId).toBeDefined();
      expect(capturedContext!.spanId).toBeDefined();
    });

    it('should propagate parent span', async () => {
      let parentContext: TraceContext | undefined;
      let childContext: TraceContext | undefined;

      await withTracing(async (parent) => {
        parentContext = parent;
        await withTracing(
          async (child) => {
            childContext = child;
          },
          { parentSpanId: parent.spanId, traceId: parent.traceId }
        );
      });

      expect(childContext!.parentSpanId).toBe(parentContext!.spanId);
      expect(childContext!.traceId).toBe(parentContext!.traceId);
    });

    it('should maintain trace ID across nested spans', async () => {
      let traceId: string | undefined;

      await withTracing(async (parent) => {
        traceId = parent.traceId;
        await withTracing(
          async (child) => {
            expect(child.traceId).toBe(traceId);
          },
          { traceId: parent.traceId }
        );
      });
    });

    it('should create new span ID for each call', async () => {
      const spanIds: string[] = [];

      await withTracing(async (parent) => {
        spanIds.push(parent.spanId);
        await withTracing(
          async (child) => {
            spanIds.push(child.spanId);
          },
          { traceId: parent.traceId }
        );
      });

      expect(spanIds[0]).not.toBe(spanIds[1]);
    });

    it('should return the callback result', async () => {
      const result = await withTracing(async () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should propagate errors', async () => {
      await expect(
        withTracing(async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });

  describe('propagateTraceHeaders', () => {
    it('should return headers for outgoing requests', () => {
      const context: TraceContext = {
        traceId: 'trace12345678901234567890123456',
        spanId: 'span1234567890ab',
        startTime: Date.now(),
      };

      const headers = propagateTraceHeaders(context);

      expect(headers['x-trace-id']).toBe('trace12345678901234567890123456');
      expect(headers['x-span-id']).toBe('span1234567890ab');
    });

    it('should include parent span if present', () => {
      const context: TraceContext = {
        traceId: 'trace12345678901234567890123456',
        spanId: 'span1234567890ab',
        parentSpanId: 'parent123456789a',
        startTime: Date.now(),
      };

      const headers = propagateTraceHeaders(context);

      expect(headers['x-parent-span-id']).toBe('parent123456789a');
    });

    it('should not include parent span header if not present', () => {
      const context: TraceContext = {
        traceId: 'trace12345678901234567890123456',
        spanId: 'span1234567890ab',
        startTime: Date.now(),
      };

      const headers = propagateTraceHeaders(context);

      expect(headers['x-parent-span-id']).toBeUndefined();
    });
  });

  describe('getCurrentTraceContext', () => {
    it('should return null when no context', () => {
      const context = getCurrentTraceContext();
      expect(context).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should support full request flow', async () => {
      // Simulate incoming request with trace header
      const incomingHeaders = new Headers({
        'x-trace-id': '00000000000000000000000000000001',
      });

      const context = getTraceContext(incomingHeaders);

      // Use context in handler
      await withTracing(
        async (ctx) => {
          // Generate outgoing headers
          const outgoingHeaders = propagateTraceHeaders(ctx);

          expect(outgoingHeaders['x-trace-id']).toBe(
            '00000000000000000000000000000001'
          );
          expect(outgoingHeaders['x-span-id']).toBe(ctx.spanId);
        },
        { traceId: context.traceId }
      );
    });
  });
});
