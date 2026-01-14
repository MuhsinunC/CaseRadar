# EDA & Pattern Detection Tools Research

**Date:** January 2025
**Purpose:** Evaluate tools for detecting patterns, trends, and anomalies in NHTSA vehicle complaint data (17K+ records, scaling to 100K+)

---

## Executive Summary: Top 3 Recommendations

### 1. BERTopic with Dynamic Topic Modeling (Primary Recommendation)

**Why it fits our use case:**
- Specifically designed for temporal topic evolution tracking
- Built-in `topics_over_time()` function for trend analysis
- Uses HDBSCAN clustering under the hood (density-based, no need to specify cluster count)
- Handles text embeddings natively with sentence transformers
- BERTrend extension specifically targets weak signal and emerging trend detection

**For NHTSA complaints:** Can identify emerging vehicle defect patterns before they become widespread, track how complaint topics evolve month-over-month, and surface "weak signals" (low-frequency but growing complaint categories).

**Effort:** Medium - requires embedding generation but provides end-to-end pipeline

### 2. PyOD 2 + Custom Embedding Pipeline (Secondary Recommendation)

**Why it fits our use case:**
- 50+ anomaly detection algorithms in one library
- New LLM-powered model selection (automated algorithm choice)
- Works with any embedding model (use sentence-transformers)
- Specifically designed for outlier/anomaly detection
- Benchmarked on 57 datasets with academic rigor

**For NHTSA complaints:** Detect statistically anomalous complaint patterns, identify complaints that deviate from "normal" patterns, flag unusual component-failure combinations.

**Effort:** Low-Medium - drop-in replacement for current clustering

### 3. River + Ruptures for Streaming/Change Detection (For Real-time Monitoring)

**Why it fits our use case:**
- River: Online learning for continuous data streams with concept drift detection
- Ruptures: Change point detection for identifying when complaint patterns shift
- ADWIN algorithm detects distribution changes automatically
- Perfect for monitoring incoming complaint streams

**For NHTSA complaints:** Real-time monitoring of new complaints, automatic alerts when complaint patterns change significantly, detect seasonal or event-driven shifts.

**Effort:** Medium - requires architectural changes for streaming

---

## Commercial Solutions

### Enterprise-Grade Platforms

| Platform | Pricing | Best For | NHTSA Fit |
|----------|---------|----------|-----------|
| **Elastic Stack (ELK)** | Free (basic), Enterprise $$$$ | Log anomaly detection, text categorization, time-series | Good - handles text clustering and temporal analysis |
| **Thematic** | Custom enterprise pricing | Customer feedback analysis, theme discovery | Excellent - built for complaint analysis |
| **InMoment** | Custom enterprise ($$$) | Emotion/intent analysis, 100+ ML models | Good - but overkill for our scale |
| **Medallia** | Enterprise ($$$$$) | Large-scale feedback, omnichannel | Overkill - designed for millions of records |
| **Datadog** | $15-34/host/month + usage | Real-time anomaly detection, pattern recognition | Moderate - more for ops than NLP |
| **Splunk** | $150+/GB/day | Advanced ML, log analysis | Overkill - expensive for our use case |
| **MeaningCloud** | Free-$999/month | Text analytics API | Good - but API-based limits integration |

### Recommendation: Avoid Commercial for MVP

**Rationale:**
- 17K-100K records is well within open-source tool capacity
- Commercial solutions add cost without proportional benefit at this scale
- Open-source provides more customization for domain-specific patterns
- Better to invest in custom embedding/clustering pipeline

**Exception:** Consider Elastic Stack if you need:
- Real-time dashboard visualization
- Integration with existing infrastructure
- Built-in anomaly detection without custom code

---

## Open Source Tools

### Topic Modeling & Text Clustering

#### BERTopic
- **GitHub:** https://github.com/MaartenGr/BERTopic
- **Install:** `pip install bertopic`
- **Strengths:**
  - Dynamic topic modeling with `topics_over_time()`
  - Automatic topic count detection
  - Multiple embedding model support
  - Visualization built-in
  - New Contextual Top2Vec mode (2024)
- **Weaknesses:**
  - Memory-intensive for very large datasets
  - Assumes one topic per document (mitigated in new version)
- **NHTSA Fit:** Excellent - can track "engine stalling" topic evolution over time

