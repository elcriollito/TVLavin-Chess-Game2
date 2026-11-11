import { test, expect } from '@playwright/test';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

const profiles = [
    { name: 'phone-portrait', width: 390, height: 844 },
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'ipad-portrait', width: 834, height: 1194 },
    { name: 'ipad-landscape', width: 1194, height: 834 },
    { name: 'desktop', width: 1440, height: 900 }
];

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function completeAndOpenAnalyzer(page) {
    const response = await page.goto('/play/games');
    const html = await response.text();
    expect(html).not.toMatch(/id="analyzeSection"|play-v2-inline-analyze\.js|data-caissa-analyze-v2/);
    await expect(page.locator('body[data-caissa-play-v2-entry="official"]')).toHaveCount(1);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => Boolean(window.App?.game && window.App?.boardProjection))).toBe(true);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator('[data-post-game-action="analyze"]:visible').first().click()
    ]);
    await expect(page).toHaveURL(/\/analyze\?handoff=[A-Za-z0-9_-]+$/);
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true');
    await expect.poll(() => page.evaluate(() => Boolean(window.AnalyzeSection?.loadedGame && window.AnalyzeSection?.board)),
        { timeout: 15_000 }).toBe(true);
}

for (const profile of profiles) {
    test(`canonical Analyzer owns one contained board at ${profile.name}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await completeAndOpenAnalyzer(page);
        await page.setViewportSize({ width: profile.width, height: profile.height });
        await expect(page.locator('#analyzeChessboard .caissa-board')).toBeVisible();
        await expect(page.locator('#analyzeSection > .analyze-layout')).toHaveCount(0);
        const state = await page.evaluate(() => {
            const visible = element => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && rect.width > 0 && rect.height > 0;
            };
            const boards = [...document.querySelectorAll('#analyzeChessboard .caissa-board')].filter(visible);
            const board = boards[0]?.getBoundingClientRect();
            const usableControls = [...document.querySelectorAll('#analyzeSection button')].filter(visible)
                .filter(element => !element.disabled).length;
            return {
                visibleBoards: boards.length,
                board: board ? { width: board.width, height: board.height } : null,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                usableControls
            };
        });
        expect(state.visibleBoards).toBe(1);
        expect(state.board).not.toBeNull();
        expect(Math.abs(state.board.width - state.board.height)).toBeLessThanOrEqual(2);
        expect(state.overflow).toBeLessThanOrEqual(1);
        expect(state.usableControls).toBeGreaterThan(3);
        await expect(page.locator('#analyzeFlipBoard')).toBeEnabled();
        await expect(page.locator('#analyzeReviewBtn')).toBeEnabled();
    });
}

test('Back and Forward preserve the completed record without reviving Play workers', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await completeAndOpenAnalyzer(page);
    await page.setViewportSize({ width: 834, height: 1194 });
    const analyzerUrl = page.url();
    const recordId = await page.evaluate(() => window.AnalyzeSection.loadedGame.recordId);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/play\/games$/);
    const backState = await page.evaluate(() => ({
        gameActive: window.App?.gameActive === true,
        postGameVisible: window.CaissaPostGameExperienceInstance?.getSnapshot?.().visible === true,
        recordId: window.CaissaPostGameExperienceInstance?.getSnapshot?.().gameRecordId || null,
        activeWorkers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount ?? 0
    }));
    expect(backState.gameActive).toBe(false);
    expect(backState.activeWorkers).toBe(0);
    if (backState.postGameVisible) expect(backState.recordId).toBe(recordId);

    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(analyzerUrl);
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true');
    await expect(page.locator('#analyzeChessboard .caissa-board')).toBeVisible();
});
