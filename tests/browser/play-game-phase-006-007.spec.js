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

async function openSummary(page, turns = 3) {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    if (turns > 3) {
        const plies = await page.evaluate((turnCount) => {
            window.__caissaPlayHarness.configure({ autoReply: false });
            window.App.gameMode = 'human'; window.App.isPlayerTurn = true;
            for (let index = 0; index < turnCount * 2; index += 1) {
                const candidates = window.App.game.moves({ verbose: true })
                    .sort((left, right) => Number(right.piece === 'p') - Number(left.piece === 'p'));
                let chosen = null;
                for (const candidate of candidates) {
                    const probe = new window.Chess(); probe.load(window.App.game.fen()); probe.move(candidate);
                    if (!probe.game_over()) { chosen = candidate; break; }
                }
                if (!chosen) break;
                const played = window.App.game.move({ from: chosen.from, to: chosen.to,
                    promotion: chosen.promotion || undefined });
                if (!played) break;
                window.App.moveHistory.push({ ...played });
                window.App.currentMoveIndex = window.App.moveHistory.length - 1;
            }
            window.App.board.position(window.App.game.fen(), false);
            window.__caissaPlayHarness.configure({ autoReply: true, resetSearchSequence: true,
                scores: [20, 35, 65, 120, -80, 15] });
            return window.App.game.history().length;
        }, turns);
        expect(plies).toBeGreaterThanOrEqual(turns * 2);
    } else {
        await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true,
            resetSearchSequence: true, scores: [30, 40, 110, 190, -190],
            bestMoves: ['e7e5', 'b8c6', 'g8f6', 'f8b4'] }));
        for (let turn = 0; turn < turns; turn += 1) {
            const count = await page.evaluate(() => window.App.game.history().length);
            const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
            expect(await playMove(page, move.from, move.to)).toBe(true);
            await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBe(count + 2);
        }
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-games-panel[data-games-phase="game-over"]')).toBeVisible();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('.caissa-games-analysis__review')).toBeEnabled({ timeout: 25_000 });
}

async function fingerprint(page) {
    return page.evaluate(async () => {
        const stable = value => JSON.stringify(value, (key, item) => key === 'updatedAt' ? undefined : item);
        const hash = async value => {
            const bytes = new TextEncoder().encode(stable(value));
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        };
        const analyze = window.AnalyzeSection;
        const values = {
            completedPgn: analyze.loadedGame?.pgn || '',
            sourceMoves: analyze.getLoadedMoves({ verbose: true }),
            appMoveHistory: window.App.moveHistory,
            analysisResults: analyze.analysisResults,
            accuracy: window.CaissaAnalyzeReviewPolicy.accuracy(analyze.analysisResults),
            classifications: analyze.analysisResults.map(item => ({ quality: item.quality,
                annotation: item.annotation, isBestMove: item.isBestMove })),
            gameResult: window.App.gameStatus
        };
        const entries = await Promise.all(Object.entries(values).map(async ([key, value]) => [key, await hash(value)]));
        return Object.fromEntries(entries);
    });
}

