import { test, expect } from '@playwright/test';
import { ENGINE18_001_BROWSER_BASELINE as baseline } from './fixtures/engine18-001-browser-baseline.js';

const LEGACY_WORKER = '/engine/stockfish-working.js';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const POSITIONS = Object.freeze([
    Object.freeze({ id: 'start', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }),
    Object.freeze({ id: 'open-game', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' }),
    Object.freeze({ id: 'mate-in-one', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' })
]);

async function createAuditedPage(browser, profile) {
    const context = await browser.newContext(profile);
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0 };
        window.Worker = class TrackedWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options); this.__auditUrl = String(url); this.__auditTerminated = false;
                audit.created.push(this.__auditUrl); audit.active += 1;
                audit.maximum = Math.max(audit.maximum, audit.active);
            }
            terminate() {
                if (!this.__auditTerminated) {
                    this.__auditTerminated = true; audit.terminated.push(this.__auditUrl); audit.active -= 1;
                }
                return super.terminate();
            }
        };
        window.__engine18WorkerAudit = audit;
    });
    return { context, page: await context.newPage() };
}

function roundedBox(rect) {
    if (!rect) return null;
    return Object.fromEntries(['x', 'y', 'width', 'height', 'right', 'bottom']
        .map(key => [key, Math.round(rect[key] * 100) / 100]));
}

function expectBox(actual, expected, label) {
    for (const [index, key] of ['x', 'y', 'width', 'height'].entries())
        expect(Math.abs(actual[key] - expected[index]), `${label}.${key}`).toBeLessThanOrEqual(1.5);
}

async function readLayout(page, surface) {
    return page.evaluate(({ surface, selector }) => {
        const shell = document.querySelector('[data-caissa-simplified-shell]');
        const panel = document.querySelector(selector);
        const box = node => node ? Object.fromEntries(['x', 'y', 'width', 'height', 'right', 'bottom']
            .map(key => [key, node.getBoundingClientRect()[key]])) : null;
        const region = node => node?.hasAttribute('data-caissa-coach-head') || node?.hasAttribute('data-caissa-coach-head-wrap')
            || node?.hasAttribute('data-caissa-games-head') || node?.hasAttribute('data-caissa-bots-head') ? 'head'
            : node?.hasAttribute('data-caissa-coach-body') || node?.hasAttribute('data-caissa-coach-body-wrap')
                || node?.hasAttribute('data-caissa-games-body') || node?.hasAttribute('data-caissa-bots-body') ? 'body'
                : node?.hasAttribute('data-caissa-coach-foot') || node?.hasAttribute('data-caissa-coach-foot-wrap')
                    || node?.hasAttribute('data-caissa-games-foot') || node?.hasAttribute('data-caissa-bots-foot') ? 'foot' : 'other';
        const nodes = surface === 'coach'
            ? [['[data-caissa-coach-head-wrap]', '[data-caissa-coach-head]'],
                ['[data-caissa-coach-body-wrap]', '[data-caissa-coach-body]'],
                ['[data-caissa-coach-foot-wrap]', '[data-caissa-coach-foot]']]
                .map(items => document.querySelector(items[0]) || document.querySelector(items[1])).filter(Boolean)
            : [...(panel?.children || [])];
        return {
            mode: shell?.dataset.mode || null,
            layout: shell?.dataset.layout || null,
            boardCount: document.querySelectorAll('#chessboard').length,
            persistentBoardCount: document.querySelectorAll('#chessboard [data-caissa-persistent-board]').length,
            tabLabels: [...document.querySelectorAll('[data-shell-mode]')].map(node => node.textContent.trim()),
            directRegions: nodes.map(region),
            boxes: {
                shell: box(shell), board: box(document.querySelector('#chessboard')),
                tabs: box(document.querySelector('.caissa-simplified-shell__modes')), panel: box(panel),
                head: box(nodes.find(node => region(node) === 'head')),
                body: box(nodes.find(node => region(node) === 'body')),
                foot: box(nodes.find(node => region(node) === 'foot'))
            },
            coach: {
                shellCount: document.querySelectorAll('[data-caissa-coach-shell]').length,
                headCount: document.querySelectorAll('[data-caissa-coach-head-wrap]').length,
                bodyCount: document.querySelectorAll('[data-caissa-coach-body-wrap]').length,
                footCount: document.querySelectorAll('[data-caissa-coach-foot-wrap], [data-caissa-coach-foot]').length,
                footPosition: getComputedStyle(document.querySelector('[data-caissa-coach-foot-wrap]')
                    || document.querySelector('[data-caissa-coach-foot]') || document.body).position,
                pageOverflowY: getComputedStyle(document.documentElement).overflowY
            }
        };
    }, { surface, selector: baseline.routes[surface].panel });
}

