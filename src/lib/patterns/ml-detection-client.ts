/**
 * ML Pattern Detection Client
 *
 * TypeScript client for the Python pattern detection service.
 * Provides access to BERTopic, PyOD, Ruptures, and PRR/EBGM algorithms.
 *
 * Based on docs/architecture/pattern-detection-system.md
 */

// Types

export interface TopicResult {
  topic_id: number;
  name: string;
  count: number;
  words: string[];
  scores: number[];
  representative_docs?: string[];
}

export interface TopicFitResponse {
  success: boolean;
  topic_count: number;
  topics: TopicResult[];
}

export interface TopicTrend {
  topic_id: number;
  name: string;
  growth_rate: number;
  confidence: number;
  frequency_by_period: Array<{ timestamp: string; frequency: number }>;
}

export interface AnomalyResult {
  document_id: string;
  anomaly_score: number;
  is_anomaly: boolean;
  detector_scores: Record<string, number>;
  anomaly_type: 'point' | 'contextual' | 'collective' | 'normal';
}

export interface AnomalyDetectResponse {
  success: boolean;
  total: number;
  anomaly_count: number;
  results: AnomalyResult[];
}

export interface ChangePoint {
  index: number;
  timestamp: string | null;
  before_mean: number;
  after_mean: number;
  magnitude: number;
}

export interface ChangeDetectResponse {
  success: boolean;
  change_point_count: number;
  change_points: ChangePoint[];
  model_used: string;
  penalty: number;
}

export interface SignalResult {
  component: string;
  prr: number | null;
  ci_lower: number | null;
  count: number;
  signal_strength: 'strong_signal' | 'weak_signal' | 'no_signal' | 'insufficient_data';
  recommendation: string;
}

export interface SignalScanResponse {
  success: boolean;
  total_components: number;
  strong_signals: number;
  weak_signals: number;
  results: SignalResult[];
}

export interface ComplaintData {
  component: string;
  make: string;
  model?: string;
  year: number;
}

// Client Configuration

const ML_SERVICE_URL = process.env.PATTERN_DETECTION_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Helper Functions

async function fetchML<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${ML_SERVICE_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ML Service error: ${response.status} - ${error}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ML Service request timeout');
    }
    throw error;
  }
}

// Topic Clustering API

export const topicAPI = {
  /**
   * Check if ML service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetchML<{ status: string }>('/health');
      return response.status === 'healthy';
    } catch {
      return false;
    }
  },

  /**
   * Fit BERTopic model on documents
   */
  async fitTopics(
    documents: string[],
    embeddings?: number[][]
  ): Promise<TopicFitResponse> {
    return fetchML<TopicFitResponse>('/api/v1/topics/fit', {
      method: 'POST',
      body: JSON.stringify({ documents, embeddings }),
    });
  },

  /**
   * Analyze topics over time
   */
  async topicsOverTime(
    documents: string[],
    timestamps: string[],
    nrBins: number = 24,
    embeddings?: number[][]
  ): Promise<{ success: boolean; topics: Array<{
    topic_id: number;
    name: string;
    frequency: number;
    timestamp: string;
  }> }> {
    return fetchML('/api/v1/topics/over-time', {
      method: 'POST',
      body: JSON.stringify({
        documents,
        timestamps,
        nr_bins: nrBins,
        embeddings,
      }),
    });
  },

  /**
   * Predict topic for a single document
   */
  async predict(
    document: string,
    embedding?: number[]
  ): Promise<{ topic_id: number; probability: number }> {
    return fetchML('/api/v1/topics/predict', {
      method: 'POST',
      body: JSON.stringify({ document, embedding }),
    });
  },

  /**
   * Get information about all fitted topics
   */
  async getTopicInfo(): Promise<{ success: boolean; topics: Record<number, {
    name: string;
    count: number;
    words: string[];
    scores: number[];
  }> }> {
    return fetchML('/api/v1/topics/info');
  },
};

// Anomaly Detection API

export const anomalyAPI = {
  /**
   * Fit anomaly detection ensemble
   */
  async fit(
    embeddings: number[][],
    contamination: number = 0.05
  ): Promise<{
    success: boolean;
    stats: {
      total_documents: number;
      anomaly_count: number;
      anomaly_rate: number;
      threshold: number;
    };
  }> {
    return fetchML('/api/v1/anomalies/fit', {
      method: 'POST',
      body: JSON.stringify({ embeddings, contamination }),
    });
  },

  /**
   * Detect anomalies in documents
   */
  async detect(
    embeddings: number[][],
    documentIds?: string[],
    threshold?: number
  ): Promise<AnomalyDetectResponse> {
    return fetchML<AnomalyDetectResponse>('/api/v1/anomalies/detect', {
      method: 'POST',
      body: JSON.stringify({
        embeddings,
        document_ids: documentIds,
        threshold,
      }),
    });
  },

  /**
   * Score a single document
   */
  async scoreSingle(
    embedding: number[]
  ): Promise<{
    success: boolean;
    anomaly_score: number;
    is_anomaly: boolean;
    detector_scores: Record<string, number>;
  }> {
    return fetchML('/api/v1/anomalies/score', {
      method: 'POST',
      body: JSON.stringify({ embedding }),
    });
  },

  /**
   * Get current anomaly threshold
   */
  async getThreshold(): Promise<{
    success: boolean;
    threshold: number | null;
    is_fitted: boolean;
  }> {
    return fetchML('/api/v1/anomalies/threshold');
  },
};

