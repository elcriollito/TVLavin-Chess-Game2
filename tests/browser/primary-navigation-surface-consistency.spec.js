import { test, expect } from '@playwright/test';

const legacy = [
  ['Insights', '/insights', 'insights', '#insightsSection'],
  ['Analyze', '/analyze', 'analyze', '#analyzeSection'],
  ['Arena', '/arena', 'arena', '#arenaSection'],
  ['FICS', '/fics', 'fics', '#ficsSection'],
  ['Spectator TV', '/spectator-tv', 'spectator-tv', '#spectatorSection'],
  ['Cheater Insight', '/cheater-insight', 'cheater-insight', '#cheater-insightSection'],
  ['Game Library', '/game-library', 'game-library', '#libraryPanel.open'],
  ['History', '/history', 'history', '#historySection'],
  ['DOS Chess', '/dos-chess', 'dos-chess', '#dosChessSection']
];

const standalone = [
  ['CAISSA Classic', '/yahoo-classic', '.yc-shell', /CAISSA Classic|Yahoo Chess Alternative/],
  ['Academy', '/academy', '#academySection', /Academy/],
  ['Endgame Trainer', '/endgame-trainer', '#endgame-v2-title', /Endgame Trainer/],
  ['Endgame Practice', '/endgame-practice', '#practice-title', /Endgame Practice/],
  ['Endgame Library', '/endgame-library', '#library-title', /Endgame Library/],
  ['Polyglot Tool', '/tools/polyglot', 'h1', /Polyglot/],
  ['Opening Database', '/opening-database', 'h1', /Opening Database/],
  ['ECO Codes', '/eco', 'h1', /ECO Codes/],
  ['Vault', '/vault', 'h1', /Vault/],
  ['Blog', '/blog', 'h1', /Blog/]
];

for (const [label, route, surface, marker] of legacy) {
  test(`${label} route, active item, surface, title, and history agree`, async ({ page }) => {
    const failures = [];
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto('/play');
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
    await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', surface);
    await expect(page.locator(marker)).toBeVisible();
    await expect(page.locator(`#mainNav [data-nav-key="${label === 'Spectator TV' ? 'spectator' : label === 'Game Library' ? 'library' : label === 'DOS Chess' ? 'dosChess' : label.toLowerCase().replaceAll(' ', '-')}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle(/CAISSA Chess/);
    expect(failures).toEqual([]);
  });
}

test('standalone product links resolve to their own observable surfaces', async ({ page }) => {
  for (const [label, route, marker, title] of standalone) {
    await page.goto('/play');
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
    await expect(page.locator(marker).first()).toBeVisible();
    await expect(page).toHaveTitle(title);
  }
});

test('Insights to Analyze to Arena never retains the preceding surface', async ({ page }) => {
  await page.goto('/insights');
  await page.getByRole('link', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'analyze');
  await expect(page.locator('#analyzeSection')).toBeVisible();
  await expect(page.locator('#insightsSection')).not.toBeVisible();
  await page.getByRole('link', { name: 'Arena', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect(page.locator('#arenaSection')).toBeVisible();
  await expect(page.locator('#analyzeSection')).not.toBeVisible();
});

test('a delayed hard navigation shows only neutral Loading, never Play under Insights', async ({ page }) => {
  await page.goto('/play');
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('#mainNav a')].find(node => node.textContent.trim() === 'Insights');
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    link.click();
  });
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'loading');
  await expect(page.locator('#caissaNavigationTransition')).toHaveText('Loading Insights\u2026');
  await expect(page.locator('#caissaNavigationTransition')).toHaveAttribute('role', 'status');
  await expect(page.locator('#caissaNavigationTransition')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#playSection')).not.toBeVisible();
  await page.evaluate(() => window.CaissaPrimaryNavigationTransitionPolicy.confirm('play'));
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'insights');
  await expect(page.locator('#insightsSection')).toBeVisible();
});

test('bounded navigation failure names the error and offers Return to Play', async ({ page }) => {
  await page.goto('/play');
  await page.evaluate(() => {
    window.CaissaPrimaryNavigationTransitionPolicy.begin('/insights', 'Insights');
    window.CaissaPrimaryNavigationTransitionPolicy.fail('Insights could not be opened.');
  });
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'navigation-error');
  await expect(page.locator('#caissaNavigationTransition')).toContainText('Insights could not be opened.');
  await expect(page.getByRole('link', { name: 'Return to Play' })).toHaveAttribute('href', '/play');
  await expect(page.locator('#playSection')).not.toBeVisible();
});

test('Spectator distinguishes loading from a stable accessible empty state', async ({ page }) => {
  await page.goto('/spectator-tv');
  const state = page.locator('#spectatorViewingState');
  await expect(state).toContainText('No live game available');
  await expect(state).toContainText('No live game is available in this channel right now.');
  await expect(state).toHaveAttribute('role', 'status');
  await expect(page.getByRole('link', { name: 'Return to Play', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.CaissaSpectatorTVSection.enterLoadingGames();
    window.CaissaSpectatorTVSection.render();
  });
  await expect(state).toContainText('Loading live game\u2026');
  await expect(page.getByRole('link', { name: 'Return to Play', exact: true })).toBeHidden();
  await page.evaluate(() => window.CaissaSpectatorTVSection.updateCatalog([]));
  await expect(state).toContainText('No live game available');
  await page.evaluate(() => window.CaissaSpectatorTVSection.updateCatalog([]));
  await expect(state).toContainText('No live game available');
});

test('cold load, reload, warm cache, and Back/Forward preserve route-to-surface identity', async ({ page }) => {
  await page.goto('/insights');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'insights');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'insights');
  await page.getByRole('link', { name: 'Arena', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'insights');
  await page.goForward();
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
});
