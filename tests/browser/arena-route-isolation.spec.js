import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const PLAY_ROUTES = ['/play', '/play/games', '/play/bots', '/play/coach'];
const FALSE_TOAST = 'An error occurred while processing your request.';

async function simulateProductionPlayAssets(page) {
  await page.route(/\/play(?:\/(?:games|bots|coach))?(?:\?.*)?$/, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /\s*<script src="js\/arena-runtime-manager\.js[^>]*><\/script>/,
      ''
    );
    await route.fulfill({ response, body });
  });
}

async function captureArenaLeakSignals(page) {
  const pageErrors = [];
  const arenaConsoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (text.includes('ArenaRuntimeManager is required')) {
      arenaConsoleErrors.push(text);
    }
  });
  await page.addInitScript((falseToast) => {
    window.__arenaRouteIsolation = { initCalls: 0, unhandled: [], falseToasts: [] };
    Object.defineProperty(window, 'CaissaArena', {
      configurable: true,
      set(arena) {
        const init = arena.init;
        arena.init = function (...args) {
          window.__arenaRouteIsolation.initCalls += 1;
          return init.apply(this, args);
        };
        Object.defineProperty(window, 'CaissaArena', {
          configurable: true,
          writable: true,
          value: arena
        });
      }
    });
    window.addEventListener('unhandledrejection', event => {
      window.__arenaRouteIsolation.unhandled.push(String(event.reason?.message || event.reason));
    });
    document.addEventListener('DOMContentLoaded', () => {
      const observer = new MutationObserver(() => {
        const notification = document.getElementById('notification');
        if (notification?.textContent === falseToast) {
          window.__arenaRouteIsolation.falseToasts.push(notification.textContent);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }, FALSE_TOAST);
  return { pageErrors, arenaConsoleErrors };
}

for (const route of PLAY_ROUTES) {
  test(`${route} stays isolated when ArenaRuntimeManager is absent`, async ({ page }) => {
    await instrumentPlay(page);
    await simulateProductionPlayAssets(page);
    const signals = await captureArenaLeakSignals(page);

    await page.goto(route);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.App?.board))).toBe(true);
    await page.waitForTimeout(100);

    const browserSignals = await page.evaluate(() => ({
      initCalls: window.__arenaRouteIsolation.initCalls,
      runtimeManagerLoaded: typeof window.ArenaRuntimeManager === 'function',
      unhandled: window.__arenaRouteIsolation.unhandled,
      falseToasts: window.__arenaRouteIsolation.falseToasts,
      falseToastVisible: document.getElementById('notification')?.textContent
        === 'An error occurred while processing your request.'
    }));
    expect(browserSignals).toEqual({
      initCalls: 0,
      runtimeManagerLoaded: false,
      unhandled: [],
      falseToasts: [],
      falseToastVisible: false
    });
    expect(signals.pageErrors.filter(message => message.includes('ArenaRuntimeManager'))).toEqual([]);
    expect(signals.arenaConsoleErrors).toEqual([]);

    const playControl = route.endsWith('/bots')
      ? '[data-bot-primary]'
      : route.endsWith('/coach')
        ? '[data-coach-primary]'
        : '[data-games-primary]';
    await page.locator(playControl).click();
    await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
  });
}

test('/arena retains its runtime manager and Match/Tournament/Game navigation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  const signals = await captureArenaLeakSignals(page);

  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(() => page.evaluate(() => Boolean(
    typeof window.ArenaRuntimeManager === 'function'
      && window.CaissaArena?.runtimeManager instanceof window.ArenaRuntimeManager
      && window.CaissaArena?.state?.boardMounted
  ))).toBe(true);
  expect(await page.evaluate(() => window.__arenaRouteIsolation.initCalls)).toBe(1);
  expect(signals.pageErrors.filter(message => message.includes('ArenaRuntimeManager'))).toEqual([]);
  expect(await page.evaluate(() => window.__arenaRouteIsolation.unhandled
    .filter(message => message.includes('ArenaRuntimeManager')))).toEqual([]);

  for (const id of ['arenaTabMatch', 'arenaTabTournament', 'arenaTabGame']) {
    const tab = page.locator(`#${id}`);
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
});
