# Semantic Analysis Tools Research

## Summary

CaseRadar requires semantic analysis capabilities for:
1. **Text Embeddings** - Convert complaint descriptions to vectors
2. **Clustering** - Group similar complaints together
3. **Trend Detection** - Identify increasing complaint frequencies
4. **Anomaly Detection** - Spot unusual patterns

This document evaluates tools and recommends an approach.

---

## 1. Text Embedding Models

### Options Comparison

| Model | Provider | Cost (per 1M tokens) | Dimensions | Quality (MTEB) | Latency |
|-------|----------|---------------------|------------|----------------|---------|
| text-embedding-3-small | OpenAI | $0.02 | 1536 | Good | API-bound |
| text-embedding-3-large | OpenAI | $0.13 | 3072 | Better | API-bound |
| Mistral-embed | Mistral | ~$0.10 | 1024 | Best (77.8%) | API-bound |
| all-MiniLM-L6-v2 | Sentence-Transformers | Free (self-hosted) | 384 | Good | 5-14k/sec |
| BGE-large-en-v1.5 | BAAI | Free (self-hosted) | 1024 | Very Good | ~1k/sec |
| e5-large-v2 | Microsoft | Free (self-hosted) | 1024 | Very Good | ~1k/sec |
| Cohere embed-v3 | Cohere | $0.10 | 1024 | Very Good | API-bound |

### Cost Analysis for CaseRadar

Estimated data volume:
- ~1 million historical complaints
- ~100 new complaints/day
- Average complaint: ~500 tokens

**Initial Backfill Cost**:
- OpenAI 3-small: 1M complaints × 500 tokens × $0.02/1M = **$10**
- OpenAI 3-large: 1M complaints × 500 tokens × $0.13/1M = **$65**

**Ongoing Monthly Cost** (assuming 3,000 new complaints/month):
- OpenAI 3-small: 3K × 500 × $0.02/1M = **$0.03/month**
- Self-hosted: **$0** (compute cost only)

### Recommendation

**Primary**: `text-embedding-3-small` from OpenAI
- Cost-effective (~$10 total for backfill)
- Good quality for semantic similarity
- Simple API integration
- No infrastructure to manage

**Alternative**: `all-MiniLM-L6-v2` from Sentence-Transformers
- Free (self-hosted)
- Very fast (14k sentences/sec on CPU)
- Good for budget-conscious deployment
- Requires hosting infrastructure

---

## 2. Clustering Algorithms

### Algorithm Comparison

| Algorithm | Pros | Cons | Best For |
|-----------|------|------|----------|
| **K-Means** | Fast, simple, scalable | Requires K upfront, spherical clusters | Large datasets, known cluster count |
| **HDBSCAN** | No K needed, finds varying densities, noise handling | Slower, memory-intensive | Unknown clusters, noise tolerance |
| **DBSCAN** | Density-based, handles noise | Sensitive to parameters | Spatial data, uniform density |
| **Agglomerative** | Hierarchical, dendrogram | O(n²) memory | Small datasets, hierarchy needed |

### Why HDBSCAN for CaseRadar

HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) is ideal because:

1. **No predefined cluster count** - We don't know how many defect patterns exist
2. **Noise handling** - Many complaints may not cluster cleanly
3. **Variable density** - Some patterns have many complaints, others few
4. **Stability** - Consistent results across runs

### Implementation Pipeline

```
Complaint Text → Embeddings → UMAP (dim reduction) → HDBSCAN → Clusters
```

**UMAP (Uniform Manifold Approximation and Projection)**:
- Reduces high-dimensional embeddings (1536D → 50D)
- Preserves local structure
- Makes clustering more effective

### Code Example

```python
import hdbscan
import umap
from sentence_transformers import SentenceTransformer

# Embed complaints
model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(complaint_texts)

# Reduce dimensions
reducer = umap.UMAP(n_components=50, metric='cosine')
reduced = reducer.fit_transform(embeddings)

# Cluster
clusterer = hdbscan.HDBSCAN(
    min_cluster_size=10,    # Minimum complaints to form a pattern
    min_samples=5,          # Core sample density
    cluster_selection_epsilon=0.5
)
clusters = clusterer.fit_predict(reduced)
```

