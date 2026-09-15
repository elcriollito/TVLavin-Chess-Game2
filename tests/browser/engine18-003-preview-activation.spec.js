import { test, expect } from '@playwright/test';

const LEGACY_WORKER = '/engine/stockfish-working.js';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const FIXED_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const BLACK_BOOK_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const BLACK_NONBOOK_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 13';
const TARGETS = Object.freeze([
    { target: 250, depth: null, movetimeMs: 50, skill: 0 },
    { target: 500, depth: null, movetimeMs: 50, skill: 4 },
    { target: 800, depth: null, movetimeMs: 50, skill: 8 },
    { target: 1200, depth: null, movetimeMs: 50, skill: 12 },
    { target: 1600, depth: null, movetimeMs: 50, skill: 16 },
    { target: 2000, depth: 12, movetimeMs: null, skill: 20 },
    { target: 2400, depth: 16, movetimeMs: null, skill: 20 },
    { target: 2800, depth: 18, movetimeMs: null, skill: 20 },
    { target: 3200, depth: null, movetimeMs: 2000, skill: 20 }
]);

async function newAuditedPage(browser, profile = {}) {
    const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const context = await browser.newContext({
        ...profile,
        ...(protectionBypass ? {
            extraHTTPHeaders: {
                ...(profile.extraHTTPHeaders || {}),
                'x-vercel-protection-bypass': protectionBypass
            }
        } : {})
    });
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0, messages: [] };
        window.Worker = class Engine18003TrackedWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.__engine18003Url = String(url);
                this.__engine18003Terminated = false;
                audit.created.push(this.__engine18003Url);
                audit.active += 1;
                audit.maximum = Math.max(audit.maximum, audit.active);
            }
            postMessage(message, transfer) {
                audit.messages.push({ url: this.__engine18003Url, message: String(message), at: performance.now() });
                return super.postMessage(message, transfer);
            }
            terminate() {
                if (!this.__engine18003Terminated) {
                    this.__engine18003Terminated = true;
                    audit.terminated.push(this.__engine18003Url);
                    audit.active -= 1;
                }
                return super.terminate();
            }
        };
        window.__engine18003WorkerAudit = audit;
    });
    return { context, page: await context.newPage() };
}

async function gotoPlay(page, route = '/play') {
    const response = await page.goto(route);
    await page.waitForFunction(() => window.App?.engine && window.EngineRegistry && window.Chess);
    return response;
}

test('Preview activates SF18 only for Game and performs ordered Game → Bots → Coach ownership', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'ENGINE18-003 route matrix runs once in Chromium');
    const { context, page } = await newAuditedPage(browser);
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const response = await gotoPlay(page);
    expect(response.headers()['x-caissa-gameplay-provider']).toBe('stockfish-18-gameplay');
    expect(await page.locator('meta[name="caissa-play-gameplay-provider"]').getAttribute('content'))
        .toBe('stockfish-18-gameplay');

    const game = await page.evaluate(async ({ sf18, legacy }) => {
        const passive = { ...window.__engine18003WorkerAudit };
        await window.App.engine.start();
        return {
            passiveCreated: passive.created.length,
            role: window.App.engineProviderRole,
            provider: window.App.engineProviderKey,
            id: window.App.engine.id,
            worker: window.App.engine.workerPath,
            identity: window.App.engine.getUciIdentity(),
            sf18Created: window.__engine18003WorkerAudit.created.filter(url => url === sf18).length,
            legacyCreated: window.__engine18003WorkerAudit.created.filter(url => url === legacy).length
        };
    }, { sf18: SF18_WORKER, legacy: LEGACY_WORKER });
    expect(game).toEqual({
        passiveCreated: 1,
        role: 'game',
        provider: 'stockfish-18-gameplay',
        id: 'stockfish-18-gameplay',
        worker: SF18_WORKER,
        identity: {
            name: 'Stockfish 18 Lite WASM',
            author: 'the Stockfish developers (see AUTHORS file)',
            validated: true
        },
        sf18Created: 1,
        legacyCreated: 0
    });

    const bots = await page.evaluate(async ({ sf18 }) => {
        window.prepareNativePlaySetup();
        window.CaissaPlayRouteController.navigate('/play/bots', { source: 'engine18-003-test' });
        await window.App.engine.start();
        return {
            role: window.App.engineProviderRole,
            provider: window.App.engineProviderKey,
            id: window.App.engine.id,
            identity: window.App.engine.getUciIdentity(),
            sf18Created: window.__engine18003WorkerAudit.created.filter(url => url === sf18).length,
            audit: { ...window.__engine18003WorkerAudit }
        };
    }, { sf18: SF18_WORKER });
    expect(bots.role).toBe('bots');
    expect(bots.provider).toBe('legacy-stockfish-2019');
    expect(bots.id).toBe('stockfish');
    expect(bots.identity.name).toBe('Stockfish 2019-08-15 Multi-Variant');
    expect(bots.sf18Created).toBe(1);
    expect(bots.audit.maximum).toBe(1);

    const coach = await page.evaluate(async ({ sf18 }) => {
        window.prepareNativePlaySetup();
        window.CaissaPlayRouteController.navigate('/play/coach', { source: 'engine18-003-test' });
        await window.App.engine.start();
        return {
            role: window.App.engineProviderRole,
            provider: window.App.engineProviderKey,
            id: window.App.engine.id,
            identity: window.App.engine.getUciIdentity(),
            sf18Created: window.__engine18003WorkerAudit.created.filter(url => url === sf18).length,
            audit: { ...window.__engine18003WorkerAudit }
        };
    }, { sf18: SF18_WORKER });
    expect(coach.role).toBe('coach-active');
    expect(coach.provider).toBe('legacy-stockfish-2019');
    expect(coach.id).toBe('stockfish');
    expect(coach.identity.name).toBe('Stockfish 2019-08-15 Multi-Variant');
    expect(coach.sf18Created).toBe(1);
    expect(coach.audit.maximum).toBe(1);

    const afterPagehide = await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        return { ...window.__engine18003WorkerAudit };
    });
    expect(afterPagehide.active).toBe(0);
    expect(afterPagehide.created.filter(url => url === SF18_WORKER)).toHaveLength(1);
    expect(afterPagehide.terminated.filter(url => url === SF18_WORKER)).toHaveLength(1);
    expect(runtimeErrors).toEqual([]);
    await context.close();
});

