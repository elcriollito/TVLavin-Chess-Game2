import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = '/opening-trainer';
const E4_E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EXPECT_LEGACY_TIMEOUT = process.env.CAISSA_EXPECT_LEGACY_TIMEOUT === '1';
const SOAK_DURATION_MS = Math.max(1_000, Number(process.env.CAISSA_ENGINE_SOAK_MS) || 90_000);
const EVIDENCE_DIR = process.env.CAISSA_ENGINE_EVIDENCE_DIR || '';

test.setTimeout(EXPECT_LEGACY_TIMEOUT ? 55_000 : Math.max(65_000, SOAK_DURATION_MS + 65_000));

async function enableEngine(page) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        sessionStorage.setItem('caissa.opening-trainer.engine-enabled', 'true');
    });
}

async function installSlowHealthyWorker(page) {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        class SlowHealthyStockfishWorker {
            constructor(url) {
                this.url = String(url);
                this.onmessage = null;
                this.onerror = null;
                this.onmessageerror = null;
                this.timer = null;
                this.depth = 1;
            }
            emit(data) { queueMicrotask(() => this.onmessage?.({ data })); }
            postMessage(message) {
                if (message === 'uci') {
                    this.emit('id name Stockfish 19 Lite WASM');
                    this.emit('id author the Stockfish developers (see AUTHORS file)');
                    this.emit('option name MultiPV type spin default 1 min 1 max 256');
                    this.emit('option name Hash type spin default 16 min 1 max 33554432');
                    this.emit('option name Threads type spin default 1 min 1 max 1024');
                    this.emit('option name UCI_ShowWDL type check default false');
                    this.emit('option name UCI_AnalyseMode type check default false');
                    this.emit('option name Ponder type check default false');
                    this.emit('uciok');
                } else if (message === 'isready') {
                    this.emit('readyok');
                } else if (/^go depth /.test(message)) {
                    this.timer = setInterval(() => {
                        this.emit(`info depth ${this.depth++} multipv 1 score cp 20 pv g1f3 b8c6`);
                    }, 750);
                } else if (message === 'stop') {
                    clearInterval(this.timer);
                    this.emit('bestmove g1f3');
                } else if (message === 'quit') {
                    clearInterval(this.timer);
                }
            }
            terminate() { clearInterval(this.timer); }
        }
        window.Worker = function Worker(url, options) {
            return String(url).includes('/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js')
                ? new SlowHealthyStockfishWorker(url)
                : new NativeWorker(url, options);
        };
    });
}

async function engineState(page) {
    return page.evaluate(() => window.CaissaOpeningTrainer?.getState().engine);
}

async function waitForFenScore(page, fen, timeout = 40_000) {
    await expect.poll(() => engineState(page), {
        timeout,
        intervals: [100, 250, 500, 1_000]
    }).toMatchObject({ ready: true, fen, score: expect.any(String) });
    return engineState(page);
}

