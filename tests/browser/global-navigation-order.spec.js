import { test, expect } from '@playwright/test';

const routes = [
  ['/play', 'Play'], ['/yahoo-classic', 'CAISSA Classic'], ['/fics', 'FICS'],
  ['/play-online/playchess', 'Playchess'],
  ['/play-online/fritz', 'Fritz'],
  ['/puzzles', 'Puzzles'],
  ['/academy', 'Academy'], ['/endgame-trainer', 'Endgame Trainer'], ['/insights', 'Insights'],
  ['/analyze', 'Analyze'], ['/spectator-tv', 'Chess TV'], ['/watch/lichess-tv', 'Lichess TV'], ['/watch/live-blitz', 'Live Blitz'], ['/watch/live-tournaments', 'Live Tournaments'], ['/arena', 'Engine Arena'],
  ['/game-library', 'Game Library'], ['/blog', 'Blog']
];

const canonicalOrder = [
  'Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz',
  'Puzzles', 'Academy', 'Endgame Trainer', 'Endgame Library', 'Endgame Tablebase',
  'Insights', 'Analyze', 'CAISSA PGN Reader', 'Chess TV', 'Lichess TV', 'Live Blitz', 'Live Tournaments', 'Engine Arena',
  'Cheater Insight', 'Polyglot Tool', 'Opening Database', 'ECO Codes',
  'Game Library', 'History', 'DOS Chess', 'Vault',
  'Blog', 'Support CAISSA', 'Help', 'About', 'Share an Idea / Contact & Feedback'
];

const navigationContract = 'CaissaGlobalNavigationOrderPolicy@1.15.0';

async function assertOrderAndIdentity(page, activeLabel) {
  const nav = page.getByRole('navigation', { name: 'CAISSA main navigation' });
  await expect(page.locator('.caissa-manual-qa-launcher, .caissa-manual-qa')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.CaissaPrimaryNavigation?.contractId || '')).toBe(navigationContract);
  const host = page.locator('[data-caissa-primary-groups], [data-caissa-standalone-sidebar]');
  await expect(host).toHaveAttribute('data-caissa-navigation-order-ready', navigationContract);
  const labels = await host.evaluate(node => {
    const scope = node.matches('.nav-items') ? node : node.querySelector('.nav-items') || node;
    return [...scope.querySelectorAll('.nav-item')].map(item => item.textContent.replace(/\s+/g, ' ').trim());
  });
  expect(labels).toEqual(canonicalOrder);
  expect(labels.slice(0, 5)).toEqual(['Play', 'CAISSA Classic', 'FICS', 'Playchess', 'Fritz']);
  expect(labels.filter(label => label === 'Play')).toHaveLength(1);
  expect(labels.filter(label => label === 'Playchess')).toHaveLength(1);
  expect(labels.filter(label => label === 'Playchess Guest')).toHaveLength(0);
  expect(labels.filter(label => label === 'Fritz')).toHaveLength(1);
  expect(labels.filter(label => label === 'Lichess TV')).toHaveLength(1);
  expect(labels.filter(label => label === 'Live Blitz')).toHaveLength(1);
  expect(labels.filter(label => label === 'Live Tournaments')).toHaveLength(1);
  expect(labels).not.toContain('Interactive Diagrams');
  const current = host.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText(activeLabel);
  const brand = page.locator('.nav-logo').first();
  if (await brand.count()) await expect(brand).toHaveAttribute('href', '/play');
  const social = nav.locator('.nav-social-link');
  await expect(social).toHaveCount(3);
  await expect(nav.locator('.nav-footer .nav-label')).toHaveCount(0);
  const discord = nav.getByRole('link', { name: 'CAISSA Discord' });
  await expect(discord).toHaveAttribute('href', 'https://discord.gg/TM7GJPUVfr');
  await expect(discord).toHaveAttribute('target', '_blank');
  await expect(discord).toHaveAttribute('rel', /noopener/);
  await expect(discord).toHaveAttribute('rel', /noreferrer/);
  const more = nav.locator('.nav-more-toggle');
  await expect(more).toHaveAttribute('aria-expanded', activeLabel === 'Blog' ? 'true' : /true|false/);
}

test('desktop shells preserve immutable DOM order and route-derived active identity', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [route, active] of routes) {
    await page.goto(route);
    await assertOrderAndIdentity(page, active);
  }
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(308);
  expect(root.headers().location).toBe('/play');
});

test('mobile shells preserve the same DOM order without promoting the active item', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, active] of routes) {
    await page.goto(route);
    const toggle = page.getByRole('button', { name: /Open navigation menu/ }).first();
    if (await toggle.isVisible()) await toggle.click();
    await assertOrderAndIdentity(page, active);
  }
});

test('Back Forward and rapid navigation change only active identity, never order', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/play');
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page.getByRole('link', { name: 'Analyze', exact: true }).click();
  await page.getByRole('link', { name: 'Engine Arena', exact: true }).click();
  await assertOrderAndIdentity(page, 'Engine Arena');
  await page.goBack();
  await assertOrderAndIdentity(page, 'Analyze');
  await page.goBack();
  await assertOrderAndIdentity(page, 'Insights');
  await page.goForward();
  await assertOrderAndIdentity(page, 'Analyze');
});

test('brand returns to Play from representative application and standalone shells', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  for (const route of ['/yahoo-classic', '/fics', '/academy', '/tools/polyglot', '/blog']) {
    await page.goto(route);
    await page.locator('#mainNav .nav-logo').click();
    await expect(page).toHaveURL(/\/play$/);
    await assertOrderAndIdentity(page, 'Play');
  }
});
