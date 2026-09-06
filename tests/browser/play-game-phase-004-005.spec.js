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

async function openHeldAnalysis(page) {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true,
        resetSearchSequence: true, bestMoves: ['e7e5', 'b8c6'] }));
    for (let turn = 0; turn < 2; turn += 1) {
        const count = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
    }
    const completedFen = await page.evaluate(() => window.App.game.fen());
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    await page.evaluate(async () => {
        await window.CaissaPlayLazyLoader.load('analyze-deep', { qa: false, retry: true });
        const original = window.AnalyzeSection.startAnalysis.bind(window.AnalyzeSection);
        window.__phase004005 = { startCalls: 0, releases: 0, reviewEvents: 0, original };
        window.addEventListener('caissa:games-guided-review-request', () => {
            window.__phase004005.reviewEvents += 1;
        });
        window.AnalyzeSection.startAnalysis = async () => {
            window.__phase004005.startCalls += 1;
            await new Promise(resolve => { window.__phase004005.release = resolve; });
            return original();
        };
    });
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('.caissa-games-panel[data-games-phase="analysis-review"]')).toBeVisible();
    await expect(page.locator('.caissa-games-analysis__review')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__phase004005.startCalls)).toBe(1);
    expect(await page.evaluate(() => window.App.game.fen())).toBe(completedFen);
    return completedFen;
}

async function frame(page) {
    return page.evaluate(() => {
        const round = value => Math.round(value * 100) / 100;
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box ? [round(box.x), round(box.y), round(box.width), round(box.height)] : null;
        };
        const body = document.querySelector('[data-caissa-games-body]');
        const board = document.querySelector('.caissa-simplified-shell__board-stage')?.getBoundingClientRect();
        const context = document.querySelector('.caissa-simplified-shell__context')?.getBoundingClientRect();
        return {
            shell: rect('.caissa-games-panel'), head: rect('[data-caissa-games-head]'),
            body: rect('[data-caissa-games-body]'), foot: rect('[data-caissa-games-foot]'),
            board: rect('.caissa-simplified-shell__board-stage'), context: rect('.caissa-simplified-shell__context'),
            bodyClientHeight: body?.clientHeight || 0, bodyScrollHeight: body?.scrollHeight || 0,
            bodyOverflow: body ? getComputedStyle(body).overflowY : null,
            footAnchored: Math.abs((document.querySelector('[data-caissa-games-foot]')?.getBoundingClientRect().bottom || 0)
                - (document.querySelector('.caissa-games-panel')?.getBoundingClientRect().bottom || 0)) <= 1,
            boardContextBottomDelta: round((context?.bottom || 0) - (board?.bottom || 0)),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

async function setViewport(page, viewport) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, 0));
}