test('Stockfish 19 attributed analysis survives 90 seconds and remains reusable', async ({ page }, testInfo) => {
    await enableEngine(page);
    if (EXPECT_LEGACY_TIMEOUT) await installSlowHealthyWorker(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'ready', { timeout: 20_000 });
    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));

    if (EXPECT_LEGACY_TIMEOUT) {
        await expect(page.locator('#trainerEnginePv')).toHaveText('The bot move took too long.', { timeout: 40_000 });
        const legacy = {
            elapsedMs: 30_000,
            fen: (await engineState(page))?.fen || '',
            state: await page.locator('#trainerEngineStrip').getAttribute('data-engine-state'),
            message: await page.locator('#trainerEnginePv').textContent()
        };
        await testInfo.attach('legacy-timeout-reproduction.json', {
            body: Buffer.from(JSON.stringify(legacy, null, 2)),
            contentType: 'application/json'
        });
        expect(legacy.fen).toBe('');
        expect(legacy.state).toBe('error');
        return;
    }

    await waitForFenScore(page, E4_E5_FEN);

    // Preserve a real unsaved tree with two continuations while the engine runs.
    await page.locator('#openingTrainerBoard .caissa-board__square[data-square="g1"]').click();
    await page.locator('#openingTrainerBoard .caissa-board__square[data-square="f3"]').click();
    await page.locator('#trainerPreviousMove').click();
    await page.locator('#openingTrainerBoard .caissa-board__square[data-square="f1"]').click();
    await page.locator('#openingTrainerBoard .caissa-board__square[data-square="c4"]').click();
    await page.locator('#trainerPreviousMove').click();
    await waitForFenScore(page, E4_E5_FEN);
    const treeBefore = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes);
    expect(treeBefore.length).toBeGreaterThanOrEqual(5);

    const startedAt = Date.now();
    const samples = [];
    while (Date.now() - startedAt < SOAK_DURATION_MS) {
        await page.waitForTimeout(Math.min(10_000, SOAK_DURATION_MS - (Date.now() - startedAt)));
        samples.push(await engineState(page));
        await expect(page.locator('#trainerEnginePv')).not.toHaveText('The bot move took too long.');
        await expect(page.locator('#trainerEngineStrip')).not.toHaveAttribute('data-engine-state', 'error');
    }

    const afterSoak = await engineState(page);
    const treeAfter = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes);
    expect(treeAfter).toEqual(treeBefore);
    expect(afterSoak).toMatchObject({
        ready: true,
        fen: E4_E5_FEN,
        score: expect.any(String),
        searchMode: 'infinite-attributed'
    });
    expect(afterSoak.debug.errors.some(error => error.code === 'ENGINE_SEARCH_TIMEOUT')).toBe(false);
    expect(afterSoak.debug.workerLifecycle.active).toBe(1);
    expect(afterSoak.debug.workerLifecycle.peakActive).toBe(1);

    const firstRequestId = afterSoak.requestId;
    await page.locator('#trainerNextMove').click();
    await expect.poll(async () => {
        const state = await engineState(page);
        return Boolean(state.requestId && state.requestId !== firstRequestId
            && state.fen !== E4_E5_FEN && typeof state.score === 'string');
    }, { timeout: 40_000 }).toBe(true);
    const nextPosition = await engineState(page);
    expect(nextPosition.fen).not.toBe(E4_E5_FEN);
    expect(nextPosition.score).toEqual(expect.any(String));

    await page.locator('#trainerSaveTrainButton').click();
    await page.locator('#trainerConfirmPractice').click();
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'paused');
    await expect(page.locator('#trainerEngineEval')).toHaveText('\u2014');
    expect((await engineState(page)).score).toBeNull();
    await page.locator('#trainerTabAnalysis').click();
    await expect.poll(async () => (await engineState(page)).score, { timeout: 40_000 }).toEqual(expect.any(String));

    await page.locator('#trainerNewStudy').click();
    if (await page.locator('#trainerNewStudyDialog').isVisible()) {
        await page.locator('#trainerNewStudyDialog button[value="discard"]').click();
    }
    const finalState = await waitForFenScore(page, START_FEN);
    expect(finalState.debug.workerLifecycle.active).toBe(1);
    expect(finalState.debug.workerLifecycle.peakActive).toBe(1);
    expect(finalState.debug.errors.some(error => error.code === 'ENGINE_SEARCH_TIMEOUT')).toBe(false);

    const evidence = {
        browser: testInfo.project.name,
        elapsedMs: Date.now() - startedAt,
        engineId: afterSoak.identity?.uciName,
        fen: afterSoak.fen,
        depth: afterSoak.depth,
        score: afterSoak.score,
        requestId: afterSoak.requestId,
        samples: samples.map(sample => ({ depth: sample.depth, score: sample.score, ready: sample.ready })),
        workerLifecycle: finalState.debug.workerLifecycle,
        timeoutCount: finalState.debug.errors.filter(error => error.code === 'ENGINE_SEARCH_TIMEOUT').length,
        finalState: finalState.debug.state,
        finalFen: finalState.fen
    };
    await testInfo.attach('stockfish-19-90s-stability.json', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json'
    });
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach('stockfish-19-90s-final.png', {
        body: screenshot,
        contentType: 'image/png'
    });
    if (EVIDENCE_DIR) {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        const stem = `stockfish-19-90s-${testInfo.project.name}`;
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${stem}.json`), `${JSON.stringify(evidence, null, 2)}\n`);
        fs.writeFileSync(path.join(EVIDENCE_DIR, `${stem}.png`), screenshot);
    }
    console.log(`CAISSA_ENGINE_SOAK ${JSON.stringify(evidence)}`);
});
