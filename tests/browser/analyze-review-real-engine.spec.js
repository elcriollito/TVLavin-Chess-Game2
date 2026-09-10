import { test, expect } from '@playwright/test';

const GOLDEN_CHESS_COM_URL = 'https://www.chess.com/game/live/170875822747?username=tvlavin';
const LICHESS_URL = 'https://lichess.org/8fuPHGyu';

test.beforeEach(async ({ page }) => {
    test.skip(process.env.CAISSA_REAL_REVIEW_QA !== '1', 'Opt-in real SF18/provider benchmark');
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const stats = { created: 0, terminated: 0, sf18Created: 0, sf18Terminated: 0, urls: [], commands: [] };
        window.Worker = new Proxy(NativeWorker, {
            construct(target, args, newTarget) {
                const worker = Reflect.construct(target, args, newTarget);
                const url = String(args[0]);
                stats.created += 1;
                stats.urls.push(url);
                if (url.includes('/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js')) stats.sf18Created += 1;
                const postMessage = worker.postMessage.bind(worker);
                worker.postMessage = message => {
                    stats.commands.push(String(message));
                    return postMessage(message);
                };
                const terminate = worker.terminate.bind(worker);
                worker.terminate = () => {
                    stats.terminated += 1;
                    if (url.includes('/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js')) stats.sf18Terminated += 1;
                    return terminate();
                };
                return worker;
            }
        });
        window.__realReviewWorkerStats = stats;
    });
});

async function openGames(page) {
    await page.goto('/analyze');
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await page.locator('#analyzeV2TabGames').click();
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
}

async function importUrl(page, url) {
    await page.locator('#analyzeGameUrl').fill(url);
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible({ timeout: 45_000 });
}

test('real SF18 reviews the imported golden game and remains healthy for Lichess', async ({ page, browserName }) => {
    test.setTimeout(360_000);
    await openGames(page);
    await importUrl(page, GOLDEN_CHESS_COM_URL);
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('TVLAVIN');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('kopi_walet');
    await expect.poll(() => page.evaluate(() => AnalyzeSection.getLoadedMoves().length)).toBeGreaterThanOrEqual(30);
    await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4, { timeout: 30_000 });

    const before = await page.evaluate(() => {
        AnalyzeSection.jumpToMove(11);
        window.__realReviewEngine = AnalyzeSection.analysisEngine;
        window.__realReviewGame = AnalyzeSection.loadedGame.game;
        window.__realReviewBoard = AnalyzeSection.board;
        return {
            cursor: AnalyzeSection.currentMoveIndex,
            plies: AnalyzeSection.getLoadedMoves().length,
            workers: { ...window.__realReviewWorkerStats },
            commandOffset: window.__realReviewWorkerStats.commands.length
        };
    });
    const startedAt = Date.now();
    await page.locator('#analyzeReviewBtn').click();
    await expect.poll(() => page.evaluate(() => AnalyzeSection.analysisPhase), { timeout: 300_000 }).toBe('complete');
    await expect.poll(() => page.evaluate(() => AnalyzeSection.liveEngineOwner), { timeout: 30_000 }).toBe('analyze-live');
    const elapsedMs = Date.now() - startedAt;
    const after = await page.evaluate(offset => ({
        cursor: AnalyzeSection.currentMoveIndex,
        plies: AnalyzeSection.getLoadedMoves().length,
        results: AnalyzeSection.analysisResults.length,
        metrics: AnalyzeSection.lastReviewMetrics,
        sameEngine: AnalyzeSection.analysisEngine === window.__realReviewEngine,
        sameGame: AnalyzeSection.loadedGame.game === window.__realReviewGame,
        sameBoard: AnalyzeSection.board === window.__realReviewBoard,
        liveEnabled: AnalyzeSection.liveEngineEnabled,
        qualities: AnalyzeSection.analysisResults.map(result => result?.quality || null),
        symbols: AnalyzeSection.analysisResults.map(result => AnalyzeSection.getReviewMoveSymbol(result)).filter(Boolean),
        workers: {
            created: window.__realReviewWorkerStats.created,
            terminated: window.__realReviewWorkerStats.terminated,
            sf18Created: window.__realReviewWorkerStats.sf18Created,
            sf18Terminated: window.__realReviewWorkerStats.sf18Terminated,
            urls: [...window.__realReviewWorkerStats.urls]
        },
        commands: window.__realReviewWorkerStats.commands.slice(offset)
    }), before.commandOffset);
    expect(after.plies).toBe(before.plies);
    expect(after.results).toBe(before.plies);
    expect(after.cursor).toBe(before.cursor);
    expect(after.sameEngine && after.sameGame && after.sameBoard).toBe(true);
    expect(after.liveEnabled).toBe(true);
    expect(after.workers.sf18Created).toBe(1);
    expect(after.workers.sf18Terminated).toBe(0);
    expect(after.metrics).toMatchObject({
        status: 'complete', plies: before.plies, depth: 12, retryDepth: 8,
        timeouts: 0, retries: 0
    });
    expect(after.commands.filter(command => command === 'go depth 12')).toHaveLength(before.plies + 1);
    expect(after.commands).not.toContain('go depth 8');
    expect(after.commands.at(-1)).toBe('go infinite');
    expect(after.symbols.length).toBeGreaterThan(0);
    await expect(page.locator('#analyzeReviewBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.caissa-analyze-v2__notation')).not.toContainText(/[-+]\d+\.\d+/);

    console.log('REAL_REVIEW_METRICS', JSON.stringify({
        browserName,
        plies: before.plies,
        elapsedMs,
        ...after.metrics,
        workerCount: after.workers.sf18Created,
        bookMoves: after.qualities.filter(quality => quality === 'Book').length,
        visibleAnnotations: after.symbols.length
    }));

    await page.locator('#analyzeV2TabGames').click();
    await importUrl(page, LICHESS_URL);
    await expect(page.locator('#analyzeGameSource')).toHaveText('Lichess Game URL');
    expect(await page.evaluate(() => ({
        plies: AnalyzeSection.getLoadedMoves().length,
        sameEngine: AnalyzeSection.analysisEngine === window.__realReviewEngine,
        workers: window.__realReviewWorkerStats.sf18Created
    }))).toMatchObject({ sameEngine: true, workers: 1 });
});
