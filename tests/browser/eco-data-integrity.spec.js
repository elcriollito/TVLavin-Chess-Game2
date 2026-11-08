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

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const expectedPlies = {
  E45: 10,
  E46: 8,
  E47: 9,
  E48: 10,
  E49: 13,
  E50: 9,
  E51: 10,
  E52: 12,
  E53: 12,
  E54: 15,
  E55: 16,
  E56: 14,
  E57: 18
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
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-code', code);
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', String(expectedPlies[code]));
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-total', String(expectedPlies[code]));
    await expect(page.locator('#ecoMiniBoard .eco-sq')).toHaveCount(64);
    await expect(page.locator('#ecoReplayStatus')).toHaveAttribute('data-replay-state', 'available');
    await expect(page.locator('#ecoReplayStatus')).toContainText(`Ply ${expectedPlies[code]} of ${expectedPlies[code]}`);
    await expect(page.locator('#ecoDetailMoves [aria-current="step"]')).toHaveCount(1);
    await expect(page.locator('[data-action="start"]')).toBeEnabled();
    await expect(page.locator('[data-action="prev"]')).toBeEnabled();
    await expect(page.locator('[data-action="next"]')).toBeDisabled();
    await expect(page.locator('[data-action="end"]')).toBeDisabled();
    await expect(page.locator('#ecoDetailTheory')).toHaveAttribute('data-theory-state', 'unavailable');
    await expect(page.locator('#ecoDetailTheory')).toContainText('Verified theory is not available');
    await expect(page.locator('#ecoStatsStatus')).toHaveAttribute('data-stats-state', 'unavailable');
    await expect(page.locator('#ecoStatGames')).toHaveText('Unavailable');
    await expect(page.locator('#ecoDetailPanel')).toBeVisible();
  }

  expect(theoryRequests).toEqual([]);
});

test('FIRST/PREV/NEXT/LAST, keyboard, flip, and rapid navigation preserve exact E45 replay state', async ({ page }) => {
  let requestsAfterLoad = 0;
  await page.goto('/eco/E45', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', '10');
  await page.waitForLoadState('networkidle');
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) requestsAfterLoad += 1;
  });

  const board = page.locator('#ecoMiniBoard');
  const firstPiece = board.locator('.eco-piece').first();
  await expect(firstPiece).toHaveAttribute('src', /bR\.png$/);
  const statsBefore = await page.locator('#ecoStatsStatus').textContent();

  await page.locator('[data-action="start"]').click();
  await expect(board).toHaveAttribute('data-fen', startFen);
  await expect(board).toHaveAttribute('data-replay-ply', '0');
  await expect(page.locator('#ecoReplayStatus')).toHaveText('Starting position — Ply 0 of 10');
  await expect(page.locator('#ecoDetailMoves [aria-current="step"]')).toHaveCount(0);
  await expect(page.locator('[data-action="start"]')).toBeDisabled();
  await expect(page.locator('[data-action="prev"]')).toBeDisabled();
  await expect(page.locator('[data-action="next"]')).toBeEnabled();
  await expect(page.locator('[data-action="end"]')).toBeEnabled();

  const next = page.locator('[data-action="next"]');
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(board).toHaveAttribute('data-replay-ply', '1');
  await expect(page.locator('#ecoReplayStatus')).toHaveText('1. d4 — Ply 1 of 10');
  await expect(page.locator('#ecoDetailMoves [aria-current="step"]')).toHaveText('d4');

  const fenBeforeFlip = await board.getAttribute('data-fen');
  await page.locator('[data-action="flip"]').click();
  await expect(board).toHaveAttribute('data-fen', fenBeforeFlip);
  await expect(board).toHaveAttribute('data-replay-ply', '1');
  await expect(firstPiece).toHaveAttribute('src', /wR\.png$/);

  await next.focus();
  await page.keyboard.press('Space');
  await expect(board).toHaveAttribute('data-replay-ply', '2');
  await page.locator('[data-action="prev"]').click();
  await expect(board).toHaveAttribute('data-replay-ply', '1');

  await page.locator('[data-action="start"]').click();
  await next.click();
  await next.click();
  await page.locator('[data-action="end"]').click();
  await page.locator('[data-action="prev"]').click();
  await expect(board).toHaveAttribute('data-replay-ply', '9');
  await expect(page.locator('#ecoReplayStatus')).toContainText('Ply 9 of 10');
  await expect(board.locator('.eco-sq')).toHaveCount(64);

  await page.locator('[data-action="end"]').click();
  await expect(board).toHaveAttribute('data-fen', expected.E45[1]);
  await expect(board).toHaveAttribute('data-replay-ply', '10');
  await expect(page.locator('#ecoStatsStatus')).toHaveText(statsBefore || '');
  expect(requestsAfterLoad).toBe(0);
});

test('E45/E57 switching and browser back/forward restore each opening at its final frame', async ({ page }) => {
  await page.goto('/eco/E45', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', '10');

  await page.locator('#ecoSearch').fill('E57');
  await page.locator('#ecoList [data-code="E57"]').click();
  await expect(page).toHaveURL(/\/eco\/E57$/);
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', expected.E57[1]);
  await expect(page.locator('#ecoReplayStatus')).toHaveText('9... cxd4 — Ply 18 of 18');

  await page.goBack();
  await expect(page).toHaveURL(/\/eco\/E45$/);
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', expected.E45[1]);
  await expect(page.locator('#ecoReplayStatus')).toHaveText('5... Ba6 — Ply 10 of 10');

  await page.goForward();
  await expect(page).toHaveURL(/\/eco\/E57$/);
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', expected.E57[1]);
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', '18');
});

test('representative A/B/C/D/E routes support legal boundary navigation', async ({ page }) => {
  for (const code of ['A00', 'B20', 'C60', 'D37', 'E45']) {
    await page.goto(`/eco/${code}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ecoReplayStatus')).toHaveAttribute('data-replay-state', 'available');
    const total = Number(await page.locator('#ecoMiniBoard').getAttribute('data-replay-total'));
    expect(total).toBeGreaterThan(0);

    await page.locator('[data-action="start"]').click();
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', startFen);
    await page.locator('[data-action="next"]').click();
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', '1');
    if (total > 1) await page.locator('[data-action="end"]').click();
    await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-replay-ply', String(total));
  }
});

test('invalid legacy move sequences fail closed with honest unavailable navigation', async ({ page }) => {
  await page.goto('/eco/C76', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ecoReplayStatus')).toHaveAttribute('data-replay-state', 'unavailable');
  await expect(page.locator('#ecoReplayStatus')).toContainText('Illegal or unverifiable move at ply 13: Ba4');
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-position-state', 'unavailable');
  await expect(page.locator('#ecoMiniBoard')).toHaveAttribute('data-fen', '');
  await expect(page.locator('#ecoMiniBoard')).toBeHidden();
  for (const action of ['start', 'prev', 'next', 'end']) {
    await expect(page.locator(`[data-action="${action}"]`)).toBeDisabled();
  }
  await expect(page.locator('[data-action="flip"]')).toBeEnabled();
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
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-action="end"]').click();
  await expect(page.locator('#ecoStatGames')).toHaveText('2748');
  await expect(page.locator('#ecoStatsStatus')).toHaveAttribute('data-stats-state', 'available');
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
