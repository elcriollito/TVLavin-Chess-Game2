import { test, expect } from '@playwright/test';

const fixture = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1930000, w: 733400, d: 598300, l: 598300 },
      { uci: 'd2d4', san: 'd4', games: 900000, w: 351000, d: 297000, l: 252000 },
      { uci: 'g1f3', san: 'Nf3', games: 450000, w: 171000, d: 157500, l: 121500 }
    ]
  }
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'v24_mobile_test',
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v24_mobile_test',
      generatedAt: '2026-11-07T12:00:00.000Z',
      maxPlies: 60
    })
  }));
  await page.route('https://downloads.caissa-chess.org/openingdb/shards/v24_mobile_test/*.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(fixture)
  }));
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 640, height: 960 }
]) {
  test(`compact Explorer keeps one continuation per row at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/opening-database');
    await expect(page.locator('#odbStatsBody tr')).toHaveCount(3);

    const layout = await page.evaluate(() => {
      const wrap = document.querySelector('.openingdb-table-wrap');
      const table = document.querySelector('.openingdb-stats-table');
      const header = document.querySelector('.openingdb-stat-headings');
      const rows = [...document.querySelectorAll('#odbStatsBody tr')];
      const rowData = rows.map((row) => {
        const cells = {
          move: row.querySelector('.col-move').getBoundingClientRect(),
          games: row.querySelector('.col-games').getBoundingClientRect(),
          wdl: row.querySelector('.col-wdl').getBoundingClientRect(),
          engine: row.querySelector('.col-engine').getBoundingClientRect()
        };
        const rect = row.getBoundingClientRect();
        return {
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          centers: Object.fromEntries(Object.entries(cells).map(([key, value]) => [key, value.left + value.width / 2]))
        };
      });
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
        wrapBorder: getComputedStyle(wrap).borderTopWidth,
        tableDisplay: getComputedStyle(table).display,
        headerPosition: getComputedStyle(header).position,
        rowData
      };
    });

    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
    expect(layout.wrapOverflow).toBeGreaterThanOrEqual(0);
    expect(layout.wrapBorder).not.toBe('0px');
    expect(layout.tableDisplay).toBe('block');
    expect(layout.headerPosition).toBe('static');
    expect(layout.rowData.every(row => row.height <= 52)).toBe(true);
    expect(layout.rowData.every(row => (
      row.centers.move < row.centers.games &&
      row.centers.games < row.centers.wdl &&
      row.centers.wdl < row.centers.engine
    ))).toBe(true);
    for (let index = 1; index < layout.rowData.length; index += 1) {
      expect(layout.rowData[index].top).toBeGreaterThanOrEqual(layout.rowData[index - 1].bottom - 1);
    }

    const firstRow = page.locator('#odbStatsBody tr').first();
    await expect(firstRow.locator('.moveSan')).toHaveText('e4');
    await expect(firstRow.locator('.col-games')).toHaveText('1,930,000');
    await expect(firstRow.locator('.col-wdl [role="img"]')).toHaveAttribute(
      'aria-label',
      /White wins 38\.0 percent, draws 31\.0 percent, Black wins 31\.0 percent/
    );
    await expect(firstRow.locator('.col-engine')).toHaveAttribute('aria-label', 'Not evaluated');
    await firstRow.locator('.openingdb-move-action').focus();
    await expect(firstRow.locator('.openingdb-move-action')).toBeFocused();
  });
}

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 }
]) {
  test(`desktop/tablet Explorer retains the approved table presentation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/opening-database');
    await expect(page.locator('#odbStatsBody tr')).toHaveCount(3);
    const layout = await page.evaluate(() => ({
      tableDisplay: getComputedStyle(document.querySelector('.openingdb-stats-table')).display,
      rowDisplay: getComputedStyle(document.querySelector('#odbStatsBody tr')).display,
      headerPosition: getComputedStyle(document.querySelector('.openingdb-stat-headings')).position,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(layout.tableDisplay).toBe('table');
    expect(layout.rowDisplay).toBe('table-row');
    expect(layout.headerPosition).toBe('absolute');
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  });
}

test('landscape mobile keeps the compact table bounded inside its workspace', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/opening-database');
  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.openingdb-table-wrap').getBoundingClientRect();
    const workspace = document.querySelector('.openingdb-workspace').getBoundingClientRect();
    const board = document.querySelector('.openingdb-board-shell').getBoundingClientRect();
    const tabs = document.querySelector('.openingdb-tabs').getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    return {
      wrap: { left: wrap.left, right: wrap.right },
      workspace: { left: workspace.left, right: workspace.right },
      board: { left: board.left, right: board.right },
      tabs: { left: tabs.left, right: tabs.right },
      viewportWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(layout.wrap.left).toBeGreaterThanOrEqual(layout.workspace.left - 1);
  expect(layout.wrap.right).toBeLessThanOrEqual(layout.workspace.right + 1);
  for (const rect of [layout.board, layout.workspace, layout.tabs]) {
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  }
  expect(layout.overflow).toBeLessThanOrEqual(1);
});
