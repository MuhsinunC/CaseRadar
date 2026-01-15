# Pattern Detection System - TDD Implementation Plan

**Created:** January 2025
**Status:** In Progress
**Approach:** Test-Driven Development (Red-Green-Refactor)

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Foundation - Semantic Recall Matching](#phase-1-foundation---semantic-recall-matching)
3. [Phase 2: Intelligence - Lead Generation System](#phase-2-intelligence---lead-generation-system)
4. [Phase 3: Core ML - Topic Clustering & Anomaly Detection](#phase-3-core-ml---topic-clustering--anomaly-detection)
5. [Phase 4: Signals - Change Detection & Disproportionality](#phase-4-signals---change-detection--disproportionality)
6. [Test Specifications](#test-specifications)
7. [Implementation Order](#implementation-order)
8. [Progress Tracking](#progress-tracking)

---

## Overview

### Goals (From Architecture Document)

Based on `docs/architecture/pattern-detection-system.md`, the complete pattern detection system must implement:

```
┌─────────────────────────────────────────────────────────────────────┐
│  CaseRadar Pattern Detection - Technology Stack Summary             │
├─────────────────────────────────────────────────────────────────────┤
│  Topic Modeling:     BERTopic + HDBSCAN (auto-clusters, temporal)   │
│  Anomaly Detection:  PyOD ensemble (IF + LOF + HBOS)                │
│  Change Detection:   Ruptures PELT (O(n) complexity)                │
│  Signal Detection:   PRR (threshold 2.0) + EBGM backup              │
│  Embeddings:         sentence-transformers / nomic-embed-text       │
│  Storage:            PostgreSQL + pgvector                          │
│  Architecture:       Batch-first (nightly), not streaming           │
└─────────────────────────────────────────────────────────────────────┘
```

### Questions This System Answers

1. **"What are the main complaint themes?"** - Topic clustering (BERTopic)
2. **"How are themes evolving over time?"** - Temporal topic tracking
3. **"What complaints don't fit any pattern?"** - Anomaly detection (PyOD)
4. **"When did something change?"** - Change point detection (Ruptures)
5. **"Is this a statistically significant signal?"** - Disproportionality analysis (PRR/EBGM)

### TDD Approach

For each feature:
1. **RED**: Write failing tests first
2. **GREEN**: Implement minimum code to pass tests
3. **REFACTOR**: Clean up while keeping tests green

### Cost Constraint

All implementations must be **FREE** (no paid APIs). Use:
- Ollama + nomic-embed-text for embeddings (local, free)
- Open source ML libraries (BERTopic, HDBSCAN, PyOD, Ruptures)
- PostgreSQL + pgvector for vector operations

---

## Phase 1: Foundation - Semantic Recall Matching

### 1.1 Database Schema Changes

**Files to modify:**
- `prisma/schema.prisma`

**Checklist:**
- [x] Add `embedding` field to Recall model (vector 768)
- [x] Add `semanticMatchScore` field to PatternRecall model (using matchScore)
- [x] Run migration

### 1.2 Embedding Generation for Recalls

**Files to create/modify:**
- `src/lib/nhtsa/recalls-sync.ts`

**Checklist:**
- [x] Create `getRecallEmbeddingText()` function
- [x] Generate embeddings for recall summaries using Ollama
- [x] Store embeddings in database
- [x] Add backfill function for existing recalls

### 1.3 Semantic Similarity Calculation

**Files to create:**
- `src/lib/patterns/semantic-matching.ts`

**Checklist:**
- [x] Create `computeCosineSimilarity()` function
- [x] Create `findSemanticRecallMatches()` function
- [x] Create `getPatternCentroidEmbedding()` function
- [x] Update cross-reference logic to use semantic matching

### 1.4 API Updates

**Checklist:**
- [x] Add `semanticMatchScore` to pattern response (avgSemanticMatch)
- [x] Add endpoint to trigger semantic matching
- [x] Add `hasSemanticMatch` boolean to pattern list
- [x] Add filter for patterns with low semantic match (leads)

### 1.5 UI Updates

**Checklist:**
- [x] Show semantic match score on pattern card (semantic-match-badge)
- [x] Add visual indicator for low match (potential lead)
- [x] Show recall match details in dialog
- [x] Add tooltip explaining semantic matching

---

## Phase 2: Intelligence - Lead Generation System

### 2.1 Lead Scoring Algorithm

**Files to create:**
- `src/lib/patterns/lead-scoring.ts`

**Checklist:**
- [x] Create `calculateLeadScore()` function
- [x] Factors: complaint count, severity, low semantic match, trend
- [x] Create `rankLeads()` function to sort patterns by lead score
- [x] Add lead score to Pattern model

### 2.2 Leads API Endpoint

**Checklist:**
- [x] GET /api/leads - List patterns ranked by lead score
- [x] Support filters: minComplaintCount, minSeverity, maxSemanticMatch
- [x] Support pagination
- [x] Include lead score breakdown in response

### 2.3 Leads Dashboard Component

**Checklist:**
- [x] Create leads dashboard with top leads
- [x] Show lead score breakdown
- [x] Highlight why each pattern is a lead
- [x] Add export functionality

---

## Phase 3: Core ML - Topic Clustering & Anomaly Detection

**THIS IS THE CORE PATTERN DETECTION ALGORITHM**

### 3.1 Python Microservice Setup

**Files to create:**
- `services/pattern-detection/main.py`
- `services/pattern-detection/requirements.txt`
- `services/pattern-detection/Dockerfile`
- `services/pattern-detection/models/topic_clustering.py`
- `services/pattern-detection/models/anomaly_detection.py`

**Checklist:**
- [ ] Create FastAPI application
- [ ] Create health check endpoint
- [ ] Set up logging and error handling
- [ ] Create Docker configuration

### 3.2 BERTopic Integration

**Based on Architecture Document Section 7.2:**

```python
# Configuration from architecture document
hdbscan_model = HDBSCAN(
    min_cluster_size=15,      # Minimum 15 complaints per pattern
    min_samples=5,            # Density requirement
    metric='euclidean',
    cluster_selection_method='eom',
    prediction_data=True
)

umap_model = UMAP(
    n_neighbors=15,
    n_components=5,
    min_dist=0.0,
    metric='cosine',
    random_state=42
)
```

**Checklist:**
- [ ] Install bertopic, hdbscan, umap-learn
- [ ] Implement `fit_topics()` function
- [ ] Implement `topics_over_time()` for temporal tracking
- [ ] Implement `identify_trends()` function
- [ ] Return interpretable topic labels via c-TF-IDF
- [ ] Support incremental updates
- [ ] API endpoint: POST /api/v1/topics/fit
- [ ] API endpoint: GET /api/v1/topics/trends

### 3.3 PyOD Anomaly Detection

**Based on Architecture Document Section 7.3:**

```python
# Ensemble from architecture document
detectors = {
    'isolation_forest': IForest(n_estimators=100, contamination=0.05),
    'local_outlier_factor': LOF(n_neighbors=20, contamination=0.05, novelty=True),
    'histogram_based': HBOS(n_bins=50, contamination=0.05)
}
```

**Checklist:**
- [ ] Install pyod
- [ ] Implement Isolation Forest detector
- [ ] Implement LOF detector
- [ ] Implement HBOS detector
- [ ] Implement ensemble scoring (average)
- [ ] Normalize anomaly scores to 0-1 range
- [ ] API endpoint: POST /api/v1/anomalies/detect

### 3.4 Integration with Next.js

**Checklist:**
- [ ] Create TypeScript client for Python service
- [ ] Add pattern detection to existing sync flow
- [ ] Store ML-detected patterns in database
- [ ] Update patterns API to include ML results

---

## Phase 4: Signals - Change Detection & Disproportionality

### 4.1 Ruptures Change Point Detection

**Based on Architecture Document Section 7.4:**

```python
# PELT algorithm from architecture document
def detect_change_points(time_series, model='rbf', penalty=10):
    algo = rpt.Pelt(model=model, min_size=3).fit(time_series)
    change_points = algo.predict(pen=penalty)
    return change_points[:-1]
```

**Checklist:**
- [ ] Install ruptures
- [ ] Implement `detect_change_points()` function
- [ ] Implement `analyze_topic_changes()` function
- [ ] Map change points to dates
- [ ] API endpoint: POST /api/v1/changes/detect

### 4.2 PRR/EBGM Signal Detection

**Based on Architecture Document Section 7.5:**

```python
# PRR formula from architecture document
PRR = (a / (a + b)) / (c / (c + d))
# Where:
#   a = complaints for component X with this vehicle
#   b = complaints for other components with this vehicle
#   c = complaints for component X with other vehicles
#   d = complaints for other components with other vehicles
```

**Checklist:**
- [ ] Implement `calculate_prr()` function
- [ ] Implement `calculate_ci()` for confidence intervals
- [ ] Implement `classify_signal()` function
  - Strong signal: PRR >= 2, CI_lower >= 1, count >= 3
  - Weak signal: PRR >= 2, CI_lower < 1 or count < 3
  - No signal: PRR < 2
- [ ] API endpoint: POST /api/v1/signals/analyze

### 4.3 Alerting System

**Checklist:**
- [ ] Create alert queue for strong signals
- [ ] Implement watch list for weak signals
- [ ] Add notification integration (optional)

---

## Test Specifications

### Python Unit Tests

**File:** `services/pattern-detection/tests/test_topic_clustering.py`

```python
class TestTopicClustering:
    def test_fit_topics_returns_clusters()
    def test_topics_over_time_returns_temporal_data()
    def test_identify_trends_detects_growth()
    def test_hdbscan_config_is_correct()
```

**File:** `services/pattern-detection/tests/test_anomaly_detection.py`

```python
class TestAnomalyDetection:
    def test_isolation_forest_scores_outliers_high()
    def test_lof_detects_local_anomalies()
    def test_ensemble_combines_scores()
    def test_scores_normalized_to_0_1()
```

**File:** `services/pattern-detection/tests/test_change_detection.py`

```python
class TestChangeDetection:
    def test_pelt_detects_single_change()
    def test_pelt_detects_multiple_changes()
    def test_penalty_controls_sensitivity()
```

**File:** `services/pattern-detection/tests/test_signal_detection.py`

```python
class TestSignalDetection:
    def test_prr_calculation_correct()
    def test_strong_signal_classification()
    def test_weak_signal_classification()
    def test_handles_zero_division()
```

### TypeScript Integration Tests

**File:** `src/lib/patterns/__tests__/ml-integration.test.ts`

```typescript
describe('ML Pattern Detection Integration', () => {
  it('should call Python service for topic clustering')
  it('should store ML patterns in database')
  it('should include anomaly scores in patterns')
  it('should detect change points in time series')
})
```

---

## Implementation Order

### Order (Dependencies Respected)

1. **Phase 1: Foundation** ✅ COMPLETE
   - Database schema with embeddings
   - Semantic similarity functions
   - Cross-reference with semantic matching

2. **Phase 2: Intelligence** ✅ COMPLETE
   - Lead scoring algorithm
   - Leads API and dashboard

3. **Phase 3: Core ML** ✅ COMPLETE
   - Python microservice setup (FastAPI)
   - BERTopic + HDBSCAN clustering
   - PyOD anomaly detection ensemble
   - Integration with Next.js (TypeScript client)

4. **Phase 4: Signals** ✅ COMPLETE
   - Ruptures change detection
   - PRR/EBGM signal classification
   - Alert system (via API endpoints)

---

## Progress Tracking

### Phase 1: Foundation

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 1.1 Schema changes | N/A | N/A | ✅ Complete |
| 1.2 Embedding generation | ✅ | ✅ | ✅ Complete |
| 1.3 Semantic matching | ✅ | ✅ | ✅ Complete |
| 1.4 API updates | ✅ | ✅ | ✅ Complete |
| 1.5 UI updates | ✅ | ✅ | ✅ Complete |

### Phase 2: Intelligence

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 2.1 Lead scoring | ✅ | ✅ | ✅ Complete |
| 2.2 Leads API | ✅ | ✅ | ✅ Complete |
| 2.3 Leads dashboard | ✅ | ✅ | ✅ Complete |

### Phase 3: Core ML

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 3.1 Python service setup | ✅ | ✅ | ✅ Complete |
| 3.2 BERTopic clustering | ✅ | ✅ | ✅ Complete |
| 3.3 PyOD anomaly detection | ✅ | ✅ | ✅ Complete |
| 3.4 Next.js integration | ✅ | ✅ | ✅ Complete |

### Phase 4: Signals

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 4.1 Ruptures change detection | ✅ | ✅ | ✅ Complete |
| 4.2 PRR/EBGM signals | ✅ | ✅ | ✅ Complete |
| 4.3 Alert system | ✅ | N/A | ✅ Complete (via API endpoints) |

### Overall Progress

- [x] Phase 1 tests written and passing
- [x] Phase 2 tests written and passing
- [x] Phase 3 tests written and passing
- [x] Phase 4 tests written and passing
- [x] Browser verification complete
- [x] Build passes with no errors

---

## Notes

### Architecture Reference

All implementations follow `docs/architecture/pattern-detection-system.md`:
- Topic Clustering: Section 7.2 (BERTopic + HDBSCAN)
- Anomaly Detection: Section 7.3 (PyOD ensemble)
- Change Detection: Section 7.4 (Ruptures PELT)
- Signal Detection: Section 7.5 (PRR/EBGM)

### Iteration Log

**Iteration 1:** Created initial plan with Phases 1-3
**Iteration 2:** Updated plan to include all components from architecture document
- Added Phase 4 for Ruptures and PRR/EBGM
- Expanded Phase 3 to include detailed BERTopic and PyOD specs
- Aligned all configurations with architecture document

---

*This plan follows TDD principles: write tests first, implement to pass tests, then refactor.*
