import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('should display the settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Manage your account and application preferences')).toBeVisible();
  });

  test('should display settings tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Profile/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Notifications/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /API/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Appearance/i })).toBeVisible();
  });

  test('should default to profile tab', async ({ page }) => {
    const profileTab = page.getByRole('tab', { name: /Profile/i });
    await expect(profileTab).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('Settings Profile Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('should display profile form', async ({ page }) => {
    await expect(page.getByText('Profile Settings')).toBeVisible();
  });

  test('should have name input', async ({ page }) => {
    await expect(page.getByLabel(/Full Name/i)).toBeVisible();
  });

  test('should have email input', async ({ page }) => {
    await expect(page.getByLabel(/Email/i)).toBeVisible();
  });

  test('should have organization input', async ({ page }) => {
    await expect(page.getByLabel(/Organization/i)).toBeVisible();
  });

  test('should have role selector', async ({ page }) => {
    await expect(page.getByLabel(/Role/i)).toBeVisible();
  });

  test('should have save button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Save/i }).first()).toBeVisible();
  });

  test('should allow typing in inputs', async ({ page }) => {
    const nameInput = page.getByLabel(/Full Name/i);
    await nameInput.fill('Test User');
    await expect(nameInput).toHaveValue('Test User');
  });
});

test.describe('Settings Notifications Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Notifications/i }).click();
  });

  test('should display notification preferences', async ({ page }) => {
    await expect(page.getByText('Notification Preferences')).toBeVisible();
  });

  test('should have email alerts checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Email Alerts/i)).toBeVisible();
  });

  test('should have pattern alerts checkbox', async ({ page }) => {
    await expect(page.getByLabel(/New Pattern Alerts/i)).toBeVisible();
  });

  test('should have weekly digest checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Weekly Digest/i)).toBeVisible();
  });

  test('should have critical only checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Critical Alerts Only/i)).toBeVisible();
  });

  test('should toggle checkboxes', async ({ page }) => {
    const weeklyDigest = page.getByLabel(/Weekly Digest/i);
    const isChecked = await weeklyDigest.isChecked();
    await weeklyDigest.click();
    await expect(weeklyDigest).toBeChecked({ checked: !isChecked });
  });
});

test.describe('Settings API Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /API/i }).click();
  });

  test('should display API settings', async ({ page }) => {
    await expect(page.getByText('API & Data Sync')).toBeVisible();
  });

  test('should have sync frequency selector', async ({ page }) => {
    await expect(page.getByLabel(/Sync Frequency/i)).toBeVisible();
  });

  test('should have auto-sync checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Auto-Sync/i)).toBeVisible();
  });

  test('should have sync now button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Sync Now/i })).toBeVisible();
  });

  test('should display last sync time', async ({ page }) => {
    await expect(page.getByText(/Last Sync/i)).toBeVisible();
  });
});

test.describe('Settings Appearance Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Appearance/i }).click();
  });

  test('should display appearance settings', async ({ page }) => {
    // CardTitle is a div, not a heading - look for it in the card
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: 'Appearance' })).toBeVisible();
    await expect(page.getByText('Customize the look and feel')).toBeVisible();
  });

  test('should have theme selector', async ({ page }) => {
    await expect(page.getByLabel(/Theme/i)).toBeVisible();
  });

  test('should have compact mode checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Compact Mode/i)).toBeVisible();
  });

  test('should have animations checkbox', async ({ page }) => {
    await expect(page.getByLabel(/Show Animations/i)).toBeVisible();
  });
});

test.describe('Settings Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Appearance/i }).click();
  });

  test('should switch to dark theme', async ({ page }) => {
    // Click theme selector
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    // Select dark option
    await page.getByRole('option', { name: /Dark/i }).click();
    // Wait for theme to apply
    await page.waitForTimeout(100);
    // HTML element should have dark class
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/dark/);
  });

  test('should switch to light theme', async ({ page }) => {
    // First switch to dark
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    await page.getByRole('option', { name: /Dark/i }).click();
    await page.waitForTimeout(100);
    // Then switch to light
    await themeSelector.click();
    await page.getByRole('option', { name: /Light/i }).click();
    await page.waitForTimeout(100);
    // HTML element should not have dark class
    const htmlElement = page.locator('html');
    await expect(htmlElement).not.toHaveClass(/dark/);
  });

  test('should switch to system theme', async ({ page }) => {
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    await page.getByRole('option', { name: /System/i }).click();
    // System theme follows OS preference
  });

  test('should show current theme indicator', async ({ page }) => {
    await expect(page.getByText(/Current:/i)).toBeVisible();
  });

  test('should persist theme preference', async ({ page }) => {
    // Switch to dark
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    await page.getByRole('option', { name: /Dark/i }).click();
    await page.waitForTimeout(100);
    // Reload page
    await page.reload();
    await page.getByRole('tab', { name: /Appearance/i }).click();
    // Theme should still be dark
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/dark/);
  });
});

test.describe('Settings Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('should navigate between all tabs', async ({ page }) => {
    // Profile is default
    await expect(page.getByText('Profile Settings')).toBeVisible();

    // Navigate to Notifications
    await page.getByRole('tab', { name: /Notifications/i }).click();
    await expect(page.getByText('Notification Preferences')).toBeVisible();

    // Navigate to API
    await page.getByRole('tab', { name: /API/i }).click();
    await expect(page.getByText('API & Data Sync')).toBeVisible();

    // Navigate to Appearance
    await page.getByRole('tab', { name: /Appearance/i }).click();
    await expect(page.getByText('Customize the look and feel')).toBeVisible();

    // Navigate back to Profile
    await page.getByRole('tab', { name: /Profile/i }).click();
    await expect(page.getByText('Profile Settings')).toBeVisible();
  });
});

test.describe('Settings Responsive Layout', () => {
  test('should display properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Tabs should be horizontal
    const tabList = page.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Tab labels may be hidden, showing only icons
  });
});

test.describe('Settings Save Functionality', () => {
  test('should show success message after saving profile', async ({ page }) => {
    await page.goto('/settings');
    // Fill in a field
    const nameInput = page.getByLabel(/Full Name/i);
    await nameInput.fill('Test User');
    // Click save
    await page.getByRole('button', { name: /Save/i }).first().click();
    // Success message should appear
    await expect(page.getByText(/saved successfully/i)).toBeVisible();
  });

  test('should show success message after saving notifications', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Notifications/i }).click();
    // Toggle a checkbox
    await page.getByLabel(/Weekly Digest/i).click();
    // Click save
    await page.getByRole('button', { name: /Save/i }).click();
    // Success message should appear
    await expect(page.getByText(/saved successfully/i)).toBeVisible();
  });
});
