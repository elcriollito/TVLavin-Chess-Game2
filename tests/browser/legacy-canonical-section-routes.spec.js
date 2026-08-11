import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:8000';

async function snapshot(page) {
  return page.evaluate(() => ({
    pathname: location.pathname,
    section: window.CaissaNavigation?.currentSection,
    active: [...document.querySelectorAll('.content-section.active')].map(node => node.id),
    ficsBoard: document.querySelectorAll('#ficsBoardContainer .board-b72b1').length,
    spectatorBoard: document.querySelectorAll('#spectatorBoard .board-b72b1').length
  }));
}

for (const [path, section, id] of [['/fics', 'fics', 'ficsSection'], ['/spectator-tv', 'spectator', 'spectatorSection']]) {
  test(`${path} remains canonical and mounted across delayed observation`, async ({ page }) => {
    const failures = [];
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(path, { waitUntil: 'networkidle' });
    const checkpoints = [0, 1000, 3000, 5000, 10000];
    let elapsed = 0;
    for (const delay of checkpoints) {
      if (delay > elapsed) await page.waitForTimeout(delay - elapsed);
      elapsed = delay;
      const state = await snapshot(page);
      expect(state.pathname).toBe(path);
      expect(state.section).toBe(section);
      expect(state.active).toEqual([id]);
      expect(path === '/fics' ? state.ficsBoard : state.spectatorBoard).toBe(1);
    }
    expect(failures).toEqual([]);
  });
}

test('canonical hard-navigation reentry and Back/Forward preserve surface identity', async ({ page }) => {
  await page.goto('/fics');
  for (const [name, surface] of [['Play', 'play'], ['FICS', 'fics'], ['Play', 'play'], ['Spectator TV', 'spectator-tv'], ['Play', 'play'], ['Spectator TV', 'spectator-tv']]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', surface);
  }
  expect((await snapshot(page)).pathname).toBe('/spectator-tv');
  await page.goBack(); await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'play');
  await page.goBack(); await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'spectator-tv');
  await page.goForward(); await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'play');
  await page.goForward(); await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'spectator-tv');
  await page.reload({ waitUntil: 'networkidle' });
  expect(await snapshot(page)).toMatchObject({ pathname: '/spectator-tv', section: 'spectator', active: ['spectatorSection'] });
});

test('delayed FICS and Spectator modules do not permit a stale default callback', async ({ page }) => {
  await page.route('**/js/fics-client.js*', async route => { await new Promise(resolve => setTimeout(resolve, 250)); await route.continue(); });
  await page.route('**/js/spectator-tv-section.js*', async route => { await new Promise(resolve => setTimeout(resolve, 250)); await route.continue(); });
  await page.goto('/spectator-tv', { waitUntil: 'networkidle' });
  expect(await snapshot(page)).toMatchObject({ pathname: '/spectator-tv', section: 'spectator', active: ['spectatorSection'], spectatorBoard: 1 });
});