async function geometry(page) {
    return page.evaluate(() => {
        const round = value => Math.round(value * 100) / 100;
        const rect = selector => {
            const box = document.querySelector(selector)?.getBoundingClientRect();
            return box ? { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height),
                bottom: round(box.bottom) } : null;
        };
        const body = document.querySelector('[data-caissa-games-body]');
        const shell = document.querySelector('.caissa-games-panel')?.getBoundingClientRect();
        const foot = document.querySelector('[data-caissa-games-foot]')?.getBoundingClientRect();
        const board = document.querySelector('.caissa-simplified-shell__board-stage')?.getBoundingClientRect();
        const context = document.querySelector('.caissa-simplified-shell__context')?.getBoundingClientRect();
        return { shell: rect('.caissa-games-panel'), head: rect('[data-caissa-games-head]'),
            body: rect('[data-caissa-games-body]'), foot: rect('[data-caissa-games-foot]'),
            board: rect('.caissa-simplified-shell__board-stage'), context: rect('.caissa-simplified-shell__context'),
            bodyClientHeight: body?.clientHeight || 0, bodyScrollHeight: body?.scrollHeight || 0,
            bodyOverflow: body ? getComputedStyle(body).overflowY : null,
            footAnchored: Math.abs((foot?.bottom || 0) - (shell?.bottom || 0)) <= 1,
            boardContextBottomDelta: round((context?.bottom || 0) - (board?.bottom || 0)),
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
}

async function viewportShot(page, state, viewport) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const measured = await geometry(page);
    console.log(`PHASE006007_FRAME ${state} ${viewport.name} ${JSON.stringify(measured)}`);
    expect(measured).toMatchObject({ bodyOverflow: 'auto', footAnchored: true, horizontalOverflow: 0 });
    if (viewport.width > 600)
        expect(Math.abs(measured.boardContextBottomDelta), `${state} ${viewport.name} baseline`).toBeLessThanOrEqual(3);
    if (viewport.name === '1600x1000')
        await page.screenshot({ path: `${ARTIFACT_DIR}/${state}-desktop-1600x1000.png`, fullPage: true });
    if (viewport.name === '390x844') {
        await page.locator('.caissa-games-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${ARTIFACT_DIR}/${state}-mobile-390x844.png`, fullPage: false });
        await page.evaluate(() => window.scrollTo(0, 0));
    }
    return measured;
}

test('Play Game Guided Review and Study preserve authoritative data and exact reviewed ply', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.setViewportSize(viewports[0]);
    await openSummary(page);
    const immutableBefore = await fingerprint(page);

    await page.locator('.caissa-games-analysis__review').click();
    const panel = page.locator('.caissa-games-panel');
    await expect(panel).toHaveAttribute('data-games-phase', 'guided-review');
    await expect(panel.locator('[data-bots-guided-review]')).toBeVisible();
    await expect(panel.locator('[data-caissa-games-head] img:visible')).toHaveCount(1);
    await expect(panel.locator('[data-bots-guided-speech]')).toContainText(/BEST|BOOK|ACCEPTABLE|INACCURACY|MISTAKE|BLUNDER/);
    await expect(panel.locator('[data-bots-guided-explain]')).toBeVisible();
    await expect(panel.locator('[data-bots-guided-next-moment]')).toBeVisible();
    await expect(panel.locator('[data-bots-guided-notation]')).not.toBeEmpty();
    await expect(panel.locator('[data-caissa-games-foot] button:visible')).toHaveCount(6);

    await panel.locator('[data-bots-guided-nav="last"]').click();
    const lastPly = await page.evaluate(() => window.AnalyzeSection.getLoadedMoves().length - 1);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(lastPly);
    await panel.locator('[data-bots-guided-nav="first"]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(-1);
    await panel.locator('[data-bots-guided-nav="next"]').click();
    await panel.locator('[data-bots-guided-nav="previous"]').click();
    await panel.locator('[data-bots-guided-ply="1"]').click();
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(1);
    const nextMoment = panel.locator('[data-bots-guided-next-moment]');
    if (await nextMoment.isEnabled()) await nextMoment.click();

    const reviewGeometry = {};
    for (const viewport of viewports) reviewGeometry[viewport.name] = await viewportShot(page, 'guided-review', viewport);
    await page.setViewportSize(viewports[0]);
    const reviewEntry = await page.evaluate(() => ({
        ply: window.AnalyzeSection.currentMoveIndex,
        fen: window.AnalyzeSection.getCoachReviewProjection().fen,
        model: window.CaissaGamesGuidedReviewPresentation.getSnapshot()
    }));

    await panel.locator('.caissa-bots-guided__analysis').click();
    await expect(panel).toHaveAttribute('data-games-phase', 'analysis-exploration');
    await expect(panel.locator('[data-bots-analysis-exploration]')).toBeVisible();
    await expect(panel.locator('[data-bots-exploration-head] img:visible')).toHaveCount(1);
    await expect(panel.locator('[data-bots-exploration-source]')).not.toBeEmpty();
    await expect(panel.locator('[data-bots-exploration-variation-section]')).toBeHidden();
    await expect(panel.locator('[data-bots-exploration-nav]')).toHaveCount(4);
    await expect(panel.locator('[data-bots-exploration-back]')).toContainText('Back to Review');
    await expect(panel.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(reviewEntry.ply);

    await panel.locator('[data-bots-exploration-nav="first"]').click();
    await panel.locator('[data-bots-exploration-nav="next"]').click();
    await panel.locator('[data-bots-exploration-nav="last"]').click();
    await panel.locator('[data-bots-exploration-nav="previous"]').click();
    await page.evaluate(() => window.CaissaBotsAnalysisExploration.goToSource(0));

    await page.locator('#chessboard .square-e2').click();
    await page.locator('#chessboard .square-e4').click();
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount)).toBe(1);
    await page.locator('#chessboard .square-g8').dragTo(page.locator('#chessboard .square-f6'));
    await expect.poll(() => page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().temporaryPlyCount)).toBe(2);
    await page.screenshot({ path: `${ARTIFACT_DIR}/study-with-variation-desktop-1600x1000.png`, fullPage: true });

    await page.evaluate(() => window.CaissaBotsAnalysisExploration.goToTemporary(1));
    await page.locator('#chessboard .square-c7').click();
    await page.locator('#chessboard .square-c5').click();
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getLine().map(move => move.san)))
        .toEqual(['e4', 'c5']);

    const requestsBeforeOff = await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().engineRequests);
    await panel.locator('[data-bots-exploration-engine]').click();
    await expect(panel.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'false');
    await panel.locator('[data-bots-exploration-nav="first"]').click();
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.getSnapshot().engineRequests)).toBe(requestsBeforeOff);
    await panel.locator('[data-bots-exploration-engine]').click();
    await expect(panel.locator('[data-bots-exploration-engine]')).toHaveAttribute('aria-pressed', 'true');

    const studyGeometry = {};
    for (const viewport of viewports) studyGeometry[viewport.name] = await viewportShot(page, 'study', viewport);
    await page.setViewportSize(viewports[0]);
    await panel.locator('[data-bots-exploration-back]').click();
    await expect(panel).toHaveAttribute('data-games-phase', 'guided-review');
    const restoration = await page.evaluate(() => window.CaissaGamesGuidedReviewPresentation.getSnapshot().lastRestoration);
    expect(restoration.exact).toBe(true);
    expect(restoration.after.currentMoveIndex).toBe(reviewEntry.ply);
    expect(restoration.after.fen).toBe(reviewEntry.fen);
    expect(await page.evaluate(() => window.CaissaBotsAnalysisExploration.isActive())).toBe(false);
    expect(await fingerprint(page)).toEqual(immutableBefore);
    console.log(`PHASE006007_EVIDENCE ${JSON.stringify({ reviewGeometry, studyGeometry, restoration,
        immutableBefore, immutableAfter: await fingerprint(page) })}`);
    runtime.assertClean();
});