test('Play Game transitions through authoritative progress and summary in one permanent shell', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.setViewportSize(viewports[0]);
    const completedFen = await openHeldAnalysis(page);
    const panel = page.locator('.caissa-games-panel');
    const head = page.locator('[data-caissa-games-head]');
    const body = page.locator('[data-caissa-games-body]');
    const foot = page.locator('[data-caissa-games-foot]');

    await expect(head.locator('img:visible')).toHaveCount(1);
    await expect(head).toContainText("I'm analyzing your game...");
    await expect(head).toContainText('This will just take a moment.');
    await expect(body.locator('.caissa-games-analysis__loading')).toBeVisible();
    await expect(body).toContainText('Analyzing your game');
    await expect(body).toContainText('Reviewing move 1 of 5');
    await expect(foot.locator('button:visible')).toHaveText(['New Game', 'Review Game']);
    await expect(foot.locator('.caissa-games-analysis__review')).toBeDisabled();
    await expect(page.locator('#analyzeSection .analyze-layout:visible')).toHaveCount(0);
    await expect(page.locator('#playSection #chessboard .board-b72b1:visible')).toHaveCount(1);

    const progress = {};
    for (const viewport of viewports) {
        await setViewport(page, viewport);
        progress[viewport.name] = await frame(page);
        expect(progress[viewport.name]).toMatchObject({ bodyOverflow: 'auto', footAnchored: true, horizontalOverflow: 0 });
        if (viewport.name === '1600x1000')
            await page.screenshot({ path: `${ARTIFACT_DIR}/analysis-progress-desktop-1600x1000.png`, fullPage: true });
        if (viewport.name === '390x844') {
            await panel.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${ARTIFACT_DIR}/analysis-progress-mobile-390x844.png`, fullPage: false });
            await page.evaluate(() => window.scrollTo(0, 0));
        }
    }

    await setViewport(page, viewports[0]);
    await page.evaluate(() => {
        window.__caissaPlayHarness.configure({ resetSearchSequence: true, autoReply: true,
            scores: [30, 40, 110, 190, -190],
            bestMoves: ['a1a1', 'a1a1', 'a1a1', 'a1a1', 'a1a1'] });
        window.__phase004005.releases += 1;
        window.__phase004005.release();
    });
    await expect(foot.locator('.caissa-games-analysis__review')).toBeEnabled({ timeout: 20_000 });
    await expect(head).toContainText('Your review is ready.');
    await expect(head).toContainText("Let's see what happened.");
    await expect(body.locator('.caissa-games-analysis__comparison')).toBeVisible();
    await expect(body.locator('.caissa-games-analysis__name')).toHaveText(['You', 'CAISSA']);
    await expect(body.locator('.caissa-games-analysis__accuracy-value')).toHaveCount(2);
    await expect(body.locator('.caissa-games-analysis__row')).not.toHaveCount(0);
    await expect(foot.locator('button:visible')).toHaveText(['New Game', 'Review Game']);
    expect(await page.evaluate(() => window.App.game.fen())).toBe(completedFen);

    const summary = {};
    for (const viewport of viewports) {
        await setViewport(page, viewport);
        summary[viewport.name] = await frame(page);
        expect(summary[viewport.name]).toMatchObject({ bodyOverflow: 'auto', footAnchored: true, horizontalOverflow: 0 });
        for (const key of ['shell', 'head', 'body', 'foot', 'board', 'context'])
            expect(summary[viewport.name][key], `${viewport.name} ${key}`).toEqual(progress[viewport.name][key]);
        if (viewport.width > 600)
            expect(Math.abs(summary[viewport.name].boardContextBottomDelta)).toBeLessThanOrEqual(3);
        if (viewport.name === '1600x1000')
            await page.screenshot({ path: `${ARTIFACT_DIR}/analysis-summary-desktop-1600x1000.png`, fullPage: true });
        if (viewport.name === '390x844') {
            await panel.scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${ARTIFACT_DIR}/analysis-summary-mobile-390x844.png`, fullPage: false });
            await page.evaluate(() => window.scrollTo(0, 0));
        }
    }

    const proof = await page.evaluate(() => ({
        state: window.CaissaGamesAnalysisSummaryPresentation.getSnapshot(),
        startCalls: window.__phase004005.startCalls, releases: window.__phase004005.releases,
        results: window.AnalyzeSection.analysisResults.length,
        moves: window.AnalyzeSection.getLoadedMoves().length,
        pgn: window.AnalyzeSection.loadedGame.pgn,
        boards: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        caissa: [...document.querySelectorAll('[data-caissa-games-head] img')]
            .filter(node => node.getBoundingClientRect().width > 0).length
    }));
    expect(proof).toMatchObject({ startCalls: 1, releases: 1, results: proof.moves, boards: 1, caissa: 1,
        state: { mounted: true, phase: 'summary', analysisStartRequests: 1, analysisOwner: 'AnalyzeSection',
            analysisResultsOwner: 'AnalyzeSection.analysisResults', completedPgnOwner: 'AnalyzeSection.loadedGame.pgn',
            moveHistoryOwner: 'AnalyzeSection.getLoadedMoves' } });
    expect(proof.pgn).not.toBe('');

    await foot.locator('.caissa-games-analysis__review').click();
    expect(await page.evaluate(() => ({ events: window.__phase004005.reviewEvents,
        requests: window.CaissaGamesAnalysisSummaryPresentation.getSnapshot().reviewRequests,
        inlineOpen: window.CaissaPlayV2InlineAnalyze.isOpen() })))
        .toEqual({ events: 1, requests: 1, inlineOpen: true });
    await expect(page.locator('[data-bots-guided-review], [data-coach-review-shell], [data-native-mentor-review]')).toHaveCount(0);
    console.log(`PHASE004005_GEOMETRY ${JSON.stringify({ progress, summary })}`);
    runtime.assertClean();
});

test('zoom characterization keeps analysis actions reachable without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openHeldAnalysis(page);
    const progress = {};
    for (const zoom of [0.9, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = progress[zoom] = await frame(page);
        expect(measured.horizontalOverflow, `${zoom * 100}%`).toBeLessThanOrEqual(1);
        expect(measured.footAnchored, `${zoom * 100}%`).toBe(true);
    }
    await page.evaluate(() => {
        document.documentElement.style.zoom = '1';
        window.__caissaPlayHarness.configure({ resetSearchSequence: true, autoReply: true,
            scores: [30, 40, 110, 190, -190],
            bestMoves: ['a1a1', 'a1a1', 'a1a1', 'a1a1', 'a1a1'] });
        window.__phase004005.release();
    });
    await expect(page.locator('.caissa-games-analysis__review')).toBeEnabled({ timeout: 20_000 });
    const summary = {};
    for (const zoom of [0.9, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = summary[zoom] = await frame(page);
        expect(measured.horizontalOverflow, `${zoom * 100}% summary`).toBeLessThanOrEqual(1);
        expect(measured.footAnchored, `${zoom * 100}% summary`).toBe(true);
        for (const key of ['shell', 'head', 'body', 'foot', 'board', 'context'])
            expect(measured[key], `${zoom * 100}% ${key}`).toEqual(progress[zoom][key]);
    }
    console.log(`PHASE004005_ZOOM ${JSON.stringify({ progress, summary })}`);
});
