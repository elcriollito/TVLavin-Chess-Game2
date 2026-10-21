import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8000';
const output = fileURLToPath(new URL('../docs/opening-trainer/screenshots/', import.meta.url));

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function prepare(page) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.setItem('caissa.opening-trainer.engine-enabled', 'true');
        localStorage.removeItem('caissa.opening-trainer.repertoires.v1');
    });
    await page.goto(`${baseUrl}/opening-trainer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await prepare(desktop);
await desktop.locator('#trainerTabWikibook').click();
await desktop.locator('#trainerWikiAuto').uncheck();
await desktop.locator('#trainerWikiReturn').click();
await desktop.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']));
await desktop.locator('#trainerEngineDepth').filter({ hasText: 'Depth' }).waitFor({ timeout: 30_000 });
await desktop.locator('#trainerToast').waitFor({ state: 'hidden', timeout: 10_000 });
await desktop.screenshot({ path: path.join(output, 'analysis-desktop.png'), fullPage: false });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await prepare(mobile);
await mobile.locator('.caissa-board__square[data-square="e2"]').click();
await mobile.locator('.caissa-board__square[data-square="e4"]').click();
await mobile.locator('#trainerTabWikibook[aria-selected="true"]').waitFor({ timeout: 30_000 });
await mobile.locator('#trainerWikiAttribution').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.screenshot({ path: path.join(output, 'wikibook-mobile.png'), fullPage: false });

await mobile.locator('#trainerWikiReturn').click();
await mobile.locator('.caissa-board__square[data-square="e7"]').click();
await mobile.locator('.caissa-board__square[data-square="e5"]').click();
await mobile.locator('#trainerTabGames').click();
await mobile.locator('.opening-trainer-game').first().waitFor({ timeout: 30_000 });
await mobile.locator('.opening-trainer-game').first().getByRole('button', { name: 'Load game' }).click();
await mobile.locator('#trainerGameNotationStatus').waitFor({ state: 'visible', timeout: 30_000 });
await mobile.locator('#trainerToast').waitFor({ state: 'hidden', timeout: 10_000 });
const mobileGeometry = await mobile.evaluate(() => ({
    viewport: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    scrollX,
    regions: ['.opening-trainer-page', '.opening-trainer-shell', '.opening-trainer-workspace',
        '.opening-trainer-workspace__body', '#trainerPanelGames', '.opening-trainer-notation-card',
        '#trainerGameNotation'].map(selector => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return { selector, left: rect?.left, right: rect?.right, width: rect?.width,
            clientWidth: element?.clientWidth, scrollWidth: element?.scrollWidth, scrollLeft: element?.scrollLeft };
    })
}));
if (mobileGeometry.documentWidth > mobileGeometry.viewport || mobileGeometry.scrollX !== 0
    || mobileGeometry.regions.some(region => region.left < -0.5 || region.right > mobileGeometry.viewport + 0.5)) {
    throw new Error(`Mobile horizontal overflow: ${JSON.stringify(mobileGeometry)}`);
}
await mobile.screenshot({ path: path.join(output, 'games-mobile.png'), fullPage: false });

await browser.close();