test('long review and Study lines grow only BODY scrollHeight across zoom levels', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewports[0]);
    await openSummary(page, 12);
    await page.locator('.caissa-games-analysis__review').click();
    const panel = page.locator('.caissa-games-panel');
    expect(await page.evaluate(() => window.AnalyzeSection.getLoadedMoves().length)).toBeGreaterThanOrEqual(24);
    const longReview = {};
    for (const zoom of [0.9, 1, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = longReview[zoom] = await geometry(page);
        expect(measured.bodyScrollHeight).toBeGreaterThan(measured.bodyClientHeight);
        expect(measured).toMatchObject({ bodyOverflow: 'auto', footAnchored: true, horizontalOverflow: 0 });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await panel.locator('.caissa-bots-guided__analysis').click();
    await page.evaluate(() => window.CaissaBotsAnalysisExploration.goToSource(0));
    await page.evaluate(() => {
        const owner = window.CaissaBotsAnalysisExploration;
        for (let index = 0; index < 40; index += 1) {
            const files = 'abcdefgh'; let chosen = null;
            for (const file of files) for (let rank = 1; rank <= 8 && !chosen; rank += 1) {
                const from = `${file}${rank}`; const move = owner.movesFrom(from)[0];
                if (move) chosen = { from, to: move.to, promotion: move.promotion };
            }
            if (!chosen || !owner.playMove(chosen.from, chosen.to, chosen.promotion)) break;
        }
    });
    const longStudy = {};
    for (const zoom of [0.9, 1, 1.1, 1.25]) {
        await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
        const measured = longStudy[zoom] = await geometry(page);
        expect(measured.bodyScrollHeight).toBeGreaterThan(measured.bodyClientHeight);
        expect(measured).toMatchObject({ bodyOverflow: 'auto', footAnchored: true, horizontalOverflow: 0 });
    }
    console.log(`PHASE006007_LONG_SCROLL ${JSON.stringify({ longReview, longStudy })}`);
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
