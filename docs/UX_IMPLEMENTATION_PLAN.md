# UX Implementation Plan - CaseRadar Dashboard

**Date:** 2026-01-15
**Objective:** Fix all UX gaps identified in the analysis

---

## Phase 1: Fix Critical Bugs (Complaints API)

### Task 1.1: Fix Complaints API Select Clause
**File:** `src/app/api/complaints/route.ts`
**Checklist:**
- [ ] Add `description: true` to select clause
- [ ] Add `dateAdded: true` to select clause
- [ ] Update the response mapping if needed
- [ ] Test that description column now shows data
- [ ] Test that date column shows correct dates

### Task 1.2: Verify Complaint Detail Dialog Works
**Files:**
- `src/components/complaints/complaint-detail-dialog.tsx`
- `src/app/(dashboard)/complaints/page.tsx`

**Checklist:**
- [ ] Verify dialog opens on row click
- [ ] Verify description shows in dialog
- [ ] Verify all complaint fields display correctly
- [ ] Test with various complaint types (with/without crashes, fires, etc.)

---

## Phase 2: Create Shared Filter Components

### Task 2.1: Create Reusable Filter Hooks
**File:** `src/hooks/use-vehicle-filters.ts` (NEW)

**Checklist:**
- [ ] Create hook for make/model/component filter state
- [ ] Fetch available makes from API or derive from data
- [ ] Filter models by selected make
- [ ] Persist filter state in URL query params
- [ ] Export filter state and setter functions

### Task 2.2: Create Filter Dropdown Components
**File:** `src/components/shared/filter-dropdowns.tsx` (NEW)

**Checklist:**
- [ ] Create MakeFilter dropdown with search
- [ ] Create ModelFilter dropdown (filtered by make)
- [ ] Create ComponentFilter dropdown
- [ ] Create TrendFilter dropdown (INCREASING, STABLE, DECREASING)
- [ ] Style consistently with existing UI
- [ ] Support multi-select where appropriate

### Task 2.3: Create API Endpoint for Filter Options
**File:** `src/app/api/filters/route.ts` (NEW)

**Checklist:**
- [ ] Return unique makes from complaints table
- [ ] Return models grouped by make
- [ ] Return unique components
- [ ] Cache results for performance

---

## Phase 3: Update Complaints Page

### Task 3.1: Add Filter UI to Complaints Page
**File:** `src/app/(dashboard)/complaints/page.tsx`

**Checklist:**
- [ ] Add filter dropdowns above table (make, model, component)
- [ ] Add year range filter
- [ ] Add severity checkboxes (crash, fire, injuries, deaths)
- [ ] Connect filters to API query params
- [ ] Update API call to include filter params
- [ ] Test filtering works correctly

### Task 3.2: Update Complaints API for Filtering
**File:** `src/app/api/complaints/route.ts`

**Checklist:**
- [ ] Accept make, model, component query params
- [ ] Accept year range params
- [ ] Accept severity filter params
- [ ] Update where clause to include filters
- [ ] Test filtered queries return correct results

---

## Phase 4: Update Patterns Page

### Task 4.1: Add Filter UI to Patterns Page
**File:** `src/app/(dashboard)/patterns/page.tsx`

**Checklist:**
- [ ] Add filter dropdowns (make, model, component, trend)
- [ ] Keep existing severity checkboxes
- [ ] Add sort dropdown (severity, complaints, deaths, trend)
- [ ] Connect to client-side filtering or API
- [ ] Test filtering works correctly

### Task 4.2: Make Complaints Clickable in Pattern Detail
**File:** `src/components/patterns/pattern-detail-dialog.tsx`

**Checklist:**
- [ ] Make each complaint row clickable
- [ ] Open complaint detail dialog on click
- [ ] Pass full complaint data to dialog
- [ ] Add "View Details" button to each row
- [ ] Test navigation works

### Task 4.3: Add Complaint Detail Dialog to Pattern Page
**File:** `src/app/(dashboard)/patterns/page.tsx`

**Checklist:**
- [ ] Import ComplaintDetailDialog
- [ ] Add state for selected complaint
- [ ] Pass complaint selection handler to PatternDetailDialog
- [ ] Wire up dialog opening/closing
- [ ] Test complete flow: Pattern → Pattern Detail → Complaint Detail

