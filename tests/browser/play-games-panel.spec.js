import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function openPanel(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
}

test('GamesPanel replaces the temporary controls host with one truthful primary action', async ({ page }) => {
    await openPanel(page);
    await expect(page.getByRole('heading', { name: 'Play Computer' })).toBeVisible();
    await expect(page.getByText('Start a local game against CAISSA.')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Opponent strength in Elo' })).toBeVisible();
    await expect(page.getByText('1500 Elo · Advanced', { exact: true })).toBeVisible();
    await expect(page.getByText(/Target strength is approximate/)).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell__context .right-panel')).toHaveCount(0);
    await expect(page.locator('.caissa-simplified-shell__advanced .right-panel')).toHaveCount(1);
    await expect(page.locator('[data-games-primary]:visible')).toHaveCount(1);
    await expect(page.locator('#navNewGameBtn:visible')).toHaveCount(0);
});

test('opponent strength supports keyboard bounds, labels, and persisted preference', async ({ page }) => {
    await openPanel(page);
    const slider = page.getByRole('slider', { name: 'Opponent strength in Elo' });
    await expect(slider).toHaveAttribute('min', '250');
    await expect(slider).toHaveAttribute('max', '3200');
    await expect(slider).toHaveAttribute('step', '50');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveValue('250');
    await expect(page.getByText('250 Elo · Beginner', { exact: true })).toBeVisible();
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('3200');
    await expect(page.getByText('3200 Elo · Elite', { exact: true })).toBeVisible();
    await slider.fill('1450');
    await expect(page.getByText('1450 Elo · Intermediate', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('slider', { name: 'Opponent strength in Elo' })).toHaveValue('1450');
});

test('beta setup disclosure owns truthful radio names and keyboard selection at every target width', async ({ page }) => {
    const presets = ['1+0 · Bullet', '2+1 · Bullet', '3+0 · Blitz', '3+2 · Blitz',
        '5+0 · Blitz', '10+0 · Rapid', '15+10 · Rapid'];
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
        { width: 430, height: 932 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/beta');
        const disclosure = page.locator('[data-games-setup-disclosure]');
        const change = page.getByText('Change', { exact: true });
        await expect(page.locator('[data-games-summary-value]')).toHaveText('1+0 · Bullet · White');
        if (await disclosure.evaluate(element => element.open)) await change.click();
        await expect(disclosure).not.toHaveAttribute('open', '');
        await expect(disclosure.getByRole('radio')).toHaveCount(0);
        await expect(disclosure.getByRole('radio', { includeHidden: true })).toHaveCount(10);
        await change.click();
        await expect(disclosure).toHaveAttribute('open', '');
        for (const name of presets)
            await expect(page.getByRole('radio', { name, exact: true })).toHaveCount(1);
        for (const name of ['White', 'Random', 'Black'])
            await expect(page.getByRole('radio', { name, exact: true })).toHaveCount(1);
        const fiveMinute = page.getByRole('radio', { name: '5+0 · Blitz', exact: true });
        await fiveMinute.focus();
        await page.keyboard.press('Space');
        await expect(fiveMinute).toBeChecked();
        const black = page.getByRole('radio', { name: 'Black', exact: true });
        await black.focus();
        await page.keyboard.press('Space');
        await expect(black).toBeChecked();
        await expect(page.locator('[data-games-summary-value]')).toHaveText('5+0 · Blitz · Black');
    }
});

test('time and color draft selections start exactly one authoritative local machine game', async ({ page }) => {
    await openPanel(page);
    await page.getByLabel('5+0 · Blitz').check();
    await page.getByRole('radio', { name: 'Black', exact: true }).check();
    const before = await page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().gamesPanel.diagnostics.successfulStarts);
    await page.locator('[data-games-primary]').click();
    const state = await page.evaluate(() => ({
        mode: window.App.gameMode,
        color: window.App.playerColor,
        timeControl: window.App.timeControl,
        clock: window.CaissaClockService.getSnapshot(),
        shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot()
    }));
    expect(state.mode).toBe('engine');
    expect(state.color).toBe('black');
    expect(state.timeControl).toBe(300);
    expect(state.clock.initialTimeMs).toBe(300000);
    expect(state.clock.incrementMs).toBe(0);
    expect(state.shell.gamesPanel.status).toBe('active');
    expect(state.shell.gamesPanel.opponent.targetElo).toBe(1500);
    expect(state.shell.gamesPanel.diagnostics.successfulStarts - before).toBe(1);
    await expect(page.locator('[data-games-primary]')).toHaveText('New Game');
});

test('one legal move receives the existing deterministic engine response', async ({ page }) => {
    await openPanel(page);
    await page.getByLabel('3+0 · Blitz').check();
    await page.getByRole('radio', { name: 'White', exact: true }).check();
    await page.locator('[data-games-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    const resources = await page.evaluate(() => ({
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        clocks: document.querySelectorAll('#topClockWhite,#topClockBlack').length,
        rails: document.querySelectorAll('#evalBar').length,
        actions: document.querySelectorAll('[data-games-primary]').length
    }));
    expect(resources).toEqual({ boards: 1, workers: 1, clocks: 2, rails: 1, actions: 1 });
});

