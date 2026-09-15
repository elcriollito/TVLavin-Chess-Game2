import { test, expect } from '@playwright/test';

const LEGACY_WORKER = '/engine/stockfish-working.js';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const SF18_WASM = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm';
const FIXED_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

async function prepareAuditedPage(page) {
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0 };
        window.Worker = class Engine18002TrackedWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.__engine18002Url = String(url);
                this.__engine18002Terminated = false;
                audit.created.push(this.__engine18002Url);
                audit.active += 1;
                audit.maximum = Math.max(audit.maximum, audit.active);
            }
            terminate() {
                if (!this.__engine18002Terminated) {
                    this.__engine18002Terminated = true;
                    audit.terminated.push(this.__engine18002Url);
                    audit.active -= 1;
                }
                return super.terminate();
            }
        };
        window.__engine18002WorkerAudit = audit;
    });
}

test('gate-OFF Play, Coach active, and Bots create zero SF18 gameplay Workers', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'provider routing audit runs once in Chromium');
    await prepareAuditedPage(page);
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));

    for (const route of ['/play', '/play/coach', '/play/bots']) {
        await page.goto(route);
        await page.waitForFunction(() => window.App?.engine && window.EngineRegistry);
        await page.evaluate(() => window.App.engine.start());
        const state = await page.evaluate(({ legacyWorker, sf18Worker }) => ({
            route: window.location.pathname,
            productionEngineId: window.App.engine.id,
            productionWorker: window.App.engine.workerPath,
            gate: window.EngineRegistry.GAMEPLAY_FEATURE_GATES.CAISSA_PLAY_SF18_GAMEPLAY,
            routing: {
                game: window.EngineRegistry.resolveRoleProvider('game', {
                    CAISSA_PLAY_SF18_GAMEPLAY: true
                }).providerKey,
                coach: window.EngineRegistry.resolveRoleProvider('coach-active', {
                    CAISSA_PLAY_SF18_GAMEPLAY: true
                }).providerKey,
                bots: window.EngineRegistry.resolveRoleProvider('bots', {
                    CAISSA_PLAY_SF18_GAMEPLAY: true
                }).providerKey
            },
            sf18Created: window.__engine18002WorkerAudit.created.filter(url => url === sf18Worker).length,
            legacyCreated: window.__engine18002WorkerAudit.created.filter(url => url === legacyWorker).length,
            sf18EligibleForBots: window.EngineRegistry
                .getGameplayProvider('stockfish-18-gameplay').roles.includes('bots')
        }), { legacyWorker: LEGACY_WORKER, sf18Worker: SF18_WORKER });
        expect(state).toMatchObject({
            productionEngineId: 'stockfish',
            productionWorker: LEGACY_WORKER,
            gate: false,
            routing: {
                game: 'legacy-stockfish-2019',
                coach: 'legacy-stockfish-2019',
                bots: 'legacy-stockfish-2019'
            },
            sf18Created: 0,
            sf18EligibleForBots: false
        });
        expect(state.legacyCreated).toBeGreaterThanOrEqual(1);
    }
    expect(runtimeErrors).toEqual([]);
});