async function captureEngine(page, route, panel) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator(panel)).toBeVisible();
    return page.evaluate(async ({ positions, legacyWorker }) => {
        const engine = window.App?.engine;
        if (!engine || engine.workerPath !== legacyWorker || engine.ready)
            throw new Error('Expected an inactive route-owned legacy App.engine.');
        const times = { start: performance.now(), uciok: null, readyok: null };
        engine.onLine = line => {
            if (line === 'uciok' && times.uciok === null) times.uciok = performance.now() - times.start;
            if (line === 'readyok' && times.readyok === null) times.readyok = performance.now() - times.start;
        };
        await engine.start();
        const startupMs = performance.now() - times.start;
        const searches = [];
        for (const position of positions) {
            const started = performance.now();
            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`search timeout: ${position.id}`)), 10_000);
                const generation = engine.getBestMoveAttributed(position.fen, (bestMove, ponder, callbackGeneration) => {
                    clearTimeout(timeout); resolve({ bestMove, ponder, generation: callbackGeneration });
                }, { depth: 4, multiPv: 1 });
                if (!generation) { clearTimeout(timeout); reject(new Error(`search rejected: ${position.id}`)); }
            });
            const game = new window.Chess(position.fen);
            const legal = !!game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4),
                promotion: result.bestMove.slice(4, 5) || undefined });
            searches.push({ id: position.id, fen: position.fen, requestFen: engine.currentFen,
                bestMove: result.bestMove, legal, elapsedMs: performance.now() - started });
        }
        return {
            identity: engine.getUciIdentity(), providerId: engine.id, workerPath: engine.workerPath,
            uciokMs: times.uciok, readyokMs: times.readyok, startupMs, searches,
            workerAudit: JSON.parse(JSON.stringify(window.__engine18WorkerAudit))
        };
    }, { positions: POSITIONS, legacyWorker: LEGACY_WORKER });
}

function expectPerformance(result) {
    expect(result.providerId).toBe('stockfish');
    expect(result.workerPath).toBe(LEGACY_WORKER);
    expect(result.identity.validated).toBe(true);
    expect(result.uciokMs).toBeLessThan(baseline.performanceBudgetsMs.uciok);
    expect(result.readyokMs).toBeLessThan(baseline.performanceBudgetsMs.readyok);
    expect(result.startupMs).toBeLessThan(baseline.performanceBudgetsMs.startup);
    expect(result.searches[0].elapsedMs).toBeLessThan(baseline.performanceBudgetsMs.firstDepth4Result);
    for (const search of result.searches) {
        expect(search.requestFen).toBe(search.fen);
        expect(search.legal).toBe(true);
        expect(search.elapsedMs).toBeLessThan(baseline.performanceBudgetsMs.repeatedDepth4Result);
    }
    expect(result.workerAudit.created.filter(path => path === LEGACY_WORKER)).toHaveLength(1);
    expect(result.workerAudit.maximum).toBe(1);
    expect(result.workerAudit.active).toBe(1);
}

