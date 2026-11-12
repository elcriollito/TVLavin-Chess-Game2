import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

const viewports = [
  { width: 390, height: 844, expectedPlaychessHeight: 540 },
  { width: 430, height: 932, expectedPlaychessHeight: 580 }
];

const openingPositions = {
  '66be37feb35e7d6a': {
    moves: [
      { uci: 'e2e4', san: 'e4', games: 1200000, w: 456000, d: 396000, l: 348000 },
      { uci: 'd2d4', san: 'd4', games: 950000, w: 361000, d: 323000, l: 266000 },
      { uci: 'g1f3', san: 'Nf3', games: 320000, w: 121600, d: 108800, l: 89600 },
      { uci: 'c2c4', san: 'c4', games: 210000, w: 79800, d: 71400, l: 58800 },
      { uci: 'b1c3', san: 'Nc3', games: 95000, w: 36100, d: 32300, l: 26600 },
      { uci: 'a2a3', san: 'a3', games: 0, w: 0, d: 0, l: 0 }
    ]
  }
};

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('**/openingdb/manifest.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activeVersion: 'compactness_test',
      baseUrl: '/openingdb/shards/compactness_test',
      generatedAt: '2026-11-12T22:00:00.000Z'
    })
  }));
  await page.route('**/openingdb/shards/compactness_test/*.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(openingPositions)
  }));
}

for (const viewport of viewports) {
  test(`mobile compactness preserves Playchess and Explorer at ${viewport.width}px`, async ({ page }, testInfo) => {
    await prepare(page);
    await page.setViewportSize(viewport);
    await page.goto('/play-online/playchess', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-caissa-mobile2-destination-title]')).toHaveText('Playchess');
    await expect(page.locator('[data-caissa-mobile2-back]')).toHaveAttribute('href', '/play-hub');
    await expect.poll(() => page.frames().some(frame => frame.url().includes('play.chessbase.com')), {
      timeout: 20_000
    }).toBe(true);
    const playchessFrame = page.frames().find(frame => frame.url().includes('play.chessbase.com'));
    await expect(playchessFrame.getByRole('button', { name: 'More', exact: true })).toBeVisible({ timeout: 20_000 });

    const playchess = await page.evaluate(() => {
      const shell = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
      const frame = document.querySelector('.playchess-embed-shell iframe');
      const frameRect = frame.getBoundingClientRect();
      return {
        shell: { top: shell.top, bottom: shell.bottom, width: shell.width, height: shell.height },
        frame: { top: frameRect.top, bottom: frameRect.bottom, width: frameRect.width, height: frameRect.height },
        transform: getComputedStyle(frame).transform,
        hitTarget: document.elementFromPoint(shell.left + (shell.width / 2), shell.top + 200)?.tagName,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(playchess.shell.height).toBe(viewport.expectedPlaychessHeight);
    expect(Math.abs(playchess.frame.height - playchess.shell.height)).toBeLessThanOrEqual(3);
    expect(playchess.transform).toContain('1.15');
    expect(playchess.hitTarget).toBe('IFRAME');
    expect(playchess.overflow).toBeLessThanOrEqual(1);
    const disclosure = page.locator('.playchess-mobile-disclosure');
    await expect(disclosure).toBeVisible();

    if (testInfo.project.name === 'chromium') {
      // ChessBase paints its board texture after the accessible controls mount.
      // Wait for that visual pass so the HQA evidence reflects the usable embed.
      await page.waitForTimeout(8_000);
      await page.screenshot({
        path: `test-results/compactness-playchess-${viewport.width}.png`,
        fullPage: true
      });
    }

    await disclosure.locator('summary').click();
    await expect(disclosure.locator('a')).toBeVisible();
    await disclosure.locator('summary').click();
    await page.locator('[data-caissa-mobile2-back]').click();
    await expect(page).toHaveURL(/\/play-hub$/);

    await page.goto('/opening-database', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
    await expect(page.locator('.openingdb-board-context')).toBeHidden();
    await expect(page.locator('#odbDatasetFreshness')).toContainText('compactness_test');
    await expect(page.locator('#odbStatsBody [data-move-uci="a2a3"]')).toHaveCount(0);

    const explorer = await page.evaluate(() => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      };
      return {
        board: rect('.openingdb-board-shell'),
        results: rect('.openingdb-table-wrap'),
        controls: rect('.openingdb-sort-selector'),
        context: rect('.openingdb-opening-context'),
        counts: [...document.querySelectorAll('#odbStatsBody .col-games')]
          .map(node => Number(node.textContent.replaceAll(',', ''))),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(explorer.results.top).toBeGreaterThanOrEqual(explorer.board.bottom);
    expect(explorer.results.top - explorer.board.bottom).toBeLessThanOrEqual(6);
    expect(explorer.results.bottom).toBeLessThan(explorer.controls.top);
    expect(explorer.controls.bottom).toBeLessThan(explorer.context.top);
    expect(explorer.counts).toEqual([1200000, 950000, 320000, 210000, 95000]);
    expect(explorer.overflow).toBeLessThanOrEqual(1);

    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: `test-results/compactness-explorer-${viewport.width}.png`,
        fullPage: true
      });
    }
  });
}

test('desktop Playchess and Opening Explorer composition is unchanged', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/play-online/playchess', { waitUntil: 'domcontentloaded' });
  const playchess = await page.evaluate(() => {
    const shell = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
    const frame = document.querySelector('.playchess-embed-shell iframe');
    return {
      shellHeight: shell.height,
      frameWidth: frame.getBoundingClientRect().width,
      shellWidth: shell.width,
      transform: getComputedStyle(frame).transform
    };
  });
  expect(playchess.shellHeight).toBe(690);
  expect(Math.abs(playchess.frameWidth - playchess.shellWidth)).toBeLessThanOrEqual(2);
  expect(playchess.transform).toBe('none');
  await expect(page.locator('.playchess-disclosure')).toBeVisible();
  await expect(page.locator('.playchess-mobile-disclosure')).toBeHidden();

  await page.goto('/opening-database', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#odbStatsBody tr')).toHaveCount(5);
  await expect(page.locator('.openingdb-board-context')).toBeVisible();
  await expect(page.locator('#odbMobileDataRegion')).toBeHidden();
  const explorer = await page.evaluate(() => {
    const board = document.querySelector('.openingdb-board-shell').getBoundingClientRect();
    const workspace = document.querySelector('.openingdb-workspace').getBoundingClientRect();
    return {
      boardRight: board.right,
      workspaceLeft: workspace.left,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(explorer.boardRight).toBeLessThan(explorer.workspaceLeft);
  expect(explorer.overflow).toBeLessThanOrEqual(1);
});
