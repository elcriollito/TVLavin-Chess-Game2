import { test, expect } from '@playwright/test';

const selectedMoves = ['e4', 'd4', 'c4', 'Nf3'];

async function captureStartPosition(page, url) {
  const requests = [];
  const failures = [];
  const onResponse = (response) => {
    if (/\/openingdb\/(manifest|shards)\//.test(response.url()) || /\/openingdb\/manifest\.json/.test(response.url())) {
      requests.push({ url: response.url(), status: response.status() });
    }
  };
  const onFailure = (request) => {
    if (/\/openingdb\//.test(request.url())) failures.push(request.url());
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailure);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#odbStatsBody tr[data-row-index]')).toHaveCount(20, { timeout: 30_000 });
  const snapshot = await page.evaluate((moves) => {
    const rows = [...document.querySelectorAll('#odbStatsBody tr[data-row-index]')].map((row) => ({
      move: row.querySelector('.moveSan')?.textContent?.trim() || '',
      games: Number(row.querySelector('.col-games')?.textContent || 0),
      results: row.querySelector('.wdb-bar')?.getAttribute('title') || ''
    }));
    return {
      selected: rows.filter((row) => moves.includes(row.move)),
      order: rows.map((row) => row.move),
      totalGames: rows.reduce((sum, row) => sum + row.games, 0),
      diagnostic: document.querySelector('#odbRowsDiag')?.textContent?.trim() || '',
      version: document.querySelector('#odbTurnPly')?.textContent?.trim() || ''
    };
  }, selectedMoves);
  page.off('response', onResponse);
  page.off('requestfailed', onFailure);
  return { ...snapshot, requests, failures };
}

test('localhost and production use the same canonical start-position data', async ({ page }) => {
  const local = await captureStartPosition(page, '/opening-database');
  const production = await captureStartPosition(page, 'https://www.caissa-chess.org/opening-database');

  expect(local.failures).toEqual([]);
  expect(production.failures).toEqual([]);
  expect(local.requests.some(({ url, status }) => (
    url === 'https://downloads.caissa-chess.org/openingdb/manifest.json' && status === 200
  ))).toBe(true);
  expect(production.requests.some(({ url, status }) => (
    url === 'https://www.caissa-chess.org/openingdb/manifest.json' && status === 200
  ))).toBe(true);
  expect(local.requests.some(({ url, status }) => /\/openingdb\/shards\/v3_p60\/66\.json$/.test(url) && status === 200)).toBe(true);
  expect(production.requests.some(({ url, status }) => /\/openingdb\/shards\/v3_p60\/66\.json$/.test(url) && status === 200)).toBe(true);
  expect(local.selected).toEqual(production.selected);
  expect(local.order).toEqual(production.order);
  expect(local.totalGames).toBe(production.totalGames);
  expect(local.totalGames).toBeGreaterThan(5_000_000);
  expect(local.diagnostic).toContain('Mode: Popular / matchLevel: exact');
  expect(production.diagnostic).toContain('Mode: Popular / matchLevel: exact');
  expect(local.version).toContain('DB: v3_p60');
  expect(production.version).toContain('DB: v3_p60');
});
