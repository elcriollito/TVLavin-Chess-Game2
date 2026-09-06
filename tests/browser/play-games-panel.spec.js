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
    await expect(page.getByRole('heading', { name: 'Welcome to Play' })).toBeVisible();
    await expect(page.getByText("Choose your game and I'll take care of the rest.")).toBeVisible();
    await expect(page.locator('[data-caissa-games-head] img'))
        .toHaveAttribute('src', '/assets/play/caissa-coach-goddess.png');
    await expect(page.getByRole('slider', { name: 'Opponent strength in Elo' })).toBeVisible();
    await expect(page.getByText('1500 Elo · Advanced', { exact: true })).toBeVisible();
    await expect(page.getByText(/Target strength is approximate/)).toBeVisible();
    await expect(page.locator('.caissa-simplified-shell__context .right-panel')).toHaveCount(0);
    await expect(page.locator('.caissa-simplified-shell__advanced .right-panel')).toHaveCount(1);
    await expect(page.locator('[data-games-primary]:visible')).toHaveCount(1);
    await expect(page.locator('[data-caissa-games-foot] > [data-games-primary]')).toHaveCount(1);
    await expect(page.locator('#navNewGameBtn:visible')).toHaveCount(0);
});

test('setup owns permanent Head, scrolling Body, and anchored Foot geometry', async ({ page }) => {
    await openPanel(page, { width: 1366, height: 768 });
    const geometry = await page.evaluate(() => {
        const rect = selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, height: box.height };
        };
        const panel = document.querySelector('.caissa-games-panel');
        const body = panel.querySelector('[data-caissa-games-body]');
        const headBefore = rect('[data-caissa-games-head]');
        const footBefore = rect('[data-caissa-games-foot]');
        body.scrollTop = 120;
        const headAfter = rect('[data-caissa-games-head]');
        const footAfter = rect('[data-caissa-games-foot]');
        return {
            panel: rect('.caissa-games-panel'), context: rect('.caissa-simplified-shell__context'),
            board: rect('.caissa-simplified-shell__board-stage'),
            head: headBefore, body: { ...rect('[data-caissa-games-body]'), clientHeight: body.clientHeight,
                scrollHeight: body.scrollHeight, overflowY: getComputedStyle(body).overflowY },
            foot: footBefore,
            fixed: Math.abs(headBefore.top - headAfter.top) <= 1 && Math.abs(footBefore.top - footAfter.top) <= 1,
            anchored: Math.abs(footBefore.bottom - panel.getBoundingClientRect().bottom) <= 1,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    expect(geometry.body.overflowY).toBe('auto');
    expect(geometry.body.scrollHeight).toBeGreaterThanOrEqual(geometry.body.clientHeight);
    expect(geometry.fixed).toBe(true);
    expect(geometry.anchored).toBe(true);
    expect(Math.abs(geometry.board.bottom - geometry.context.bottom)).toBeLessThanOrEqual(3);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
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

test('public setup keeps legacy controls inert and outside the Game Body', async ({ page }) => {
    await openPanel(page);
    const advanced = page.locator('.caissa-simplified-shell__advanced');
    await expect(advanced).toBeHidden();
    for (const id of ['btnSettings', 'flipBoard', 'pasteFEN', 'analyzeGame', 'btnDownload'])
        await expect(advanced.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator('[data-caissa-games-body] #analyzeGame')).toHaveCount(0);
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
});

test('canonical Play preserves unique controls across mode restoration', async ({ page }) => {
    await page.goto('/play');
    const duplicateIdsBefore = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
        return ids.length - new Set(ids).size;
    });
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.getByRole('tab', { name: 'Play Bots' }).click();
    await expect(page.locator('.caissa-games-panel')).toBeHidden();
    await page.getByRole('tab', { name: 'Play Game' }).click();
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.locator('[data-games-primary]')).toHaveCount(1);
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
        await expect.poll(() => page.evaluate(expectedHeight => {
            const geometry = window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry;
            return !!geometry && geometry.width > 0 && geometry.height === expectedHeight;
        }, height)).toBe(true);
        const result = await page.evaluate(() => {
            const play = document.querySelector('#playSection');
            const action = document.querySelector('[data-games-primary]');
            const advanced = document.querySelector('.caissa-simplified-shell__advanced');
            action.scrollIntoView({ block: 'center' });
            const actionBox = action.getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                actionReachable: actionBox.top >= 0 && actionBox.bottom <= innerHeight,
                advancedPreserved: ['btnSettings', 'flipBoard', 'pasteFEN', 'analyzeGame', 'btnDownload']
                    .every(id => advanced.querySelector(`#${id}`)),
                playScrollable: play.scrollHeight >= play.clientHeight,
                labels: [...document.querySelectorAll('.caissa-games-panel__option span')]
                    .every(label => label.getBoundingClientRect().width >= 44)
            };
        });
        expect(result.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(result.actionReachable, `${width}x${height}`).toBe(true);
        expect(result.advancedPreserved && result.playScrollable && result.labels, `${width}x${height}`).toBe(true);
    }
});