---

## Phase 5: Update Leads Page

### Task 5.1: Add Filter UI to Leads Page
**File:** `src/app/(dashboard)/leads/page.tsx`

**Checklist:**
- [ ] Add filter dropdowns (make, model, component, trend)
- [ ] Keep existing severity/count filters
- [ ] Connect to filtering logic
- [ ] Test filtering works correctly

### Task 5.2: Add Pattern Detail View to Leads
**File:** `src/components/leads/lead-card.tsx`

**Checklist:**
- [ ] Add "View Pattern" button to lead card
- [ ] Open pattern detail dialog on click
- [ ] Pass pattern ID to fetch full pattern data
- [ ] Show pattern detail with all linked complaints

### Task 5.3: Enable Full Drill-Down from Leads
**File:** `src/app/(dashboard)/leads/page.tsx`

**Checklist:**
- [ ] Import PatternDetailDialog and ComplaintDetailDialog
- [ ] Add state for selected pattern and complaint
- [ ] Wire up Lead → Pattern → Complaint navigation
- [ ] Test complete drill-down flow

---

## Phase 6: Add Hierarchical Navigation

### Task 6.1: Create Breadcrumb Component
**File:** `src/components/shared/breadcrumb-nav.tsx` (NEW)

**Checklist:**
- [ ] Create breadcrumb component
- [ ] Show current navigation path
- [ ] Clickable breadcrumbs to go back
- [ ] Style consistently with UI

### Task 6.2: Implement Navigation Context
**File:** `src/contexts/navigation-context.tsx` (NEW)

**Checklist:**
- [ ] Track current navigation stack
- [ ] Push/pop navigation levels
- [ ] Provide goBack function
- [ ] Integrate with dialog components

### Task 6.3: Add Breadcrumbs to Dialog Headers
**Files:**
- `src/components/patterns/pattern-detail-dialog.tsx`
- `src/components/complaints/complaint-detail-dialog.tsx`

**Checklist:**
- [ ] Add breadcrumb to dialog headers
- [ ] Show navigation path (Lead → Pattern → Complaint)
- [ ] Enable navigation between levels

---

## Phase 7: Final Testing and Polish

### Task 7.1: End-to-End Testing
**Checklist:**
- [ ] Test complaints page with all filters
- [ ] Test patterns page with all filters
- [ ] Test leads page with all filters
- [ ] Test Lead → Pattern → Complaint navigation
- [ ] Test complaint detail from all entry points
- [ ] Verify description shows everywhere
- [ ] Verify dates show correctly

### Task 7.2: Browser Verification
**Checklist:**
- [ ] Take screenshots of all pages
- [ ] Verify no empty columns
- [ ] Verify filters work visually
- [ ] Verify drill-down navigation works
- [ ] Test on different screen sizes

### Task 7.3: Unit Tests
**Checklist:**
- [ ] Add tests for filter components
- [ ] Add tests for API filtering
- [ ] Add tests for navigation context
- [ ] Verify existing tests still pass

---

## Success Criteria

All of the following must be true:
1. Description column shows data on complaints page
2. Date column shows correct dates
3. Clicking any complaint opens full detail view
4. All pages have make/model/component filters
5. Patterns page has sort options
6. Can navigate Lead → Pattern → Complaint
7. All existing tests pass
8. No regressions in pattern detection

---

## Files Created/Modified Summary

### New Files
- `src/hooks/use-vehicle-filters.ts`
- `src/components/shared/filter-dropdowns.tsx`
- `src/app/api/filters/route.ts`
- `src/components/shared/breadcrumb-nav.tsx`
- `src/contexts/navigation-context.tsx`

### Modified Files
- `src/app/api/complaints/route.ts`
- `src/app/(dashboard)/complaints/page.tsx`
- `src/app/(dashboard)/patterns/page.tsx`
- `src/app/(dashboard)/leads/page.tsx`
- `src/components/complaints/complaint-table.tsx`
- `src/components/complaints/complaint-detail-dialog.tsx`
- `src/components/patterns/pattern-detail-dialog.tsx`
- `src/components/leads/lead-card.tsx`
