# Known Issues and Limitations

This document tracks known issues, limitations, and workarounds for CaseRadar.

## Current Issues

### High Priority

#### 1. Embedding Field Not Accessible via Prisma ORM

**Status**: Known limitation
**Severity**: Medium
**Affected Component**: Pattern clustering, semantic search

**Description**: The `embedding` field in the complaints table uses pgvector's `vector(1536)` type, which Prisma marks as "Unsupported". This prevents direct access to embeddings through the Prisma client.

**Impact**:
- Pattern clustering in cron jobs cannot access embeddings
- Semantic search requires raw SQL queries

**Workaround**: Use raw SQL queries to access embeddings:
```typescript
const results = await prisma.$queryRaw`
  SELECT id, embedding::float[] as embedding
  FROM complaints
  WHERE embedding IS NOT NULL
`;
```

**Planned Fix**: Evaluate Prisma's upcoming native pgvector support or migrate to a custom database adapter.

---

#### 2. Test Coverage Below 80% Threshold

**Status**: In progress
**Severity**: Low
**Affected Component**: Test suite

**Description**: Current test coverage metrics:
- Statements: 82.5% (passing)
- Branches: 77.28% (below 80%)
- Functions: 77.04% (below 80%)
- Lines: 83.14% (passing)

**Impact**: Branch and function coverage slightly below target threshold.

**Root Cause**:
- Complex conditional logic in analysis modules
- Edge cases in document generation
- Error handling paths

**Workaround**: None needed for functionality.

**Planned Fix**: Add additional unit tests for:
- Edge cases in `src/lib/analysis/` modules
- Error paths in document generation
- Complex conditionals in API routes

---

### Medium Priority

#### 3. NHTSA API Rate Limiting

**Status**: Known limitation
**Severity**: Low
**Affected Component**: Data synchronization

**Description**: NHTSA API may rate limit requests during high-volume synchronization.

**Impact**: Initial data sync may take longer than expected.

**Workaround**:
- Sync includes exponential backoff retry logic
- Initial sync batches requests with delays
- Monitor logs for rate limit errors

**Planned Fix**: Implement request queue with configurable rate limiting.

---

#### 4. Document Generation Memory Usage

**Status**: Monitoring
**Severity**: Low
**Affected Component**: Document generation API

**Description**: Generating documents for patterns with >1000 complaints may consume significant memory.

**Impact**: Potential timeout on serverless functions for very large patterns.

**Workaround**:
- Split large patterns into sub-reports
- Use pagination when selecting complaints for documents
- Set `maxDuration` in API routes

**Planned Fix**: Implement streaming document generation for large patterns.

---

### Low Priority

#### 5. Safari File Download Naming

**Status**: Known browser limitation
**Severity**: Low
**Affected Component**: Document download

**Description**: Safari may not respect the suggested filename for downloaded documents.

**Impact**: Downloaded files may have generic names.

**Workaround**: Users can rename files after download.

**Planned Fix**: Implement Safari-specific download handling.

---

#### 6. Dark Mode Inconsistencies

**Status**: Known cosmetic issue
**Severity**: Low
**Affected Component**: UI theming

**Description**: Some third-party components may not fully respect dark mode settings.

**Impact**: Minor visual inconsistencies in dark mode.

**Workaround**: Use light mode for consistent appearance.

**Planned Fix**: Add CSS overrides for third-party component dark mode support.

---

## Limitations

### Platform Limitations

| Limitation | Description | Impact |
|------------|-------------|--------|
| Serverless Timeout | Vercel functions timeout at 5 minutes | Large batch operations may need splitting |
| Database Connections | Serverless connection pooling limits | High concurrency may queue requests |
| File Size | Document uploads limited to 10MB | Large attachments need external storage |
| API Rate Limits | 100 requests/minute per user | Heavy automation needs throttling |

### Feature Limitations

| Feature | Limitation | Workaround |
|---------|------------|------------|
| Semantic Search | Requires OpenAI API | Configure embedding model in settings |
| Pattern Clustering | Memory-intensive for >10k complaints | Filter by date range |
| Document Generation | Template customization limited | Use DOCX export and modify |
| Alerts | Max 25 alerts per user (Professional) | Consolidate alert criteria |

### Browser Support

| Browser | Support Level | Notes |
|---------|--------------|-------|
| Chrome 90+ | Full | Recommended |
| Firefox 90+ | Full | - |
| Safari 14+ | Full | Minor download issues |
| Edge 90+ | Full | - |
| IE 11 | Not Supported | - |

### Mobile Support

| Platform | Support Level | Notes |
|----------|--------------|-------|
| iOS Safari | Full | Responsive design |
| Android Chrome | Full | Responsive design |
| Tablet | Full | Optimized layout |

---

## Reporting Issues

### How to Report

1. Check this document for known issues
2. Search existing GitHub issues
3. If new, create issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/OS information
   - Screenshots if applicable

### Issue Template

```markdown
## Description
[Clear description of the issue]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [...]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- Browser: [e.g., Chrome 120]
- OS: [e.g., macOS 14.0]
- Account Type: [Free/Professional/Enterprise]

## Additional Context
[Screenshots, error messages, etc.]
```

### Priority Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| Critical | System down, data loss risk | 1 hour |
| High | Major feature broken | 4 hours |
| Medium | Feature degraded | 24 hours |
| Low | Minor issue, workaround exists | 1 week |

---

## Recently Fixed

### Version 1.0.0 (Current)

| Issue | Description | Fixed In |
|-------|-------------|----------|
| Prisma AuditLog nullable fields | Type errors with auth events | Phase 14 |
| Cron route function names | Import path mismatches | Phase 15 |
| Database field names | dateReceived → dateAdded | Phase 15 |

---

## Upcoming Improvements

| Improvement | Target | Status |
|-------------|--------|--------|
| Native pgvector support | v1.1 | Researching |
| Streaming document generation | v1.1 | Planned |
| Enhanced dark mode | v1.1 | Planned |
| Mobile app | v2.0 | Backlog |

---

*Last Updated: January 2026*
