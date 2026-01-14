/**
 * Custom Metrics Collection
 * P2-12 Implementation
 *
 * Provides custom metrics collection with Prometheus-compatible export format.
 * Supports Counter, Gauge, and Histogram metric types.
 */

/**
 * Base metric configuration
 */
export interface MetricConfig {
  name: string;
  help: string;
  labels?: string[];
}

/**
 * Counter metric configuration
 */
export interface CounterConfig extends MetricConfig {}

/**
 * Gauge metric configuration
 */
export interface GaugeConfig extends MetricConfig {}

/**
 * Histogram metric configuration
 */
export interface HistogramConfig extends MetricConfig {
  buckets?: number[];
}

/**
 * Default histogram buckets
 */
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorConfig {
  prefix?: string;
  defaultLabels?: Record<string, string>;
}

/**
 * Label values type
 */
type LabelValues = Record<string, string>;

/**
 * Generate a key from label values
 */
function labelsToKey(labels: LabelValues): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

/**
 * Escape label value for Prometheus format
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Format labels for Prometheus export
 */
function formatLabels(
  labels: LabelValues,
  defaultLabels: Record<string, string>
): string {
  const allLabels = { ...defaultLabels, ...labels };
  const keys = Object.keys(allLabels).sort();

  if (keys.length === 0) return '';

  const pairs = keys.map((k) => `${k}="${escapeLabelValue(allLabels[k])}"`);
  return `{${pairs.join(',')}}`;
}

/**
 * Counter metric implementation
 */
export class Counter {
  private values = new Map<string, number>();

  constructor(
    private config: CounterConfig,
    private prefix: string,
    private defaultLabels: Record<string, string>
  ) {}

