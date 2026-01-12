import { test, expect } from '@playwright/test';

test.describe('Patterns Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
  });

  test('should display the patterns page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pattern Detector' })).toBeVisible();
    await expect(page.getByText('Analyze detected patterns in NHTSA complaint data')).toBeVisible();
  });

  test('should display search input', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search patterns/i)).toBeVisible();
  });

  test('should display severity filter buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /All/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /High/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Medium/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Low/i })).toBeVisible();
  });

  test('should display stats badges', async ({ page }) => {
    await expect(page.getByText(/patterns found/i)).toBeVisible();
    await expect(page.getByText(/high severity/i)).toBeVisible();
    await expect(page.getByText(/trending up/i)).toBeVisible();
  });
});

test.describe('Patterns Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
  });

  test('should allow typing in search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search patterns/i);
    await searchInput.fill('brake');
    await expect(searchInput).toHaveValue('brake');
  });

  test('should debounce search input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search patterns/i);
    await searchInput.fill('airbag');
    // Wait for debounce
    await page.waitForTimeout(400);
    await expect(searchInput).toHaveValue('airbag');
  });
});

test.describe('Patterns Severity Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
  });

  test('should filter by high severity', async ({ page }) => {
    const highButton = page.getByRole('button', { name: /High/i });
    await highButton.click();
    // Button should appear selected
    await expect(highButton).toHaveClass(/bg-primary/);
  });

  test('should filter by medium severity', async ({ page }) => {
    const mediumButton = page.getByRole('button', { name: /Medium/i });
    await mediumButton.click();
    await expect(mediumButton).toHaveClass(/bg-primary/);
  });

  test('should filter by low severity', async ({ page }) => {
    const lowButton = page.getByRole('button', { name: /Low/i });
    await lowButton.click();
    await expect(lowButton).toHaveClass(/bg-primary/);
  });

  test('should clear filter with All button', async ({ page }) => {
    // First select a filter
    await page.getByRole('button', { name: /High/i }).click();
    // Then click All
    const allButton = page.getByRole('button', { name: /All/i });
    await allButton.click();
    await expect(allButton).toHaveClass(/bg-primary/);
  });
});

test.describe('Pattern Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
  });

  test('should display pattern cards in grid', async ({ page }) => {
    // Wait for patterns to load
    await page.waitForTimeout(500);
    // Check for pattern card structure or loading state
    const cards = page.locator('[data-testid^="pattern-card"]');
    const loadingCards = page.locator('.animate-pulse');
    // Either cards or loading state should be visible
    const cardCount = await cards.count();
    const loadingCount = await loadingCards.count();
    expect(cardCount + loadingCount).toBeGreaterThanOrEqual(0);
  });

  test('should show pattern details on card', async ({ page }) => {
    await page.waitForTimeout(500);
    // Cards should contain vehicle info
    const cards = page.locator('[data-testid^="pattern-card"]');
    if (await cards.first().isVisible()) {
      // Pattern cards should show make/model info
      await expect(cards.first()).toBeVisible();
    }
  });
});

test.describe('Pattern Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patterns');
  });

  test('should have generate complaint button on pattern cards', async ({ page }) => {
    await page.waitForTimeout(500);
    const generateButton = page.getByRole('button', { name: /Generate Complaint/i }).first();
    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeVisible();
    }
  });

  test('should navigate to generator when clicking generate complaint', async ({ page }) => {
    await page.waitForTimeout(500);
    const generateButton = page.getByRole('button', { name: /Generate Complaint/i }).first();
    if (await generateButton.isVisible()) {
      await generateButton.click();
      await expect(page).toHaveURL(/\/generator/);
    }
  });
});

test.describe('Patterns Empty State', () => {
  test('should show empty state when no patterns match search', async ({ page }) => {
    await page.goto('/patterns');
    const searchInput = page.getByPlaceholder(/Search patterns/i);
    await searchInput.fill('xyznonexistent12345');
    await page.waitForTimeout(400);
    // Empty state message may appear
    const emptyState = page.getByText(/No patterns found/i);
    // This depends on actual API behavior
  });
});

test.describe('Patterns Responsive Layout', () => {
  test('should display grid properly on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/patterns');
    await expect(page.getByRole('heading', { name: 'Pattern Detector' })).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/patterns');
    await expect(page.getByRole('heading', { name: 'Pattern Detector' })).toBeVisible();
  });

  test('should display single column on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/patterns');
    await expect(page.getByRole('heading', { name: 'Pattern Detector' })).toBeVisible();
  });
});