test('Preview SF18 preserves every Play target request and exact-FEN legal result', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'target policy suite runs once in Chromium');
    const { context, page } = await newAuditedPage(browser);
    await gotoPlay(page);
    const samples = await page.evaluate(async ({ fen, targets }) => {
        await window.App.engine.start();
        window.App.game.load(fen);
        const canonicalFen = window.App.game.fen();
        const output = [];
        for (const target of targets) {
            const strength = window.CaissaOpponentStrengthSession.beginGame(target.target);
            if (!strength.ok) throw new Error(`target rejected: ${target.target}`);
            const policy = window.CaissaOpponentStrengthSession.getSearchOptions({
                role: window.App.engineProviderRole,
                providerKey: window.App.engineProviderKey
            });
            const uciOptions = window.CaissaOpponentStrengthSession.getEngineOptions({
                role: window.App.engineProviderRole,
                providerKey: window.App.engineProviderKey
            });
            const searchOptions = { ...(policy || { movetime: 2000 }), uciOptions };
            const startedAt = performance.now();
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`search timeout: ${target.target}`)), 30000);
                const generation = window.App.engine.getBestMoveAttributed(canonicalFen,
                    (bestmove, ponder, resultGeneration) => {
                        clearTimeout(timer);
                        resolve({ bestmove, ponder, resultGeneration, generation });
                    }, searchOptions);
            });
            const legalGame = new window.Chess(canonicalFen);
            const legal = !!legalGame.move({
                from: result.bestmove.slice(0, 2), to: result.bestmove.slice(2, 4),
                promotion: result.bestmove.slice(4) || undefined
            });
            output.push({
                target: target.target,
                requestedDepth: policy?.depth ?? null,
                requestedMovetimeMs: policy?.movetime ?? (policy ? null : 2000),
                requestedSkill: uciOptions?.['Skill Level'] ?? null,
                requestedFen: canonicalFen,
                provider: window.App.engineProviderKey,
                bestmove: result.bestmove,
                legal,
                elapsedMs: performance.now() - startedAt,
                generation: result.generation,
                resultGeneration: result.resultGeneration,
                finalCanonicalFen: window.App.game.fen()
            });
        }
        window.App.engine.terminate('engine18-003-target-suite');
        return { samples: output, audit: { ...window.__engine18003WorkerAudit } };
    }, { fen: FIXED_FEN, targets: TARGETS });

    expect(samples.samples).toHaveLength(TARGETS.length);
    for (let index = 0; index < TARGETS.length; index += 1) {
        expect(samples.samples[index]).toMatchObject({
            target: TARGETS[index].target,
            requestedDepth: TARGETS[index].depth,
            requestedMovetimeMs: TARGETS[index].movetimeMs,
            requestedSkill: TARGETS[index].skill,
            requestedFen: FIXED_FEN,
            provider: 'stockfish-18-gameplay',
            legal: true,
            finalCanonicalFen: FIXED_FEN
        });
        expect(samples.samples[index].bestmove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        expect(samples.samples[index].resultGeneration).toBe(samples.samples[index].generation);
        expect(samples.samples[index].elapsedMs).toBeLessThan(10000);
    }
    expect(samples.audit.created.filter(url => url === SF18_WORKER)).toHaveLength(1);
    expect(samples.audit.created.filter(url => url === LEGACY_WORKER)).toHaveLength(0);
    expect(samples.audit.maximum).toBe(1);
    expect(samples.audit.active).toBe(0);
    console.log('ENGINE18_003_TARGETS', JSON.stringify(samples.samples));
    await context.close();
});

