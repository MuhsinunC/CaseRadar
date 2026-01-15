# Pattern Detection Algorithm Audit
**Date:** 2026-01-15
**Purpose:** EDA on generated patterns to identify quality issues and algorithm improvements

---

## Executive Summary

### What's Working Well
- **0% cross-make contamination** - Option A fix was successful
- **0% invalid years** - Year sanitization working
- **Reasonable year ranges** - Avg 4.4 years, max 6 years (no more 9999 or 20+ year spans)
- **No orphan patterns** - All patterns have linked complaints
- **Good pattern naming** - No numeric prefixes, no generic names

### Critical Issues Found

| Issue | Severity | Impact |
|-------|----------|--------|
| **Severe complaints discarded as noise** | CRITICAL | 70% of fatalities in noise bucket! |
| **Duplicate patterns** | HIGH | 23 groups with duplicates (Honda CR-V STEERING has 34!) |
| **Severity metrics all 0** | HIGH | Deaths/injuries/crashes/fires not being populated |
| **Trend analysis broken** | MEDIUM | 100% of patterns show STABLE (no trend detection) |
| **Low complaint coverage** | MEDIUM | 48% of complaints unlinked (noise) |

---

## Detailed Findings

### 1. Basic Statistics
- Total Patterns: 152
- Total Linked Complaints: 9,131
- Avg Complaints/Pattern: 60.1
- Min/Max Complaints: 15 / 736
- High Severity (>1000): 2

### 2. Cross-Make Contamination: PASS ✅
- 0/152 patterns (0%) have cross-make contamination
- 0/152 patterns have multiple models
- **Option A implementation successful!**

### 3. Year Range Analysis: PASS ✅
- Avg Year Range: 4.4 years
- Min/Max: 0 / 6 years
- Distribution:
  - 0-2 years: 17 (11.2%)
  - 3-5 years: 84 (55.3%)
  - 6-10 years: 51 (33.6%)
- **No invalid years (>2030)**

### 4. CRITICAL: Duplicate Patterns

**This is the biggest issue.** BERTopic is creating multiple fine-grained clusters for what should be ONE pattern.

| Vehicle | Component | Duplicate Count |
|---------|-----------|-----------------|
| HONDA CR-V | STEERING | 34 patterns! |
| TOYOTA RAV4 | ENGINE | 15 patterns |
| TESLA MODEL 3 | STEERING | 10 patterns |
| TOYOTA CAMRY | AIR BAGS | 7 patterns |
| HONDA ACCORD | FUEL SYSTEM | 7 patterns |

**Example: Honda CR-V STEERING**
All 34 patterns have nearly identical names "HONDA CR-V STEERING Issues (2018-2024)" but cover different complaint subsets:
- 691 complaints (score: 625)
- 43 complaints (score: 190)
- 27 complaints (score: 70)
- ... and 31 more

**Root Cause Analysis:**
BERTopic's HDBSCAN is finding too many fine-grained clusters within the same vehicle/component. This happens because:
1. `min_cluster_size=15` is too small - allows many small clusters
2. Different phrasing of similar issues creates separate clusters
3. No post-processing to merge semantically similar clusters

### 5. CRITICAL: Severity Metrics All Zero

```
Top severity patterns show:
Deaths: 0, Injuries: 0, Crashes: 0, Fires: 0
```

This is wrong! The complaints HAVE this data (we saw 11 deaths, 155 injuries in the UI earlier).

**Root Cause:** The `createPatternsFromTopicsForVehicle()` method is creating patterns but NOT calculating the aggregate severity metrics from the actual complaint data.

### 6. Trend Analysis Not Working

100% of patterns show STABLE trend. No INCREASING or DECREASING.

**Root Cause:** `trendDirection` defaults to STABLE and is never calculated.

### 7. Complaint Coverage

- Total complaints: 17,589
- Linked to patterns: 9,131 (51.9%)
- Unlinked (noise): 8,458 (48.1%)

This means **48% of complaints are considered noise** and not assigned to any pattern.

### 7.1 CRITICAL: Severe Complaints Are Being Discarded as Noise!

| Metric | Linked | Unlinked (Noise) | % in Noise |
|--------|--------|------------------|------------|
| Severe complaints | 553 | 613 | **52.6%** |
| Deaths | 5 | 12 | **70.6%** |

**The clustering algorithm is discarding the MOST important complaints!**

Example unlinked complaints with deaths:
- "My son was killed along with his passenger in this Tesla..." (2 deaths)
- "THE DRIVER WAS INVOLVED IN A FATAL ACCIDENT..." (1 death)

All 8,458 unlinked complaints HAVE embeddings - they're being classified as noise because:
1. Severe complaints use different language (emotional, describing accidents)
2. BERTopic clusters by semantic similarity
3. Severe complaints are semantically different from typical complaints
4. HDBSCAN marks them as outliers (topic_id=-1)

