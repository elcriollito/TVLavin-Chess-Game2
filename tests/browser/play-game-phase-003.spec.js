import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const artifacts = 'artifacts/play-game-v1-phase-003';
const requestedViewports = [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
];

async function openCompletedGame(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('[data-games-primary]')).toBeEnabled();
    await page.locator('[data-games-primary]').click();
    await expect(page.locator('.caissa-games-panel[data-games-phase="active-game"]')).toBeVisible();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    const finalFen = await page.evaluate(() => window.App.game.fen());
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    expect(await page.evaluate(() => window.App.game.fen())).toBe(finalFen);
}

async function geometry(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box ? { top: box.top, right: box.right, bottom: box.bottom, left: box.left,
                width: box.width, height: box.height } : null;
        };
        const body = document.querySelector('[data-caissa-games-body]');
        return {
            board: rect('.caissa-simplified-shell__board-stage'),
            context: rect('.caissa-simplified-shell__context'),
            panel: rect('.caissa-games-panel'),
            head: rect('[data-caissa-games-head]'),
            body: rect('[data-caissa-games-body]'),
            foot: rect('[data-caissa-games-foot]'),
            bodyClientHeight: body?.clientHeight || 0,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('Game Over keeps the permanent shell and exact visible contract', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openCompletedGame(page, { width: 1600, height: 1000 });
    const head = page.locator('[data-caissa-games-head]');
    const body = page.locator('[data-caissa-games-body]');
    const foot = page.locator('[data-caissa-games-foot]');

    await expect(head.locator('img:visible')).toHaveCount(1);
    await expect(head).toContainText('Game Over');
    await expect(head).toContainText('You lost by resignation.');
    await expect(head).toContainText("Good game! Let's take a look at what happened.");
    await expect(body.locator('[data-post-game-result]')).toHaveText('You Lost');
    await expect(body.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(body.locator('[data-post-game-action="analyze"]')).toBeVisible();
    await expect(body.locator('[data-post-game-action]:visible')).toHaveText(['Analyze This Game']);
    await expect(body.locator('[data-post-game-summary]')).toBeHidden();
    await expect(foot.locator('[data-post-game-action]:visible')).toHaveText(['New Game']);
    await expect(foot.locator('.caissa-games-panel__post-game-menu-toggle')).toHaveText(/Menu/);
    await expect(foot.locator('[data-post-game-action="rematch"]')).toBeHidden();
    await expect(foot.locator('[data-post-game-action="mentor-review"]')).toBeHidden();
    await expect(page.locator('[data-caissa-post-game]')).toHaveCount(1);
    runtime.assertClean();
});

for (const viewport of requestedViewports) {
    test(`Game Over geometry is stable at ${viewport.name}`, async ({ page }) => {
        await openCompletedGame(page, viewport);
        if (viewport.width <= 600) await page.locator('.caissa-games-panel').scrollIntoViewIfNeeded();
        const closed = await geometry(page);
        const menu = page.locator('.caissa-games-panel__post-game-menu');
        await page.locator('.caissa-games-panel__post-game-menu-toggle').click();
        await expect(menu).toHaveAttribute('open', '');
        await expect(menu.locator('[data-post-game-action]:visible'))
            .toHaveText(['Copy PGN', 'Download PGN', 'Save PGN Locally']);
        const opensUpward = await page.evaluate(() => {
            const toggle = document.querySelector('.caissa-games-panel__post-game-menu-toggle').getBoundingClientRect();
            const items = document.querySelector('.caissa-games-panel__post-game-menu-items').getBoundingClientRect();
            return items.bottom <= toggle.top + 1;
        });
        expect(opensUpward).toBe(true);
        const opened = await geometry(page);
        expect(opened).toEqual(closed);
        expect(closed.overflow).toBeLessThanOrEqual(1);
        if (viewport.width > 600) expect(Math.abs(closed.context.bottom - closed.board.bottom)).toBeLessThanOrEqual(3);
        console.log(`PHASE003_GEOMETRY ${viewport.name} ${JSON.stringify({ closed, opened })}`);
        if (viewport.name === '1600x1000') {
            await page.screenshot({ path: `${artifacts}/game-over-desktop-1600x1000.png`, fullPage: true });
        }
        if (viewport.name === '390x844') {
            await page.screenshot({ path: `${artifacts}/game-over-mobile-390x844.png`, fullPage: true });
        }
        await page.keyboard.press('Escape');
        await expect(menu).not.toHaveAttribute('open', '');
    });
}

test('Game Over menu callbacks and New Game reuse the existing controller', async ({ page }) => {
    await page.addInitScript(() => {
        window.__phase003Proof = { copied: '', created: 0, revoked: 0, downloads: 0 };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async text => { window.__phase003Proof.copied = text; }
        } });
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__phase003Proof.created += 1; return create(blob); };
        const revoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = url => { window.__phase003Proof.revoked += 1; revoke(url); };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            window.__phase003Proof.downloads += 1; return click.call(this);
        };
    });
    await openCompletedGame(page, { width: 1366, height: 768 });
    await page.locator('.caissa-games-panel__post-game-menu-toggle').click();
    await page.locator('[data-post-game-action="copy-pgn"]').click();
    await expect.poll(() => page.evaluate(() => window.__phase003Proof.copied)).not.toBe('');
    await page.locator('[data-post-game-action="download-pgn"]').click();
    expect(await page.evaluate(() => window.__phase003Proof)).toMatchObject({ created: 1, revoked: 1, downloads: 1 });
    await page.locator('[data-post-game-consent]').check();
    await page.locator('[data-post-game-action="save-game"]').click();
    expect((await page.evaluate(() => window.CaissaGameRecordPersistence.listCompleted())).value).toHaveLength(1);
    await page.locator('[data-post-game-action="new-game"]').click();
    await expect(page.locator('.caissa-games-panel[data-games-phase="setup"]')).toBeVisible();
    await expect(page.locator('[data-games-primary]')).toHaveText('Play');
});

test('Analyze This Game preserves the existing handoff boundary', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    expect(page.url()).not.toMatch(/(?:pgn|fen|handoff)=/i);
});

test('Game Over remains reachable at characterized zoom levels', async ({ page }) => {
    await openCompletedGame(page, { width: 1600, height: 1000 });
    for (const zoom of [0.9, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const state = await page.evaluate(() => {
            const body = document.querySelector('[data-caissa-games-body]');
            const foot = document.querySelector('[data-caissa-games-foot]');
            body.scrollTop = body.scrollHeight;
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                bodyReachable: body.clientHeight > 0,
                footReachable: foot.getBoundingClientRect().height > 0,
                shellBottom: document.querySelector('.caissa-games-panel').getBoundingClientRect().bottom,
                boardBottom: document.querySelector('.caissa-simplified-shell__board-stage').getBoundingClientRect().bottom
            };
        });
        expect(state.overflow, `${zoom * 100}%`).toBeLessThanOrEqual(1);
        expect(state.bodyReachable && state.footReachable, `${zoom * 100}%`).toBe(true);
        console.log(`PHASE003_ZOOM ${zoom} ${JSON.stringify(state)}`);
    }
});