### BERTopic Alternative

**BERTopic** combines embedding + UMAP + HDBSCAN + topic extraction:
- Extracts representative keywords per cluster
- Built-in visualization
- Active development

```python
from bertopic import BERTopic

topic_model = BERTopic()
topics, probs = topic_model.fit_transform(complaint_texts)
```

---

## 3. Trend Detection

### Time Series Analysis for Complaint Data

**Goal**: Detect when complaint frequency for a pattern is increasing.

### Methods

#### 1. Rolling Statistics
```python
import pandas as pd

# Complaints per week for a pattern
weekly_counts = complaints.groupby(['pattern_id', 'week']).size()

# Rolling mean and std
rolling_mean = weekly_counts.rolling(window=4).mean()
rolling_std = weekly_counts.rolling(window=4).std()

# Z-score for anomaly detection
z_score = (weekly_counts - rolling_mean) / rolling_std
anomalies = z_score > 3  # 3 standard deviations
```

#### 2. Linear Regression Trend
```python
from scipy import stats

# Fit linear trend
slope, intercept, r_value, p_value, std_err = stats.linregress(
    x=range(len(weekly_counts)),
    y=weekly_counts
)

# Significant upward trend if:
# - slope > 0
# - p_value < 0.05
is_trending = slope > 0 and p_value < 0.05
```

#### 3. Change Point Detection
```python
import ruptures as rpt

# Detect change points in complaint frequency
algo = rpt.Pelt(model="rbf").fit(weekly_counts.values)
change_points = algo.predict(pen=10)
```

### Recommended Approach

1. **Short-term spikes**: Rolling Z-score (weekly window)
2. **Medium-term trends**: Linear regression over 3-month window
3. **Structural changes**: Change point detection with `ruptures`

---

## 4. Anomaly Detection

### Types of Anomalies in Complaint Data

| Type | Description | Detection Method |
|------|-------------|------------------|
| **Spike** | Sudden increase in complaints | Z-score > 3 |
| **Level Shift** | Sustained increase | Change point detection |
| **Seasonal** | Recurring patterns | STL decomposition |
| **Collective** | Group of related anomalies | Cluster analysis |

### Python Libraries

| Library | Purpose | Strengths |
|---------|---------|-----------|
| **ADTK** | Time series anomaly detection | Purpose-built, multiple detectors |
| **PyOD** | Outlier detection | 40+ algorithms |
| **tsmoothie** | Smoothing + outlier detection | Handles multiple series |
| **Prophet** | Forecasting + anomaly | Easy trend/seasonality |

### ADTK Example

```python
from adtk.data import validate_series
from adtk.detector import ThresholdAD, QuantileAD, InterQuartileRangeAD

# Validate time series
ts = validate_series(complaint_counts_series)

# Detect spikes using IQR
iqr_detector = InterQuartileRangeAD(c=3)
anomalies = iqr_detector.fit_detect(ts)
```

---

## 5. MLOps Evaluation

### Do We Need MLOps Tools?

**Weights & Biases, MLflow, etc.**

| Feature | CaseRadar Need | Verdict |
|---------|----------------|---------|
| Experiment tracking | Low - not training custom models | Skip |
| Model versioning | Low - using pre-trained embeddings | Skip |
| Data versioning | Medium - complaint data changes | Maybe |
| Pipeline orchestration | Medium - ETL + analysis pipelines | Maybe |
| Monitoring | High - track analysis quality | Consider |

### Recommendation

**For MVP**: Skip MLOps platforms
- Use pre-trained embedding models (no training)
- Log metrics to database
- Simple cron-based pipelines

**For Scale**: Consider lightweight options
- **Prefect** or **Dagster** for pipeline orchestration
- Simple logging to PostgreSQL for tracking
- Alerting via existing monitoring (Sentry, Datadog)

---

## 6. Vector Database

### Options

