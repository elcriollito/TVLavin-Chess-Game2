import { test, expect } from '@playwright/test';

const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const LEGACY_WORKER = '/engine/stockfish-working.js';
const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
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

async function auditedPage(browser, profile) {
    const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const context = await browser.newContext({
        ...profile,
        ...(protectionBypass ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': protectionBypass } } : {})
    });
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0, messages: [] };
        window.Worker = class Engine18003ACalibrationWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.__url = String(url);
                this.__terminated = false;
                audit.created.push(this.__url);
                audit.active += 1;
                audit.maximum = Math.max(audit.maximum, audit.active);
            }
            postMessage(message, transfer) {
                audit.messages.push({ url: this.__url, message: String(message), at: performance.now() });
                return super.postMessage(message, transfer);
            }
            terminate() {
                if (!this.__terminated) {
                    this.__terminated = true;
                    audit.terminated.push(this.__url);
                    audit.active -= 1;
                }
                return super.terminate();
            }
        };
        window.__engine18003AAudit = audit;
    });
    return { context, page: await context.newPage() };
}

for (const profile of [
    { id: 'desktop', options: { viewport: { width: 1440, height: 1000 } } },
    { id: 'mobile-emulated', options: {
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    } }
]) {
    test(`calibrated ladder is bounded and exact-FEN safe on ${profile.id}`, async ({ browser }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium', 'ENGINE18-003A latency matrix runs once in Chromium');
        test.setTimeout(90_000);
        const { context, page } = await auditedPage(browser, profile.options);
        const runtimeErrors = [];
        page.on('pageerror', error => runtimeErrors.push(error.message));
        const response = await page.goto('/play');
        expect(response.headers()['x-caissa-gameplay-provider']).toBe('stockfish-18-gameplay');
        await page.waitForFunction(() => window.App?.engine && window.Chess);

        const report = await page.evaluate(async ({ fen, targets, sf18, legacy }) => {
            const startupAt = performance.now();
            await window.App.engine.start();
            const coldStartupMs = performance.now() - startupAt;
            window.App.game.load(fen);
            const canonicalFen = window.App.game.fen();
            const samples = [];
            for (const target of targets) {
                const started = window.CaissaOpponentStrengthSession.beginGame(target.target);
                if (!started.ok) throw new Error(`strength rejected: ${target.target}`);
                const policy = window.CaissaOpponentStrengthSession.getSearchOptions({
                    role: window.App.engineProviderRole,
                    providerKey: window.App.engineProviderKey
                });
                const uciOptions = window.CaissaOpponentStrengthSession.getEngineOptions({
                    role: window.App.engineProviderRole,
                    providerKey: window.App.engineProviderKey
                });
                const search = { ...(policy || { movetime: 2000 }), uciOptions };
                const searchAt = performance.now();
                const result = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error(`search timeout: ${target.target}`)), 15_000);
                    const generation = window.App.engine.getBestMoveAttributed(canonicalFen,
                        (bestmove, ponder, resultGeneration) => {
                            clearTimeout(timer);
                            resolve({ bestmove, ponder, generation, resultGeneration });
                        }, search);
                });
                const chess = new window.Chess(canonicalFen);
                const legal = !!chess.move({ from: result.bestmove.slice(0, 2), to: result.bestmove.slice(2, 4),
                    promotion: result.bestmove.slice(4) || undefined });
                samples.push({
                    target: target.target,
                    depth: policy?.depth ?? null,
                    movetimeMs: policy?.movetime ?? (policy ? null : 2000),
                    skill: uciOptions?.['Skill Level'] ?? null,
                    elapsedMs: performance.now() - searchAt,
                    bestmove: result.bestmove,
                    legal,
                    generation: result.generation,
                    resultGeneration: result.resultGeneration,
                    canonicalFenAfterSearch: window.App.game.fen()
                });
            }
            window.App.engine.terminate('engine18-003a-latency-complete');
            const audit = window.__engine18003AAudit;
            return {
                coldStartupMs,
                samples,
                worker: {
                    sf18Created: audit.created.filter(url => url === sf18).length,
                    legacyCreated: audit.created.filter(url => url === legacy).length,
                    sf18Terminated: audit.terminated.filter(url => url === sf18).length,
                    active: audit.active,
                    maximum: audit.maximum,
                    commands: audit.messages.filter(item => item.url === sf18).map(item => item.message)
                }
            };
        }, { fen: FEN, targets: TARGETS, sf18: SF18_WORKER, legacy: LEGACY_WORKER });

        expect(report.samples).toHaveLength(TARGETS.length);
        for (let index = 0; index < TARGETS.length; index += 1) {
            const sample = report.samples[index];
            expect(sample).toMatchObject({
                target: TARGETS[index].target,
                depth: TARGETS[index].depth,
                movetimeMs: TARGETS[index].movetimeMs,
                skill: TARGETS[index].skill,
                legal: true,
                canonicalFenAfterSearch: FEN
            });
            expect(sample.resultGeneration).toBe(sample.generation);
            expect(sample.elapsedMs).toBeLessThan(10_000);
        }
        expect(report.worker).toMatchObject({
            sf18Created: 1, legacyCreated: 0, sf18Terminated: 1, active: 0, maximum: 1
        });
        expect(report.worker.commands).toContain('setoption name Hash value 16');
        expect(report.worker.commands).toContain('setoption name Threads value 1');
        expect(report.worker.commands).toContain('setoption name Skill Level value 0');
        expect(report.worker.commands).toContain('setoption name Skill Level value 20');
        expect(report.worker.commands).toContain('setoption name UCI_LimitStrength value false');
        expect(report.worker.commands).toContain('go depth 18');
        expect(report.worker.commands).not.toContain('go depth 20');
        expect(report.worker.commands).toContain('go movetime 2000');
        expect(runtimeErrors).toEqual([]);
        console.log(`ENGINE18_003A_LATENCY_${profile.id.toUpperCase().replace('-', '_')}`, JSON.stringify(report));
        await context.close();
    });
}