test('ENGINE18-001 captures fresh Play/Bots/Coach DOM and layout baselines', async ({ browser }, testInfo) => {
    const capture = {};
    for (const [profileId, profile] of Object.entries(baseline.profiles)) {
        capture[profileId] = {};
        for (const [surface, contract] of Object.entries(baseline.routes)) {
            const { context, page } = await createAuditedPage(browser, profile);
            await page.goto(contract.route, { waitUntil: 'networkidle' });
            await expect(page.locator(contract.panel)).toBeVisible();
            await expect.poll(() => page.locator('#chessboard').evaluate(node => node.getBoundingClientRect().width))
                .toBeGreaterThan(200);
            await page.evaluate(() => document.fonts?.ready);
            const actual = await readLayout(page, surface);
            actual.boxes = Object.fromEntries(Object.entries(actual.boxes).map(([key, value]) => [key, roundedBox(value)]));
            capture[profileId][surface] = actual;
            const expected = baseline.measurements.dom[profileId][surface];
            expect(actual.mode).toBe(contract.mode);
            expect(actual.layout).toBe(expected.layout);
            expect(actual.boardCount).toBe(1);
            expect(actual.tabLabels).toEqual(baseline.expectedTabLabels);
            expect(actual.directRegions).toEqual(expected.directRegions);
            for (const [region, box] of Object.entries(expected.boxes))
                expectBox(actual.boxes[region], box, `${profileId}.${surface}.${region}`);
            if (surface === 'coach') {
                expect(actual.coach).toMatchObject({ shellCount: 1, headCount: 1, bodyCount: 1 });
                expect(actual.coach.footCount).toBe(expected.footCount);
                expect(actual.coach.footPosition).toBe(expected.footPosition);
            }
            await testInfo.attach(`${profileId}-${surface}-current-baseline`, {
                body: await page.screenshot({ fullPage: true }), contentType: 'image/png'
            });
            await context.close();
        }
    }
    expect(Object.keys(capture)).toEqual(Object.keys(baseline.profiles));
});

test('ENGINE18-001 measures legacy Play and Coach active-engine performance on desktop and mobile Chromium', async ({ browser }) => {
    const capture = {};
    for (const [profileId, profile] of Object.entries(baseline.profiles)) {
        capture[profileId] = {};
        for (const surface of ['play', 'coach']) {
            const contract = baseline.routes[surface];
            const { context, page } = await createAuditedPage(browser, profile);
            const result = await captureEngine(page, contract.route, contract.panel);
            expectPerformance(result);
            expect(result.searches.map(search => search.bestMove))
                .toEqual(baseline.measurements.performance[profileId][surface].bestMoves);
            capture[profileId][surface] = result;
            await context.close();
        }
    }
    expect(Object.keys(capture)).toEqual(Object.keys(baseline.profiles));
});