test('Advanced Options preserves legacy controls while setup Analyze navigation remains blocked', async ({ page }) => {
    await openPanel(page);
    const advanced = page.locator('.caissa-simplified-shell__advanced');
    await advanced.locator('summary').click();
    await expect(advanced).toHaveAttribute('open', '');
    await expect(advanced.locator('#btnSettings')).toBeVisible();
    await expect(advanced.locator('#flipBoard')).toBeVisible();
    await expect(advanced.locator('#pasteFEN')).toBeVisible();
    await expect(advanced.locator('#analyzeGame')).toBeVisible();
    await expect(advanced.locator('#btnDownload')).toBeVisible();
    await advanced.locator('#pasteFEN').click();
    await expect(page.locator('#fenModal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await advanced.locator('#btnSettings').click();
    await expect(page.locator('#menuModal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await page.locator('#mobileNavToggle').click();
    await page.locator('[data-section="analyze"]').first().click();
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
});

test('legacy Play stays unchanged and shell activation restoration preserves unique controls', async ({ page }) => {
    await page.goto('/play');
    const duplicateIdsBefore = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.length - new Set(ids).size;
    });
    await expect(page.locator('.caissa-games-panel')).toHaveCount(0);
    await expect(page.locator('#navNewGameBtn')).toBeVisible();
    await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.caissa-games-panel')).toHaveCount(0);
    await expect(page.locator('#navNewGameBtn')).toBeVisible();
    expect(await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.length - new Set(ids).size;
    })).toBe(duplicateIdsBefore);
});

const viewports = [
    [320, 568], [375, 667], [390, 844], [412, 915],
    [768, 1024], [1024, 768], [1366, 768], [1440, 900]
];

test('panel controls remain reachable and bounded across required layouts', async ({ page }) => {
    await openPanel(page, { width: 320, height: 568 });
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        await expect.poll(() => page.evaluate(() =>
            window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry?.width)).toBe(width);
        const result = await page.evaluate(() => {
            const play = document.querySelector('#playSection');
            const action = document.querySelector('[data-games-primary]');
            const advanced = document.querySelector('.caissa-simplified-shell__advanced');
            action.scrollIntoView({ block: 'center' });
            const actionBox = action.getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                actionReachable: actionBox.top >= 0 && actionBox.bottom <= innerHeight,
                advancedPresent: advanced.getBoundingClientRect().width > 0,
                playScrollable: play.scrollHeight >= play.clientHeight,
                labels: [...document.querySelectorAll('.caissa-games-panel__option span')]
                    .every(label => label.getBoundingClientRect().width >= 44)
            };
        });
        expect(result.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(result.actionReachable, `${width}x${height}`).toBe(true);
        expect(result.advancedPresent && result.playScrollable && result.labels, `${width}x${height}`).toBe(true);
    }
});
