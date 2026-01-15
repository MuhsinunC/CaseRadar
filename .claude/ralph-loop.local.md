ultrathink: NHTSA Full Historical Data Sync System - TDD Implementation

# Ralph Loop Configuration
iteration: 0
max_iterations: 500
completion_promise: NHTSA_FULL_SYNC_COMPLETE

## Objective
Implement a comprehensive NHTSA data fetching system that:
1. Fetches ALL 2.1+ million historical complaints from NHTSA
2. Keeps the database continuously updated with fresh data
3. Is thoroughly tested with both programmatic and browser tests

## Critical Context
- **Current state**: Only ~17,000 complaints in database
- **Target state**: 2,165,676+ complaints (full NHTSA history since 1995)
- **Data source**: NHTSA flat file at https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip (~1.5GB)
- **Secondary source**: SODA API at https://data.transportation.gov/resource/jhit-z9cc.json (for incremental syncs)
- **Worktree**: /Users/user/Documents/Muhsinun/Projects/GitHub/CaseRadar/CaseRadar-nhtsa-full-sync
- **Branch**: feature/nhtsa-full-historical-sync

## TDD Approach - MANDATORY
This implementation MUST follow Test-Driven Development:
1. **Red**: Write failing tests FIRST (before any implementation)
2. **Green**: Write minimal code to make tests pass
3. **Refactor**: Clean up code while keeping tests green

### Test Categories Required
1. **Unit Tests** (Vitest) - `npm run test`
   - Flat file parser tests
   - Incremental sync logic tests
   - Data validation tests
   - Rate limiting tests
   - Error handling tests

2. **Integration Tests** (Vitest)
   - Database insertion tests
   - Deduplication tests
   - Batch processing tests

3. **E2E Tests** (Playwright) - `npm run test:e2e`
   - Admin dashboard shows sync status
   - Manual sync trigger works
   - Complaint count updates after sync
   - Sync progress is visible

## Implementation Requirements

### Phase 1: Historical Bulk Import (Flat File)
Create a new system to import ALL historical data from NHTSA's flat file:

1. **Flat File Downloader** (`src/lib/nhtsa/flat-file-downloader.ts`)
   - Download https://static.nhtsa.gov/odi/ffdd/cmpl/FLAT_CMPL.zip
   - Stream download (don't load full 1.5GB into memory)
   - Store in temp directory
   - Validate file integrity

2. **Flat File Parser** (`src/lib/nhtsa/flat-file-parser.ts`)
   - Parse tab-delimited format
   - Stream processing (handle 2.1M+ records)
   - Field mapping to our schema
   - Data validation and sanitization

3. **Bulk Import Service** (`src/lib/nhtsa/bulk-import.ts`)
   - Batch inserts (1000 records at a time)
   - Progress tracking
   - Resume capability (track last imported record)
   - Embedding generation (optional, can be backfilled)

4. **Import API Endpoint** (`src/app/api/nhtsa/import/route.ts`)
   - POST /api/nhtsa/import - trigger bulk import
   - GET /api/nhtsa/import/status - get import progress
   - Protected by admin authentication

### Phase 2: Incremental Sync (Keep Database Fresh)
Enhance existing sync to catch new complaints:

1. **Enhanced Sync Service** (modify `src/lib/nhtsa/sync.ts`)
   - Compare local vs remote count
   - Fetch only new records (by date)
   - Handle API rate limits gracefully
   - Retry logic for failures

2. **Scheduled Sync** (modify `src/app/api/cron/sync-nhtsa/route.ts`)
   - Run every 6 hours (existing)
   - Track sync history
   - Alert on failures

### Phase 3: Monitoring & Admin UI
1. **Sync Dashboard Component** (`src/components/admin/sync-dashboard.tsx`)
   - Total complaints count
   - Last sync time
   - Sync history
   - Manual trigger button
   - Progress bar for bulk imports

2. **Sync Status API** (`src/app/api/nhtsa/sync/status/route.ts`)
   - GET endpoint for sync statistics
   - Import progress if running

## Flat File Format Reference
The NHTSA FLAT_CMPL.txt is TAB-delimited with these fields (in order):
1. CMPLID - Unique complaint ID (maps to nhtsaId)
2. ODESSION - ODI investigation number
3. MFR_NAME - Manufacturer name
4. MAKETXT - Vehicle make
5. MODELTXT - Vehicle model
6. YEARTXT - Model year
7. CRASH - Y/N
8. FAILDATE - Date of failure (YYYYMMDD)
9. FIRE - Y/N
10. INJURED - Number injured
11. DEATHS - Number of deaths
12. COMPDESC - Component description
13. CITY - City
14. STATE - State
15. VIN - Partial VIN
16. DATEA - Date added (YYYYMMDD)
17. LDATE - Last update date
18. CDESCR - Complaint description (the main text)
... (additional fields for internal NHTSA use)

## Success Criteria
- [ ] All unit tests pass (`npm run test`)
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] Bulk import completes for full flat file
- [ ] Database contains 2M+ complaints after import
- [ ] Incremental sync works (fetches new complaints)
- [ ] Admin can monitor sync status in UI
- [ ] No memory issues during import (streaming)
- [ ] Import can be resumed if interrupted
- [ ] Rate limiting respects NHTSA API limits

