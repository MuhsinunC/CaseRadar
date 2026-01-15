/**
 * Pipeline Events Tests
 * Tests for the event system that coordinates pipeline stages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Pipeline Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('pipelineEvents EventEmitter', () => {
    it('should be an EventEmitter instance', async () => {
      const { pipelineEvents } = await import('../events');
      expect(pipelineEvents).toBeDefined();
      expect(typeof pipelineEvents.on).toBe('function');
      expect(typeof pipelineEvents.emit).toBe('function');
      expect(typeof pipelineEvents.removeListener).toBe('function');
    });

    it('should allow registering event listeners', async () => {
      const { pipelineEvents } = await import('../events');
      const handler = vi.fn();

      const countBefore = pipelineEvents.listenerCount('complaints:ingested');
      pipelineEvents.on('complaints:ingested', handler);

      // Verify listener was registered
      expect(pipelineEvents.listenerCount('complaints:ingested')).toBe(countBefore + 1);

      // Cleanup
      pipelineEvents.removeListener('complaints:ingested', handler);
    });

    it('should allow removing event listeners', async () => {
      const { pipelineEvents } = await import('../events');
      const handler = vi.fn();

      const countBefore = pipelineEvents.listenerCount('embeddings:generated');
      pipelineEvents.on('embeddings:generated', handler);
      expect(pipelineEvents.listenerCount('embeddings:generated')).toBe(countBefore + 1);

      pipelineEvents.removeListener('embeddings:generated', handler);
      expect(pipelineEvents.listenerCount('embeddings:generated')).toBe(countBefore);
    });
  });

  describe('emitPipelineEvent', () => {
    it('should emit complaints:ingested event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('complaints:ingested', handler);

      emitPipelineEvent('complaints:ingested', {
        count: 100,
        complaintIds: ['c1', 'c2', 'c3'],
        source: 'api',
        duration: 5000,
      });

      expect(handler).toHaveBeenCalledWith({
        count: 100,
        complaintIds: ['c1', 'c2', 'c3'],
        source: 'api',
        duration: 5000,
      });

      pipelineEvents.removeListener('complaints:ingested', handler);
    });

    it('should emit embeddings:generated event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('embeddings:generated', handler);

      emitPipelineEvent('embeddings:generated', {
        count: 500,
        complaintIds: ['c1', 'c2'],
        duration: 10000,
        remaining: 100,
      });

      expect(handler).toHaveBeenCalledWith({
        count: 500,
        complaintIds: ['c1', 'c2'],
        duration: 10000,
        remaining: 100,
      });

      pipelineEvents.removeListener('embeddings:generated', handler);
    });

    it('should emit patterns:detected event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('patterns:detected', handler);

      emitPipelineEvent('patterns:detected', {
        count: 25,
        patternIds: ['p1', 'p2'],
        complaintsLinked: 450,
        patternsCreated: 10,
        patternsUpdated: 15,
        duration: 8000,
      });

      expect(handler).toHaveBeenCalledWith({
        count: 25,
        patternIds: ['p1', 'p2'],
        complaintsLinked: 450,
        patternsCreated: 10,
        patternsUpdated: 15,
        duration: 8000,
      });

      pipelineEvents.removeListener('patterns:detected', handler);
    });

    it('should emit leads:generated event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('leads:generated', handler);

      emitPipelineEvent('leads:generated', {
        count: 15,
        leadIds: ['l1', 'l2', 'l3'],
        highPriorityCount: 5,
        duration: 2000,
      });

      expect(handler).toHaveBeenCalledWith({
        count: 15,
        leadIds: ['l1', 'l2', 'l3'],
        highPriorityCount: 5,
        duration: 2000,
      });

      pipelineEvents.removeListener('leads:generated', handler);
    });

    it('should emit pipeline:started event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('pipeline:started', handler);

      emitPipelineEvent('pipeline:started', {
        runId: 'run_123',
        mode: 'full',
        triggeredBy: 'cron',
        stages: {
          ingest: true,
          embed: true,
          patterns: true,
          leads: true,
        },
      });

      expect(handler).toHaveBeenCalledWith({
        runId: 'run_123',
        mode: 'full',
        triggeredBy: 'cron',
        stages: {
          ingest: true,
          embed: true,
          patterns: true,
          leads: true,
        },
      });

      pipelineEvents.removeListener('pipeline:started', handler);
    });

    it('should emit pipeline:complete event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('pipeline:complete', handler);

      emitPipelineEvent('pipeline:complete', {
        runId: 'run_123',
        success: true,
        totalRecords: 1500,
        totalDuration: 30000,
        stages: {
          ingest: { success: true, records: 500 },
          embed: { success: true, records: 500 },
          patterns: { success: true, records: 400 },
          leads: { success: true, records: 100 },
        },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run_123',
          success: true,
          totalRecords: 1500,
        })
      );

      pipelineEvents.removeListener('pipeline:complete', handler);
    });

    it('should emit pipeline:error event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('pipeline:error', handler);

      emitPipelineEvent('pipeline:error', {
        runId: 'run_456',
        stage: 'embed',
        error: 'OpenAI API rate limit exceeded',
        recoverable: true,
      });

      expect(handler).toHaveBeenCalledWith({
        runId: 'run_456',
        stage: 'embed',
        error: 'OpenAI API rate limit exceeded',
        recoverable: true,
      });

      pipelineEvents.removeListener('pipeline:error', handler);
    });

    it('should emit stage:started event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('stage:started', handler);

      emitPipelineEvent('stage:started', {
        runId: 'run_789',
        stage: 'patterns',
      });

      expect(handler).toHaveBeenCalledWith({
        runId: 'run_789',
        stage: 'patterns',
      });

      pipelineEvents.removeListener('stage:started', handler);
    });

    it('should emit stage:complete event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('stage:complete', handler);

      emitPipelineEvent('stage:complete', {
        runId: 'run_789',
        stage: 'ingest',
        success: true,
        recordsProcessed: 250,
        duration: 5000,
      });

      expect(handler).toHaveBeenCalledWith({
        runId: 'run_789',
        stage: 'ingest',
        success: true,
        recordsProcessed: 250,
        duration: 5000,
      });

      pipelineEvents.removeListener('stage:complete', handler);
    });

    it('should emit stage:error event with correct payload', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');
      const handler = vi.fn();

      pipelineEvents.on('stage:error', handler);

      emitPipelineEvent('stage:error', {
        runId: 'run_err',
        stage: 'leads',
        error: 'Database connection lost',
        recoverable: false,
      });

      expect(handler).toHaveBeenCalledWith({
        runId: 'run_err',
        stage: 'leads',
        error: 'Database connection lost',
        recoverable: false,
      });

      pipelineEvents.removeListener('stage:error', handler);
    });
  });

  describe('Event Type Safety', () => {
    it('should have all event types exported', async () => {
      const events = await import('../events');

      // Verify type exports
      expect(events.emitPipelineEvent).toBeDefined();
      expect(events.pipelineEvents).toBeDefined();
    });
  });

  describe('Multiple Listeners', () => {
    it('should notify all registered listeners for an event', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      pipelineEvents.on('pipeline:complete', handler1);
      pipelineEvents.on('pipeline:complete', handler2);
      pipelineEvents.on('pipeline:complete', handler3);

      emitPipelineEvent('pipeline:complete', {
        runId: 'multi_test',
        success: true,
        totalRecords: 100,
        totalDuration: 1000,
        stages: {
          ingest: { success: true, records: 25 },
          embed: { success: true, records: 25 },
          patterns: { success: true, records: 25 },
          leads: { success: true, records: 25 },
        },
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();

      pipelineEvents.removeListener('pipeline:complete', handler1);
      pipelineEvents.removeListener('pipeline:complete', handler2);
      pipelineEvents.removeListener('pipeline:complete', handler3);
    });

    it('should not call listeners for different events', async () => {
      const { pipelineEvents, emitPipelineEvent } = await import('../events');

      const ingestHandler = vi.fn();
      const embedHandler = vi.fn();

      pipelineEvents.on('complaints:ingested', ingestHandler);
      pipelineEvents.on('embeddings:generated', embedHandler);

      // Only emit ingest event
      emitPipelineEvent('complaints:ingested', {
        count: 50,
        complaintIds: [],
        source: 'bulk',
        duration: 1000,
      });

      expect(ingestHandler).toHaveBeenCalled();
      expect(embedHandler).not.toHaveBeenCalled();

      pipelineEvents.removeListener('complaints:ingested', ingestHandler);
      pipelineEvents.removeListener('embeddings:generated', embedHandler);
    });
  });
});