  /**
   * Increment the counter
   */
  inc(labels: LabelValues = {}, value = 1): void {
    const key = labelsToKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  /**
   * Get current value
   */
  get(labels: LabelValues = {}): number {
    const key = labelsToKey(labels);
    return this.values.get(key) || 0;
  }

  /**
   * Export in Prometheus format
   */
  export(): string {
    const fullName = `${this.prefix}${this.config.name}`;
    const lines: string[] = [
      `# HELP ${fullName} ${this.config.help}`,
      `# TYPE ${fullName} counter`,
    ];

    for (const [key, value] of this.values) {
      const labels = key
        ? Object.fromEntries(key.split(',').map((p) => p.split('=')))
        : {};
      const labelStr = formatLabels(labels, this.defaultLabels);
      lines.push(`${fullName}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all values
   */
  clear(): void {
    this.values.clear();
  }
}

/**
 * Gauge metric implementation
 */
export class Gauge {
  private values = new Map<string, number>();

  constructor(
    private config: GaugeConfig,
    private prefix: string,
    private defaultLabels: Record<string, string>
  ) {}

  /**
   * Set the gauge value
   */
  set(labelsOrValue: LabelValues | number = {}, value?: number): void {
    if (typeof labelsOrValue === 'number') {
      this.values.set('', labelsOrValue);
    } else {
      const key = labelsToKey(labelsOrValue);
      this.values.set(key, value ?? 0);
    }
  }

  /**
   * Increment the gauge
   */
  inc(labelsOrValue: LabelValues | number = {}, value = 1): void {
    if (typeof labelsOrValue === 'number') {
      const current = this.values.get('') || 0;
      this.values.set('', current + labelsOrValue);
    } else {
      const key = labelsToKey(labelsOrValue);
      const current = this.values.get(key) || 0;
      this.values.set(key, current + value);
    }
  }

  /**
   * Decrement the gauge
   */
  dec(labelsOrValue: LabelValues | number = {}, value = 1): void {
    if (typeof labelsOrValue === 'number') {
      const current = this.values.get('') || 0;
      this.values.set('', current - labelsOrValue);
    } else {
      const key = labelsToKey(labelsOrValue);
      const current = this.values.get(key) || 0;
      this.values.set(key, current - value);
    }
  }

  /**
   * Get current value
   */
  get(labels: LabelValues = {}): number {
    const key = labelsToKey(labels);
    return this.values.get(key) || 0;
  }

  /**
   * Export in Prometheus format
   */
  export(): string {
    const fullName = `${this.prefix}${this.config.name}`;
    const lines: string[] = [
      `# HELP ${fullName} ${this.config.help}`,
      `# TYPE ${fullName} gauge`,
    ];

    for (const [key, value] of this.values) {
      const labels = key
        ? Object.fromEntries(key.split(',').map((p) => p.split('=')))
        : {};
      const labelStr = formatLabels(labels, this.defaultLabels);
      lines.push(`${fullName}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all values
   */
  clear(): void {
    this.values.clear();
  }
}

/**
 * Histogram data
 */
interface HistogramData {
  count: number;
  sum: number;
  observations: number[];
  buckets: Map<number, number>;
}

/**
 * Histogram metric implementation
 */
export class Histogram {
  private data = new Map<string, HistogramData>();
  private buckets: number[];

  constructor(
    private config: HistogramConfig,
    private prefix: string,
    private defaultLabels: Record<string, string>
  ) {
    this.buckets = config.buckets || DEFAULT_BUCKETS;
  }

  /**
   * Initialize data for a key
   */
  private initData(key: string): HistogramData {
    const buckets = new Map<number, number>();
    for (const b of this.buckets) {
      buckets.set(b, 0);
    }
    return {
      count: 0,
      sum: 0,
      observations: [],
      buckets,
    };
  }

  /**
   * Observe a value
   */
  observe(labelsOrValue: LabelValues | number = {}, value?: number): void {
    let key: string;
    let observedValue: number;

    if (typeof labelsOrValue === 'number') {
      key = '';
      observedValue = labelsOrValue;
    } else {
      key = labelsToKey(labelsOrValue);
      observedValue = value ?? 0;
    }

    let data = this.data.get(key);
    if (!data) {
      data = this.initData(key);
      this.data.set(key, data);
    }

    data.count++;
    data.sum += observedValue;
    data.observations.push(observedValue);

    // Update bucket counts
    for (const bucket of this.buckets) {
      if (observedValue <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  /**
   * Get histogram data
   */
  get(labels: LabelValues = {}): { count: number; sum: number } {
    const key = labelsToKey(labels);
    const data = this.data.get(key);
    return {
      count: data?.count || 0,
      sum: data?.sum || 0,
    };
  }

  /**
   * Calculate percentile
   */
  percentile(p: number, labels: LabelValues = {}): number {
    const key = labelsToKey(labels);
    const data = this.data.get(key);

    if (!data || data.observations.length === 0) return 0;

    const sorted = [...data.observations].sort((a, b) => a - b);
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Export in Prometheus format
   */
  export(): string {
    const fullName = `${this.prefix}${this.config.name}`;
    const lines: string[] = [
      `# HELP ${fullName} ${this.config.help}`,
      `# TYPE ${fullName} histogram`,
    ];

    for (const [key, data] of this.data) {
      const labels = key
        ? Object.fromEntries(key.split(',').map((p) => p.split('=')))
        : {};

      // Export buckets
      for (const bucket of this.buckets) {
        const bucketLabels = { ...labels, le: String(bucket) };
        const labelStr = formatLabels(bucketLabels, this.defaultLabels);
        lines.push(`${fullName}_bucket${labelStr} ${data.buckets.get(bucket) || 0}`);
      }

      // Export +Inf bucket
      const infLabels = { ...labels, le: '+Inf' };
      const infLabelStr = formatLabels(infLabels, this.defaultLabels);
      lines.push(`${fullName}_bucket${infLabelStr} ${data.count}`);

      // Export sum and count
      const baseLabelStr = formatLabels(labels, this.defaultLabels);
      lines.push(`${fullName}_sum${baseLabelStr} ${data.sum}`);
      lines.push(`${fullName}_count${baseLabelStr} ${data.count}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all values
   */
  clear(): void {
    this.data.clear();
  }
}

/**
 * Metrics collector
 */
export class MetricsCollector {
  private counters: Counter[] = [];
  private gauges: Gauge[] = [];
  private histograms: Histogram[] = [];

  constructor(private config: MetricsCollectorConfig) {}

  /**
   * Get prefix
   */
  private get prefix(): string {
    return this.config.prefix || '';
  }

  /**
   * Get default labels
   */
  private get defaultLabels(): Record<string, string> {
    return this.config.defaultLabels || {};
  }

  /**
   * Create a counter metric
   */
  counter(config: CounterConfig): Counter {
    const counter = new Counter(config, this.prefix, this.defaultLabels);
    this.counters.push(counter);
    return counter;
  }

  /**
   * Create a gauge metric
   */
  gauge(config: GaugeConfig): Gauge {
    const gauge = new Gauge(config, this.prefix, this.defaultLabels);
    this.gauges.push(gauge);
    return gauge;
  }

  /**
   * Create a histogram metric
   */
  histogram(config: HistogramConfig): Histogram {
    const histogram = new Histogram(config, this.prefix, this.defaultLabels);
    this.histograms.push(histogram);
    return histogram;
  }

  /**
   * Export all metrics in Prometheus format
   */
  export(): string {
    const sections: string[] = [];

    for (const counter of this.counters) {
      const exported = counter.export();
      if (exported.split('\n').length > 2) {
        sections.push(exported);
      }
    }

    for (const gauge of this.gauges) {
      const exported = gauge.export();
      if (exported.split('\n').length > 2) {
        sections.push(exported);
      }
    }

    for (const histogram of this.histograms) {
      const exported = histogram.export();
      if (exported.split('\n').length > 2) {
        sections.push(exported);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    for (const counter of this.counters) {
      counter.clear();
    }
    for (const gauge of this.gauges) {
      gauge.clear();
    }
    for (const histogram of this.histograms) {
      histogram.clear();
    }

    this.counters = [];
    this.gauges = [];
    this.histograms = [];
  }
}

/**
 * Create a metrics collector
 */
export function createMetricsCollector(
  config: MetricsCollectorConfig = {}
): MetricsCollector {
  return new MetricsCollector(config);
}

/**
 * Global metrics collector instance
 */
export const globalMetrics = createMetricsCollector({
  prefix: 'caseradar_',
  defaultLabels: {
    service: 'caseradar',
  },
});
