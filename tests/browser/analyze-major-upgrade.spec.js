import { expect, test } from '@playwright/test';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

const singlePgn = `[Event "CAISSA Analyzer"]
[Site "Local"]
[Date "2026.09.30"]
[Round "7"]
[White "Alexander"]
[Black "CAISSA"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const multiPgn = `${singlePgn}

[Event "Second Event"]
[Site "Local"]
[Date "2026.09.29"]
[Round "2"]
[White "Gamma"]
[Black "Delta"]
[Result "*"]

1. d4 d5 (1... Nf6 2. c4) 2. c4 e6 3. Nc3 Nf6 *`;

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { bestMove: 'e2e4', cp: 35, depth: 8, delayMs: 5 });
});

test('Open PGN loads one game directly and Flip Board preserves analysis context', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/analyze');
    await page.getByRole('tab', { name: 'Setup Position' }).click();

    const load = page.getByRole('button', { name: 'Load', exact: true });
    const open = page.getByRole('button', { name: 'Open PGN' });
    await expect(open).toBeVisible();
    const placement = await page.evaluate(() => ({
        loadBottom: document.getElementById('analyzeSetupLoad').getBoundingClientRect().bottom,
        openTop: document.getElementById('analyzeOpenPgnBtn').getBoundingClientRect().top
    }));
    expect(placement.openTop).toBeGreaterThanOrEqual(placement.loadBottom);

    await page.locator('#analyzePgnFile').setInputFiles({
        name: 'single-game.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(singlePgn)
    });
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('Alexander');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('CAISSA');
    await expect(page.locator('#analyzeMoveList .move-white')).toHaveCount(3);

    const before = await page.evaluate(() => ({
        fen: window.AnalyzeSection.getGame().fen(),
        cursor: window.AnalyzeSection.currentMoveIndex,
        currentNodeId: window.AnalyzeSection.getAnalysisTree().inspect().currentNodeId,
        orientation: window.AnalyzeSection.board.getOrientation()
    }));
    await page.locator('#analyzeFooterFlipBoard').click();
    const after = await page.evaluate(() => ({
        fen: window.AnalyzeSection.getGame().fen(),
        cursor: window.AnalyzeSection.currentMoveIndex,
        currentNodeId: window.AnalyzeSection.getAnalysisTree().inspect().currentNodeId,
        orientation: window.AnalyzeSection.board.getOrientation(),
        pressed: document.getElementById('analyzeFooterFlipBoard').getAttribute('aria-pressed')
    }));
    expect(after).toMatchObject({ fen: before.fen, cursor: before.cursor, currentNodeId: before.currentNodeId, pressed: 'true' });
    expect(after.orientation).not.toBe(before.orientation);
    expect(runtime.errors).toEqual([]);
});

test('multi-game PGN opens Game List and switches games without a page reload', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.goto('/analyze');
    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await page.locator('#analyzePgnFile').setInputFiles({
        name: 'collection.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(multiPgn)
    });

    const list = page.locator('#analyzePgnGameList');
    await expect(list).toBeVisible();
    await expect(list.locator('.caissa-analyze-v2__collection-game')).toHaveCount(2);
    await expect(list).toContainText('Alexander vs CAISSA');
    await expect(list).toContainText('Gamma vs Delta');
    await expect(list).toContainText('Second Event');
    await expect(list).toContainText('Round 2');

    await list.locator('[data-pgn-game-index="1"]').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('Gamma');
    await expect(page.getByRole('button', { name: 'Game List' })).toBeVisible();
    await page.getByRole('button', { name: 'Game List' }).click();
    await expect(list).toBeVisible();
    await list.locator('[data-pgn-game-index="0"]').click();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('Alexander');
    expect(await page.evaluate(() => window.AnalyzeSection.activePgnGameIndex)).toBe(0);
    expect(runtime.errors).toEqual([]);
});

test('historical moves create real nested RAV while main line and branch navigation remain intact', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.goto('/analyze');
    await page.evaluate(pgn => window.AnalyzeSection.loadPgnDocument(pgn, 'Browser RAV Test'), singlePgn);

    const result = await page.evaluate(() => {
        const analyze = window.AnalyzeSection;
        const tree = analyze.getAnalysisTree();
        const main = tree.getMainLine();
        analyze.jumpToFicsAnalysisNode(main[1].id);
        const d4Ok = analyze.playStudyMove('d2', 'd4');
        const d4 = tree.getCurrentNode();
        const exd4Ok = analyze.playStudyMove('e5', 'd4');
        const exd4 = tree.getCurrentNode();
        const qxd4Ok = analyze.playStudyMove('d1', 'd4');
        const qxd4 = tree.getCurrentNode();
        analyze.jumpToFicsAnalysisNode(d4.id, { preferMainContinuation: false });
        const nf6Ok = analyze.playStudyMove('g8', 'f6');
        const nf6 = tree.getCurrentNode();
        analyze.jumpToFicsAnalysisNode(main[3].id);
        analyze.navigateAnalysisLine('last');
        const mainRestored = analyze.getGame().history();
        analyze.jumpToFicsAnalysisNode(exd4.id, { preferMainContinuation: true });
        analyze.navigateAnalysisLine('next');
        const branchLast = tree.getCurrentNode();
        const exported = analyze.buildAnalysisPgn();
        return {
            outcomes: [d4Ok, exd4Ok, qxd4Ok, nf6Ok],
            ids: [d4.id, exd4.id, qxd4.id, nf6.id],
            main: tree.getMainLine().map(node => node.san),
            mainRestored,
            branchLast: branchLast.san,
            localNodes: tree.inspect().localNodeCount,
            exported,
            reparsedGames: window.CaissaAnalyzeVariationTree.parseCollection(exported).games.length
        };
    });
    expect(result.outcomes).toEqual([true, true, true, true]);
    expect(result.main).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(result.mainRestored).toEqual(result.main);
    expect(result.branchLast).toBe('Qxd4');
    expect(result.localNodes).toBe(4);
    expect(result.exported).toMatch(/\(2\. d4 exd4 \(2\.\.\. Nf6\) 3\. Qxd4\)/);
    expect(result.reparsedGames).toBe(1);
    await expect(page.locator('.caissa-analysis-variation')).toHaveCount(2);
    expect(runtime.errors).toEqual([]);
});

test('move list fills the workspace, uses approved typography, and keeps long SAN unclipped', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/analyze');
    await page.evaluate(pgn => window.AnalyzeSection.loadPgnDocument(pgn, 'Typography Test'), multiPgn.split(/\n\n(?=\[Event "Second)/)[1]);
    const metrics = await page.evaluate(() => {
        const notation = document.getElementById('analyzeMoveList');
        const footer = document.querySelector('.caissa-analyze-v2__footer');
        const san = notation.querySelector('.move-white, .move-black');
        const number = notation.querySelector('.move-num');
        const action = document.getElementById('analyzeFooterFlipBoard');
        const tab = document.getElementById('analyzeV2TabAnalysis');
        const n = getComputedStyle(notation);
        const s = getComputedStyle(san);
        return {
            gap: footer.getBoundingClientRect().top - notation.getBoundingClientRect().bottom,
            san: { size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight, spacing: s.letterSpacing },
            numberSize: getComputedStyle(number).fontSize,
            actionSize: getComputedStyle(action).fontSize,
            tabSize: getComputedStyle(tab).fontSize,
            horizontalOverflow: notation.scrollWidth - notation.clientWidth,
            notationOverflow: n.overflowX
        };
    });
    expect(Math.abs(metrics.gap)).toBeLessThanOrEqual(2);
    expect(metrics.san.size).toBe('18px');
    expect(Number(metrics.san.weight)).toBeGreaterThanOrEqual(600);
    expect(metrics.san.lineHeight).toBe('25px');
    expect(metrics.numberSize).toBe('16px');
    expect(parseFloat(metrics.actionSize)).toBeGreaterThanOrEqual(13);
    expect(parseFloat(metrics.tabSize)).toBeGreaterThanOrEqual(14);
    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.notationOverflow).toBe('hidden');
});
