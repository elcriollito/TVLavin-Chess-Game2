import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime, playMove } from '../play/playwright-helpers.js';

const ARTIFACT_DIR = 'artifacts/play-game-v1-phase-006-007';
const viewports = [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
];

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function completeGame(page, turns = 3) {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    if (turns > 3) {
        const plies = await page.evaluate((turnCount) => {
            window.__caissaPlayHarness.configure({ autoReply: false });
            window.App.gameMode = 'human';
            window.App.isPlayerTurn = true;
            for (let index = 0; index < turnCount * 2; index += 1) {
                const candidates = window.App.game.moves({ verbose: true })
                    .sort((left, right) => Number(right.piece === 'p') - Number(left.piece === 'p'));
                let chosen = null;
                for (const candidate of candidates) {
                    const probe = new window.Chess();
                    probe.load(window.App.game.fen());
                    probe.move(candidate);
                    if (!probe.game_over()) { chosen = candidate; break; }
                }
                if (!chosen) break;
                const played = window.App.game.move({
                    from: chosen.from,
                    to: chosen.to,
                    promotion: chosen.promotion || undefined
                });
                if (!played) break;
                window.App.moveHistory.push({ ...played });
                window.App.currentMoveIndex = window.App.moveHistory.length - 1;
            }
            window.App.board.position(window.App.game.fen(), false);
            return window.App.game.history().length;
        }, turns);
        expect(plies).toBeGreaterThanOrEqual(turns * 2);
    } else {
        await page.evaluate(() => window.__caissaPlayHarness.configure({
            autoReply: true,
            resetSearchSequence: true,
            bestMoves: ['e7e5', 'b8c6', 'g8f6', 'f8b4']
        }));
        for (let turn = 0; turn < turns; turn += 1) {
            const count = await page.evaluate(() => window.App.game.history().length);
            const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
            expect(await playMove(page, move.from, move.to)).toBe(true);
            await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
        }
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    return page.evaluate(() => ({
        recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId,
        fen: window.App.game.fen(),
        pgn: window.App.game.pgn(),
        history: window.App.game.history(),
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

async function analyzeState(page) {
    return page.evaluate(() => ({
        recordId: window.AnalyzeSection.loadedGame.recordId,
        fen: window.AnalyzeSection.getGame().fen(),
        pgn: window.AnalyzeSection.loadedGame.pgn,
        history: window.AnalyzeSection.getLoadedMoves(),
        cursor: window.AnalyzeSection.currentMoveIndex,
        handoffId: window.AnalyzeSection.activeHandoffId,
        inlineOpen: window.CaissaPlayV2InlineAnalyze.isOpen(),
        activeSections: [...document.querySelectorAll('.content-section.active')].map(section => section.id)
    }));
}

async function geometry(page) {
    return page.evaluate(() => {
        const round = value => Math.round(value * 100) / 100;
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box ? { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) } : null;
        };
        const section = document.getElementById('analyzeSection');
        const moveList = document.getElementById('analyzeMoveList');
        return {
            section: rect('#analyzeSection'),
            layout: rect('#analyzeSection .analyze-layout'),
            board: rect('#analyzeChessboard .caissa-board'),
            actions: rect('#analyzeSection .analyze-board-navigation'),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            sectionOverflow: getComputedStyle(section).overflowY,
            sectionClientHeight: section.clientHeight,
            sectionScrollHeight: section.scrollHeight,
            moveListClientHeight: moveList?.clientHeight || 0,
            moveListScrollHeight: moveList?.scrollHeight || 0,
            boardVisible: Boolean(document.querySelector('#analyzeChessboard .caissa-board')?.offsetParent),
            actionsVisible: Boolean(document.querySelector('#analyzeSection .analyze-board-navigation')?.offsetParent)
        };
    });
}

test('canonical Analyze preserves completed-game authority, exact ply navigation, and Back state', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.setViewportSize(viewports[0]);
    const completed = await completeGame(page);
    await openCanonicalAnalyze(page);

    const initial = await analyzeState(page);
    expect(initial).toMatchObject({
        recordId: completed.recordId,
        fen: completed.fen,
        history: completed.history,
        inlineOpen: false,
        activeSections: ['analyzeSection']
    });
    expect(initial.handoffId).toBeTruthy();
    expect(initial.pgn).toContain(completed.history.at(-1));

    await page.locator('#analyzeNavFirst').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await page.locator('#analyzeNavNext').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(0);
    await page.locator('#analyzeNavLast').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(completed.history.length - 1);
    await page.locator('#analyzeNavPrev').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(completed.history.length - 2);

    const afterNavigation = await analyzeState(page);
    expect({
        recordId: afterNavigation.recordId,
        pgn: afterNavigation.pgn,
        history: afterNavigation.history,
        handoffId: afterNavigation.handoffId,
        inlineOpen: afterNavigation.inlineOpen,
        activeSections: afterNavigation.activeSections
    }).toEqual({
        recordId: initial.recordId,
        pgn: initial.pgn,
        history: initial.history,
        handoffId: initial.handoffId,
        inlineOpen: initial.inlineOpen,
        activeSections: initial.activeSections
    });

    const frames = {};
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const measured = frames[viewport.name] = await geometry(page);
        expect(measured).toMatchObject({ boardVisible: true, actionsVisible: true, horizontalOverflow: 0 });
    }
    await page.setViewportSize(viewports[0]);
    await page.screenshot({ path: `${ARTIFACT_DIR}/canonical-analyze-navigation-1600x1000.png`, fullPage: true });

    await page.goBack();
    await expect(page).toHaveURL(completed.url);
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
    await expect(page.locator('[data-post-game-result]')).toHaveText(completed.result);
    await expect(page.locator('[data-post-game-reason]')).toHaveText(completed.reason);
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId))
        .toBe(completed.recordId);
    runtime.assertClean();
    console.log(`PHASE006007_CANONICAL_EVIDENCE ${JSON.stringify({ frames, recordId: completed.recordId })}`);
});