**Same vehicles have both linked AND unlinked complaints:**
| Vehicle | Linked | Unlinked | % Unlinked |
|---------|--------|----------|------------|
| Honda CR-V | 2,364 | 2,057 | 46% |
| Tesla Model 3 | 1,180 | 1,709 | **59%** |
| Honda Accord | 1,558 | 1,202 | 44% |
| Toyota RAV4 | 1,134 | 979 | 46% |

---

## Algorithm Improvement Recommendations

### Priority 1: CRITICAL - Rescue Severe Complaints from Noise (HIGHEST)

**The clustering is discarding 70% of fatality complaints as noise. This is the opposite of what we want.**

**Solution: Force-assign noise complaints to nearest cluster**
```typescript
// After BERTopic clustering, for any complaint marked as noise (topic_id=-1):
// 1. Find the nearest cluster centroid
// 2. Assign to that cluster if distance < threshold
// 3. Especially for complaints with deaths/injuries/crashes/fires

for (const complaint of noiseComplaints) {
  if (complaint.deaths > 0 || complaint.injuries > 0) {
    // Find nearest pattern by embedding similarity
    const nearestPattern = findNearestPattern(complaint.embedding);
    // Force-assign to that pattern
    await linkComplaintToPattern(complaint.id, nearestPattern.id);
  }
}
```

**Alternative: Weight severe complaints higher in clustering**
- Use weighted clustering where severe complaints have higher influence
- Or run separate clustering for severe complaints only

### Priority 2: Fix Duplicate Patterns (HIGH)

**Option A: Post-Processing Merge**
After BERTopic clustering, merge patterns with same make/model/component:
```typescript
// Pseudo-code
const patternsByKey = groupBy(patterns, p => `${p.make}|${p.model}|${p.component}`);
for (const [key, group] of patternsByKey) {
  if (group.length > 1) {
    // Merge all patterns into one
    const merged = mergePatterns(group);
    // Link all complaints to merged pattern
  }
}
```

**Option B: Increase HDBSCAN min_cluster_size**
Change from 15 to 30 or 50 to create fewer, larger clusters.

**Option C: Two-Stage Clustering**
1. First stage: Coarse clusters by dominant keywords
2. Second stage: Fine-grained analysis within clusters

### Priority 3: Fix Severity Metrics (HIGH)

The pattern creation code needs to aggregate severity from complaints:
```typescript
const aggregates = complaints.reduce((acc, c) => ({
  deathCount: acc.deathCount + (c.deaths || 0),
  injuryCount: acc.injuryCount + (c.injuries || 0),
  crashCount: acc.crashCount + (c.crash ? 1 : 0),
  fireCount: acc.fireCount + (c.fire ? 1 : 0),
}), { deathCount: 0, injuryCount: 0, crashCount: 0, fireCount: 0 });
```

### Priority 4: Implement Trend Detection (MEDIUM)

Calculate trend by analyzing complaint dates:
```typescript
// Group complaints by month
// Calculate slope of complaint count over time
// If slope > threshold: INCREASING
// If slope < -threshold: DECREASING
// Otherwise: STABLE
```

### Priority 5: Reduce Noise Rate (LOW - after Priority 1 fix)

Current 48% noise rate should be significantly reduced after Priority 1.
Additional improvements:
- Lower `min_cluster_size` for small vehicle datasets
- Use soft clustering to assign borderline complaints
- Consider fuzzy cluster boundaries

---

## Next Steps

1. [ ] **CRITICAL:** Implement noise recovery for severe complaints (deaths/injuries)
2. [ ] Implement pattern merging to consolidate duplicate patterns by make/model/component
3. [ ] Fix severity metric aggregation (deathCount, injuryCount, etc.)
4. [ ] Add trend detection based on temporal analysis
5. [ ] Consider increasing `min_cluster_size` to reduce fragmentation
6. [ ] Re-run pattern detection and verify fixes

---

## Raw Data

### Component Distribution
| Component | Count | % |
|-----------|-------|---|
| STEERING | 48 | 31.6% |
| ELECTRICAL SYSTEM | 20 | 13.2% |
| ENGINE | 18 | 11.8% |
| AIR BAGS | 15 | 9.9% |
| FORWARD COLLISION AVOIDANCE | 15 | 9.9% |
| FUEL SYSTEM | 11 | 7.2% |
| UNKNOWN OR OTHER | 9 | 5.9% |
| POWER TRAIN | 6 | 3.9% |

### Make Distribution
| Make | Count | % |
|------|-------|---|
| HONDA | 60 | 39.5% |
| TOYOTA | 34 | 22.4% |
| TESLA | 30 | 19.7% |
| BMW | 8 | 5.3% |
| FORD | 7 | 4.6% |
| CHEVROLET | 5 | 3.3% |
| RIVIAN | 4 | 2.6% |
| KIA | 2 | 1.3% |
| HYUNDAI | 2 | 1.3% |

### Severity Distribution
| Score Range | Count | % |
|-------------|-------|---|
| 0 | 32 | 21.1% |
| 1-100 | 72 | 47.4% |
| 101-500 | 44 | 28.9% |
| 501-1000 | 2 | 1.3% |
| 1001-5000 | 2 | 1.3% |
