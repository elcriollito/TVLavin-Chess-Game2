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

test('checkmate keeps Caissa and presents one truthful Play Game result shell', async ({ page }) => {
    await openQa(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Won');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Checkmate');
    await expect(page.locator('.caissa-games-panel')).toHaveAttribute('data-games-phase', 'game-over');
    await expect(page.locator('[data-caissa-games-head] img:visible')).toHaveCount(1);
    await expect(page.locator('[data-caissa-games-head]')).toContainText('Game Over');
    await expect(page.locator('[data-caissa-games-head]')).toContainText('You won by checkmate.');
    await expect(page.locator('.caissa-post-game__action--primary:visible')).toHaveCount(1);
    await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeHidden();
    await expect(page.locator('[data-post-game-action="rematch"]')).toBeHidden();
    await expect(page.locator('[data-caissa-games-foot] [data-post-game-action]:visible'))
        .toHaveText(['New Game']);
    await expect(page.locator('[data-caissa-games-foot] summary:visible')).toHaveText(/Menu/);
    await expect(page.locator('[data-post-game-concepts],[data-mentor-summary]')).toHaveCount(0);
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
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');

    await page.locator('[data-post-game-action="new-game"]').click();
    await loadPosition(page, positions.stalemate);
    await page.evaluate(() => window.handleGameOver());
    await expect(page.locator('[data-post-game-result]')).toHaveText('Draw');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Stalemate');
});

test('visible New Game returns to setup without duplicating runtime resources', async ({ page }) => {
    await openQa(page);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    const before = await page.evaluate(() => window.__caissaPlayHarness.snapshot());
    await page.locator('[data-post-game-action="new-game"]').click();
    const reset = await snapshot(page);
    expect(reset.gameActive).toBe(false);
    expect(reset.harness.workersCreated).toBe(before.workersCreated);
    expect(reset.harness.boardConstructions).toBe(before.boardConstructions);
    expect(reset.harness.activeRafs).toBeLessThanOrEqual(1);
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
    const expectedUrl = page.url();
    const recordId = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active.*caissa-play-v2-inline-analyze|caissa-play-v2-inline-analyze.*active/);
    const url = new URL(page.url());
    expect(page.url()).toBe(expectedUrl);
    expect(url.searchParams.has('handoff') || url.searchParams.has('pgn') || url.searchParams.has('fen')).toBe(false);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.getGame()?.pgn())).toContain(expectedPgn);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);
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
    await page.locator('.caissa-games-panel__post-game-menu-toggle').click();
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
                actions: [...region.querySelectorAll('button')].filter(button => button.offsetParent !== null).every(button =>
                    button.getBoundingClientRect().height >= 44),
                boardWidth: document.querySelector('#chessboard').getBoundingClientRect().width
            };
        });
        expect(result.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
        expect(result.visible && result.primaryReachable && result.actions, `${width}x${height}`).toBe(true);
        expect(result.boardWidth, `${width}x${height}`).toBeGreaterThan(180);
    }
});