test('token-bound inactive provider completes a real, attributed SF18 WASM search and terminates', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'real inactive-provider smoke runs once in Chromium');
    await prepareAuditedPage(page);
    const runtimeErrors = [];
    const assetResponses = [];
    let documentCsp = '';
    page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' || /wasm (?:streaming )?compile failed/i.test(message.text())) {
            runtimeErrors.push(`${message.type()}: ${message.text()}`);
        }
    });
    page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (pathname === SF18_WORKER || pathname === SF18_WASM) {
            assetResponses.push({
                pathname,
                origin: new URL(response.url()).origin,
                status: response.status(),
                contentType: response.headers()['content-type'] || ''
            });
        }
    });

    const response = await page.goto('/play');
    documentCsp = response?.headers()['content-security-policy'] || '';
    await page.waitForFunction(() => window.App?.engine && window.EngineRegistry && window.Chess);

    const result = await page.evaluate(async ({ fen, workerPath }) => {
        await window.App.engine.start();
        window.App.engine.terminate('engine18-002-verification-handoff');
        const engine = window.EngineRegistry.createInactiveGameplayProviderForVerification('game', {
            verificationToken: 'ENGINE18-002',
            adapterOptions: {
                autoStart: false,
                owner: 'engine18-002-browser-smoke',
                generationIdFactory: () => 'browser-fixed-fen',
                handshakeTimeoutMs: 10000,
                searchTimeoutMs: 20000
            }
        });
        if (!engine) throw new Error('inactive provider unavailable');
        const passiveCount = window.__engine18002WorkerAudit.created.filter(url => url === workerPath).length;
        const lines = [];
        const infos = [];
        engine.onLine = line => lines.push(line);
        await engine.start();

        const search = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('SF18 fixed-FEN search timeout')), 20000);
            const generation = engine.getBestMoveAttributed(fen, (bestmove, ponder, resultGeneration) => {
                clearTimeout(timer);
                resolve({ bestmove, ponder, resultGeneration, requestedGeneration: generation });
            }, { depth: 8, onInfo: (info, generation) => infos.push({ ...info, generation }) });
        });
        const exactEngineFen = engine.currentFen;
        const game = new window.Chess(fen);
        const legal = !!game.move({
            from: search.bestmove?.slice(0, 2),
            to: search.bestmove?.slice(2, 4),
            promotion: search.bestmove?.slice(4) || undefined
        });
        const readyAfterSearch = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('post-search ready timeout')), 10000);
            const previous = engine.onLine;
            engine.onLine = line => {
                previous?.(line);
                if (line === 'readyok') { clearTimeout(timer); resolve(true); }
            };
        });
        engine.send('isready');
        await readyAfterSearch;
        const identity = engine.getUciIdentity();
        const attribution = engine.inspectAttribution();
        engine.terminate('engine18-002-browser-smoke-complete');
        return {
            documentOrigin: window.location.origin,
            passiveCount,
            identity,
            search,
            exactEngineFen,
            requestedFen: fen,
            legal,
            infoCount: infos.length,
            deepestInfo: Math.max(0, ...infos.map(info => info.depth)),
            sawReady: lines.filter(line => line === 'readyok').length >= 2,
            attribution,
            workerAudit: { ...window.__engine18002WorkerAudit }
        };
    }, { fen: FIXED_FEN, workerPath: SF18_WORKER });

    expect(result.passiveCount).toBe(0);
    expect(result.identity).toEqual({
        name: 'Stockfish 18 Lite WASM',
        author: 'the Stockfish developers (see AUTHORS file)',
        validated: true
    });
    expect(result.search.bestmove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(result.search.resultGeneration).toBe(result.search.requestedGeneration);
    expect(result.search.resultGeneration).toBe('browser-fixed-fen:1');
    expect(result.exactEngineFen).toBe(FIXED_FEN);
    expect(result.requestedFen).toBe(FIXED_FEN);
    expect(result.legal).toBe(true);
    expect(result.infoCount).toBeGreaterThan(0);
    expect(result.deepestInfo).toBeGreaterThanOrEqual(8);
    expect(result.sawReady).toBe(true);
    expect(result.attribution.diagnostics.completed).toBe(1);
    expect(result.attribution.activeOperationCount).toBe(0);
    expect(result.workerAudit.maximum).toBe(1);
    expect(result.workerAudit.active).toBe(0);
    expect(result.workerAudit.created.filter(url => url === SF18_WORKER)).toHaveLength(1);
    expect(result.workerAudit.terminated.filter(url => url === SF18_WORKER)).toHaveLength(1);
    expect(documentCsp).toContain("worker-src 'self'");
    expect(documentCsp).not.toMatch(/worker-src[^;]*(?:https?:|\*)/);
    expect(assetResponses).toEqual(expect.arrayContaining([
        expect.objectContaining({ pathname: SF18_WORKER, origin: result.documentOrigin, status: 200 }),
        expect.objectContaining({ pathname: SF18_WASM, origin: result.documentOrigin, status: 200,
            contentType: expect.stringMatching(/^application\/wasm/) })
    ]));
    expect(assetResponses.find(item => item.pathname === SF18_WORKER)?.contentType)
        .toMatch(/^(?:application|text)\/javascript/);
    expect(runtimeErrors).toEqual([]);
    console.log('ENGINE18_002_SF18_SMOKE', JSON.stringify({
        fen: result.requestedFen,
        depth: result.deepestInfo,
        bestmove: result.search.bestmove,
        generation: result.search.resultGeneration,
        identity: result.identity.name,
        maximumWorkers: result.workerAudit.maximum,
        sf18Terminated: result.workerAudit.terminated.filter(url => url === SF18_WORKER).length
    }));
});
