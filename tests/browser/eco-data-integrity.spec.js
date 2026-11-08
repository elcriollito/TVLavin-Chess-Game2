import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expected = {
  E45: ['Nimzo-Indian Defense: St. Petersburg Variation, Fischer Variation', 'rn1qk2r/p1pp1ppp/bp2pn2/8/1bPP4/2N1P3/PP2NPPP/R1BQKB1R w KQkq - 2 6'],
  E46: ['Nimzo-Indian Defense: Normal Variation', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQ - 1 5'],
  E47: ['Nimzo-Indian Defense: Normal Variation', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2NBP3/PP3PPP/R1BQK1NR b KQ - 2 5'],
  E48: ['Nimzo-Indian Defense: Normal Variation, Classical Defense', 'rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2NBP3/PP3PPP/R1BQK1NR w KQ - 0 6'],
  E49: ['Nimzo-Indian Defense: Normal Variation, Botvinnik System', 'rnbq1rk1/ppp2ppp/4pn2/3p4/2PP4/P1PBP3/5PPP/R1BQK1NR b KQ - 0 7'],
  E50: ['Nimzo-Indian Defense', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1PN2/PP3PPP/R1BQKB1R b KQ - 2 5'],
  E51: ['Nimzo-Indian Defense: Normal Variation, Ragozin Variation', 'rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6'],
  E52: ['Nimzo-Indian Defense: Normal Variation, Schlechter Defense', 'rnbq1rk1/p1p2ppp/1p2pn2/3p4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7'],
  E53: ['Nimzo-Indian Defense: Normal Variation, Gligoric System', 'rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7'],
  E54: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Exchange Variation', 'rnbq1rk1/pp3ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 b - - 0 8'],
  E55: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bronstein Variation', 'r1bq1rk1/pp1n1ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 1 9'],
  E56: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense', 'r1bq1rk1/pp3ppp/2n1pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 2 8'],
  E57: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense', 'r1bq1rk1/pp3ppp/2n1pn2/8/1bBp4/P1N1PN2/1P3PPP/R1BQ1RK1 w - - 0 10']
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://caissa-game-fetcher.elcriollito.workers.dev/**', route => route.abort('internetdisconnected'));
});

test('E45-E57 direct routes render verified identity, moves, positions, and honest availability', async ({ page }) => {
  const theoryRequests = [];
  page.on('request', request => {
    if (/\/data\/openings\/eco\/E\d{2}\.json/.test(request.url())) theoryRequests.push(request.url());
  });

  for (const [code, [name, fen]] of Object.entries(expected)) {
    await page.goto(`/eco/${code}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ecoDetailTitle')).toHaveText(`${code} - ${name}`);
    await expect(page.locator('#ecoDetailMoves')).toContainText('Defining moves: d4 Nf6 c4 e6 Nc3 Bb4');
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-position-state', 'verified');
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', fen);
    await expect(page.locator('#ecoMiniBoard .eco-sq')).toHaveCount(64);
    await expect(page.locator('#ecoDetailTheory')).toHaveAttribute('data-theory-state', 'unavailable');
    await expect(page.locator('#ecoDetailTheory')).toContainText('Verified theory is not available');
    await expect(page.locator('#ecoStatsStatus')).toHaveAttribute('data-stats-state', 'unavailable');
    await expect(page.locator('#ecoStatGames')).toHaveText('Unavailable');
    await expect(page.locator('#ecoDetailPanel')).toBeVisible();
  }

  expect(theoryRequests).toEqual([]);
});

test('search crosses the active volume and same-code variation labels are preserved', async ({ page }) => {
  await page.goto('/eco', { waitUntil: 'domcontentloaded' });
  await page.locator('#ecoSearch').fill('E55');
  await expect(page.locator('#ecoList [data-code="E55"]')).toContainText('Bronstein Variation');
  await page.locator('#ecoSearch').fill('E46');
  await page.locator('#ecoList [data-code="E46"]').click();
  await expect(page.locator('#ecoDetailRelated')).toContainText('Reshevsky Variation');
  await expect(page.locator('#ecoDetailRelated')).toContainText('Simagin Variation');
});

test('offline cloud book cannot erase valid local identity, board, or consistent local statistics', async ({ page }) => {
  await page.goto('/eco/E44', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ecoDetailTitle')).toHaveText('E44 - Nimzo-Indian Defense');
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-position-state', 'verified');
  await expect(page.locator('#ecoStatGames')).toHaveText('2748');
  await expect(page.locator('#ecoStatsStatus')).toHaveAttribute('data-stats-state', 'available');
  await expect(page.locator('#ecoStatBookWeight')).toHaveText('Unavailable');
  await expect(page.locator('#ecoDetailTitle')).toHaveText('E44 - Nimzo-Indian Defense');
  await expect(page.locator('#ecoStatGames')).toHaveText('2748');
});

test('rapid selection cancels stale async work and leaves the final opening authoritative', async ({ page }) => {
  await page.goto('/eco', { waitUntil: 'domcontentloaded' });
  await page.locator('#ecoSearch').fill('E45');
  await page.locator('#ecoList [data-code="E45"]').click();
  await page.locator('#ecoSearch').fill('E57');
  await page.locator('#ecoList [data-code="E57"]').click();
  await expect(page).toHaveURL(/\/eco\/E57$/);
  await expect(page.locator('#ecoDetailTitle')).toHaveText(`E57 - ${expected.E57[0]}`);
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', expected.E57[1]);
  await expect(page.locator('#ecoStatGames')).toHaveText('Unavailable');
  await expect(page.locator('#ecoDetailTheory')).toHaveAttribute('data-theory-state', 'unavailable');
});

test('legacy routes permanently land on canonical ECO URLs', async ({ page }) => {
  const databaseResponse = await page.goto('/database', { waitUntil: 'domcontentloaded' });
  expect(databaseResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/eco$/);

  const detailResponse = await page.goto('/database/eco/e55?source=legacy', { waitUntil: 'domcontentloaded' });
  expect(detailResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/eco\/E55\?source=legacy$/);
  await expect(page.locator('#ecoDetailTitle')).toContainText('Bronstein Variation');
});

test('ECO detail stays usable on the configured viewport with no serious accessibility violations', async ({ page }) => {
  await page.goto('/eco/E54', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ecoMiniBoard .eco-sq')).toHaveCount(64);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  const results = await new AxeBuilder({ page }).include('#ecoDetailPanel').analyze();
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