// Change Detection API

export const changeAPI = {
  /**
   * Detect change points in a time series
   */
  async detect(
    timeSeries: number[],
    timestamps?: string[],
    penalty: number = 10.0
  ): Promise<ChangeDetectResponse> {
    return fetchML<ChangeDetectResponse>('/api/v1/changes/detect', {
      method: 'POST',
      body: JSON.stringify({
        time_series: timeSeries,
        timestamps,
        penalty,
      }),
    });
  },

  /**
   * Analyze topic-specific changes
   */
  async analyzeTopicChanges(
    frequencies: number[],
    timestamps: string[],
    topicId: number,
    topicName: string,
    penalty: number = 10.0
  ): Promise<{
    success: boolean;
    topic_id: number;
    topic_name: string;
    change_points: ChangePoint[];
  }> {
    return fetchML('/api/v1/changes/topic', {
      method: 'POST',
      body: JSON.stringify({
        frequencies,
        timestamps,
        topic_id: topicId,
        topic_name: topicName,
        penalty,
      }),
    });
  },

  /**
   * Run detection with multiple penalty values
   */
  async multiPenaltyAnalysis(
    timeSeries: number[],
    penalties: number[] = [5, 10, 20, 50]
  ): Promise<{
    success: boolean;
    results: Record<string, number[]>;
  }> {
    return fetchML('/api/v1/changes/multi-penalty', {
      method: 'POST',
      body: JSON.stringify({ time_series: timeSeries, penalties }),
    });
  },
};

// Signal Detection API

export const signalAPI = {
  /**
   * Analyze signal for a specific component
   */
  async analyze(
    complaints: ComplaintData[],
    component: string,
    make?: string,
    model?: string,
    yearStart?: number,
    yearEnd?: number
  ): Promise<SignalResult & { success: boolean }> {
    return fetchML('/api/v1/signals/analyze', {
      method: 'POST',
      body: JSON.stringify({
        complaints,
        component,
        make,
        model,
        year_start: yearStart,
        year_end: yearEnd,
      }),
    });
  },

  /**
   * Scan all components for signals
   */
  async scan(
    complaints: ComplaintData[],
    make?: string,
    model?: string,
    minCount: number = 3
  ): Promise<SignalScanResponse> {
    return fetchML<SignalScanResponse>('/api/v1/signals/scan', {
      method: 'POST',
      body: JSON.stringify({
        complaints,
        make,
        model,
        min_count: minCount,
      }),
    });
  },

  /**
   * Get only strong signals (alerts)
   */
  async getStrongSignals(
    complaints: ComplaintData[],
    make?: string,
    model?: string
  ): Promise<{ success: boolean; count: number; signals: SignalResult[] }> {
    return fetchML('/api/v1/signals/strong-signals', {
      method: 'POST',
      body: JSON.stringify({ complaints, make, model }),
    });
  },

  /**
   * Get weak signals for watch list
   */
  async getWatchList(
    complaints: ComplaintData[],
    make?: string,
    model?: string
  ): Promise<{ success: boolean; count: number; signals: SignalResult[] }> {
    return fetchML('/api/v1/signals/watch-list', {
      method: 'POST',
      body: JSON.stringify({ complaints, make, model }),
    });
  },

  /**
   * Calculate PRR directly
   */
  async calculatePRR(
    complaints: ComplaintData[],
    component: string,
    make?: string,
    model?: string,
    yearStart?: number,
    yearEnd?: number
  ): Promise<{
    success: boolean;
    prr: number | null;
    ci_lower: number | null;
    ci_upper: number | null;
    contingency_table: { a: number; b: number; c: number; d: number };
  }> {
    return fetchML('/api/v1/signals/prr', {
      method: 'POST',
      body: JSON.stringify({
        complaints,
        component,
        make,
        model,
        year_start: yearStart,
        year_end: yearEnd,
      }),
    });
  },
};

// Combined ML Detection Client

export const mlDetectionClient = {
  topics: topicAPI,
  anomalies: anomalyAPI,
  changes: changeAPI,
  signals: signalAPI,

  /**
   * Check if ML service is available
   */
  async isAvailable(): Promise<boolean> {
    return topicAPI.healthCheck();
  },
};

export default mlDetectionClient;