#### Top2Vec
- **GitHub:** https://github.com/ddangelov/Top2Vec
- **Install:** `pip install top2vec`
- **Strengths:**
  - Jointly learns topic, document, and word embeddings
  - No need to specify topic count
  - Built-in semantic search
  - Hierarchical topic reduction
- **Weaknesses:**
  - Less temporal analysis capability than BERTopic
  - Slower training
- **NHTSA Fit:** Good for initial clustering, but BERTopic better for trends

#### BERTrend (Research)
- **Paper:** https://arxiv.org/html/2411.05930v1
- **Strengths:**
  - Specifically designed for emerging trend detection
  - Classifies topics as noise/weak signals/strong signals
  - Online learning mode for streaming data
- **NHTSA Fit:** Excellent for early warning of emerging defect patterns

### Anomaly Detection

#### PyOD (Python Outlier Detection)
- **GitHub:** https://github.com/yzhao062/pyod
- **Install:** `pip install pyod`
- **Algorithms:** 50+ including:
  - KNN, LOF (Local Outlier Factor)
  - Isolation Forest
  - HBOS (Histogram-based)
  - AutoEncoder-based
  - Deep learning models (PyOD 2)
- **New in PyOD 2 (2025):**
  - LLM-powered model selection
  - Unified PyTorch framework
  - 12 modern neural models
- **NHTSA Fit:** Excellent for finding unusual complaint patterns

#### ADBench
- **GitHub:** https://github.com/Minqi824/ADBench
- **Purpose:** Benchmark for anomaly detection algorithms
- **NHTSA Fit:** Use to evaluate which PyOD algorithm works best for your data

### Change Point Detection

#### Ruptures
- **GitHub:** https://github.com/deepcharles/ruptures
- **Install:** `pip install ruptures`
- **Algorithms:**
  - PELT (Pruned Exact Linear Time) - O(n) complexity
  - Binary Segmentation
  - Window-based methods
- **Use Case:** Detect when complaint patterns shift significantly
- **NHTSA Fit:** Excellent for detecting "something changed" moments (e.g., new model year defect)

### Online/Streaming Learning

#### River
- **Website:** https://riverml.xyz
- **Install:** `pip install river`
- **Features:**
  - Online learning (single-instance updates)
  - Concept drift detection (ADWIN, DDM, EDDM)
  - Streaming clustering
- **NHTSA Fit:** Good for real-time monitoring of incoming complaints

---

## Python Libraries

### Embedding Generation

| Library | Model | Dimensions | Speed | Quality |
|---------|-------|------------|-------|---------|
| **sentence-transformers** | all-MiniLM-L6-v2 | 384 | Fast | Good |
| **sentence-transformers** | all-mpnet-base-v2 | 768 | Medium | Excellent |
| **OpenAI** | text-embedding-3-small | 1536 | API | Excellent |
| **OpenAI** | text-embedding-3-large | 3072 | API | Best |
| **Cohere** | embed-english-v3.0 | 1024 | API | Excellent |

**Recommendation:** Start with `all-MiniLM-L6-v2` for speed, upgrade to OpenAI embeddings for production if budget allows.

### Clustering

| Library | Algorithm | Strengths | Weaknesses |
|---------|-----------|-----------|------------|
| **hdbscan** | HDBSCAN | No cluster count needed, handles noise | Parameter tuning |
| **scikit-learn** | DBSCAN | Simple, fast | Requires eps parameter |
| **scikit-learn** | OPTICS | Variable density | Slower than HDBSCAN |
| **umap-learn** | UMAP | Dimensionality reduction | Preprocessing step |
| **rapids cuML** | GPU HDBSCAN | 100x faster | Requires GPU |

**Recommendation:** HDBSCAN via `hdbscan` library or integrated in BERTopic

### Sequential Pattern Mining

| Library | Algorithm | Use Case |
|---------|-----------|----------|
| **prefixspan** | PrefixSpan | Sequential patterns in complaint sequences |
| **gsp-py** | GSP | General sequential patterns |
| **mlxtend** | FP-Growth, Apriori | Association rules (component co-failures) |

**NHTSA Application:** Find patterns like "brake complaint -> steering complaint -> crash" sequences

### Time Series

