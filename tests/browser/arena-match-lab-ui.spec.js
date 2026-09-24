import { test, expect } from '@playwright/test';

async function openArena(page, viewport = { width: 1920, height: 1080 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    localStorage.removeItem('caissa_arena_match_lab_advanced_panel');
  });
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArenaMatchLabUI))).toBe(true);
}

async function geometry(page) {
  return page.evaluate(() => {
    const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
    const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
    return {
      board: { left: board.left, top: board.top, width: board.width, height: board.height },
      panel: { left: panel.left, top: panel.top, width: panel.width, height: panel.height },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
}

function expectStable(before, after) {
  for (const region of ['board', 'panel']) {
    for (const key of ['left', 'top', 'width', 'height']) {
      expect(Math.abs(after[region][key] - before[region][key]), `${region}.${key}`).toBeLessThanOrEqual(1);
    }
  }
  expect(after.horizontalOverflow).toBe(false);
}

test('desktop Match Lab shell follows the approved hierarchy without board jitter', async ({ page }) => {
  await openArena(page);
  await expect(page.getByRole('tab', { name: 'Match' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#arenaAdvancedMatchOptions')).not.toHaveAttribute('open', '');

  const order = await page.locator('#arenaPanelMatch').evaluate(panel => {
    const ids = ['arenaWhiteEngine', 'arenaBlackEngine', 'arenaSetPositionBtn', 'arenaManualSetupBtn', 'arenaAdvancedMatchOptions'];
    return ids.map(id => [...panel.querySelectorAll('*')].indexOf(document.getElementById(id)));
  });
  expect(order).toEqual([...order].sort((a, b) => a - b));

  const before = await geometry(page);
  await page.locator('#arenaAdvancedMatchOptions summary').click();
  await expect(page.locator('#arenaAdvancedMatchOptions')).toHaveAttribute('open', '');
  await expect(page.locator('.arena-match-option-column')).toHaveCount(3);
  await expect(page.locator('#arenaSwapEngines')).toBeVisible();
  await expect(page.locator('#arenaMatchTitle')).toBeVisible();
  await expect(page.locator('#arenaTimeControlMode')).toBeVisible();
  await expect(page.locator('#arenaOpeningMode')).toBeVisible();
  expectStable(before, await geometry(page));
});

test('shell controls are keyboard-operable and presentation-only behaviors are truthful', async ({ page }) => {
  await openArena(page);
  await page.locator('#arenaAdvancedMatchOptions summary').click();

  await expect(page.locator('#arenaMatchTitle')).toHaveValue(/.+ vs .+/);
  await expect(page.locator('#arenaMatchTitle')).not.toHaveValue('White vs Black');
  await page.locator('#arenaTimeControlMode').selectOption('fixed-depth');
  await expect(page.locator('#arenaTimeControlPreset')).toHaveValue('12');
  await expect(page.locator('#arenaTimeControlSummary')).toContainText('Depth 12');

  await page.locator('#arenaOpeningMode').selectOption('eco');
  await expect(page.locator('#arenaOpeningSummary')).toHaveText('Choose an ECO opening');
  await page.locator('#arenaEcoSelect').click();
  await expect(page.locator('#arenaMatchLabPhaseNote')).toContainText('ML-001D');

  const before = await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    white: window.CaissaArena.state.whiteEngine.id,
    black: window.CaissaArena.state.blackEngine.id,
    orientation: window.CaissaArena.board.orientation()
  }));
  await page.locator('#arenaFlipBoard').check();
  const after = await page.evaluate(() => ({
    fen: window.CaissaArena.game.fen(),
    white: window.CaissaArena.state.whiteEngine.id,
    black: window.CaissaArena.state.blackEngine.id,
    orientation: window.CaissaArena.board.orientation()
  }));
  expect(after).toEqual({ ...before, orientation: 'black' });
  expect(before.orientation).toBe('white');
  await expect(page.locator('#arenaSavePgn')).toBeChecked();
});

test('mobile stacks advanced options and leaves Tournament and Game intact', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  const before = await geometry(page);
  await page.locator('#arenaAdvancedMatchOptions summary').click();
  await expect(page.locator('#arenaMatchTitle')).toBeVisible();
  expect((await geometry(page)).horizontalOverflow).toBe(false);

  const columns = await page.locator('.arena-match-option-column').evaluateAll(items => items.map(item => item.getBoundingClientRect().left));
  expect(Math.max(...columns) - Math.min(...columns)).toBeLessThanOrEqual(1);

  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect(page.locator('#arenaPanelTournament')).toBeVisible();
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect(page.locator('#arenaPanelGame')).toBeVisible();
  await page.getByRole('tab', { name: 'Match' }).click();
  const after = await geometry(page);
  expect(Math.abs(after.board.width - before.board.width)).toBeLessThanOrEqual(1);
  expect(after.horizontalOverflow).toBe(false);
});
