# UX Gaps Analysis - CaseRadar Dashboard

**Date:** 2026-01-15
**Purpose:** Document all UX gaps identified through browser investigation

---

## 1. Complaints Page Issues

### 1.1 BUG: Empty Description Column
**Severity:** Critical
**Location:** `/src/app/api/complaints/route.ts` lines 160-172

**Problem:** The description column in the complaints table always shows empty because the API doesn't include `description` in the select clause.

**Root Cause:**
```typescript
select: {
  id: true,
  nhtsaId: true,
  make: true,
  model: true,
  year: true,
  component: true,
  crash: true,
  fire: true,
  injuries: true,
  deaths: true,
  createdAt: true,  // Wrong field!
  // MISSING: description: true,
  // MISSING: dateAdded: true,
}
```

**Fix Required:** Add `description: true` and `dateAdded: true` to the select clause.

### 1.2 BUG: N/A Date Column
**Severity:** High
**Location:** Same API endpoint

**Problem:** Date column shows "N/A" because API returns `createdAt` but table expects `dateAdded`.

**Fix Required:** Add `dateAdded: true` to select clause and map it correctly.

### 1.3 Missing: Click-to-Expand Complaint Details
**Severity:** High
**Location:** `/src/components/complaints/complaint-detail-dialog.tsx`

**Problem:** The dialog component exists and is wired up, but clicking a row doesn't show full details because the API doesn't return the required data.

**Current State:**
- `complaint-detail-dialog.tsx` exists and is properly designed
- `handleRowClick` in page.tsx correctly opens the dialog
- But the complaint object passed to the dialog has empty description

**Fix Required:** Once API returns full data, the dialog should work.

### 1.4 Missing: Filter by Make/Model/Component
**Severity:** Medium
**Current Filters:** General text search only

**Required Filters:**
- Make dropdown (with search)
- Model dropdown (filtered by selected make)
- Component dropdown
- Year range slider
- Severity filters (crash, fire, injuries, deaths)

---

## 2. Patterns Page Issues

### 2.1 Missing: Make/Model/Component Filters
**Severity:** High
**Location:** `/src/app/(dashboard)/patterns/page.tsx`

**Current State:**
- Only has search text input
- Severity checkboxes (deaths, injuries, crashes, fires)
- No make/model/component filters

**Required Filters:**
- Make dropdown
- Model dropdown (filtered by make)
- Component dropdown
- Trend filter (INCREASING, STABLE, DECREASING)

### 2.2 Missing: Sort Options
**Severity:** Medium

**Current State:** Sorted by severity score only

**Required Sort Options:**
- Severity score (default)
- Complaint count
- Death count
- Recent activity
- Trend (INCREASING first)

### 2.3 Missing: Expandable Complaints in Pattern Detail
**Severity:** High
**Location:** `/src/components/patterns/pattern-detail-dialog.tsx`

**Current State:**
- PatternDetailDialog shows list of linked complaints
- Complaints show make, model, year, component, but NOT expandable
- Cannot view full complaint description or details

**Required:**
- Each complaint row should be clickable
- Opens complaint detail dialog with full information
- Shows description, full NHTSA data, severity flags

---

## 3. Leads Page Issues

### 3.1 Missing: Make/Model/Component Filters
**Severity:** High
**Location:** `/src/app/(dashboard)/leads/page.tsx`

**Current Filters:**
- Min severity score
- Min complaint count
- Semantic match threshold

**Required Filters:**
- Make dropdown
- Model dropdown (filtered by make)
- Component dropdown
- Trend filter

### 3.2 Missing: Click Through to Pattern Detail
**Severity:** High

**Current State:**
- LeadCard shows basic pattern info
- No way to click into the pattern and see all complaints
- No way to see pattern severity breakdown

**Required:**
- "View Pattern" button or clickable card
- Opens pattern detail dialog
- Shows all linked complaints

### 3.3 Missing: Click Through to Complaints
**Severity:** High

**Current State:**
- Cannot see individual complaints for a lead
- Cannot drill down to investigate specific issues

**Required:**
- View complaints list for the lead's pattern(s)
- Each complaint expandable to full detail

---

## 4. Cross-Cutting Issues

### 4.1 No Hierarchical Navigation
**Severity:** Critical

**Problem:** Users cannot follow the natural investigation path:
```
Lead → Pattern → Complaint
```

**Current State:**
- Pages are siloed
- No way to navigate from leads to patterns to complaints
- Must manually search/filter on each page separately

**Required:**
- From Leads page: Click lead → See pattern(s) → Click pattern → See complaints → Click complaint → See full detail
- Breadcrumb navigation when drilling down
- Back navigation to return to previous level

### 4.2 Inconsistent Filtering UI
**Severity:** Medium

**Problem:** Each page has different filter UI patterns.

**Required:**
- Consistent filter sidebar or header on all pages
- Same make/model/component dropdowns everywhere
- Reusable filter components

### 4.3 No URL State for Filters
**Severity:** Medium

**Problem:** Filters don't persist in URL, can't share filtered views.

**Required:**
- Filter state in URL query params
- Shareable URLs for specific filtered views

---

## 5. Summary of Required Changes

### Critical (Must Fix)
1. Fix complaints API to return `description` and `dateAdded`
2. Enable complaint detail expansion on all pages
3. Add hierarchical navigation Lead → Pattern → Complaint

### High Priority
4. Add make/model/component filters to all pages
5. Make complaints clickable in pattern detail dialog
6. Add pattern detail view to leads page

### Medium Priority
7. Add sort options to patterns page
8. Consistent filter UI across pages
9. URL state for filters

### Low Priority
10. Year range slider
11. Export functionality
12. Bulk actions

---

## 6. Files to Modify

| File | Changes Needed |
|------|----------------|
| `src/app/api/complaints/route.ts` | Add description, dateAdded to select |
| `src/app/(dashboard)/complaints/page.tsx` | Add filter dropdowns |
| `src/app/(dashboard)/patterns/page.tsx` | Add filter dropdowns, sort options |
| `src/app/(dashboard)/leads/page.tsx` | Add filter dropdowns, pattern detail |
| `src/components/complaints/complaint-table.tsx` | Verify row click works |
| `src/components/patterns/pattern-detail-dialog.tsx` | Make complaints clickable |
| `src/components/leads/lead-card.tsx` | Add view pattern button |
| NEW: `src/components/shared/filter-sidebar.tsx` | Reusable filters |
| NEW: `src/hooks/use-filter-state.ts` | URL-synced filter state |
