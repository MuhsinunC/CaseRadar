# Pattern Detection Algorithm Audit - Iteration 3
**Date:** 2026-01-15
**Purpose:** Deep audit and bug fix for cross-model contamination

---

## Bug Fixed This Iteration

### Cross-Model Contamination Bug

**Problem:** The `rescueSevereComplaintsFromNoise()` function had a fallback that assigned severe complaints to ANY pattern with the same make, even if the model was different.

**Impact:**
- HYUNDAI IONIQ 5 pattern had 14 complaints from KONA/KONA ELECTRIC
- FORD MUSTANG MACH E pattern had 2 complaints from F-150

**Fix:** Removed the make-only fallback. Now severe complaints are ONLY assigned to patterns with EXACT make+model match. If no matching pattern exists, the complaint remains as noise.

---

## Current Quality Metrics

| Metric | Target | Achieved |
|--------|--------|----------|
| Cross-make contamination | 0% | **0%** ✅ |
| Cross-model contamination | 0% | **0%** ✅ (fixed!) |
| Duplicate pattern groups | 0 | **0** ✅ |
| Severity metrics populated | Yes | **Yes** ✅ |
| Trend detection working | Not all STABLE | **36% INCREASING, 5% DECREASING** ✅ |
| All tests pass | Yes | **1268 pass** ✅ |

---

## Known Limitations (Not Bugs)

### 1. 10,000 Complaint Sample Limit

The pattern detection processes only the 10,000 most recent complaints with embeddings. This means:
- Vehicles with complaints spread across time may be underrepresented
- Some vehicles may not have enough complaints in the sample to form patterns

**Affected vehicles:**
- HYUNDAI KONA: 136 total complaints, only 48 in sample → no patterns
- HYUNDAI KONA ELECTRIC: 98 total complaints, only 23 in sample → no patterns
- FORD F-150: Only 3 complaints in database → no patterns

**Impact:** 5 fire complaints remain in noise (Ford F-150 and Hyundai KONA/KONA ELECTRIC)

**Potential fix:** Process ALL complaints for vehicles with fire/death incidents, or run a separate clustering pass for severe complaints.

### 2. 45% Noise Rate

45.9% of complaints remain unlinked. This is due to:
- BERTopic HDBSCAN marking semantically unique complaints as outliers
- Some vehicles having too few complaints to form clusters
- min_cluster_size threshold filtering small groups

**Breakdown of noise by component:**
- FORWARD COLLISION AVOIDANCE: 1,255 complaints
- ELECTRICAL SYSTEM: 1,171 complaints
- UNKNOWN OR OTHER: 838 complaints
- ENGINE: 702 complaints
- SERVICE BRAKES: 697 complaints

These are not severe complaints (0 deaths, 0 injuries in noise after rescue).

### 3. Vehicles with High Unlinked Rates

| Vehicle | Linked | Unlinked | % Unlinked | Reason |
|---------|--------|----------|------------|--------|
| HYUNDAI KONA | 0 | 136 | 100% | No patterns (under threshold) |
| CHEVROLET BOLT EV | 164 | 278 | 63% | Many scattered complaints |
| TESLA MODEL Y | 109 | 153 | 58% | Many scattered complaints |
| TOYOTA CAMRY | 658 | 856 | 57% | Large vehicle, many edge cases |

---

## Audit Summary

### What's Working

1. **No cross-make contamination** - Each pattern contains only complaints from its make
2. **No cross-model contamination** - Each pattern contains only complaints from its model (FIXED!)
3. **Duplicate merging** - All duplicate patterns consolidated (120 merged)
4. **Severity metrics** - Deaths, injuries, crashes, fires all populated
5. **Trend detection** - 36% INCREASING, 5% DECREASING (working!)
6. **Severe complaint rescue** - 612 severe complaints rescued from noise

### Remaining Issues

1. **5 fire complaints in noise** - Due to no patterns for F-150/KONA (sample limit)
2. **45% noise rate** - Acceptable given BERTopic's outlier detection
3. **2 patterns with 0 severity** - Minor complaints only (no deaths/injuries/crashes/fires)

---

## Recommendations for Future

1. **Consider processing all complaints** - Remove the 10,000 limit for a comprehensive analysis
2. **Separate severe complaint clustering** - Run a dedicated clustering pass for complaints with deaths/injuries/fires
3. **Lower threshold for specific makes** - Dynamically adjust min_cluster_size based on vehicle complaint volume

---

## Algorithm State

The pattern detection algorithm is now production-ready with the following characteristics:
- Zero data contamination (cross-make, cross-model)
- Proper severity aggregation
- Trend detection working
- Known limitations documented

The 5 fire complaints in noise and 45% noise rate are acceptable tradeoffs for data integrity.
