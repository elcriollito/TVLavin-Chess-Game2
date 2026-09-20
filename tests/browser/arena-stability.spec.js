import { test, expect } from '@playwright/test';

const TOLERANCE = 0.5;

async function openArena(page, viewport) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(async () => page.locator('#arenaBoardMount').evaluate(element => {
    const box = element.getBoundingClientRect();
    return Math.min(box.width, box.height);
  })).toBeGreaterThan(80);
  await expect.poll(async () => page.evaluate(() => Boolean(
    window.CaissaArena.board && window.CaissaArena.state.boardMounted
  ))).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.enginesReady), {
    timeout: 15_000
  }).toBe(true);
}

async function boardGeometry(page) {
  return page.evaluate(() => {
    const section = document.querySelector('#arenaSection');
    const board = document.querySelector('#arenaBoardMount');
    const box = board.getBoundingClientRect();
    const aFile = board.querySelector('[data-square^="a"], .square-a1, .square-a8')?.getBoundingClientRect();
    const hFile = board.querySelector('[data-square^="h"], .square-h1, .square-h8')?.getBoundingClientRect();
    return {
      x: box.x + section.scrollLeft,
      y: box.y + section.scrollTop,
      width: box.width,
      height: box.height,
      square: Math.abs(box.width - box.height) <= 0.5,
      filesVisible: Boolean(aFile && hFile
        && aFile.left >= 0
        && hFile.right <= window.innerWidth
        && aFile.width > 0
        && hFile.width > 0),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
}

function expectStable(samples, label) {
  for (const key of ['x', 'y', 'width', 'height']) {
    const values = samples.map(sample => sample[key]);
    expect(Math.max(...values) - Math.min(...values), `${label} ${key} drift`).toBeLessThanOrEqual(TOLERANCE);
  }
  for (const sample of samples) {
    expect(sample.square, `${label} square`).toBe(true);
    expect(sample.filesVisible, `${label} files A/H`).toBe(true);
    expect(sample.horizontalOverflow, `${label} horizontal overflow`).toBe(false);
  }
}

async function instrumentBoard(page) {
  await page.evaluate(() => {
    const arena = window.CaissaArena;
    window.__arenaStability = {
      workers: [arena.whiteEngineInstance, arena.blackEngineInstance, arena.evaluatorEngine],
      boardResizeCalls: 0
    };
    const resize = arena.board.resize.bind(arena.board);
    arena.board.resize = (...args) => {
      window.__arenaStability.boardResizeCalls += 1;
      return resize(...args);
    };
  });
}

async function assertRuntimeContinuity(page) {
  expect(await page.evaluate(() => ({
    boardResizeCalls: window.__arenaStability.boardResizeCalls,
    sameWorkers: window.__arenaStability.workers.every((worker, index) => worker === [
      window.CaissaArena.whiteEngineInstance,
      window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine
    ][index])
  }))).toEqual({ boardResizeCalls: 0, sameWorkers: true });
}

async function runActiveMatchStability(page, { simulateBrowserChrome = false } = {}) {
  await page.getByRole('tab', { name: 'Match' }).click();
  const samples = [await boardGeometry(page)];
  await instrumentBoard(page);
  await page.locator('#arenaStartMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThanOrEqual(3);
  samples.push(await boardGeometry(page));

  await page.getByRole('tab', { name: 'Game' }).click();
  samples.push(await boardGeometry(page));
  await page.locator('#arenaPauseMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  samples.push(await boardGeometry(page));
  await page.locator('#arenaPauseMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');

  if (simulateBrowserChrome) {
    await page.setViewportSize({ width: 390, height: 744 });
    await page.waitForTimeout(250);
    samples.push(await boardGeometry(page));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
  }

  await page.getByRole('tab', { name: 'Match' }).click();
  samples.push(await boardGeometry(page));
  await assertRuntimeContinuity(page);
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaStopMatch').click();
  return samples;
}

async function runActiveTournamentStability(page) {
  await page.getByRole('tab', { name: 'Tournament' }).click();
  const samples = [await boardGeometry(page)];
  await instrumentBoard(page);
  await page.locator('#arenaStartTournament').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThanOrEqual(2);
  samples.push(await boardGeometry(page));

  await page.getByRole('tab', { name: 'Game' }).click();
  samples.push(await boardGeometry(page));
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();
  await expect.poll(async () => page.evaluate(() => ({
    running: window.CaissaArena.state.matchState,
    completed: window.CaissaArena.state.tournament.games.filter(game => game.result !== null).length,
    moves: window.CaissaArena.game.history().length
  })), { timeout: 20_000 }).toMatchObject({ running: 'running', completed: 1 });
  samples.push(await boardGeometry(page));

  await page.getByRole('tab', { name: 'Tournament' }).click();
  samples.push(await boardGeometry(page));
  await assertRuntimeContinuity(page);
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaStopMatch').click();
  return samples;
}

test('active Match keeps deterministic geometry on a common laptop viewport', async ({ page }) => {
  await openArena(page, { width: 1440, height: 900 });
  expectStable(await runActiveMatchStability(page), 'laptop Match');
});

test('active Tournament and its next pairing keep deterministic desktop geometry', async ({ page }) => {
  await openArena(page, { width: 1920, height: 1080 });
  expectStable(await runActiveTournamentStability(page), 'desktop Tournament');
});

test('mobile portrait Match ignores browser-chrome height churn', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  expectStable(await runActiveMatchStability(page, { simulateBrowserChrome: true }), 'mobile portrait Match');
});

test('mobile portrait Tournament stays fixed through standings and pairing changes', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  expectStable(await runActiveTournamentStability(page), 'mobile portrait Tournament');
});

for (const viewport of [
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} active Match remains square and fixed`, async ({ page }) => {
    await openArena(page, viewport);
    expectStable(await runActiveMatchStability(page), `${viewport.name} Match`);
  });
}