test('full-power opening book bypasses SF18 and exhausted book uses movetime 2000', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'opening-book policy runs once in Chromium');
    const { context, page } = await newAuditedPage(browser);
    await gotoPlay(page);
    const result = await page.evaluate(async ({ bookFen, nonbookFen, sf18 }) => {
        await window.App.engine.start();
        window.CaissaOpponentStrengthSession.beginGame(3200);
        window.CaissaEngineRequestIsolation.createSession();
        window.App.game.load(bookFen);
        window.App.moveHistory = [];
        window.App.currentMoveIndex = -1;
        window.App.gameActive = true;
        window.App.isPlayerTurn = false;
        window.App.enginePlaysAs = 'black';
        window.App.useOpeningBook = true;
        window.App.openingBook = { loaded: true, selectBookMove: () => 'g8f6' };
        const beforeBookGo = window.__engine18003WorkerAudit.messages.filter(item =>
            item.url === sf18 && item.message.startsWith('go ')).length;
        window.makeEngineMove();
        const afterBookGo = window.__engine18003WorkerAudit.messages.filter(item =>
            item.url === sf18 && item.message.startsWith('go ')).length;
        const bookMove = window.App.moveHistory.at(-1);

        window.CaissaEngineRequestIsolation.createSession();
        window.App.game.load(nonbookFen);
        window.App.moveHistory = [];
        window.App.currentMoveIndex = -1;
        window.App.gameActive = true;
        window.App.isPlayerTurn = false;
        window.App.openingBook = { loaded: true, selectBookMove: () => null };
        const requestedFen = window.App.game.fen();
        window.makeEngineMove();
        await new Promise((resolve, reject) => {
            const started = performance.now();
            const poll = () => {
                if (window.App.moveHistory.length === 1) return resolve();
                if (performance.now() - started > 10000) return reject(new Error('non-book engine move timeout'));
                setTimeout(poll, 20);
            };
            poll();
        });
        const goMessages = window.__engine18003WorkerAudit.messages.filter(item => item.url === sf18
            && item.message.startsWith('go ')).map(item => item.message);
        const finalFen = window.App.game.fen();
        const move = window.App.moveHistory[0];
        window.App.engine.terminate('engine18-003-opening-book-suite');
        return {
            beforeBookGo,
            afterBookGo,
            bookUci: `${bookMove.from}${bookMove.to}`,
            requestedFen,
            goMessages,
            engineUci: `${move.from}${move.to}${move.promotion || ''}`,
            finalFen,
            audit: { ...window.__engine18003WorkerAudit }
        };
    }, { bookFen: BLACK_BOOK_FEN, nonbookFen: BLACK_NONBOOK_FEN, sf18: SF18_WORKER });
    expect(result.afterBookGo).toBe(result.beforeBookGo);
    expect(result.bookUci).toBe('g8f6');
    expect(result.goMessages).toContain('go movetime 2000');
    expect(result.engineUci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(result.finalFen).not.toBe(result.requestedFen);
    expect(result.audit.maximum).toBe(1);
    expect(result.audit.active).toBe(0);
    console.log('ENGINE18_003_OPENING_BOOK', JSON.stringify(result));
    await context.close();
});

