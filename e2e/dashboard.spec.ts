import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display the dashboard page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Overview of your CaseRadar analytics')).toBeVisible();
  });

  test('should display stats cards', async ({ page }) => {
    // Should have stats cards section
    await expect(page.getByText('Total Complaints')).toBeVisible();
    await expect(page.getByText('Active Patterns')).toBeVisible();
    await expect(page.getByText('Generated Complaints')).toBeVisible();
    await expect(page.getByText('High Severity')).toBeVisible();
  });

  test('should display activity feed', async ({ page }) => {
    await expect(page.getByText('Recent Activity')).toBeVisible();
  });

  test('should display alerts panel', async ({ page }) => {
    // CardTitle is a div, not heading - look for Alerts text in card title
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: 'Alerts' })).toBeVisible();
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should have sidebar navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Complaints' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Patterns' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Generator' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('should navigate to complaints page', async ({ page }) => {
    await page.getByRole('link', { name: 'Complaints' }).click();
    await expect(page).toHaveURL('/complaints');
    await expect(page.getByRole('heading', { name: 'Complaints Explorer' })).toBeVisible();
  });

  test('should navigate to patterns page', async ({ page }) => {
    await page.getByRole('link', { name: 'Patterns' }).click();
    await expect(page).toHaveURL('/patterns');
    await expect(page.getByRole('heading', { name: 'Pattern Detector' })).toBeVisible();
  });

  test('should navigate to generator page', async ({ page }) => {
    await page.getByRole('link', { name: 'Generator' }).click();
    await expect(page).toHaveURL('/generator');
    await expect(page.getByRole('heading', { name: 'Complaint Generator' })).toBeVisible();
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should highlight active navigation item', async ({ page }) => {
    // Dashboard link should be highlighted
    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toHaveClass(/bg-primary/);
  });
});

test.describe('Dashboard Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should show mobile menu button', async ({ page }) => {
    await page.goto('/dashboard');
    // Mobile menu button should be visible
    const menuButton = page.locator('button').filter({ has: page.locator('[data-lucide="menu"]') }).or(
      page.getByRole('button').filter({ hasText: '' }).first()
    );
    await expect(menuButton.first()).toBeVisible();
  });

  test('should open sidebar on mobile', async ({ page }) => {
    await page.goto('/dashboard');
    // Click mobile menu button
    const menuButton = page.locator('header button').first();
    await menuButton.click();
    // Sidebar should become visible
    await expect(page.getByRole('link', { name: 'Complaints' })).toBeVisible();
  });
});

test.describe('Dashboard Responsive Layout', () => {
  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard');
    // Sidebar should be visible
    await expect(page.getByText('CaseRadar').first()).toBeVisible();
    // Content should be visible
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
