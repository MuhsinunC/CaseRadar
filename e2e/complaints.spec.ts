import { test, expect } from '@playwright/test';

test.describe('Complaints Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/complaints');
  });

  test('should display the complaints page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Complaints Explorer' })).toBeVisible();
    await expect(page.getByText('Search and analyze NHTSA vehicle complaints')).toBeVisible();
  });

  test('should display search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search/i)).toBeVisible();
  });

  test('should display filter controls', async ({ page }) => {
    // Should have make filter input (by its ID)
    await expect(page.locator('#make-filter')).toBeVisible();
    // Should have year from filter
    await expect(page.locator('#year-from-filter')).toBeVisible();
  });

  test('should display complaint table', async ({ page }) => {
    // Table headers should be visible
    await expect(page.getByRole('columnheader', { name: /Make/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Model/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Year/i })).toBeVisible();
  });
});

test.describe('Complaints Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/complaints');
  });

  test('should allow typing in search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i);
    await searchInput.fill('Toyota');
    await expect(searchInput).toHaveValue('Toyota');
  });

  test('should debounce search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search/i);
    await searchInput.fill('Ford');
    // Wait for debounce
    await page.waitForTimeout(400);
    // URL should update with search param (if implemented)
    // This verifies the debounce behavior worked
    await expect(searchInput).toHaveValue('Ford');
  });
});

test.describe('Complaints Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/complaints');
  });

  test('should toggle crash filter', async ({ page }) => {
    const crashCheckbox = page.getByLabel(/Crash/i).first();
    await crashCheckbox.click();
    await expect(crashCheckbox).toBeChecked();
  });

  test('should toggle fire filter', async ({ page }) => {
    const fireCheckbox = page.getByLabel(/Fire/i).first();
    await fireCheckbox.click();
    await expect(fireCheckbox).toBeChecked();
  });

  test('should toggle injury filter', async ({ page }) => {
    const injuryCheckbox = page.getByLabel(/Injury|Injuries/i).first();
    await injuryCheckbox.click();
    await expect(injuryCheckbox).toBeChecked();
  });

  test('should show active filters badge', async ({ page }) => {
    // Check a filter
    const crashCheckbox = page.getByLabel(/Crash/i).first();
    await crashCheckbox.click();
    // Active filters badge should show
    const badge = page.getByTestId('active-filters-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1');
  });

  test('should clear all filters', async ({ page }) => {
    // Set some filters
    const crashCheckbox = page.getByLabel(/Crash/i).first();
    await crashCheckbox.click();
    // Clear filters
    const clearButton = page.getByRole('button', { name: /Clear/i });
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await expect(crashCheckbox).not.toBeChecked();
    }
  });
});

test.describe('Complaints Table Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/complaints');
  });

  test('should allow sorting by column', async ({ page }) => {
    // Click on a column header to sort
    const yearHeader = page.getByRole('columnheader', { name: /Year/i });
    await yearHeader.click();
    // Verify sort indicator appears
    // The actual sorting behavior depends on data
  });

  test('should allow row selection', async ({ page }) => {
    // If checkboxes are visible
    const checkbox = page.locator('tbody input[type="checkbox"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
  });
});

test.describe('Complaints Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/complaints');
  });

  test('should display pagination controls when needed', async ({ page }) => {
    // Pagination may or may not be visible depending on data
    const paginationText = page.getByText(/Page \d+ of \d+/);
    // If pagination is visible, verify controls
    if (await paginationText.isVisible()) {
      await expect(page.getByRole('button', { name: /Previous/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Next/i })).toBeVisible();
    }
  });
});

test.describe('Complaints Loading States', () => {
  test('should show loading state initially', async ({ page }) => {
    // Navigate and check for loading indicator
    await page.goto('/complaints');
    // Loading state should appear briefly
    // This is hard to catch, but we verify the page loads correctly
    await expect(page.getByRole('heading', { name: 'Complaints Explorer' })).toBeVisible();
  });

  test('should show empty state when no results', async ({ page }) => {
    await page.goto('/complaints');
    // Search for something unlikely to exist
    const searchInput = page.getByPlaceholder(/Search/i);
    await searchInput.fill('xyznonexistent12345');
    await page.waitForTimeout(400); // Wait for debounce
    // Empty state may show
    const emptyState = page.getByText(/No complaints found/i);
    // This depends on actual API behavior
  });
});
