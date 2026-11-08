import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.env.OPENING_DB_CAPTURE_URL || 'http://127.0.0.1:8000/opening-database';
const outputDir = resolve('docs/reports/opening-database-v2-evidence');
const viewports = [
  { name: 'phone-360x800', width: 360, height: 800 },
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1920x1080', width: 1920, height: 1080 }
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.route('**/api/public-auth-config', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publishableKey: '' })
    }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('#openingDbBoard .board-b72b1').waitFor({ state: 'visible' });
    await page.locator('#odbStatsBody [data-move-index]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.screenshot({
      path: resolve(outputDir, `candidate-${viewport.name}.png`),
      fullPage: false
    });
    if (viewport.name === 'desktop-1440x900') {
      await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
      await page.screenshot({
        path: resolve(outputDir, 'candidate-desktop-1440x900-analysis.png'),
        fullPage: false
      });
      await page.getByRole('tab', { name: 'Games', exact: true }).click();
      await page.screenshot({
        path: resolve(outputDir, 'candidate-desktop-1440x900-games.png'),
        fullPage: false
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