test('long canonical Analyze notation remains reachable across supported zoom levels', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewports[0]);
    const completed = await completeGame(page, 12);
    await openCanonicalAnalyze(page);
    await expect(page.locator('#analyzeMoveList')).not.toBeEmpty();
    expect((await analyzeState(page)).history.length).toBeGreaterThanOrEqual(24);

    const measurements = {};
    for (const zoom of [0.9, 1, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = measurements[zoom] = await geometry(page);
        expect(measured).toMatchObject({ boardVisible: true, actionsVisible: true, horizontalOverflow: 0 });
        expect(measured.sectionOverflow).toBe('auto');
        expect(measured.moveListScrollHeight).toBeGreaterThan(0);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(completed.history.length - 1);
    expect((await analyzeState(page)).recordId).toBe(completed.recordId);
    console.log(`PHASE006007_LONG_CANONICAL ${JSON.stringify(measurements)}`);
});

test('generic Analyze remains isolated when opened without a Play Game review context', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true,
        resetSearchSequence: true, bestMoves: ['e7e5'] }));
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(2);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();

    const opened = await page.evaluate(async () => {
        await window.CaissaPlayLazyLoader.load('analyze-deep', { qa: false, retry: true });
        const record = window.CaissaGameRecord.buildFromPlay();
        const handoff = window.CaissaAnalyzeHandoff.createFromCompletedPlayRecord(record);
        return handoff.ok ? window.CaissaPlayV2InlineAnalyze.open({ token: handoff.value.token }) : handoff;
    });
    expect(opened).toMatchObject({ ok: true, status: 'accepted' });
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeSection')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.caissa-games-panel')).toHaveAttribute('data-games-phase', 'game-over');
    await expect(page.locator('[data-bots-guided-review], [data-bots-analysis-exploration]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('#analyzeSection')).not.toHaveClass(/active/);
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
});
