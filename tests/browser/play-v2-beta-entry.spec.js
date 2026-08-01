import { test, expect } from '@playwright/test';

test('authorized internal beta supports canonical Games, Bots, history, refresh, and one board', async ({ page }) => {
    await page.goto('/play/beta');
    await expect(page).toHaveTitle(/CAISSA/i);
    await expect(page.locator('[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Games' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bots' })).toBeVisible();
    for (const blocked of ['Coach', 'Mentor', 'Players']) await expect(page.getByRole('tab', { name: blocked })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Bots' }).click();
    await expect(page).toHaveURL(/\/play\/beta\/bots$/);
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.reload();
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/play\/beta$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/play\/beta\/bots$/);
});

test('query, fragment, and storage cannot admit prohibited modes or external resources', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('playV2Beta', 'public-beta');
        sessionStorage.setItem('playMode', 'players');
    });
    await page.goto('/play/beta/games?token=internal&mode=players&provider=fics#mentor');
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    const urls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    expect(urls.filter(url => /fics|academy|coach|mentor|guided[-_/]?replay|knowledge|training[-_/]?memory|mastery|players/i.test(url)
        && !/play-v2-fics-isolation\.js/i.test(url))).toEqual([]);
    await expect(page.getByRole('tab', { name: /Coach|Mentor|Players/ })).toHaveCount(0);
});

test('prohibited and malformed beta descendants fail closed without Play runtime', async ({ page }) => {
    for (const path of ['/play/beta/coach', '/play/beta/mentor', '/play/beta/players', '/play/beta/unknown', '/play/beta//bots', '/play/beta/%62ots']) {
        await page.goto(path);
        await expect(page).toHaveTitle(/Play Beta Unavailable/);
        await expect(page.getByRole('heading', { name: 'Play beta is unavailable' })).toBeVisible();
        await expect(page.locator('script')).toHaveCount(0);
        await expect(page.locator('#chessboard')).toHaveCount(0);
    }
});

test('production defaults and QA compatibility remain unchanged', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
    await page.goto('/play');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('body[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);
    await page.goto('/yahoo-classic');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
});
