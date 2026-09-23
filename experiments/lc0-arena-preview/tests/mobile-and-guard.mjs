// Opt-in protected preview browser guard; no user session or relay row is created.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

if (process.env.EAE013_GUARD_PREVIEW !== '1' || !process.env.EAE013_BYPASS)
  throw new Error('EAE013_GUARD_CREDENTIAL_REQUIRED');
const MAIN = process.env.EAE013_MAIN_ORIGIN || 'https://eae013-main-elcriollitos-projects.vercel.app';
const browser = await chromium.launch({ headless: true,
  ...(process.env.EAE015B_BROWSER_CHANNEL ? { channel: process.env.EAE015B_BROWSER_CHANNEL } : {}) });
const results = [];
try {
  for (const { width, height, route, expectedLc0 } of [
    { width: 390, height: 844, route: '/arena-preview', expectedLc0: false },
    { width: 844, height: 390, route: '/arena-preview', expectedLc0: false },
    { width: 1440, height: 900, route: '/arena-preview', expectedLc0: true },
    { width: 1440, height: 900, route: '/arena', expectedLc0: false }
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await context.route(url => url.href.startsWith(`${MAIN}/`),
      request => request.continue({ headers: { ...request.request().headers(),
        'x-vercel-protection-bypass': process.env.EAE013_BYPASS } }));
    const page = await context.newPage();
    assert.equal((await page.goto(`${MAIN}${route}`, { waitUntil: 'domcontentloaded' })).status(), 200);
    await page.waitForFunction(() => Boolean(window.EngineRegistry && window.CaissaArena?.runtimeManager),
      null, { timeout: 20_000 });
    const result = await page.evaluate(() => ({
      providerIds: window.EngineRegistry.listArenaProviders().map(p => p.id),
      selectIds: Array.from(document.querySelectorAll('#arenaWhiteEngine option')).map(p => p.value),
      lc0Registered: Boolean(window.EngineRegistry.getArenaProvider('lc0-maia-1100-preview')),
      lc0Visible: Boolean(document.querySelector('#arenaWhiteEngine option[value="lc0-maia-1100-preview"]')),
      sf19: window.EngineRegistry.getArenaProvider('stockfish-19-lite')?.enabled,
      sf18: window.EngineRegistry.getArenaProvider('stockfish-18-lite')?.enabled
    }));
    assert.equal(result.lc0Registered, expectedLc0);
    assert.equal(result.lc0Visible, expectedLc0);
    assert.equal(result.sf19, true);
    assert.equal(result.sf18, true);
    results.push({ width, height, route, lc0Registered: result.lc0Registered,
      stockfish18: result.sf18, stockfish19: result.sf19 });
    await context.close();
  }
  console.log(`EAE013_MOBILE_GUARDS ${JSON.stringify(results)}`);
} finally {
  await browser.close();
}
