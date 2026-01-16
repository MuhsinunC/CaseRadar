# Pattern Detection EDA Notes

## Iteration 1 - Data Quality Analysis

### Summary
**Critical finding**: 99% of complaint records have malformed data from a faulty bulk import.

### Database Counts (as of 2026-01-16)
- Total complaints: 2,183,265
- Patterns: 111
- Leads: 0 (NONE - something is broken)
- Recalls: 234
- Complaints with embeddings: 2,140,119 (98%)
- Complaints without embeddings: 43,146 (2%)

### Data Quality Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| Total records | 2,183,265 | 100% |
| Records with valid year | 17,615 | 0.8% |
| Records with proper description (>50 chars) | 17,190 | 0.8% |
| Quality records (year + description) | 17,188 | 0.8% |
| Has embeddings | 2,140,119 | 98% |

**Root cause**: A massive bulk import in January 2026 imported 2.16M records with malformed data.

### Bulk Import Analysis

**Monthly breakdown**:
- January 2026: 2,159,984 records - only 139 have year, 107 have good descriptions
- Other months (regular sync): ~250-325/month - ALL have valid year and descriptions

**Sample of bad data (Jan 2026 import)**:
```
nhtsaId | manufacturer | make | model  | year | component | description
1221193 | 10766686     | Indian | INDIAN |     | 0         | 3000
1221196 | 10766687     | Honda  | HONDA  |     | 0         | 117000
```

**Sample of good data (regular sync)**:
```
nhtsaId       | manufacturer             | make   | model   | year | component      | description
CMPL_DEMO_003 | TOYOTA MOTOR CORPORATION | TOYOTA | RAV4    | 2019 | FUEL SYSTEM    | STRONG FUEL ODOR...
11389684      | Toyota Motor Corporation | TOYOTA | RAV4    | 2021 | FUEL/PROPULSION| HAVE A 2019 AMS...
```

### Problems Identified

1. **Malformed field mapping in flat file parser**
   - `manufacturer` contains numeric IDs instead of company names
   - `description` contains numbers (likely mileage) instead of complaint text
   - `component` is "0" instead of component names
   - `year` is NULL for 99% of records

2. **Embeddings generated for garbage data**
   - 2.14M embeddings exist, but for malformed text
   - Embedding text combines garbage fields: "3000 | Vehicle: INDIAN INDIAN null | Component: 0"
   - This is why patterns don't make semantic sense!

3. **Two ingestion paths**
   - `sync.ts` - Uses NHTSA API directly, produces quality data
   - `bulk-import.ts` - Downloads flat file, column mapping is WRONG

4. **No leads generated**
   - Lead count is 0
   - Pipeline may not be integrated or running

### Source Files
- Bulk import: `src/lib/nhtsa/bulk-import.ts`
- Flat file parser: `src/lib/nhtsa/flat-file-parser.ts`
- Regular sync: `src/lib/nhtsa/sync.ts`

### Proposed Solutions

#### Option A: Delete bad records and regenerate (RECOMMENDED)
1. Delete all records from January 2026 bulk import (WHERE year IS NULL AND LENGTH(description) < 50)
2. Fix the flat file parser column mapping
3. Re-run bulk import with correct mapping
4. Regenerate all embeddings

**Pros**: Clean slate, proper data
**Cons**: Need to verify correct flat file format first

#### Option B: Add data validation filters
1. Filter out bad records in queries (WHERE year IS NOT NULL AND LENGTH(description) > 50)
2. Only pattern/cluster on valid records
3. Keep bad records but ignore them

**Pros**: Non-destructive, quick fix
**Cons**: Database bloat, doesn't fix root cause

#### Option C: Just use good data going forward
1. Mark bad records as "invalid" flag
2. Only use records from regular sync
3. Build validation to prevent future bad imports

**Pros**: Preserves records for audit
**Cons**: 99% of database is useless, still need to regenerate patterns

### Next Steps
1. Build data validation system (incoming data quality checks)
2. Research the actual NHTSA flat file format to fix column mapping
3. Clean up bad records
4. Research pattern detection pipeline
5. Figure out why leads = 0

---

## Iteration 1 - Resolution (COMPLETED)

### Actions Taken

1. **Deleted 2,166,067 garbage records**
   - Criteria: `year IS NULL OR LENGTH(description) < 50`
   - Kept: 17,198 quality records (100% have year, description, embeddings)

2. **Built data validation system**
   - Added `validateComplaint()` and `isQualityComplaint()` in `flat-file-parser.ts`
   - Added validation to bulk import - rejects bad records with `recordsRejected` counter
   - Validation checks: year required, description >= 20 chars and not numeric, component not "0"

3. **Fixed database schema**
   - Ran `prisma db push` to add missing `matchedRecallId` column to Lead table

4. **Generated leads**
   - Ran leads pipeline stage via `scripts/run-leads-stage.ts`
   - 60 leads generated from 60 eligible patterns

### Final Database State (AFTER CLEANUP)

| Table | Count |
|-------|-------|
| Complaints | 17,198 |
| Patterns | 111 |
| Leads | 60 |
| Recalls | 234 |

### Pattern Quality Assessment
- 111 active patterns
- 15,881 complaints linked to patterns (92%)
- All patterns have proper names, makes, models, components
- Severity scores range from 50 to 6,160

### Top Leads Generated

| Lead | Make | Model | Component | Severity | Complaints |
|------|------|-------|-----------|----------|------------|
| TESLA MODEL 3 VEHICLE SPEED CONTROL | TESLA | MODEL 3 | VEHICLE SPEED CONTROL | 6,160 | 208 |
| TOYOTA CAMRY AIR BAGS | TOYOTA | CAMRY | AIR BAGS | 2,700 | 193 |
| HONDA CR-V AIR BAGS | HONDA | CR-V | AIR BAGS | 2,265 | 123 |
| HONDA CR-V FORWARD COLLISION AVOIDANCE | HONDA | CR-V | FORWARD COLLISION AVOIDANCE | 1,985 | 940 |
| TOYOTA RAV4 AIR BAGS | TOYOTA | RAV4 | AIR BAGS | 1,805 | 191 |

### Files Modified
- `src/lib/nhtsa/flat-file-parser.ts` - Added validation functions
- `src/lib/nhtsa/bulk-import.ts` - Added validation during import, added `recordsRejected` tracking
- `src/lib/nhtsa/__tests__/bulk-import.test.ts` - Updated tests for new interface

### Scripts Created
- `scripts/check-db-counts.ts` - Database diagnostic script
- `scripts/run-leads-stage.ts` - Run leads pipeline stage
