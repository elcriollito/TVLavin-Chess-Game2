import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove, snapshot } from '../play/playwright-helpers.js';

async function openQa(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-primary]').click();
}

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('checkmate shows one truthful summary and suppresses competing GamesPanel action', async ({ page }) => {
    await openQa(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('White wins.');
    await expect(page.locator('[data-post-game-summary]')).toContainText('checkmate');
    await expect(page.locator('.caissa-games-panel')).toBeHidden();
    await expect(page.locator('.caissa-post-game__action--primary:visible')).toHaveCount(1);
    await expect(page.locator('[data-post-game-action="mentor-review"],[data-post-game-concepts],[data-mentor-summary]')).toHaveCount(0);
    expect(await page.evaluate(() => ({
        regions: document.querySelectorAll('.caissa-post-game').length,
        rail: window.CaissaEvaluationRailInstance.getSnapshot().displayMode,
        state: window.CaissaPostGameExperienceInstance.getSnapshot()
    }))).toMatchObject({
        regions: 1,
        rail: 'post-game',
        state: { visible: true, trainingMemoryWrites: 0, masteryWrites: 0 }
    });
});

test('resignation and stalemate preserve authoritative result and termination', async ({ page }) => {
    await openQa(page);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-result]')).toHaveText('Black wins.');
    await expect(page.locator('[data-post-game-summary]')).toContainText('resignation');

    await page.locator('[data-post-game-action="new-game"]').click();
    await loadPosition(page, positions.stalemate);
    await page.evaluate(() => window.handleGameOver());
    await expect(page.locator('[data-post-game-result]')).toHaveText('Draw.');
    await expect(page.locator('[data-post-game-summary]')).toContainText('stalemate');
});

test('Rematch starts once while New Game returns to setup without duplicating runtime resources', async ({ page }) => {
    await openQa(page);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const before = await page.evaluate(() => window.__caissaPlayHarness.snapshot());
    await page.locator('[data-post-game-action="rematch"]').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rematch = await snapshot(page);
    expect(rematch.gameActive).toBe(true);
    expect(rematch.harness.workersCreated).toBe(before.workersCreated);
    expect(rematch.harness.boardConstructions).toBe(before.boardConstructions);
    expect(rematch.harness.activeRafs).toBeLessThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-post-game-action="new-game"]').click();
    expect((await snapshot(page)).gameActive).toBe(false);
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.locator('[data-games-primary]')).toHaveText('Play');
    expect(await page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().diagnostics.newGames)).toBe(1);
});

test('Analyze uses opaque handoff and Back restores the post-game summary', async ({ page }) => {
    await openQa(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    const expectedPgn = (await snapshot(page)).pgn;
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    const url = new URL(page.url());
    expect(url.searchParams.get('handoff')).toMatch(/^[A-Za-z0-9_-]{12,120}$/);
    expect(url.searchParams.has('pgn') || url.searchParams.has('fen')).toBe(false);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.pgn())).toContain(expectedPgn);
    await page.goBack();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
});

test('Copy, Download, and consent-aware Save have bounded side effects', async ({ page }) => {
    await page.addInitScript(() => {
        window.__postGameProof = { copied: null, created: 0, revoked: 0, clicks: 0 };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async text => { window.__postGameProof.copied = text; }
        } });
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__postGameProof.created += 1; return create(blob); };
        const revoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = value => { window.__postGameProof.revoked += 1; revoke(value); };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { window.__postGameProof.clicks += 1; return click.call(this); };
    });
    await openQa(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    const beforeKeys = await page.evaluate(() => Object.keys(localStorage));
    await expect(page.locator('[data-post-game-action="save-game"]')).toBeDisabled();
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(beforeKeys);
    await page.locator('[data-post-game-action="copy-pgn"]').click();
    await expect.poll(() => page.evaluate(() => window.__postGameProof.copied)).toContain('Qg7#');
    await page.locator('[data-post-game-action="download-pgn"]').click();
    expect(await page.evaluate(() => window.__postGameProof)).toMatchObject({ created: 1, revoked: 1, clicks: 1 });
    await page.locator('[data-post-game-consent]').check();
    await expect(page.locator('[data-post-game-action="save-game"]')).toBeEnabled();
    await page.locator('[data-post-game-action="save-game"]').click();
    const persisted = await page.evaluate(() => window.CaissaGameRecordPersistence.listCompleted());
    expect(persisted.value).toHaveLength(1);
    await expect(page.locator('[data-post-game-action="save-game"]')).toBeDisabled();
});

const viewports = [
    [320, 568], [375, 667], [390, 844], [412, 915],
    [768, 1024], [1024, 768], [1366, 768], [1440, 900]
];

test('summary and actions remain reachable across required layouts', async ({ page }) => {
    await openQa(page, { width: 320, height: 568 });
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        const result = await page.evaluate(() => {
            const region = document.querySelector('.caissa-post-game');
            const primary = document.querySelector('.caissa-post-game__action--primary');
            primary.scrollIntoView({ block: 'center' });
            const box = primary.getBoundingClientRect();
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                visible: region.getBoundingClientRect().width > 0,
                primaryReachable: box.top >= 0 && box.bottom <= innerHeight,
                actions: [...region.querySelectorAll('button')].every(button =>
                    button.getBoundingClientRect().height >= 44),
                boardWidth: document.querySelector('#chessboard').getBoundingClientRect().width
            };
        });
        expect(result.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(result.visible && result.primaryReachable && result.actions, `${width}x${height}`).toBe(true);
        expect(result.boardWidth, `${width}x${height}`).toBeGreaterThan(180);
    }
});
