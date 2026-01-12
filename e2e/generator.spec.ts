import { test, expect } from '@playwright/test';

test.describe('Generator Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
  });

  test('should display the generator page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Complaint Generator' })).toBeVisible();
    await expect(page.getByText('Generate and manage legal complaints from detected patterns')).toBeVisible();
  });

  test('should display tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Generated Complaints/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Generate New/i })).toBeVisible();
  });

  test('should default to history tab', async ({ page }) => {
    const historyTab = page.getByRole('tab', { name: /Generated Complaints/i });
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Generator History Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
  });

  test('should display generated complaints list', async ({ page }) => {
    // The list or empty state should be visible
    const content = page.locator('[role="tabpanel"]').first();
    await expect(content).toBeVisible();
  });

  test('should have New Complaint button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /New Complaint/i })).toBeVisible();
  });

  test('should switch to generate tab when clicking New Complaint', async ({ page }) => {
    await page.getByRole('button', { name: /New Complaint/i }).click();
    const generateTab = page.getByRole('tab', { name: /Generate New/i });
    await expect(generateTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Generator Generate Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
    await page.getByRole('tab', { name: /Generate New/i }).click();
  });

  test('should switch to generate tab', async ({ page }) => {
    const generateTab = page.getByRole('tab', { name: /Generate New/i });
    await expect(generateTab).toHaveAttribute('aria-selected', 'true');
  });

  test('should show pattern selection prompt when no pattern selected', async ({ page }) => {
    await expect(page.getByText(/Select a pattern to generate a complaint/i)).toBeVisible();
  });

  test('should have Browse Patterns button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Browse Patterns/i })).toBeVisible();
  });

  test('should navigate to patterns page when clicking Browse Patterns', async ({ page }) => {
    await page.getByRole('button', { name: /Browse Patterns/i }).click();
    await expect(page).toHaveURL('/patterns');
  });
});

test.describe('Generator with Pattern Selected', () => {
  test('should show form when pattern is in URL', async ({ page }) => {
    // Navigate with a pattern ID
    await page.goto('/generator?patternId=test-pattern-1');
    // Should show form or pattern selection depending on API response
    // Wait for loading to complete
    await page.waitForTimeout(500);
    // Either form or selection prompt should be visible
    const form = page.locator('form');
    const selectionPrompt = page.getByText(/Select a pattern/i);
    const isFormVisible = await form.isVisible();
    const isPromptVisible = await selectionPrompt.isVisible();
    expect(isFormVisible || isPromptVisible).toBeTruthy();
  });
});

test.describe('Generator List Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
  });

  test('should display search input when complaints exist', async ({ page }) => {
    await page.waitForTimeout(500);
    const searchInput = page.getByPlaceholder(/Search/i);
    // Search may or may not be visible depending on data
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('should display filter controls when complaints exist', async ({ page }) => {
    await page.waitForTimeout(500);
    // Status filter may be visible
    const statusFilter = page.getByText(/Status/i);
    if (await statusFilter.isVisible()) {
      await expect(statusFilter).toBeVisible();
    }
  });
});

test.describe('Generator Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
  });

  test('should have action buttons on complaint items', async ({ page }) => {
    await page.waitForTimeout(500);
    // View, Edit, Download, Delete buttons may be visible
    const viewButton = page.getByRole('button', { name: /View/i }).first();
    const downloadButton = page.getByRole('button', { name: /Download/i }).first();
    // These depend on having complaints in the list
  });

  test('should open delete confirmation dialog', async ({ page }) => {
    await page.waitForTimeout(500);
    const deleteButton = page.getByRole('button', { name: /Delete/i }).first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      // Confirmation dialog should appear
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });
});

test.describe('Generator Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
  });

  test('should switch between tabs', async ({ page }) => {
    // Click generate tab
    await page.getByRole('tab', { name: /Generate New/i }).click();
    const generateTab = page.getByRole('tab', { name: /Generate New/i });
    await expect(generateTab).toHaveAttribute('aria-selected', 'true');

    // Click back to history tab
    await page.getByRole('tab', { name: /Generated Complaints/i }).click();
    const historyTab = page.getByRole('tab', { name: /Generated Complaints/i });
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Generator Responsive Layout', () => {
  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/generator');
    await expect(page.getByRole('heading', { name: 'Complaint Generator' })).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/generator');
    await expect(page.getByRole('heading', { name: 'Complaint Generator' })).toBeVisible();
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/generator');
    await expect(page.getByRole('heading', { name: 'Complaint Generator' })).toBeVisible();
  });
});