| Library | Purpose | NHTSA Use |
|---------|---------|-----------|
| **ruptures** | Change point detection | When did complaint spike start? |
| **prophet** | Forecasting | Predict future complaint volumes |
| **statsmodels** | Statistical tests | Trend significance testing |
| **tslearn** | Time series clustering | Group similar complaint timelines |

---

## Recommended Architecture for CaseRadar

### Proposed Pipeline

```
                                    +------------------+
                                    |   NHTSA API      |
                                    +--------+---------+
                                             |
                                             v
+------------------------------------------+------------------------+
|                        DATA INGESTION LAYER                       |
+------------------------------------------+------------------------+
                                             |
                                             v
+------------------------------------------+------------------------+
|                     EMBEDDING GENERATION                          |
|   sentence-transformers (all-MiniLM-L6-v2 or all-mpnet-base-v2)  |
+------------------------------------------+------------------------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
                    v                        v                        v
        +----------+----------+  +----------+----------+  +----------+----------+
        |  PATTERN DETECTION  |  |   ANOMALY DETECTION |  |  TREND ANALYSIS     |
        |                     |  |                     |  |                     |
        |  - BERTopic         |  |  - PyOD (Isolation  |  |  - BERTopic         |
        |  - HDBSCAN          |  |    Forest, LOF)     |  |    topics_over_time |
        |  - Top2Vec          |  |  - Custom threshold |  |  - Ruptures (change |
        |                     |  |    detection        |  |    points)          |
        +----------+----------+  +----------+----------+  +----------+----------+
                    |                        |                        |
                    +------------------------+------------------------+
                                             |
                                             v
+------------------------------------------+------------------------+
|                      ALERT & MONITORING LAYER                     |
|   River (concept drift) + Custom rule engine                      |
+------------------------------------------+------------------------+
                                             |
                                             v
+------------------------------------------+------------------------+
|                         VISUALIZATION                             |
|   Dashboard with trend charts, cluster views, anomaly highlights  |
+------------------------------------------+------------------------+
```

### Component Responsibilities

1. **Embedding Layer**
   - Generate 384-dim vectors for each complaint text
   - Cache embeddings for performance
   - Update incrementally for new complaints

2. **Pattern Detection (BERTopic)**
   - Cluster similar complaints
   - Generate human-readable topic labels
   - Track topic evolution over time

3. **Anomaly Detection (PyOD)**
   - Flag statistically unusual complaints
   - Identify rare component/failure combinations
   - Surface complaints worth human review

4. **Trend Analysis**
   - Monthly topic frequency tracking
   - Change point detection for sudden shifts
   - Weak signal identification for emerging issues

5. **Monitoring (River)**
   - Real-time drift detection
   - Alert when new complaint patterns emerge
   - Continuous model updates

---

## Implementation Considerations

### Phase 1: Quick Wins (1-2 weeks)

1. **Replace greedy clustering with HDBSCAN**
   ```python
   from hdbscan import HDBSCAN

   clusterer = HDBSCAN(
       min_cluster_size=5,
       min_samples=3,
       metric='euclidean',
       cluster_selection_method='eom'
   )
   labels = clusterer.fit_predict(embeddings)
   ```

2. **Add anomaly scoring with PyOD**
   ```python
   from pyod.models.iforest import IForest

   clf = IForest(contamination=0.05)
   clf.fit(embeddings)
   anomaly_scores = clf.decision_function(embeddings)
   ```

### Phase 2: Temporal Analysis (2-4 weeks)

1. **Implement BERTopic with temporal tracking**
   ```python
   from bertopic import BERTopic

   topic_model = BERTopic()
   topics, probs = topic_model.fit_transform(documents)

   # Track topics over time
   topics_over_time = topic_model.topics_over_time(
       documents,
       timestamps,
       nr_bins=20
   )
   topic_model.visualize_topics_over_time(topics_over_time)
   ```

2. **Add change point detection**
   ```python
   import ruptures as rpt

   # Detect when complaint patterns shifted
   algo = rpt.Pelt(model="rbf").fit(topic_frequencies)
   change_points = algo.predict(pen=10)
   ```

### Phase 3: Real-time Monitoring (4-6 weeks)

