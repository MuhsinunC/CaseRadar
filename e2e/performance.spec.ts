/**
 * Performance Baseline Tests
 * Measures page load times and identifies performance bottlenecks
 */
import { test, expect } from '@playwright/test';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  pageLoad: 3000,        // Max time for full page load
  domContentLoaded: 2000, // Max time for DOM ready
  firstPaint: 1500,       // Max time for first paint
  apiResponse: 1000,      // Max time for API responses
  navigation: 2000,       // Max time for navigation between pages
};

interface PerformanceMetrics {
  url: string;
  domContentLoaded: number;
  loadComplete: number;
  firstPaint: number | null;
  firstContentfulPaint: number | null;
  resourceCount: number;
  slowResources: Array<{ name: string; duration: number; type: string }>;
}

async function measurePagePerformance(page: any, url: string): Promise<PerformanceMetrics> {
  const startTime = Date.now();

  // Navigate and wait for load
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });

  // Wait for any dynamic content
  await page.waitForTimeout(1000);

  // Get performance metrics
  const metrics = await page.evaluate(() => {
    const perfEntries = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    const slowResources = resourceEntries
      .filter(r => r.duration > 500)
      .map(r => ({
        name: r.name.split('/').pop() || r.name,
        duration: Math.round(r.duration),
        type: r.initiatorType
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    return {
      domContentLoaded: Math.round(perfEntries?.domContentLoadedEventEnd || 0),
      loadComplete: Math.round(perfEntries?.loadEventEnd || 0),
      firstPaint: paintEntries.find(p => p.name === 'first-paint')?.startTime || null,
      firstContentfulPaint: paintEntries.find(p => p.name === 'first-contentful-paint')?.startTime || null,
      resourceCount: resourceEntries.length,
      slowResources
    };
  });

  return {
    url,
    ...metrics
  };
}

test.describe('Performance Baseline Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test('Dashboard page load performance', async ({ page }) => {
    const metrics = await measurePagePerformance(page, '/dashboard');

    console.log('Dashboard Performance:', JSON.stringify(metrics, null, 2));

    expect(metrics.loadComplete, `Dashboard load time ${metrics.loadComplete}ms exceeds threshold`).toBeLessThan(THRESHOLDS.pageLoad);
    expect(metrics.domContentLoaded, `Dashboard DOM ready ${metrics.domContentLoaded}ms exceeds threshold`).toBeLessThan(THRESHOLDS.domContentLoaded);

    if (metrics.slowResources.length > 0) {
      console.log('Slow resources:', metrics.slowResources);
    }
  });

  test('Complaints page load performance', async ({ page }) => {
    const metrics = await measurePagePerformance(page, '/complaints');

    console.log('Complaints Performance:', JSON.stringify(metrics, null, 2));

    expect(metrics.loadComplete, `Complaints load time ${metrics.loadComplete}ms exceeds threshold`).toBeLessThan(THRESHOLDS.pageLoad);
    expect(metrics.domContentLoaded, `Complaints DOM ready ${metrics.domContentLoaded}ms exceeds threshold`).toBeLessThan(THRESHOLDS.domContentLoaded);
  });

  test('Patterns page load performance', async ({ page }) => {
    const metrics = await measurePagePerformance(page, '/patterns');

    console.log('Patterns Performance:', JSON.stringify(metrics, null, 2));

    expect(metrics.loadComplete, `Patterns load time ${metrics.loadComplete}ms exceeds threshold`).toBeLessThan(THRESHOLDS.pageLoad);
    expect(metrics.domContentLoaded, `Patterns DOM ready ${metrics.domContentLoaded}ms exceeds threshold`).toBeLessThan(THRESHOLDS.domContentLoaded);
  });

  test('Settings page load performance', async ({ page }) => {
    const metrics = await measurePagePerformance(page, '/settings');

    console.log('Settings Performance:', JSON.stringify(metrics, null, 2));

    expect(metrics.loadComplete, `Settings load time ${metrics.loadComplete}ms exceeds threshold`).toBeLessThan(THRESHOLDS.pageLoad);
    expect(metrics.domContentLoaded, `Settings DOM ready ${metrics.domContentLoaded}ms exceeds threshold`).toBeLessThan(THRESHOLDS.domContentLoaded);
  });

  test.skip('Navigation performance between pages', async ({ page }) => {
    // Skip this test - requires authentication which is not set up in Playwright
    // Start at dashboard
    await page.goto('/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const navigationTimes: Record<string, number> = {};

    // Navigate to Complaints
    let startTime = Date.now();
    await page.click('text=Complaints');
    await page.waitForURL('**/complaints', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    navigationTimes['Dashboard -> Complaints'] = Date.now() - startTime;

    // Navigate to Patterns
    startTime = Date.now();
    await page.click('text=Patterns');
    await page.waitForURL('**/patterns', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    navigationTimes['Complaints -> Patterns'] = Date.now() - startTime;

    // Navigate to Settings
    startTime = Date.now();
    await page.click('text=Settings');
    await page.waitForURL('**/settings', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    navigationTimes['Patterns -> Settings'] = Date.now() - startTime;

    // Navigate back to Dashboard
    startTime = Date.now();
    await page.click('text=Dashboard');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    navigationTimes['Settings -> Dashboard'] = Date.now() - startTime;

    console.log('Navigation Times:', JSON.stringify(navigationTimes, null, 2));

    // Check all navigations are within threshold
    for (const [nav, time] of Object.entries(navigationTimes)) {
      expect(time, `${nav} took ${time}ms, exceeds threshold`).toBeLessThan(THRESHOLDS.navigation);
    }
  });

  test.skip('Data loading performance on Complaints page', async ({ page }) => {
    // Skip this test - requires authentication which is not set up in Playwright
    // Monitor network requests
    const apiCalls: Array<{ url: string; duration: number; status: number }> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('/_next/data/')) {
        const timing = response.request().timing();
        apiCalls.push({
          url: url.split('?')[0].split('/').slice(-2).join('/'),
          duration: Math.round(timing.responseEnd - timing.requestStart),
          status: response.status()
        });
      }
    });

    await page.goto('/complaints', { waitUntil: 'networkidle' });

    // Wait for data to load
    await page.waitForTimeout(2000);

    console.log('API Calls:', JSON.stringify(apiCalls, null, 2));

    // Check for slow API calls
    const slowAPIs = apiCalls.filter(api => api.duration > THRESHOLDS.apiResponse);
    if (slowAPIs.length > 0) {
      console.log('SLOW API CALLS:', slowAPIs);
    }

    expect(slowAPIs.length, `Found ${slowAPIs.length} slow API calls`).toBe(0);
  });

  test.skip('Interaction responsiveness', async ({ page }) => {
    // Skip this test - requires authentication which is not set up in Playwright
    await page.goto('/complaints', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const interactionTimes: Record<string, number> = {};

    // Test search input responsiveness
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      let startTime = Date.now();
      await searchInput.fill('test');
      interactionTimes['Search input'] = Date.now() - startTime;
    }

    // Test filter button click
    const filterButton = page.locator('button:has-text("Crash"), button:has-text("Fire")').first();
    if (await filterButton.isVisible()) {
      let startTime = Date.now();
      await filterButton.click();
      await page.waitForTimeout(100);
      interactionTimes['Filter button'] = Date.now() - startTime;
    }

    console.log('Interaction Times:', JSON.stringify(interactionTimes, null, 2));

    // Interactions should be fast (< 500ms)
    for (const [interaction, time] of Object.entries(interactionTimes)) {
      expect(time, `${interaction} took ${time}ms`).toBeLessThan(500);
    }
  });
});

test.describe('Memory and Resource Usage', () => {
  test('Check for memory leaks during navigation', async ({ page }) => {
    const memorySnapshots: number[] = [];

    // Navigate through pages multiple times
    const pages = ['/dashboard', '/complaints', '/patterns', '/settings'];

    for (let i = 0; i < 3; i++) {
      for (const url of pages) {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Get JS heap size if available
        const memory = await page.evaluate(() => {
          // @ts-ignore
          return (performance as any).memory?.usedJSHeapSize || 0;
        });

        if (memory > 0) {
          memorySnapshots.push(memory);
        }
      }
    }

    if (memorySnapshots.length > 0) {
      console.log('Memory snapshots (bytes):', memorySnapshots);

      // Check if memory is growing significantly (> 50% increase)
      const firstHalf = memorySnapshots.slice(0, memorySnapshots.length / 2);
      const secondHalf = memorySnapshots.slice(memorySnapshots.length / 2);

      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const growthPercent = ((avgSecond - avgFirst) / avgFirst) * 100;
      console.log(`Memory growth: ${growthPercent.toFixed(1)}%`);

      expect(growthPercent, 'Memory growing too fast - possible leak').toBeLessThan(50);
    }
  });
});
