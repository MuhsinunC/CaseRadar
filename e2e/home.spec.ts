import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CaseRadar/);
  });

  test('should display the main heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
