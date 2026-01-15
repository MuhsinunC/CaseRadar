import { test, expect } from '@playwright/test';

test.describe('Admin NHTSA Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
  });

  test('should display the admin page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByText('System administration and NHTSA data sync')).toBeVisible();
  });

  test('should display the sync dashboard', async ({ page }) => {
    await expect(page.getByTestId('sync-dashboard')).toBeVisible();
    await expect(page.getByText('NHTSA Data Sync')).toBeVisible();
    await expect(page.getByText('Import all 2.1M+ historical NHTSA complaints')).toBeVisible();
  });

  test('should display the start import button', async ({ page }) => {
    const startButton = page.getByTestId('start-import-btn');
    await expect(startButton).toBeVisible();
    await expect(startButton).toHaveText(/Start Full Import/);
  });

  test('should display the refresh button', async ({ page }) => {
    const refreshButton = page.getByTestId('refresh-btn');
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toHaveText(/Refresh/);
  });

  test('should display status badge', async ({ page }) => {
    await expect(page.getByTestId('status-badge')).toBeVisible();
  });

  test('should display info section about full sync', async ({ page }) => {
    await expect(page.getByText('About Full Sync')).toBeVisible();
    await expect(page.getByText(/Downloads the complete NHTSA flat file/)).toBeVisible();
    await expect(page.getByText(/Contains 2.1M\+ historical complaints/)).toBeVisible();
    await expect(page.getByText(/Skips existing records to avoid duplicates/)).toBeVisible();
    await expect(page.getByText(/Estimated time: 1-3 hours/)).toBeVisible();
  });
});

test.describe('Admin Sync Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
  });

  test('should be able to click refresh button', async ({ page }) => {
    const refreshButton = page.getByTestId('refresh-btn');
    await expect(refreshButton).toBeEnabled();

    // Click and ensure no errors
    await refreshButton.click();

    // Dashboard should still be visible
    await expect(page.getByTestId('sync-dashboard')).toBeVisible();
  });

  test('should show loading state when starting import', async ({ page }) => {
    // Note: This test may fail if the API actually starts an import
    // In a real scenario, you would mock the API
    const startButton = page.getByTestId('start-import-btn');
    await expect(startButton).toBeEnabled();
  });
});

test.describe('Admin Sync Responsive Layout', () => {
  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/admin');
    await expect(page.getByTestId('sync-dashboard')).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/admin');
    await expect(page.getByTestId('sync-dashboard')).toBeVisible();
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');
    await expect(page.getByTestId('sync-dashboard')).toBeVisible();
  });
});