test('three real SF18 opponent moves preserve the persistent Play board geometry', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'persistent Play board proof runs once in Chromium');
    const { context, page } = await newAuditedPage(browser);
    await gotoPlay(page);
    const result = await page.evaluate(async ({ sf18, legacy }) => {
        await window.App.engine.start();
        window.CaissaOpponentStrengthSession.beginGame(1600);
        window.CaissaEngineRequestIsolation.createSession();
        window.App.game.reset();
        window.App.moveHistory = [];
        window.App.currentMoveIndex = -1;
        window.App.gameActive = true;
        window.App.gameMode = 'engine';
        window.App.engineEnabled = true;
        window.App.enginePlaysAs = 'black';
        window.App.playerColor = 'white';
        window.App.isPlayerTurn = true;
        window.App.useOpeningBook = false;
        window.projectCanonicalPlayPosition(window.App.game.fen(), { reason: 'engine18-003-board-sequence' });

        const root = document.querySelector('#chessboard');
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const initialRect = root.getBoundingClientRect();
        const fens = [];
        for (let cycle = 0; cycle < 3; cycle += 1) {
            const move = window.App.game.moves({ verbose: true })[0];
            if (!move || !window.makeMoveFromSquares(move.from, move.to)) {
                throw new Error(`unable to make player move ${cycle + 1}`);
            }
            const expectedHistory = (cycle + 1) * 2;
            await new Promise((resolve, reject) => {
                const started = performance.now();
                const poll = () => {
                    if (window.App.moveHistory.length === expectedHistory && window.App.game.turn() === 'w') return resolve();
                    if (performance.now() - started > 10000) return reject(new Error(`engine move timeout ${cycle + 1}`));
                    setTimeout(poll, 20);
                };
                poll();
            });
            fens.push(window.App.game.fen());
        }
        const finalRect = root.getBoundingClientRect();
        const sameRoot = root === document.querySelector('#chessboard');
        const currentSquares = [...root.querySelectorAll('.caissa-board__square')];
        const sameSquares = squares.length === 64 && currentSquares.length === 64
            && squares.every((square, index) => square === currentSquares[index]);
        window.App.engine.terminate('engine18-003-board-sequence-complete');
        return {
            moves: window.App.moveHistory.map(move => `${move.from}${move.to}${move.promotion || ''}`),
            fens,
            sameRoot,
            sameSquares,
            geometryDelta: {
                width: Math.abs(finalRect.width - initialRect.width),
                height: Math.abs(finalRect.height - initialRect.height),
                top: Math.abs(finalRect.top - initialRect.top),
                left: Math.abs(finalRect.left - initialRect.left)
            },
            goCommands: window.__engine18003WorkerAudit.messages.filter(item =>
                item.url === sf18 && item.message === 'go movetime 50').length,
            sf18Workers: window.__engine18003WorkerAudit.created.filter(url => url === sf18).length,
            legacyWorkers: window.__engine18003WorkerAudit.created.filter(url => url === legacy).length,
            audit: { ...window.__engine18003WorkerAudit }
        };
    }, { sf18: SF18_WORKER, legacy: LEGACY_WORKER });
    expect(result.moves).toHaveLength(6);
    expect(result.fens).toHaveLength(3);
    expect(new Set(result.fens).size).toBe(3);
    expect(result.sameRoot).toBe(true);
    expect(result.sameSquares).toBe(true);
    expect(result.geometryDelta).toEqual({ width: 0, height: 0, top: 0, left: 0 });
    expect(result.goCommands).toBe(3);
    expect(result.sf18Workers).toBe(1);
    expect(result.legacyWorkers).toBe(0);
    expect(result.audit.maximum).toBe(1);
    expect(result.audit.active).toBe(0);
    console.log('ENGINE18_003_BOARD_SEQUENCE', JSON.stringify(result));
    await context.close();
});

test('Coach Review and Manual roles retain the real SF18 Analyze identity', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Analyze role identity proof runs once in Chromium');
    const { context, page } = await newAuditedPage(browser);
    await gotoPlay(page);
    const result = await page.evaluate(async () => {
        window.App.engine?.terminate('engine18-003-analyze-role-handoff');
        const roles = ['analyze-review', 'manual-analysis'];
        const identities = [];
        for (const role of roles) {
            const engine = window.EngineRegistry.createRoleEngine(role, {
                adapterOptions: { autoStart: false, owner: `engine18-003-${role}` }
            });
            await engine.start();
            identities.push({ role, id: engine.id, identity: engine.getUciIdentity() });
            engine.terminate(`engine18-003-${role}-complete`);
        }
        return { identities, audit: { ...window.__engine18003WorkerAudit } };
    });
    expect(result.identities).toEqual([
        {
            role: 'analyze-review', id: 'stockfish-18-lite',
            identity: {
                name: 'Stockfish 18 Lite WASM',
                author: 'the Stockfish developers (see AUTHORS file)',
                validated: true
            }
        },
        {
            role: 'manual-analysis', id: 'stockfish-18-lite',
            identity: {
                name: 'Stockfish 18 Lite WASM',
                author: 'the Stockfish developers (see AUTHORS file)',
                validated: true
            }
        }
    ]);
    expect(result.audit.maximum).toBe(1);
    expect(result.audit.active).toBe(0);
    await context.close();
});

