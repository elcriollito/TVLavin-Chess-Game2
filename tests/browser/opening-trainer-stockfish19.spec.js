import { expect, test } from '@playwright/test';

const ROUTE = '/opening-trainer';
const WORKER = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js';
const WASM = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm';
const E4_E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

async function enableEngine(page) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        sessionStorage.setItem('caissa.opening-trainer.engine-enabled', 'true');
    });
}

async function waitForPrincipal(page, fen, minimumDepth = 18) {
    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer?.getState().engine), {
        timeout: 35_000,
        intervals: [100, 250, 500]
    }).toMatchObject({ fen, depth: expect.any(Number), score: expect.any(String) });
    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer.getState().engine.depth), {
        timeout: 35_000,
        intervals: [100, 250, 500]
    }).toBeGreaterThanOrEqual(minimumDepth);
    return page.evaluate(() => window.CaissaOpeningTrainer.getState().engine);
}

async function installRecoveringWorker(page) {
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        const fixture = { created: 0, terminated: 0 };
        window.__openingTrainerRecoveryFixture = fixture;
        class RecoveryWorker {
            constructor(url) {
                this.url = String(url);
                this.instance = ++fixture.created;
                this.onmessage = null;
                this.onerror = null;
                this.timer = null;
                this.terminated = false;
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
                } else if (message === 'go infinite') {
                    if (this.instance === 1) {
                        this.emit('info depth 6 multipv 1 score cp 15 pv e2e4 e7e5');
                        setTimeout(() => this.onerror?.({ message: 'injected worker failure' }), 30);
                        setTimeout(() => this.emit('info depth 99 multipv 1 score cp 999 pv h2h4'), 1200);
                    } else {
                        let depth = 8;
                        this.timer = setInterval(() => {
                            this.emit(`info depth ${depth++} multipv 1 score cp 22 pv e2e4 e7e5`);
                        }, 50);
                    }
                } else if (message === 'stop') {
                    clearInterval(this.timer);
                    this.emit('bestmove e2e4');
                } else if (message === 'quit') {
                    clearInterval(this.timer);
                }
            }
            terminate() {
                if (this.terminated) return;
                this.terminated = true;
                fixture.terminated += 1;
                clearInterval(this.timer);
            }
        }
        window.Worker = function Worker(url, options) {
            return String(url).includes('/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js')
                ? new RecoveryWorker(url)
                : new NativeWorker(url, options);
        };
    });
}

test('Opening Trainer evaluates 1.e4 e5 with Stockfish 19 and keeps score independent of board orientation', async ({ page }) => {
    await enableEngine(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#trainerEngineStrip')).toContainText('Stockfish 19 Lite');
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'ready', { timeout: 20_000 });

    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));
    const result = await waitForPrincipal(page, E4_E5_FEN);
    expect(result.identity).toMatchObject({
        displayName: 'Stockfish 19 Lite',
        uciName: 'Stockfish 19 Lite WASM',
        workerPath: WORKER,
        wasmPath: WASM,
        ready: true
    });
    expect(result.targetDepth).toBe(20);
    expect(result.multiPV).toBe(3);
    expect(result.searchMode).toBe('infinite-attributed');
    expect(result.debug.analyzing).toBe(true);
    expect(result.debug.supportedOptions).toEqual(expect.arrayContaining([
        'MultiPV', 'Hash', 'Threads', 'UCI_ShowWDL', 'Ponder'
    ]));
    expect(result.debug.configuredOptions).toEqual(expect.arrayContaining([
        'Hash', 'Threads', 'UCI_ShowWDL', 'Ponder'
    ]));
    expect(result.debug.configuredOptions.includes('UCI_AnalyseMode'))
        .toBe(result.debug.supportedOptions.includes('UCI_AnalyseMode'));
    expect(result.score).toMatch(/^(?:[+\-]\d+\.\d{2}|.?M-?\d+)$/);
    await expect(page.locator('#trainerEngineLines li')).toHaveCount(3);
    await expect(page.locator('#openingTrainerBoard .caissa-board__arrow-line')).toHaveCount(1);

    const beforeFlip = await page.locator('#trainerEngineEval').textContent();
    await page.locator('#trainerFlipBoard').click();
    await expect(page.locator('#openingTrainerBoard .caissa-board')).toHaveAttribute('data-orientation', 'black');
    await expect(page.locator('#trainerEngineEval')).toHaveText(beforeFlip);
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().engine)).fen).toBe(E4_E5_FEN);
});

