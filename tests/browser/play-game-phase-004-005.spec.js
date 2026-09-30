import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const ARTIFACT_DIR = 'artifacts/play-game-v1-phase-004-005';
const viewports = [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
];

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function completeGame(page) {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => window.__caissaPlayHarness.configure({
        autoReply: true,
        resetSearchSequence: true,
        bestMoves: ['e7e5', 'b8c6']
    }));
    for (let turn = 0; turn < 2; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    return page.evaluate(() => ({
        recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId,
        fen: window.App.game.fen(),
        pgn: window.App.game.pgn(),
        result: document.querySelector('[data-post-game-result]')?.textContent,
        reason: document.querySelector('[data-post-game-reason]')?.textContent,
        url: window.location.href
    }));
}

async function openCanonicalAnalyze(page) {
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect(page.locator('#playSection')).not.toHaveClass(/active/);
    await expect(page.locator('#analyzeChessboard .caissa-board')).toBeVisible();
    await expect(page.locator('#analyzeSection .analyze-layout')).toBeVisible();
}

async function analyzeFrame(page) {
    return page.evaluate(() => {
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box ? [box.x, box.y, box.width, box.height].map(value => Math.round(value * 100) / 100) : null;
        };
        return {
            activeSections: [...document.querySelectorAll('.content-section.active')].map(section => section.id),
            section: rect('#analyzeSection'),
            workspace: rect('#analyzeSection .analyze-layout'),
            board: rect('#analyzeChessboard .caissa-board'),
            actions: rect('#analyzeSection .analyze-board-navigation'),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            boardVisible: Boolean(document.querySelector('#analyzeChessboard .caissa-board')?.offsetParent),
            actionsVisible: Boolean(document.querySelector('#analyzeSection .analyze-board-navigation')?.offsetParent)
        };
    });
}

test('PostGame hands the completed game to the canonical Analyze section and Back restores it', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.setViewportSize(viewports[0]);
    const completed = await completeGame(page);

    await openCanonicalAnalyze(page);
    const handoff = await page.evaluate(() => ({
        currentSection: window.CaissaNavigation.currentSection,
        recordId: window.AnalyzeSection.loadedGame.recordId,
        fen: window.AnalyzeSection.getGame().fen(),
        pgn: window.AnalyzeSection.loadedGame.pgn,
        activeHandoffId: window.AnalyzeSection.activeHandoffId,
        inlineOpen: window.CaissaPlayV2InlineAnalyze.isOpen(),
        analyzeAriaHidden: document.getElementById('analyzeSection').getAttribute('aria-hidden'),
        inlineOverlay: document.body.classList.contains('caissa-play-v2-analyze-open')
    }));
    expect(handoff).toMatchObject({
        currentSection: 'analyze',
        recordId: completed.recordId,
        fen: completed.fen,
        inlineOpen: false,
        analyzeAriaHidden: null,
        inlineOverlay: false
    });
    expect(handoff.activeHandoffId).toBeTruthy();
    expect(handoff.pgn).toContain(completed.pgn.split('\n').at(-1).trim().split(' ')[1]);

    const frames = {};
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const measured = frames[viewport.name] = await analyzeFrame(page);
        expect(measured.activeSections).toEqual(['analyzeSection']);
        expect(measured).toMatchObject({ boardVisible: true, actionsVisible: true });
        expect(measured.horizontalOverflow, viewport.name).toBeLessThanOrEqual(1);
        for (const key of ['section', 'workspace', 'board', 'actions'])
            expect(measured[key], `${viewport.name} ${key}`).not.toBeNull();
    }
    await page.setViewportSize(viewports[0]);
    await page.screenshot({ path: `${ARTIFACT_DIR}/canonical-analyze-desktop-1600x1000.png`, fullPage: true });

    await page.goBack();
    await expect(page).toHaveURL(completed.url);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
    await expect(page.locator('[data-post-game-result]')).toHaveText(completed.result);
    await expect(page.locator('[data-post-game-reason]')).toHaveText(completed.reason);
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId))
        .toBe(completed.recordId);
    runtime.assertClean();
});

test('canonical Analyze keeps its board and actions reachable across supported zoom levels', async ({ page }) => {
    await page.setViewportSize(viewports[0]);
    await completeGame(page);
    await openCanonicalAnalyze(page);

    const measurements = {};
    for (const zoom of [0.9, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = measurements[zoom] = await analyzeFrame(page);
        expect(measured.activeSections).toEqual(['analyzeSection']);
        expect(measured).toMatchObject({ boardVisible: true, actionsVisible: true });
        expect(measured.horizontalOverflow, `${zoom * 100}%`).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    console.log(`PHASE004005_CANONICAL_ANALYZE ${JSON.stringify(measurements)}`);
});