for (const profile of [
    { id: 'desktop', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false },
    { id: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }
]) {
    test(`legacy versus SF18 observational comparison and lifecycle on ${profile.id}`, async ({ browser }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'comparison uses Chromium desktop/mobile profiles');
        const { id, ...browserProfile } = profile;
        const { context, page } = await newAuditedPage(browser, browserProfile);
        await gotoPlay(page);
        const comparison = await page.evaluate(async ({ positions }) => {
            window.App.engine.terminate('engine18-003-comparison-handoff');
            const previewGates = {
                CAISSA_PLAY_SF18_GAMEPLAY: true,
                activationId: 'ENGINE18-003',
                deploymentEnvironment: 'preview'
            };
            const providers = [
                { id: 'legacy', role: 'bots', gates: {} },
                { id: 'sf18', role: 'game', gates: previewGates }
            ];
            const output = [];
            for (const provider of providers) {
                const engine = window.EngineRegistry.createRoleEngine(provider.role, {
                    featureGates: provider.gates,
                    adapterOptions: { autoStart: false, owner: `engine18-003-comparison-${provider.id}` }
                });
                const lines = [];
                let uciokMs = null;
                const startupAt = performance.now();
                engine.onLine = line => {
                    lines.push(line);
                    if (line === 'uciok' && uciokMs === null) uciokMs = performance.now() - startupAt;
                };
                await engine.start();
                const readyokMs = performance.now() - startupAt;
                const samples = [];
                for (const position of positions) {
                    let latest = null;
                    const searchAt = performance.now();
                    const result = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => reject(new Error(`comparison timeout: ${position.id}`)), 20000);
                        engine.getBestMoveAttributed(position.fen, (bestmove, ponder, generation) => {
                            clearTimeout(timer); resolve({ bestmove, ponder, generation });
                        }, { depth: 8, onInfo: info => { latest = { ...info }; } });
                    });
                    const chess = new window.Chess(position.fen);
                    const legal = !!chess.move({ from: result.bestmove.slice(0, 2), to: result.bestmove.slice(2, 4),
                        promotion: result.bestmove.slice(4) || undefined });
                    samples.push({
                        ...position,
                        move: result.bestmove,
                        score: latest?.score ?? null,
                        mate: latest?.mate ?? null,
                        depth: latest?.depth ?? null,
                        latencyMs: performance.now() - searchAt,
                        legal,
                        generation: result.generation
                    });
                }
                output.push({
                    provider: provider.id,
                    engineId: engine.id,
                    identity: engine.getUciIdentity(),
                    uciokMs,
                    readyokMs,
                    samples
                });
                engine.terminate(`engine18-003-comparison-${provider.id}-complete`);
            }
            return { output, audit: { ...window.__engine18003WorkerAudit } };
        }, { positions: [
            { id: 'start', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
            { id: 'open-game', fen: FIXED_FEN },
            { id: 'mate-in-one', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' }
        ] });
        expect(comparison.output.map(item => item.identity.name)).toEqual([
            'Stockfish 2019-08-15 Multi-Variant', 'Stockfish 18 Lite WASM'
        ]);
        for (const provider of comparison.output) {
            expect(provider.uciokMs).toBeLessThan(10000);
            expect(provider.readyokMs).toBeLessThan(10000);
            for (const sample of provider.samples) {
                expect(sample.legal).toBe(true);
                expect(sample.depth).toBeGreaterThanOrEqual(8);
                expect(sample.latencyMs).toBeLessThan(10000);
            }
        }
        expect(comparison.audit.maximum).toBe(1);
        expect(comparison.audit.active).toBe(0);
        console.log(`ENGINE18_003_COMPARISON_${id.toUpperCase()}`, JSON.stringify(comparison.output));
        await context.close();
    });
}