test('ENGINE18-001 captures every required Play strength request and legal legacy bestmove', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await createAuditedPage(browser, baseline.profiles.desktopChromium);
    await page.goto('/play', { waitUntil: 'networkidle' });
    await expect(page.locator(baseline.routes.play.panel)).toBeVisible();
    const results = await page.evaluate(async (fen) => {
        await window.App.engine.start();
        const targets = [250, 500, 800, 1200, 1600, 2000, 2400, 2800, 3200];
        const output = [];
        for (const target of targets) {
            window.CaissaOpponentStrengthSession.beginGame(target);
            const strength = window.CaissaOpponentStrengthSession.getSearchOptions();
            const options = strength || { movetime: 2000 };
            const started = performance.now();
            const result = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`strength timeout: ${target}`)), 30_000);
                window.App.engine.getBestMoveAttributed(fen, (bestMove, ponder, generation) => {
                    clearTimeout(timeout); resolve({ bestMove, ponder, generation });
                }, options);
            });
            const game = new window.Chess(fen);
            const legal = !!game.move({ from: result.bestMove.slice(0, 2), to: result.bestMove.slice(2, 4),
                promotion: result.bestMove.slice(4, 5) || undefined });
            output.push({ target, depth: strength?.depth ?? null, movetimeMs: strength ? null : 2000,
                multiPv: window.App.engine.multipv, canonicalFen: fen, requestFen: window.App.engine.currentFen,
                bestMove: result.bestMove, legal, elapsedMs: performance.now() - started });
        }
        return { output, audit: JSON.parse(JSON.stringify(window.__engine18WorkerAudit)) };
    }, POSITIONS[2].fen);
    for (const item of results.output) {
        expect(item.requestFen).toBe(item.canonicalFen);
        expect(item.legal).toBe(true);
        expect(item.multiPv).toBe(1);
        expect(item.elapsedMs).toBeLessThan(baseline.performanceBudgetsMs.repeatedDepth4Result);
    }
    expect(results.audit.maximum).toBe(1);
    expect(results.output.map(({ target, depth, movetimeMs, multiPv, canonicalFen, bestMove }) =>
        ({ target, depth, movetimeMs, multiPv, canonicalFen, bestMove }))).toEqual(
        baseline.measurements.playStrengths.samples.map(({ target, depth, movetimeMs, multiPv, bestMove }) =>
            ({ target, depth, movetimeMs, multiPv,
                canonicalFen: baseline.measurements.playStrengths.canonicalFen, bestMove })));
    await context.close();
});

test('ENGINE18-001 measures route cleanup and Coach-to-Review worker handoff without overlap', async ({ browser }) => {
    const capture = {};
    for (const [profileId, profile] of Object.entries(baseline.profiles)) {
        const { context, page } = await createAuditedPage(browser, profile);
        await captureEngine(page, '/play', baseline.routes.play.panel);
        const routeStarted = Date.now();
        await page.evaluate(() => window.CaissaPlayRouteController.navigate('/play/coach?simplified=1'));
        await expect(page.locator(baseline.routes.coach.panel)).toBeVisible();
        const routeTransitionMs = Date.now() - routeStarted;
        const handoff = await page.evaluate(async ({ sf18Worker }) => {
            const started = performance.now();
            window.App.engine?.terminate('engine18-handoff-baseline');
            const activeAfterGameplayTerminate = window.__engine18WorkerAudit.active;
            const review = window.EngineRegistry.createAnalyzeEngine('stockfish-18-lite', {
                autoStart: false, owner: 'engine18-review-handoff-baseline'
            });
            await review.start();
            const result = {
                elapsedMs: performance.now() - started,
                activeAfterGameplayTerminate,
                identity: review.getUciIdentity(),
                workerPath: review.workerPath,
                audit: JSON.parse(JSON.stringify(window.__engine18WorkerAudit))
            };
            review.terminate('engine18-handoff-baseline-complete');
            result.activeAfterReviewTerminate = window.__engine18WorkerAudit.active;
            return result;
        }, { sf18Worker: SF18_WORKER });
        expect(routeTransitionMs).toBeLessThan(baseline.performanceBudgetsMs.routeTransition);
        expect(handoff.elapsedMs).toBeLessThan(baseline.performanceBudgetsMs.coachReviewHandoff);
        expect(handoff.activeAfterGameplayTerminate).toBe(0);
        expect(handoff.workerPath).toBe(SF18_WORKER);
        expect(handoff.identity).toEqual({ name: 'Stockfish 18 Lite WASM',
            author: 'the Stockfish developers (see AUTHORS file)', validated: true });
        expect(handoff.audit.maximum).toBe(1);
        expect(handoff.audit.active).toBe(1);
        expect(handoff.activeAfterReviewTerminate).toBe(0);
        capture[profileId] = { routeTransitionMs, handoff };
        await context.close();
    }
    expect(Object.keys(capture)).toEqual(Object.keys(baseline.profiles));
});
