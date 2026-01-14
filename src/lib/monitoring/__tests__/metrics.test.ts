/**
 * Custom Metrics Collection Tests
 * P2-12 Implementation - TDD
 *
 * Tests for custom metrics collection with Prometheus-compatible format.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MetricsCollector,
  createMetricsCollector,
  Counter,
  Gauge,
  Histogram,
} from '../metrics';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = createMetricsCollector({
      prefix: 'caseradar_',
      defaultLabels: { service: 'api', env: 'test' },
    });
  });

  afterEach(() => {
    collector.clear();
  });

  describe('Counter Metrics', () => {
    it('should create and increment counters', () => {
      const counter = collector.counter({
        name: 'api_requests_total',
        help: 'Total API requests',
        labels: ['method', 'endpoint', 'status'],
      });

      counter.inc({ method: 'GET', endpoint: '/api/complaints', status: '200' });
      counter.inc({ method: 'GET', endpoint: '/api/complaints', status: '200' });

      expect(
        counter.get({ method: 'GET', endpoint: '/api/complaints', status: '200' })
      ).toBe(2);
    });

    it('should increment by custom value', () => {
      const counter = collector.counter({
        name: 'ai_tokens_consumed',
        help: 'AI tokens consumed',
        labels: ['model'],
      });

      counter.inc({ model: 'gpt-4o' }, 500);

      expect(counter.get({ model: 'gpt-4o' })).toBe(500);
    });

    it('should export in Prometheus format', () => {
      const counter = collector.counter({
        name: 'complaints_generated',
        help: 'Complaints generated',
      });

      counter.inc();
      counter.inc();

      const output = collector.export();
      expect(output).toContain(
        '# HELP caseradar_complaints_generated Complaints generated'
      );
      expect(output).toContain('# TYPE caseradar_complaints_generated counter');
      expect(output).toContain('caseradar_complaints_generated');
    });

    it('should default to 0 for unset labels', () => {
      const counter = collector.counter({
        name: 'test_counter',
        help: 'Test',
        labels: ['label1'],
      });

      expect(counter.get({ label1: 'unset' })).toBe(0);
    });
  });

  describe('Gauge Metrics', () => {
    it('should create and set gauges', () => {
      const gauge = collector.gauge({
        name: 'active_users',
        help: 'Currently active users',
      });

      gauge.set(42);

      expect(gauge.get()).toBe(42);
    });

    it('should support increment and decrement', () => {
      const gauge = collector.gauge({
        name: 'queue_depth',
        help: 'Items in queue',
      });

      gauge.set(10);
      gauge.inc();
      gauge.inc(5);
      gauge.dec(3);

      expect(gauge.get()).toBe(13);
    });

    it('should support labels', () => {
      const gauge = collector.gauge({
        name: 'cache_size_bytes',
        help: 'Cache size in bytes',
        labels: ['cache_name'],
      });

      gauge.set({ cache_name: 'complaints' }, 1024);
      gauge.set({ cache_name: 'patterns' }, 2048);

      expect(gauge.get({ cache_name: 'complaints' })).toBe(1024);
      expect(gauge.get({ cache_name: 'patterns' })).toBe(2048);
    });

    it('should default to 0', () => {
      const gauge = collector.gauge({
        name: 'unset_gauge',
        help: 'Unset gauge',
      });

      expect(gauge.get()).toBe(0);
    });
  });

  describe('Histogram Metrics', () => {
    it('should create and observe histograms', () => {
      const histogram = collector.histogram({
        name: 'request_duration_seconds',
        help: 'Request duration in seconds',
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      });

      histogram.observe(0.025);
      histogram.observe(0.15);
      histogram.observe(0.5);

      const values = histogram.get();
      expect(values.count).toBe(3);
      expect(values.sum).toBeCloseTo(0.675, 2);
    });

    it('should calculate percentiles', () => {
      const histogram = collector.histogram({
        name: 'ai_latency_seconds',
        help: 'AI API latency',
        buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      });

      // Simulate many requests with values in 0-2 range
      for (let i = 0; i < 100; i++) {
        histogram.observe(i * 0.02); // 0 to 1.98
      }

      const p50 = histogram.percentile(0.5);
      const p95 = histogram.percentile(0.95);
      const p99 = histogram.percentile(0.99);

      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
    });

    it('should support labels for histograms', () => {
      const histogram = collector.histogram({
        name: 'db_query_duration_seconds',
        help: 'Database query duration',
        labels: ['query_type'],
        buckets: [0.001, 0.01, 0.1, 1],
      });

      histogram.observe({ query_type: 'select' }, 0.005);
      histogram.observe({ query_type: 'insert' }, 0.02);

      expect(histogram.get({ query_type: 'select' }).count).toBe(1);
      expect(histogram.get({ query_type: 'insert' }).count).toBe(1);
    });

    it('should have default buckets if not specified', () => {
      const histogram = collector.histogram({
        name: 'default_buckets',
        help: 'Default buckets histogram',
      });

      histogram.observe(0.5);
      const values = histogram.get();

      expect(values.count).toBe(1);
    });
  });

  describe('Business Metrics', () => {
    it('should track complaint generation metrics', () => {
      const complaintsGenerated = collector.counter({
        name: 'complaints_generated_total',
        help: 'Total complaints generated',
        labels: ['type', 'status'],
      });

      complaintsGenerated.inc({ type: 'defect', status: 'draft' });
      complaintsGenerated.inc({ type: 'lemon_law', status: 'published' });

      expect(collector.export()).toContain('complaints_generated_total');
    });

    it('should track pattern detection metrics', () => {
      const patternsDetected = collector.counter({
        name: 'patterns_detected_total',
        help: 'Patterns detected by AI',
        labels: ['severity', 'component'],
      });

      patternsDetected.inc({ severity: 'critical', component: 'airbag' });

      expect(collector.export()).toContain('patterns_detected_total');
    });

    it('should track AI cost metrics', () => {
      const aiCost = collector.counter({
        name: 'ai_cost_usd_total',
        help: 'AI cost in USD',
        labels: ['provider', 'model', 'operation'],
      });

      aiCost.inc(
        { provider: 'openai', model: 'gpt-4o', operation: 'generation' },
        0.05
      );

      expect(collector.export()).toContain('ai_cost_usd_total');
    });

    it('should track user activity metrics', () => {
      const activeUsers = collector.gauge({
        name: 'active_users_current',
        help: 'Currently active users',
        labels: ['plan'],
      });

      activeUsers.set({ plan: 'pro' }, 150);
      activeUsers.set({ plan: 'enterprise' }, 25);

      expect(collector.export()).toContain('active_users_current');
    });
  });

  describe('Metrics Export', () => {
    it('should export all metrics in Prometheus format', () => {
      collector.counter({ name: 'test_counter', help: 'Test' }).inc();
      collector.gauge({ name: 'test_gauge', help: 'Test' }).set(42);

      const output = collector.export();

      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
      expect(output).toMatch(/caseradar_test_counter/);
      expect(output).toMatch(/caseradar_test_gauge/);
    });

    it('should include default labels in export', () => {
      collector.counter({ name: 'test', help: 'Test' }).inc();

      const output = collector.export();

      expect(output).toContain('service="api"');
      expect(output).toContain('env="test"');
    });

    it('should handle empty metrics', () => {
      const output = collector.export();
      expect(output).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in label values', () => {
      const counter = collector.counter({
        name: 'test',
        help: 'Test',
        labels: ['path'],
      });

      counter.inc({ path: '/api/complaints?filter="test"' });

      const output = collector.export();
      expect(output).toContain('path=');
    });

    it('should handle very large numbers', () => {
      const counter = collector.counter({
        name: 'large_counter',
        help: 'Large counter',
      });

      counter.inc({}, 1_000_000_000);

      expect(counter.get()).toBe(1_000_000_000);
    });

    it('should handle negative gauge values', () => {
      const gauge = collector.gauge({
        name: 'negative_gauge',
        help: 'Negative gauge',
      });

      gauge.set(-42);

      expect(gauge.get()).toBe(-42);
    });
  });
});