## Iteration Log
Track progress here after each iteration.

### Iteration 0 (Initial)
- Status: Starting TDD implementation
- Next: Write failing tests for flat file parser

## Anti-Patterns to Avoid
1. Writing implementation before tests
2. Loading entire 1.5GB file into memory
3. Ignoring rate limits on NHTSA APIs
4. Not handling duplicates properly
5. Skipping browser/E2E tests
6. Making database schema changes without migrations
7. Not tracking import progress for resume capability

## Commands Reference
```bash
# Navigate to worktree
cd /Users/user/Documents/Muhsinun/Projects/GitHub/CaseRadar/CaseRadar-nhtsa-full-sync

# Install dependencies
npm install

# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Run specific test file
npm run test -- src/lib/nhtsa/__tests__/flat-file-parser.test.ts

# Run tests in watch mode
npm run test -- --watch

# Check TypeScript types
npm run typecheck

# Start dev server (for E2E tests)
npm run dev
```

## File Structure to Create
```
src/lib/nhtsa/
├── __tests__/
│   ├── flat-file-parser.test.ts      # Unit tests for parser
│   ├── flat-file-downloader.test.ts  # Unit tests for downloader
│   ├── bulk-import.test.ts           # Unit tests for import service
│   └── sync.test.ts                  # Enhanced sync tests
├── flat-file-parser.ts               # Parser implementation
├── flat-file-downloader.ts           # Downloader implementation
├── bulk-import.ts                    # Bulk import service
├── client.ts                         # (existing)
├── sync.ts                           # (enhance existing)
└── types.ts                          # (add new types)

src/app/api/nhtsa/
├── import/
│   └── route.ts                      # POST to trigger import
├── import/status/
│   └── route.ts                      # GET import progress
└── sync/status/
    └── route.ts                      # GET sync statistics

e2e/
└── sync-dashboard.spec.ts            # E2E tests for admin sync UI

src/components/admin/
└── sync-dashboard.tsx                # Admin sync dashboard component
```

## Completion Conditions
When ALL of the following are true, output `<promise>NHTSA_FULL_SYNC_COMPLETE</promise>`:
1. All unit tests pass (new tests for bulk import + existing tests)
2. All E2E tests pass (including new sync status tests)
3. Bulk import tested with real flat file
4. Incremental sync working
5. Admin UI shows sync status
6. Documentation updated
7. No TypeScript errors
8. Code reviewed and clean

## Browser Testing Requirements
E2E tests MUST verify:
1. Navigate to admin sync dashboard
2. See current complaint count
3. See last sync timestamp
4. Trigger manual sync and see progress
5. See sync complete with updated count
6. No console errors during operations