| Database | Type | Pros | Cons |
|----------|------|------|------|
| **pgvector** | PostgreSQL extension | Single DB, simple, ACID | Limited to PostgreSQL |
| **Pinecone** | Managed service | Scalable, fast, serverless | Cost, vendor lock-in |
| **Weaviate** | Open source | Flexible, self-hosted | Infra management |
| **Qdrant** | Open source | Fast, Rust-based | Newer, smaller community |
| **Chroma** | Open source | Simple, Python-native | Less mature |

### Recommendation

**pgvector** (PostgreSQL extension)
- Keep everything in one database
- Good enough for ~1M vectors
- No additional infrastructure
- Full SQL query capabilities

```sql
-- Enable extension
CREATE EXTENSION vector;

-- Create table with vector column
CREATE TABLE complaint_embeddings (
    complaint_id BIGINT PRIMARY KEY,
    embedding vector(1536),
    cluster_id INTEGER
);

-- Create index for similarity search
CREATE INDEX ON complaint_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Find similar complaints
SELECT complaint_id, 1 - (embedding <=> query_vector) as similarity
FROM complaint_embeddings
ORDER BY embedding <=> query_vector
LIMIT 10;
```

---

## 7. Complete Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEMANTIC ANALYSIS PIPELINE                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   New        │     │  OpenAI      │     │  PostgreSQL  │
│  Complaint   │────▶│  Embeddings  │────▶│  + pgvector  │
│   Text       │     │  API         │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                      CLUSTERING (Daily Job)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Fetch all embeddings from pgvector                          │
│  2. UMAP dimensionality reduction (1536D → 50D)                 │
│  3. HDBSCAN clustering                                          │
│  4. Extract cluster topics (top terms via TF-IDF or c-TF-IDF)   │
│  5. Save cluster assignments back to DB                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                    TREND DETECTION (Daily Job)                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  For each cluster/pattern:                                       │
│  1. Aggregate complaints by week                                 │
│  2. Calculate rolling mean/std                                   │
│  3. Compute Z-scores for spike detection                         │
│  4. Linear regression for trend direction                        │
│  5. Update pattern severity scores                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SEVERITY SCORING                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Score = w1 * deaths + w2 * injuries + w3 * crashes              │
│        + w4 * fires + w5 * complaint_count + w6 * trend_score    │
│                                                                  │
│  Where:                                                          │
│  - deaths: Number of reported fatalities (highest weight)        │
│  - injuries: Number of reported injuries                         │
│  - crashes: Number of crash incidents                            │
│  - fires: Number of fire incidents                               │
│  - complaint_count: Total complaints in cluster                  │
│  - trend_score: Rate of increase (from trend detection)          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Final Recommendations

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Embeddings** | OpenAI text-embedding-3-small | Cost-effective, quality, simple |
| **Vector Storage** | pgvector (PostgreSQL) | Single DB, no extra infra |
| **Clustering** | HDBSCAN (via `hdbscan` library) | No K needed, noise handling |
| **Dim Reduction** | UMAP | Preserves structure, fast |
| **Trend Detection** | Custom (scipy, pandas) | Simple, explainable |
| **Anomaly Detection** | ADTK | Purpose-built for time series |
| **Topic Extraction** | TF-IDF or BERTopic | Understand cluster themes |

### Build vs Buy

**Build (custom)**: Clustering, trend detection, severity scoring
- Domain-specific logic
- Full control
- Lower ongoing cost

**Buy (API)**: Embeddings
- Better quality
- No maintenance
- Trivial cost at our scale

### Implementation Order

1. Set up pgvector in PostgreSQL
2. Implement embedding pipeline (OpenAI API)
3. Implement HDBSCAN clustering
4. Implement trend detection
5. Implement severity scoring
6. Build dashboard to visualize patterns

---

## References

- [Embedding Models Comparison 2025](https://artsmart.ai/blog/top-embedding-models-in-2025/)
- [HDBSCAN Documentation](https://hdbscan.readthedocs.io/)
- [BERTopic](https://maartengr.github.io/BERTopic/)
- [ADTK Documentation](https://adtk.readthedocs.io/)
- [pgvector](https://github.com/pgvector/pgvector)
- [Time Series Anomaly Detection](https://neptune.ai/blog/anomaly-detection-in-time-series)
