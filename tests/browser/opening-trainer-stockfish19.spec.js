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
    const after = await page.locator('#openingTrainerBoard .caissa-board').boundingBox();
    expect(Math.abs(before.width - after.width)).toBeLessThan(1);
    expect(Math.abs(before.height - after.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
