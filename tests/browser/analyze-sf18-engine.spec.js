import { test, expect } from '@playwright/test';

const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const SF18_WASM = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm';
const GOLDEN_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

async function prepareRealEnginePage(page) {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const state = { created: [], terminated: [] };
        window.Worker = class TrackedNativeWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.__caissaTrackedUrl = String(url);
                state.created.push(this.__caissaTrackedUrl);
            }
            terminate() {
                state.terminated.push(this.__caissaTrackedUrl);
                return super.terminate();
            }
        };
        window.__caissaNativeWorkerAudit = state;
    });
}

for (const browserName of ['chromium', 'webkit']) {
    test(`A1.4 runs one isolated SF18 Analyze worker in ${browserName}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== browserName, `covered by the ${browserName} project`);
        await prepareRealEnginePage(page);
        const runtimeErrors = [];
        const wasmResponses = [];
        page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
        page.on('console', message => {
            if (message.type() === 'error' || /wasm (?:streaming )?compile failed/i.test(message.text()))
                runtimeErrors.push(`${message.type()}: ${message.text()}`);
        });
        page.on('response', response => {
            if (new URL(response.url()).pathname === SF18_WASM) {
                wasmResponses.push({ status: response.status(), contentType: response.headers()['content-type'] });
            }
        });

        await page.goto('/analyze');
        const toggle = page.locator('#analyzeEngineToggle');
        await toggle.click();
        await expect(toggle).toHaveText('Engine On');
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection.analysisEngine?.getUciIdentity?.()))
            .toEqual({
                name: 'Stockfish 18 Lite WASM',
                author: 'the Stockfish developers (see AUTHORS file)',
                validated: true
            });
        await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4, { timeout: 20_000 });

        const initial = await page.evaluate((workerPath) => {
            window.__a14Owner = window.AnalyzeSection.analysisEngine;
            return {
                ownerId: window.AnalyzeSection.analysisEngine?.id,
                ownerName: window.AnalyzeSection.analysisEngine?.name,
                ownerPath: window.AnalyzeSection.analysisEngine?.workerPath,
                analyzing: window.AnalyzeSection.analysisEngine?.isAnalyzing(),
                activeOperations: window.AnalyzeSection.analysisEngine?.inspectAttribution().activeOperationCount,
                currentFen: window.AnalyzeSection.liveCurrentResult?.fen,
                boardFen: window.AnalyzeSection.getGame().fen(),
                sf18Created: window.__caissaNativeWorkerAudit.created.filter(url => url === workerPath).length,
                legacyCreated: window.__caissaNativeWorkerAudit.created.filter(url => url === '/engine/stockfish-working.js').length
            };
        }, SF18_WORKER);
        expect(initial).toMatchObject({
            ownerId: 'stockfish-18-lite',
            ownerName: 'Stockfish 18 Lite WASM',
            ownerPath: SF18_WORKER,
            analyzing: true,
            activeOperations: 1,
            sf18Created: 1
        });
        expect(initial.currentFen).toBe(initial.boardFen);

        await toggle.click();
        await expect(toggle).toHaveText('Engine Off');
        await toggle.click();
        await expect(page.locator('.caissa-analyze-v2__engine-line')).toHaveCount(4, { timeout: 20_000 });
        const afterRestart = await page.evaluate((workerPath) => ({
            sameOwner: window.AnalyzeSection.analysisEngine === window.__a14Owner,
            sf18Created: window.__caissaNativeWorkerAudit.created.filter(url => url === workerPath).length
        }), SF18_WORKER);
        expect(afterRestart).toEqual({ sameOwner: true, sf18Created: 1 });

        const movedFen = await page.evaluate(() => {
            window.__a14Owner = window.AnalyzeSection.analysisEngine;
            const moves = [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6']];
            for (const [from, to] of moves) {
                if (!window.AnalyzeSection.playStudyMove(from, to)) throw new Error(`move failed: ${from}${to}`);
            }
            return window.AnalyzeSection.getGame().fen();
        });
        await page.evaluate(() => {
            ['analyzeNavFirst', 'analyzeNavLast', 'analyzeNavPrev', 'analyzeNavNext']
                .forEach(id => document.getElementById(id)?.click());
        });
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection.liveCurrentResult?.fen), { timeout: 20_000 })
            .toBe(movedFen);
        await expect.poll(() => page.evaluate(() =>
            window.AnalyzeSection.analysisEngine.inspectAttribution().activeOperationCount
        ), { timeout: 5_000 }).toBe(1);
        const final = await page.evaluate((workerPath) => ({
            sameOwner: window.AnalyzeSection.analysisEngine === window.__a14Owner,
            sf18Created: window.__caissaNativeWorkerAudit.created.filter(url => url === workerPath).length,
            activeOperations: window.AnalyzeSection.analysisEngine.inspectAttribution().activeOperationCount,
            boardFen: window.AnalyzeSection.getGame().fen(),
            resultFen: window.AnalyzeSection.liveCurrentResult?.fen
        }), SF18_WORKER);
        expect(final).toEqual({
            sameOwner: true,
            sf18Created: 1,
            activeOperations: 1,
            boardFen: movedFen,
            resultFen: movedFen
        });
        expect(wasmResponses.some(response => response.status === 200
            && response.contentType?.startsWith('application/wasm'))).toBe(true);
        expect(runtimeErrors).toEqual([]);
    });
}

test('A1.4 SF18 golden suite preserves raw score mapping and MultiPV order', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'golden engine suite runs once in Chromium');
    await prepareRealEnginePage(page);
    await page.goto('/analyze');

    const results = await page.evaluate(async ({ workerUrl, goldenFen }) => {
        const positions = [
            { id: 'starting', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
            { id: 'e4-e5-nf3-nc6', fen: goldenFen },
            { id: 'equal-middlegame', fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4' },
            { id: 'white-advantage', fen: '4k3/8/8/8/8/8/8/Q3K3 w - - 0 1' },
            { id: 'black-advantage', fen: 'q3k3/8/8/8/8/8/8/4K3 w - - 0 1' },
            { id: 'mate', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' }
        ];
        const worker = new Worker(workerUrl);
        const allLines = [];
        let readyResolve = null;
        let searchResolve = null;
        let searchLines = [];
        worker.onmessage = event => {
            const line = String(event.data);
            allLines.push(line);
            if (line === 'readyok') readyResolve?.();
            if (line.startsWith('info ')) searchLines.push(line);
            if (line.startsWith('bestmove')) searchResolve?.(line);
        };
        const waitReady = () => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('ready timeout')), 15_000);
            readyResolve = () => { clearTimeout(timer); readyResolve = null; resolve(); };
            worker.postMessage('isready');
        });
        worker.postMessage('uci');
        await new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (allLines.includes('uciok')) { clearInterval(timer); resolve(); }
            }, 10);
            setTimeout(() => { clearInterval(timer); reject(new Error('uci timeout')); }, 15_000);
        });
        worker.postMessage('setoption name MultiPV value 4');
        worker.postMessage('setoption name Hash value 16');
        await waitReady();

        const output = [];
        for (const position of positions) {
            searchLines = [];
            worker.postMessage(`position fen ${position.fen}`);
            const bestmove = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`search timeout: ${position.id}`)), 20_000);
                searchResolve = line => { clearTimeout(timer); searchResolve = null; resolve(line); };
                worker.postMessage('go depth 10');
            });
            const parsed = searchLines.map(raw => {
                const depth = Number(raw.match(/\bdepth (\d+)/)?.[1] || 0);
                const multipv = Number(raw.match(/\bmultipv (\d+)/)?.[1] || 1);
                const cpMatch = raw.match(/\bscore cp (-?\d+)/);
                const mateMatch = raw.match(/\bscore mate (-?\d+)/);
                return {
                    raw,
                    depth,
                    multipv,
                    cp: cpMatch ? Number(cpMatch[1]) : null,
                    mate: mateMatch ? Number(mateMatch[1]) : null,
                    pv: raw.match(/\bpv (.+)$/)?.[1] || ''
                };
            }).filter(line => line.pv);
            const deepest = Math.max(...parsed.map(line => line.depth));
            const latest = [1, 2, 3, 4].map(multipv => parsed
                .filter(line => line.multipv === multipv)
                .sort((left, right) => right.depth - left.depth)[0]).filter(Boolean);
            const primary = latest[0];
            const side = position.fen.split(' ')[1];
            output.push({
                ...position,
                deepest,
                lines: latest,
                bestmove,
                normalizedPawns: primary.cp === null ? null : (side === 'b' ? -primary.cp : primary.cp) / 100,
                normalizedMate: primary.mate === null ? null : (side === 'b' ? -primary.mate : primary.mate)
            });
            await waitReady();
        }
        worker.terminate();
        return output;
    }, { workerUrl: SF18_WORKER, goldenFen: GOLDEN_FEN });

    for (const result of results.slice(0, 5)) {
        expect(result.deepest).toBeGreaterThanOrEqual(10);
        expect(result.lines.map(line => line.multipv)).toEqual([1, 2, 3, 4]);
        expect(result.lines[0].raw).toMatch(/score (?:cp|mate) -?\d+.*\bpv /);
        const cpScores = result.lines.map(line => line.cp).filter(Number.isFinite);
        expect(cpScores).toEqual([...cpScores].sort((left, right) => right - left));
    }
    const golden = results.find(result => result.id === 'e4-e5-nf3-nc6');
    expect(golden.fen).toBe(GOLDEN_FEN);
    expect(golden.lines[0].cp).not.toBeNull();
    expect(golden.normalizedPawns).toBe(golden.lines[0].cp / 100);
    expect(Math.abs(results.find(result => result.id === 'starting').normalizedPawns)).toBeLessThan(1.5);
    expect(Math.abs(results.find(result => result.id === 'equal-middlegame').normalizedPawns)).toBeLessThan(1.5);
    expect(results.find(result => result.id === 'white-advantage').normalizedPawns).toBeGreaterThan(4);
    expect(results.find(result => result.id === 'black-advantage').normalizedPawns).toBeLessThan(-4);
    expect(results.find(result => result.id === 'mate').normalizedMate).toBeGreaterThan(0);
});