1. **Streaming anomaly detection with River**
   ```python
   from river import anomaly
   from river import drift

   model = anomaly.HalfSpaceTrees()
   drift_detector = drift.ADWIN()

   for complaint in stream:
       score = model.score_one(complaint)
       model.learn_one(complaint)
       drift_detector.update(score)
       if drift_detector.drift_detected:
           alert("Distribution change detected!")
   ```

### Scaling Considerations

| Records | Approach | Notes |
|---------|----------|-------|
| <50K | Single machine, in-memory | Current state |
| 50K-500K | Batch processing, disk-based | Use incremental HDBSCAN |
| 500K-5M | Distributed (Spark + Spark NLP) | Consider cloud |
| >5M | Full distributed pipeline | Elasticsearch + Spark |

### Performance Benchmarks (Expected)

| Operation | 17K records | 100K records | 1M records |
|-----------|-------------|--------------|------------|
| Embedding generation | ~2 min | ~10 min | ~2 hours |
| HDBSCAN clustering | ~5 sec | ~30 sec | ~10 min |
| BERTopic full pipeline | ~3 min | ~15 min | ~3 hours |
| PyOD Isolation Forest | ~1 sec | ~5 sec | ~1 min |

---

## Comparison Table

| Tool | Type | Temporal | Anomaly | Scalability | Learning Curve | NHTSA Fit |
|------|------|----------|---------|-------------|----------------|-----------|
| **BERTopic** | Topic Modeling | Excellent | Moderate | Good (100K) | Medium | Excellent |
| **Top2Vec** | Topic Modeling | Limited | Moderate | Good | Low | Good |
| **PyOD** | Anomaly Detection | Limited | Excellent | Good | Low | Excellent |
| **HDBSCAN** | Clustering | None | Via density | Excellent | Low | Excellent |
| **River** | Streaming ML | Excellent | Good | Excellent | Medium | Good |
| **Ruptures** | Change Detection | Excellent | Indirect | Excellent | Low | Excellent |
| **Elastic Stack** | Platform | Good | Good | Excellent | High | Good |
| **Spark MLlib** | Distributed ML | Moderate | Moderate | Excellent | High | Overkill |
| **Datadog** | Monitoring | Good | Good | Excellent | Medium | Moderate |

---

## Key Takeaways

### Do This

1. **Replace current greedy clustering** with HDBSCAN - immediate improvement
2. **Add BERTopic** for interpretable topics with temporal tracking
3. **Implement PyOD** for anomaly detection alongside clustering
4. **Use sentence-transformers** (all-MiniLM-L6-v2) for fast, good-quality embeddings
5. **Add ruptures** for change point detection in complaint trends

### Avoid This

1. **Don't use commercial platforms** at current scale - overkill and expensive
2. **Don't use Spark** until you exceed 500K records
3. **Don't over-engineer** - start simple, add complexity as needed
4. **Don't ignore temporal dimension** - trends are as important as clusters

### Research to Watch

- **BERTrend** - promising for weak signal detection (not yet production-ready)
- **PyOD 2 LLM selection** - automated algorithm selection could simplify pipeline
- **Contextual Top2Vec** - multi-topic per document (beta)

---

## References

### Primary Sources
- [BERTopic Documentation](https://maartengr.github.io/BERTopic/)
- [PyOD Documentation](https://pyod.readthedocs.io/)
- [HDBSCAN Documentation](https://hdbscan.readthedocs.io/)
- [Ruptures Documentation](https://centre-borelli.github.io/ruptures-docs/)
- [River Documentation](https://riverml.xyz/)
- [Sentence Transformers](https://www.sbert.net/)

### Research Papers
- BERTrend: Neural Topic Modeling for Emerging Trends Detection (2024)
- PyOD 2: A Python Library for Outlier Detection with LLM-powered Model Selection (2025)
- AD-LLM: Benchmarking Large Language Models for Anomaly Detection (2024)
- Text mining to decipher free-response consumer complaints: insights from the NHTSA database

### Benchmarks
- [ADBench](https://github.com/Minqi824/ADBench) - Anomaly Detection Benchmark
- [NLP-ADBench](https://arxiv.org/html/2412.04784v1) - NLP Anomaly Detection Benchmark
- [TAD-Bench](https://arxiv.org/html/2501.11960v1) - Text Anomaly Detection Benchmark