test('rapid position changes, Practice and NEW cannot display stale Stockfish results', async ({ page }) => {
    await enableEngine(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'ready', { timeout: 20_000 });

    await page.evaluate(() => {
        window.CaissaOpeningTrainer.loadOpeningLine(['d4', 'd5']);
        window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']);
    });
    const settled = await waitForPrincipal(page, E4_E5_FEN);
    expect(settled.fen).toBe(E4_E5_FEN);

    await page.locator('#trainerSaveTrainButton').click();
    await page.locator('#trainerConfirmPractice').click();
    await expect(page.locator('#trainerTabPractice')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'paused');
    await expect(page.locator('#trainerEngineEval')).toHaveText('\u2014');
    await expect(page.locator('#trainerEngineDepth')).toHaveText('Paused');
    await expect(page.locator('#trainerEnginePv')).toHaveText('Paused during protected practice');
    await expect(page.locator('#trainerEngineLines')).toContainText('Analysis is hidden');
    await expect(page.locator('#openingTrainerBoard .caissa-board__arrow-line')).toHaveCount(0);
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().engine)).score).toBeNull();

    await page.locator('#trainerTabAnalysis').click();
    await waitForPrincipal(page, E4_E5_FEN);
    await page.locator('#trainerNewStudy').click();
    if (await page.locator('#trainerNewStudyDialog').isVisible()) {
        await page.locator('#trainerNewStudyDialog button[value="discard"]').click();
    }
    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer.getState().engine.fen), {
        timeout: 20_000
    }).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes))).toHaveLength(1);
});

test('real SF19 Lite handles the comparative position matrix in-browser', async ({ page }, testInfo) => {
    await page.goto('/favicon-test.html');
    const assets = [];
    page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (pathname === WORKER || pathname === WASM) {
            assets.push({ pathname, status: response.status(), contentType: response.headers()['content-type'] || '' });
        }
    });
    const cases = [
        { id: 'initial', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
        { id: 'e4-e5', fen: E4_E5_FEN },
        { id: 'd4-d5', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2' },
        { id: 'white-material', fen: '4k3/8/8/8/8/8/2Q5/4K3 w - - 0 1' },
        { id: 'black-material', fen: '4k3/4q3/8/8/8/8/8/4K3 w - - 0 1' },
        { id: 'forced-mate', fen: '7k/6pp/8/8/8/8/6PP/5RK1 w - - 0 1' }
    ];
    const evidence = await page.evaluate(async ({ workerPath, positions }) => {
        const worker = new Worker(workerPath);
        const subscribers = new Set();
        const identity = { name: '', author: '' };
        const emit = line => {
            if (line.startsWith('id name ')) identity.name = line.slice(8).trim();
            if (line.startsWith('id author ')) identity.author = line.slice(10).trim();
            [...subscribers].forEach(listener => listener(line));
        };
        worker.onmessage = event => emit(String(event.data?.data ?? event.data));
        const waitFor = (predicate, timeout = 30_000) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                subscribers.delete(listener);
                reject(new Error('Stockfish browser test timed out.'));
            }, timeout);
            const listener = line => {
                if (!predicate(line)) return;
                clearTimeout(timer);
                subscribers.delete(listener);
                resolve(line);
            };
            subscribers.add(listener);
        });
        worker.postMessage('uci');
        await waitFor(line => line.trim() === 'uciok');
        worker.postMessage('setoption name MultiPV value 1');
        worker.postMessage('setoption name Hash value 16');
        worker.postMessage('setoption name Threads value 1');
        worker.postMessage('setoption name UCI_ShowWDL value true');
        worker.postMessage('isready');
        await waitFor(line => line.trim() === 'readyok');

        const results = [];
        for (const position of positions) {
            const startedAt = performance.now();
            let principal = null;
            const listener = line => {
                if (!line.startsWith('info') || !/\bmultipv\s+1\b/.test(line) || !/\bscore\s+(?:cp|mate)\s+-?\d+/.test(line)) return;
                const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] || 0);
                if (principal && principal.depth > depth) return;
                const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
                const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
                const wdl = line.match(/\bwdl\s+(\d+)\s+(\d+)\s+(\d+)/);
                const pv = line.match(/\bpv\s+(.+)$/);
                principal = {
                    depth,
                    rawCp: cp ? Number(cp[1]) : null,
                    rawMate: mate ? Number(mate[1]) : null,
                    wdl: wdl ? wdl.slice(1).map(Number) : null,
                    pv: pv ? pv[1].trim().split(/\s+/) : []
                };
            };
            subscribers.add(listener);
            worker.postMessage(`position fen ${position.fen}`);
            const bestmovePromise = waitFor(line => line.startsWith('bestmove'));
            worker.postMessage('go depth 18');
            const bestmove = await bestmovePromise;
            subscribers.delete(listener);
            const side = position.fen.split(/\s+/)[1];
            results.push({
                ...position,
                ...principal,
                whitePawns: principal?.rawCp == null ? null : (side === 'b' ? -principal.rawCp : principal.rawCp) / 100,
                whiteMate: principal?.rawMate == null ? null : (side === 'b' ? -principal.rawMate : principal.rawMate),
                bestmove: bestmove.split(/\s+/)[1] || '',
                elapsedMs: Math.round(performance.now() - startedAt)
            });
        }
        worker.postMessage('quit');
        worker.terminate();
        return { identity, results };
    }, { workerPath: WORKER, positions: cases });

    await testInfo.attach('stockfish-19-comparative-evidence.json', {
        body: Buffer.from(JSON.stringify({ engine: evidence.identity, assets, results: evidence.results }, null, 2)),
        contentType: 'application/json'
    });
    expect(evidence.identity).toEqual({
        name: 'Stockfish 19 Lite WASM',
        author: 'the Stockfish developers (see AUTHORS file)'
    });
    expect(evidence.results.filter(result => ['initial', 'e4-e5', 'd4-d5'].includes(result.id))
        .every(result => result.depth >= 18), JSON.stringify(evidence.results)).toBe(true);
    expect(evidence.results.find(result => result.id === 'forced-mate').depth).toBeGreaterThan(0);
    expect(Math.abs(evidence.results.find(result => result.id === 'initial').whitePawns)).toBeLessThan(1);
    expect(Math.abs(evidence.results.find(result => result.id === 'e4-e5').whitePawns)).toBeLessThan(1);
    expect(Math.abs(evidence.results.find(result => result.id === 'd4-d5').whitePawns)).toBeLessThan(1);
    const whiteMaterial = evidence.results.find(result => result.id === 'white-material');
    const blackMaterial = evidence.results.find(result => result.id === 'black-material');
    expect(whiteMaterial.whitePawns > 3 || whiteMaterial.whiteMate > 0).toBe(true);
    expect(blackMaterial.whitePawns < -3 || blackMaterial.whiteMate < 0).toBe(true);
    expect(evidence.results.find(result => result.id === 'forced-mate').whiteMate).toBeGreaterThan(0);
    expect(assets.find(asset => asset.pathname === WORKER)?.status).toBe(200);
    expect(assets.find(asset => asset.pathname === WASM)).toMatchObject({
        status: 200,
        contentType: expect.stringContaining('application/wasm')
    });
});

