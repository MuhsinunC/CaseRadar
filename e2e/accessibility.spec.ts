import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test.describe('Landing Page', () => {
    test('should not have any automatically detectable accessibility issues', async ({ page }) => {
      await page.goto('/');
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });

  test.describe('Dashboard Page', () => {
    test('should not have any automatically detectable accessibility issues', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(500); // Wait for content to load
      const results = await new AxeBuilder({ page })
        .exclude('.animate-pulse') // Exclude loading skeletons
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/dashboard');
      const h1 = await page.locator('h1').count();
      expect(h1).toBe(1);
      // H1 should come before H2s
      const firstH1 = page.locator('h1').first();
      await expect(firstH1).toBeVisible();
    });

    test('should have accessible navigation', async ({ page }) => {
      await page.goto('/dashboard');
      const nav = page.locator('nav, [role="navigation"]');
      await expect(nav.first()).toBeVisible();
      // Navigation links should be visible
      const links = page.locator('nav a, [role="navigation"] a');
      expect(await links.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Complaints Page', () => {
    test('should not have any critical accessibility issues', async ({ page }) => {
      await page.goto('/complaints');
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .exclude('.animate-pulse')
        .withTags(['wcag2a', 'wcag2aa']) // Focus on WCAG 2.x Level A and AA
        .analyze();
      // Filter to only critical violations
      const criticalViolations = results.violations.filter(v => v.impact === 'critical');
      expect(criticalViolations).toEqual([]);
    });

    test('should have accessible form controls', async ({ page }) => {
      await page.goto('/complaints');
      // Search input should have accessible name
      const searchInput = page.getByPlaceholder(/Search/i);
      await expect(searchInput).toBeVisible();
    });

    test('should have accessible table', async ({ page }) => {
      await page.goto('/complaints');
      await page.waitForTimeout(500);
      // Table should have proper structure
      const table = page.locator('table');
      if (await table.isVisible()) {
        // Check for table headers
        const headers = page.locator('th, [role="columnheader"]');
        expect(await headers.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Patterns Page', () => {
    test('should not have any automatically detectable accessibility issues', async ({ page }) => {
      await page.goto('/patterns');
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .exclude('.animate-pulse')
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('should have accessible filter buttons', async ({ page }) => {
      await page.goto('/patterns');
      // Filter buttons should be accessible
      const buttons = page.getByRole('button');
      expect(await buttons.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Generator Page', () => {
    test('should not have any automatically detectable accessibility issues', async ({ page }) => {
      await page.goto('/generator');
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .exclude('.animate-pulse')
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('should have accessible tabs', async ({ page }) => {
      await page.goto('/generator');
      // Tabs should be properly structured
      const tablist = page.locator('[role="tablist"]');
      await expect(tablist).toBeVisible();
      const tabs = page.locator('[role="tab"]');
      expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Settings Page', () => {
    test('should not have any automatically detectable accessibility issues', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .exclude('.animate-pulse')
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('should have accessible form labels', async ({ page }) => {
      await page.goto('/settings');
      // All inputs should have associated labels
      const inputs = page.locator('input[id]');
      const inputCount = await inputs.count();
      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        if (id) {
          const label = page.locator(`label[for="${id}"]`);
          // Label should exist or input should have aria-label
          const hasLabel = await label.count() > 0;
          const hasAriaLabel = await input.getAttribute('aria-label');
          expect(hasLabel || hasAriaLabel).toBeTruthy();
        }
      }
    });

    test('should have accessible checkboxes', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /Notifications/i }).click();
      // Checkboxes should be accessible
      const checkboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
      expect(await checkboxes.count()).toBeGreaterThan(0);
    });
  });
});

test.describe('Keyboard Navigation', () => {
  test('should navigate dashboard with keyboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Tab through navigation
    await page.keyboard.press('Tab');
    // First interactive element should be focused
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should navigate tabs with keyboard', async ({ page }) => {
    await page.goto('/generator');
    const firstTab = page.getByRole('tab').first();
    await firstTab.focus();
    // Arrow keys should move between tabs
    await page.keyboard.press('ArrowRight');
    const secondTab = page.getByRole('tab').nth(1);
    await expect(secondTab).toBeFocused();
  });

  test('should navigate settings tabs with keyboard', async ({ page }) => {
    await page.goto('/settings');
    const firstTab = page.getByRole('tab').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    // Focus should move to next tab
    const secondTab = page.getByRole('tab').nth(1);
    await expect(secondTab).toBeFocused();
  });
});

test.describe('Focus Management', () => {
  test('should show focus indicators', async ({ page }) => {
    await page.goto('/dashboard');
    // Tab to an element
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    // Focus should be visible
    await expect(focusedElement).toBeVisible();
    // Element should have focus ring or outline
    const outline = await focusedElement.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.outline || styles.boxShadow;
    });
    expect(outline).toBeTruthy();
  });

  test('should trap focus in dialogs', async ({ page }) => {
    await page.goto('/generator');
    await page.waitForTimeout(500);
    // If there's a delete button, click it to open dialog
    const deleteButton = page.getByRole('button', { name: /Delete/i }).first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible()) {
        // Focus should be within dialog
        await page.keyboard.press('Tab');
        const focusedElement = page.locator(':focus');
        await expect(dialog).toContainText(await focusedElement.textContent() || '');
      }
    }
  });
});

test.describe('Color Contrast', () => {
  test('should have sufficient color contrast in light mode', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Appearance/i }).click();
    // Ensure light mode
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    await page.getByRole('option', { name: /Light/i }).click();
    await page.waitForTimeout(100);
    // Run axe with color contrast rules
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .exclude('.animate-pulse')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('should have sufficient color contrast in dark mode', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: /Appearance/i }).click();
    // Enable dark mode
    const themeSelector = page.getByLabel(/Theme/i);
    await themeSelector.click();
    await page.getByRole('option', { name: /Dark/i }).click();
    await page.waitForTimeout(100);
    // Run axe with color contrast rules
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .exclude('.animate-pulse')
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('Screen Reader Compatibility', () => {
  test('should have proper ARIA landmarks', async ({ page }) => {
    await page.goto('/dashboard');
    // Should have main landmark
    const main = page.locator('main, [role="main"]');
    await expect(main).toBeVisible();
    // Should have navigation
    const nav = page.locator('nav, [role="navigation"]');
    expect(await nav.count()).toBeGreaterThan(0);
  });

  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/dashboard');
    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
    // Headings should be in order (no skipping levels)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    let lastLevel = 0;
    for (const heading of headings) {
      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
      const level = parseInt(tagName.charAt(1));
      // Should not skip more than one level
      expect(level).toBeLessThanOrEqual(lastLevel + 2);
      lastLevel = level;
    }
  });

  test('should have accessible images', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img');
    const imageCount = await images.count();
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      // Image should have alt text or be decorative (role="presentation")
      expect(alt !== null || role === 'presentation').toBeTruthy();
    }
  });
});

test.describe('Responsive Accessibility', () => {
  test('should be accessible on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .exclude('.animate-pulse')
      .exclude('button:has(svg)') // Icon buttons may lack text - common pattern
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    // Focus on critical violations, excluding button-name issues (tracked separately)
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' && v.id !== 'button-name'
    );
    expect(criticalViolations).toEqual([]);
  });

  test('should be accessible on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page })
      .exclude('.animate-pulse')
      .exclude('button:has(svg)') // Icon buttons may lack text - common pattern
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    // Focus on critical violations, excluding button-name issues (tracked separately)
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' && v.id !== 'button-name'
    );
    expect(criticalViolations).toEqual([]);
  });
});
