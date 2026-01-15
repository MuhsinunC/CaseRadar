# CaseRadar Product Roadmap

**Last Updated:** January 2025
**Status:** Active Development

This document tracks future enhancements, deferred features, and technical debt. Items are prioritized and include implementation details for when we're ready to tackle them.

---

## Table of Contents

1. [Current Phase](#current-phase)
2. [Completed Items](#completed-items)
3. [In Progress](#in-progress)
4. [Future Phases](#future-phases)
5. [Technical Debt](#technical-debt)
6. [Cost Considerations](#cost-considerations)

---

## Current Phase

### Phase 1: Pattern Detection MVP (Current)

**Goal:** Detect patterns in NHTSA complaints and identify unaddressed defects

| Item | Status | Notes |
|------|--------|-------|
| NHTSA Complaints Sync | Done | 17K+ complaints synced |
| Embedding Generation | Done | Using Ollama + nomic-embed-text (FREE) |
| Basic Pattern Detection | Done | Greedy clustering implemented |
| Pattern UI | Done | Cards, filters, detail dialog |
| NHTSA Recalls Sync | Done | 511 recalls synced, cross-referenced with patterns |
| Semantic Recall Matching | Planned | Improve lead quality with embedding similarity |
| Advanced Pattern Detection | Planned | BERTopic + HDBSCAN upgrade |

---

## Completed Items

- [x] NHTSA API integration
- [x] Complaint data sync
- [x] PostgreSQL + pgvector setup
- [x] Embedding generation (local, FREE)
- [x] Basic clustering algorithm
- [x] Pattern detection UI
- [x] Dashboard with statistics
- [x] Complaint generator (GPT-based)
- [x] Architecture documentation (3,700+ lines)
- [x] NHTSA Recalls sync (511 recalls from 71 vehicle combinations)
- [x] Pattern-Recall cross-referencing (1,837 links created)
- [x] "Has Recall" indicator on pattern cards

---

## In Progress

### Semantic Recall Matching

**Priority:** High
**Effort:** Medium (2-3 days)
**Cost:** FREE (uses existing embeddings)

**Why:** Current cross-referencing matches broadly on make/model/component. A pattern having "related recalls" doesn't mean the **specific defect** is addressed. We need semantic similarity to determine if a recall actually fixes the issue.

**Problem Example:**
- KIA EV6 Electrical pattern: 761 complaints, 4 recalls
- But do those 4 recalls address the SPECIFIC electrical failure mode?
- Need to compare pattern description embeddings with recall summary embeddings

**Implementation Plan:**
1. Generate embeddings for recall summaries (using existing Ollama + nomic-embed-text)
2. Add `embedding` column to `Recall` table
3. Compute cosine similarity between pattern centroid and recall embeddings
4. Only link recalls with similarity > 0.7 (tunable threshold)
5. Add "Recall Match Confidence" score to UI

**Database Changes:**
```sql
ALTER TABLE "Recall" ADD COLUMN embedding vector(768);
CREATE INDEX idx_recall_embedding ON "Recall" USING ivfflat (embedding vector_cosine_ops);
```

**Expected Outcome:**
- Patterns with "related recalls" but LOW semantic similarity = **HIGH-VALUE LEADS**
- Example: KIA EV6 has 4 recalls, but if none semantically match the electrical failure pattern, it's still a lead

---

## Future Phases

### Phase 2: Lawsuit Tracking

**Priority:** High (after recalls)
**Effort:** High (2-4 weeks depending on approach)
**Cost:** Varies by approach

**Goal:** Identify which detected patterns have NOT been pursued by law firms yet. This is the core value proposition - generating leads for lawsuits.

#### Data Source Options

| Option | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|----------------|
| **A: Manual Entry** | FREE | Simple, accurate for known cases | Labor intensive, not scalable | Good for MVP |
| **B: PACER (Federal Courts)** | $0.10/page | Official federal records | Only federal cases, per-page cost | Good for class actions |
| **C: State Court Scrapers** | Varies | State-level coverage | Complex (50+ systems), legal gray area | Defer |
| **D: Legal Databases (Lexis/Westlaw)** | $$$$ (thousands/month) | Comprehensive | Expensive, overkill for MVP | Only with revenue |
| **E: SEC Filings** | FREE | Large settlements disclosed | Only public companies, delayed | Supplement |
| **F: News/Press Release Scraping** | FREE | Early signal of lawsuits | Incomplete, noisy | Supplement |

#### Recommended Phased Approach

**Phase 2a: Manual Tracking (MVP)**
- Add `lawsuits` table with manual entry
- Attorney users can flag patterns they know about
- Simple "Has Known Lawsuit" indicator
- **Cost: FREE**

**Phase 2b: PACER Integration**
- Integrate PACER API for federal class actions
- Search by manufacturer, component, defect type
- Auto-match to patterns
- **Cost: ~$50-200/month depending on volume**

**Phase 2c: Comprehensive Legal Data**
- Integrate legal database API (when revenue supports it)
- Full federal + state coverage
- **Cost: $500-5000/month**

#### Database Schema (Phase 2a)

```sql
CREATE TABLE lawsuits (
  id TEXT PRIMARY KEY,
  pattern_id TEXT REFERENCES patterns(id),
  case_name TEXT NOT NULL,
  case_number TEXT,
  court TEXT,
  filing_date DATE,
  status TEXT CHECK (status IN ('filed', 'active', 'settled', 'dismissed', 'unknown')),
  settlement_amount DECIMAL,
  source TEXT CHECK (source IN ('manual', 'pacer', 'news', 'legal_db')),
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lawsuits_pattern ON lawsuits(pattern_id);
CREATE INDEX idx_lawsuits_status ON lawsuits(status);
```

#### UI Changes Needed

1. Add "Lawsuits" tab to pattern detail dialog
2. Add "No Known Lawsuit" badge (high-value indicator)
3. Add manual lawsuit entry form for attorneys
4. Filter patterns by "Has Lawsuit" / "No Lawsuit"

---

### Phase 3: Advanced Pattern Detection

**Priority:** Medium
**Effort:** High (2-3 weeks)
**Cost:** FREE (all open source)

**Goal:** Replace greedy clustering with BERTopic + HDBSCAN for better pattern quality.

#### Components

| Component | Library | Purpose | Cost |
|-----------|---------|---------|------|
| Topic Modeling | BERTopic | Interpretable clusters with labels | FREE |
| Clustering | HDBSCAN | Density-based, auto-determines cluster count | FREE |
| Anomaly Detection | PyOD | Identify unusual complaints | FREE |
| Change Detection | Ruptures | Detect trend shifts | FREE |
| Signal Detection | Custom PRR | Statistical significance | FREE |

#### Implementation Plan

1. Create Python microservice (`services/pattern-detection/`)
2. Set up FastAPI endpoints
3. Implement BERTopic pipeline
4. Add PyOD anomaly scoring
5. Integrate Ruptures for change points
6. Add PRR/EBGM signal detection
7. Create migration from current clustering

#### Architecture Reference

See `docs/architecture/pattern-detection-system.md` for full details (3,700+ lines).

---

### Phase 4: Real-Time Monitoring

**Priority:** Low (after revenue)
**Effort:** High
**Cost:** Infrastructure costs

**Goal:** Stream processing for instant pattern updates.

**Defer until:**
- Customer base established
- Latency SLA requires <1 hour updates
- Currently, daily batch is sufficient

---

### Phase 5: Production Infrastructure

**Priority:** Medium (before launch)
**Effort:** Medium
**Cost:** ~$90-150/month

**Components:**
- Cloud hosting (Vercel/Railway/AWS)
- Managed PostgreSQL
- Redis for job queues
- Monitoring (Sentry, Datadog)

**Note:** Currently running locally for FREE. Only incur costs when ready to launch.

---

## Technical Debt

### High Priority

| Item | Description | Effort |
|------|-------------|--------|
| Greedy clustering replacement | Current algorithm is order-dependent | High |
| Embedding model upgrade | Consider all-mpnet-base-v2 for production | Low |
| Test coverage for patterns | Pattern detection has minimal tests | Medium |

### Medium Priority

| Item | Description | Effort |
|------|-------------|--------|
| Rate limiting on NHTSA sync | Avoid API throttling | Low |
| Batch processing optimization | Current sync is slow for large batches | Medium |
| Error handling in embeddings | Better retry logic needed | Low |

### Low Priority

| Item | Description | Effort |
|------|-------------|--------|
| Dark mode support | UI enhancement | Low |
| Export to CSV/Excel | User-requested feature | Low |
| API documentation | OpenAPI spec for external integrations | Medium |

---

## Cost Considerations

### Current (Development): $0/month

| Item | Solution | Cost |
|------|----------|------|
| Embeddings | Ollama + nomic-embed-text (local) | FREE |
| Database | PostgreSQL (local) | FREE |
| ML Libraries | BERTopic, PyOD, etc. (open source) | FREE |
| NHTSA Data | Public API | FREE |
| Recalls Data | Public API | FREE |

### Production Estimate: $90-150/month

| Item | Solution | Cost |
|------|----------|------|
| Hosting | Vercel Pro or Railway | $20-50/month |
| Database | Managed PostgreSQL (Supabase/Neon) | $25-50/month |
| Embeddings | OpenAI API (optional upgrade) | $20-50/month |
| Monitoring | Sentry + basic logging | $0-29/month |

### With Legal Database Integration: +$500-5000/month

Only pursue when revenue supports it.

---

## Changelog

| Date | Change |
|------|--------|
| 2025-01-15 | Created roadmap, added lawsuit tracking options |
| 2025-01-15 | Added NHTSA Recalls sync as in-progress |
| 2025-01-15 | Completed NHTSA Recalls sync (511 recalls, 1,837 pattern links) |
| 2025-01-15 | Added Semantic Recall Matching as next priority |

---

## How to Use This Document

1. **Before starting new work:** Check if it's on the roadmap
2. **When completing items:** Move to "Completed" section with date
3. **When deferring items:** Add rationale and "Defer until" criteria
4. **When costs change:** Update the cost tables
5. **Weekly review:** Check priorities, update statuses

---

*This is a living document. Update it as priorities shift and items are completed.*