test('mobile policy uses bounded depth and MultiPV without changing the board geometry', async ({ page }) => {
    await enableEngine(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'ready', { timeout: 20_000 });
    const before = await page.locator('#openingTrainerBoard .caissa-board').boundingBox();
    const engine = await page.evaluate(() => window.CaissaOpeningTrainer.getState().engine);
    expect(engine).toMatchObject({ targetDepth: 18, multiPV: 2 });
    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));
    await waitForPrincipal(page, E4_E5_FEN, 18);
    await expect.poll(async () => (await page.evaluate(() => window.CaissaOpeningTrainer.getState().engine)).debug)
        .toMatchObject({ analyzing: false, lastStopReason: 'target-depth' });
    const after = await page.locator('#openingTrainerBoard .caissa-board').boundingBox();
    expect(Math.abs(before.width - after.width)).toBeLessThan(1);
    expect(Math.abs(before.height - after.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('real worker failure recovers once without overlap and rejects stale callbacks', async ({ page }) => {
    await enableEngine(page);
    await installRecoveringWorker(page);
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));

    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer.getState().engine), {
        timeout: 10_000
    }).toMatchObject({
        ready: true,
        score: '+0.22',
        debug: {
            recoveryTotal: 1,
            workerLifecycle: { created: 2, terminated: 1, active: 1, peakActive: 1 }
        }
    });
    const recovered = await page.evaluate(() => window.CaissaOpeningTrainer.getState().engine);
    expect(recovered.debug.errors.some(error => error.code === 'ENGINE_WORKER_ERROR')).toBe(true);
    expect(recovered.score).not.toBe('+9.99');
    expect(await page.evaluate(() => window.__openingTrainerRecoveryFixture)).toEqual({ created: 2, terminated: 1 });

    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));
    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer.getState().engine.fen), {
        timeout: 10_000
    }).toBe(E4_E5_FEN);
    await expect.poll(async () => page.evaluate(() => window.CaissaOpeningTrainer.getState().engine.score), {
        timeout: 10_000
    }).toBe('+0.22');
});
