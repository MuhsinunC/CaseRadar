# Pattern Detection System - TDD Implementation Plan

**Created:** January 2025
**Status:** In Progress
**Approach:** Test-Driven Development (Red-Green-Refactor)

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Semantic Recall Matching](#phase-1-semantic-recall-matching)
3. [Phase 2: Lead Generation System](#phase-2-lead-generation-system)
4. [Phase 3: Advanced Pattern Detection](#phase-3-advanced-pattern-detection)
5. [Test Specifications](#test-specifications)
6. [Implementation Order](#implementation-order)
7. [Progress Tracking](#progress-tracking)

---

## Overview

### Goals

1. **Semantic Recall Matching** - Use embedding similarity to determine if recalls actually address detected patterns
2. **Lead Generation** - Identify high-value patterns (many complaints, low recall match)
3. **Advanced Detection** - Upgrade from greedy clustering to BERTopic + HDBSCAN

### TDD Approach

For each feature:
1. **RED**: Write failing tests first
2. **GREEN**: Implement minimum code to pass tests
3. **REFACTOR**: Clean up while keeping tests green

### Cost Constraint

All implementations must be **FREE** (no paid APIs). Use:
- Ollama + nomic-embed-text for embeddings (local, free)
- Open source ML libraries (BERTopic, HDBSCAN, PyOD)
- PostgreSQL + pgvector for vector operations

---

## Phase 1: Semantic Recall Matching

### 1.1 Database Schema Changes

**Files to modify:**
- `prisma/schema.prisma`

**Checklist:**
- [x] Add `embedding` field to Recall model (vector 768)
- [x] Add `semanticMatchScore` field to PatternRecall model (using matchScore)
- [x] Run migration

**Schema Changes:**
```prisma
model Recall {
  // ... existing fields
  embedding Unsupported("vector(768)")?  // NEW
}

model PatternRecall {
  // ... existing fields
  semanticMatchScore Float?  // NEW: 0-1 similarity score
}
```

### 1.2 Embedding Generation for Recalls

**Files to create/modify:**
- `src/lib/nhtsa/recalls-sync.ts`

**Checklist:**
- [x] Create `getRecallEmbeddingText()` function
- [x] Generate embeddings for recall summaries using Ollama
- [x] Store embeddings in database
- [x] Add backfill function for existing recalls

**Functions to implement:**
```typescript
function getRecallEmbeddingText(recall: TransformedRecall): string
async function generateRecallEmbeddings(recallIds?: string[]): Promise<{processed: number, errors: number}>
```

### 1.3 Semantic Similarity Calculation

**Files to create:**
- `src/lib/patterns/semantic-matching.ts`

**Checklist:**
- [x] Create `computeCosineSimilarity()` function
- [x] Create `findSemanticRecallMatches()` function
- [x] Create `getPatternCentroidEmbedding()` function
- [x] Update cross-reference logic to use semantic matching

**Functions to implement:**
```typescript
function computeCosineSimilarity(embedding1: number[], embedding2: number[]): number
async function getPatternCentroidEmbedding(patternId: string): Promise<number[]>
async function findSemanticRecallMatches(patternId: string, threshold?: number): Promise<SemanticMatch[]>
```

### 1.4 API Updates

**Files to modify:**
- `src/app/api/patterns/route.ts`
- `src/app/api/patterns/[id]/route.ts`
- `src/app/api/recalls/route.ts`

**Checklist:**
- [x] Add `semanticMatchScore` to pattern response (avgSemanticMatch)
- [x] Add endpoint to trigger semantic matching (/api/patterns/[id]/semantic-match)
- [x] Add `hasSemanticMatch` boolean to pattern list
- [x] Add filter for patterns with low semantic match (leads)

### 1.5 UI Updates

**Files to modify:**
- `src/components/patterns/pattern-card.tsx`
- `src/components/patterns/pattern-detail-dialog.tsx`

**Checklist:**
- [x] Show semantic match score on pattern card (semantic-match-badge)
- [x] Add visual indicator for low match (potential lead) (No Recall, Hot Lead badges)
- [x] Show recall match details in dialog (Linked Recalls section)
- [x] Add tooltip explaining semantic matching

---

## Phase 2: Lead Generation System

### 2.1 Lead Scoring Algorithm

**Files to create:**
- `src/lib/patterns/lead-scoring.ts`

**Checklist:**
- [x] Create `calculateLeadScore()` function
- [x] Factors: complaint count, severity, low semantic match, trend
- [x] Create `rankLeads()` function to sort patterns by lead score
- [x] Add lead score to Pattern model (computed on-the-fly, optional caching)

**Lead Score Formula:**
```
leadScore = (complaintCount * 0.3) +
            (severityScore * 0.3) +
            ((1 - avgSemanticMatch) * 0.3) +
            (trendScore * 0.1)
```

### 2.2 Leads API Endpoint

**Files to create:**
- `src/app/api/leads/route.ts`

**Checklist:**
- [x] GET /api/leads - List patterns ranked by lead score
- [x] Support filters: minComplaintCount, minSeverity, maxSemanticMatch
- [x] Support pagination
- [x] Include lead score breakdown in response

### 2.3 Leads Dashboard Component

**Files to create:**
- `src/app/(dashboard)/leads/page.tsx` (leads dashboard with LeadCard inline)

**Checklist:**
- [x] Create leads dashboard with top leads
- [x] Show lead score breakdown (expandable with progress bars)
- [x] Highlight why each pattern is a lead (No Recall, Low Match badges)
- [x] Add export functionality (CSV and JSON)

---

## Phase 3: Advanced Pattern Detection

### 3.1 Python Microservice Setup

**Files to create:**
- `services/pattern-detection/main.py`
- `services/pattern-detection/requirements.txt`
- `services/pattern-detection/Dockerfile`

**Checklist:**
- [ ] Create FastAPI application
- [ ] Set up BERTopic pipeline
- [ ] Set up HDBSCAN clustering
- [ ] Create health check endpoint
- [ ] Create pattern detection endpoint

**Note:** This phase is lower priority than Phases 1-2. Defer if needed.

### 3.2 BERTopic Integration

**Checklist:**
- [ ] Install bertopic, hdbscan, umap-learn
- [ ] Create topic modeling endpoint
- [ ] Return interpretable topic labels
- [ ] Support incremental updates

### 3.3 Anomaly Detection

**Checklist:**
- [ ] Install pyod
- [ ] Implement Isolation Forest for anomaly scoring
- [ ] Flag unusual complaint patterns
- [ ] Add anomaly score to API response

---

## Test Specifications

### Unit Tests (Phase 1)

**File:** `src/lib/patterns/__tests__/semantic-matching.test.ts`

```typescript
describe('Semantic Matching', () => {
  describe('computeCosineSimilarity', () => {
    it('should return 1 for identical vectors')
    it('should return 0 for orthogonal vectors')
    it('should return value between 0 and 1')
    it('should handle zero vectors gracefully')
  })

  describe('getRecallEmbeddingText', () => {
    it('should combine summary, consequence, and remedy')
    it('should handle missing fields')
  })

  describe('findSemanticRecallMatches', () => {
    it('should return recalls above threshold')
    it('should sort by similarity descending')
    it('should return empty array for no matches')
  })
})
```

**File:** `src/lib/patterns/__tests__/lead-scoring.test.ts`

```typescript
describe('Lead Scoring', () => {
  describe('calculateLeadScore', () => {
    it('should return higher score for more complaints')
    it('should return higher score for higher severity')
    it('should return higher score for lower semantic match')
    it('should normalize score to 0-100 range')
  })

  describe('rankLeads', () => {
    it('should sort patterns by lead score descending')
    it('should filter out patterns with high semantic match')
  })
})
```

### Integration Tests

**File:** `src/app/api/__tests__/semantic-matching.integration.test.ts`

```typescript
describe('Semantic Matching Integration', () => {
  it('should generate embeddings for recalls')
  it('should compute semantic matches for patterns')
  it('should update PatternRecall with semantic scores')
  it('should return patterns with semantic match info via API')
})
```

**File:** `src/app/api/__tests__/leads.test.ts`

```typescript
describe('Leads API', () => {
  it('should return patterns ranked by lead score')
  it('should filter by minimum complaint count')
  it('should filter by maximum semantic match')
  it('should include lead score breakdown')
})
```

### Component Tests

**File:** `src/components/patterns/__tests__/pattern-card.test.tsx`

```typescript
describe('PatternCard', () => {
  it('should show semantic match score when available')
  it('should highlight low match patterns as leads')
  it('should show appropriate badge for lead status')
})
```

### E2E Browser Tests

**File:** `e2e/leads.spec.ts` (Playwright or manual verification)

```typescript
describe('Leads Flow', () => {
  it('should display leads dashboard')
  it('should show lead scores on pattern cards')
  it('should filter patterns by lead criteria')
  it('should navigate to pattern detail from lead card')
})
```

---

## Implementation Order

### Order (Dependencies Respected)

1. **Database Schema** (no dependencies)
   - Add embedding to Recall
   - Add semanticMatchScore to PatternRecall
   - Run migration

2. **Embedding Generation** (depends on schema)
   - getRecallEmbeddingText function
   - generateRecallEmbeddings function
   - Backfill existing recalls

3. **Semantic Matching** (depends on embeddings)
   - computeCosineSimilarity function
   - getPatternCentroidEmbedding function
   - findSemanticRecallMatches function

4. **Cross-Reference Update** (depends on semantic matching)
   - Update crossReferencePatterns to use semantic matching
   - Store semanticMatchScore in PatternRecall

5. **Lead Scoring** (depends on semantic matching)
   - calculateLeadScore function
   - rankLeads function

6. **API Updates** (depends on lead scoring)
   - Update patterns API with semantic info
   - Create leads API endpoint

7. **UI Updates** (depends on API)
   - Update pattern card
   - Create leads dashboard

8. **Browser Verification** (depends on UI)
   - Verify all UI elements work
   - Test interactive features

---

## Progress Tracking

### Phase 1: Semantic Recall Matching

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 1.1 Schema changes | N/A | N/A | [x] Complete (existing schema) |
| 1.2 getRecallEmbeddingText | [x] | [x] | [x] Complete |
| 1.2 generateRecallEmbeddings | [x] | [x] | [x] Complete (integrated into NHTSA sync) |
| 1.3 computeCosineSimilarity | [x] | [x] | [x] Complete |
| 1.3 getPatternCentroidEmbedding | [x] | [x] | [x] Complete |
| 1.3 findSemanticRecallMatches | [x] | [x] | [x] Complete |
| 1.4 API updates | [x] | [x] | [x] Complete (patterns API includes lead scores) |
| 1.5 UI updates | [x] | [x] | [x] Complete (pattern-card shows lead badges) |

### Phase 2: Lead Generation

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 2.1 calculateLeadScore | [x] | [x] | [x] Complete |
| 2.1 rankLeads | [x] | [x] | [x] Complete |
| 2.2 Leads API | [x] | [x] | [x] Complete (/api/leads endpoint) |
| 2.3 Leads dashboard | [x] | [x] | [x] Complete (/leads page with filtering) |

### Phase 3: Advanced Detection (Deferred)

| Task | Test Written | Test Passing | Status |
|------|--------------|--------------|--------|
| 3.1 Python service | [ ] | [ ] | [ ] Deferred |
| 3.2 BERTopic | [ ] | [ ] | [ ] Deferred |
| 3.3 Anomaly detection | [ ] | [ ] | [ ] Deferred |

### Overall Progress

- [x] All Phase 1 tests written
- [x] All Phase 1 tests passing
- [x] All Phase 2 tests written
- [x] All Phase 2 tests passing
- [x] Browser verification complete
- [x] Build passes with no errors

**Final Status (January 2026):**
- 1228 tests passing
- Build successful
- Dashboard UI verified (17,589 complaints, 65 patterns displayed)

---

## Notes

### Iteration Log

**Iteration 1:**
- Created initial implementation plan
- Defined test specifications
- Established implementation order

---

*This plan follows TDD principles: write tests first, implement to pass tests, then refactor.*
