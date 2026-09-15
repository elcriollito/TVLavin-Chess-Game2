import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const LEGACY_WORKER = '/engine/stockfish-working.js';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
const TIERS = Object.freeze([
    { target: 250, skill: 0, movetime: 50 }, { target: 500, skill: 4, movetime: 50 },
    { target: 800, skill: 8, movetime: 50 }, { target: 1200, skill: 12, movetime: 50 },
    { target: 1600, skill: 16, movetime: 50 }, { target: 2000, skill: 20, depth: 12 },
    { target: 2400, skill: 20, depth: 16 }, { target: 2800, skill: 20, depth: 18 },
    { target: 3200, skill: 20, movetime: 2000 }
]);

async function trackedPage(browser, mobile = false) {
    const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        hasTouch: mobile,
        ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : {}),
        ...(protectionBypass ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': protectionBypass } } : {})
    });
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0, messages: [], workerErrors: [] };
        window.Worker = class Engine18003BTrackedWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options); this.__url = String(url); this.__terminated = false;
                audit.created.push(this.__url); audit.active += 1; audit.maximum = Math.max(audit.maximum, audit.active);
                this.addEventListener('error', event => audit.workerErrors.push(String(event.message || 'worker-error')));
            }
            postMessage(message, transfer) {
                audit.messages.push({ url: this.__url, message: String(message), at: performance.now() });
                return super.postMessage(message, transfer);
            }
            terminate() {
                if (!this.__terminated) { this.__terminated = true; audit.terminated.push(this.__url); audit.active -= 1; }
                return super.terminate();
            }
        };
        window.__engine18003bAudit = audit;
    });
    return { context, page: await context.newPage() };
}

test('SF18 low-tier options and full-strength resets are serialized on one exact-FEN worker', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await trackedPage(browser);
    const response = await page.goto('/play');
    await page.waitForFunction(() => window.App?.engine && window.Chess);
    expect(response.headers()['x-caissa-gameplay-provider']).toBe('stockfish-18-gameplay');
    const report = await page.evaluate(async ({ fen, tiers, sf18, legacy }) => {
        await window.App.engine.start(); window.App.game.load(fen); const canonicalFen = window.App.game.fen();
        const sequence = [...tiers, tiers[0], tiers[4], tiers[0], tiers[8], tiers[0]]; const samples = [];
        for (const tier of sequence) {
            window.CaissaOpponentStrengthSession.beginGame(tier.target);
            const context = { role: window.App.engineProviderRole, providerKey: window.App.engineProviderKey };
            const policy = window.CaissaOpponentStrengthSession.getSearchOptions(context);
            const uciOptions = window.CaissaOpponentStrengthSession.getEngineOptions(context);
            const before = window.__engine18003bAudit.messages.length; const started = performance.now();
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`search timeout ${tier.target}`)), 15_000);
                const generation = window.App.engine.getBestMoveAttributed(canonicalFen,
                    (bestmove, _ponder, resultGeneration) => { clearTimeout(timer);
                        resolve({ bestmove, generation, resultGeneration }); },
                    { ...(policy || { movetime: 2000 }), uciOptions });
            });
            const chess = new window.Chess(canonicalFen);
            const legal = !!chess.move({ from: result.bestmove.slice(0, 2), to: result.bestmove.slice(2, 4),
                promotion: result.bestmove.slice(4) || undefined });
            samples.push({ target: tier.target, policy, uciOptions, legal,
                elapsedMs: performance.now() - started, generation: result.generation,
                resultGeneration: result.resultGeneration, canonicalFenAfter: window.App.game.fen(),
                commands: window.__engine18003bAudit.messages.slice(before).map(item => item.message) });
        }
        window.App.engine.terminate('engine18-003b-option-proof');
        return { samples, audit: { ...window.__engine18003bAudit },
            sf18Created: window.__engine18003bAudit.created.filter(url => url === sf18).length,
            legacyCreated: window.__engine18003bAudit.created.filter(url => url === legacy).length };
    }, { fen: FEN, tiers: TIERS, sf18: SF18_WORKER, legacy: LEGACY_WORKER });
    for (const sample of report.samples) {
        const tier = TIERS.find(item => item.target === sample.target);
        expect(sample.legal).toBe(true); expect(sample.canonicalFenAfter).toBe(FEN);
        expect(sample.resultGeneration).toBe(sample.generation);
        expect(sample.uciOptions).toEqual({ 'Skill Level': tier.skill, UCI_LimitStrength: false, UCI_Elo: 1320 });
        expect(sample.commands).toContain(`setoption name Skill Level value ${tier.skill}`);
        expect(sample.commands).toContain('setoption name UCI_LimitStrength value false');
        expect(sample.commands).toContain(tier.depth ? `go depth ${tier.depth}` : `go movetime ${tier.movetime}`);
    }
    expect(report).toMatchObject({ sf18Created: 1, legacyCreated: 0,
        audit: { active: 0, maximum: 1, workerErrors: [] } });
    console.log('ENGINE18_003B_OPTION_RESET', JSON.stringify(report));
    await context.close();
});

test('Coach GM uses legacy Stockfish with bounded movetime and completes an opponent move', async ({ browser }) => {
    test.setTimeout(45_000);
    const { context, page } = await trackedPage(browser, true); const engineErrors = []; const pageErrors = [];
    page.on('console', message => { if (message.type() === 'error' && /Engine error/i.test(message.text())) engineErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/play/coach');
    await page.waitForFunction(() => window.App?.engine
        && window.CaissaSimplifiedPlayShellInstance?.getSnapshot?.().coachPanel);
    const panel = page.locator('[data-caissa-native-coach-panel]');
    await panel.getByRole('button', { name: /Show All Levels/ }).click();
    await panel.getByLabel('Grandmaster', { exact: true }).check({ force: true });
    await panel.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.status)).toBe('active');
    const preMove = await page.evaluate(() => {
        window.App.useOpeningBook = false;
        if (window.App.openingBook) window.App.openingBook.loaded = false;
        const context = { role: window.App.engineProviderRole, providerKey: window.App.engineProviderKey };
        return { context, target: window.CaissaOpponentStrengthSession.inspect(),
            policy: window.CaissaOpponentStrengthSession.getSearchOptions(context),
            coachSession: window.CaissaCoachSession?.getSearchOptions?.() || null };
    });
    expect(await page.evaluate(() => window.makeMoveFromSquares('e2', 'e4'))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history()), { timeout: 12_000 })
        .toHaveLength(2);
    await expect.poll(() => page.evaluate(() => window.App.currentEvaluation?.fen === window.App.game.fen()
        && window.App.currentEvaluation.depth >= 12 && window.App.analyzing === false),
    { timeout: 12_000 }).toBe(true);
    const proof = await page.evaluate(({ legacy, sf18, preMove }) => ({
        history: window.App.game.history(), fen: window.App.game.fen(), role: window.App.engineProviderRole,
        evaluation: window.App.currentEvaluation,
        provider: window.App.engineProviderKey, identity: window.App.engine.getUciIdentity(),
        opponentStrength: window.CaissaOpponentStrengthSession.inspect(),
        legacyCreated: window.__engine18003bAudit.created.filter(url => url === legacy).length,
        sf18Created: window.__engine18003bAudit.created.filter(url => url === sf18).length,
        go: window.__engine18003bAudit.messages.map(item => item.message).filter(message => message.startsWith('go ')),
        audit: { ...window.__engine18003bAudit }, preMove
    }), { legacy: LEGACY_WORKER, sf18: SF18_WORKER, preMove });
    console.log('ENGINE18_003B_COACH_GM', JSON.stringify(proof));
    expect(proof).toMatchObject({ role: 'coach-active', provider: 'legacy-stockfish-2019',
        identity: { name: 'Stockfish 2019-08-15 Multi-Variant', validated: true },
        legacyCreated: 1, sf18Created: 0 });
    expect(preMove).toMatchObject({ context: { role: 'coach-active', providerKey: 'legacy-stockfish-2019' },
        policy: { movetime: 2000, targetElo: 2800 }, coachSession: null });
    expect(proof.history).toHaveLength(2);
    expect(proof.go.filter(command => command === 'go movetime 2000')).toHaveLength(1);
    expect(proof.go).toContain('go depth 20');
    const gmGoIndex = proof.audit.messages.findIndex(item => item.message === 'go movetime 2000');
    expect(gmGoIndex).toBeGreaterThan(0);
    expect(proof.audit.messages[gmGoIndex - 1].message).toBe(
        'position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(proof.evaluation).toMatchObject({ fen: proof.fen });
    expect(proof.evaluation.depth).toBeGreaterThanOrEqual(12);
    expect(proof.audit.maximum).toBe(1); expect(proof.audit.workerErrors).toEqual([]);
    expect(engineErrors).toEqual([]); expect(pageErrors).toEqual([]);
    await context.close();
});

test('all seven Coach levels still start and receive an attributed opponent move', async ({ browser }) => {
    test.setTimeout(120_000);
    const levels = [
        { label: 'Casual', id: 'casual' }, { label: 'Beginner', id: 'beginner' },
        { label: 'Balanced', id: 'intermediate' }, { label: 'Challenging', id: 'advanced' },
        { label: 'Expert', id: 'expert' }, { label: 'Master', id: 'master' },
        { label: 'Grandmaster', id: 'grandmaster' }
    ];
    const results = []; const context = await browser.newContext(); const page = await context.newPage();
    await instrumentPlay(page);
    for (const level of levels) {
        await page.goto('/play/coach');
        await expect(page.locator('[data-caissa-native-coach-panel]')).toBeVisible();
        const panel = page.locator('[data-caissa-native-coach-panel]');
        if (!(await panel.getByLabel(level.label, { exact: true }).isVisible()))
            await panel.getByRole('button', { name: /Show All Levels/ }).click();
        await panel.getByLabel(level.label, { exact: true }).check({ force: true });
        await panel.getByRole('button', { name: 'Play', exact: true }).click();
        await expect.poll(() => page.evaluate(() =>
            window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.status)).toBe('active');
        await page.evaluate(() => window.makeMoveFromSquares('e2', 'e4'));
        await expect.poll(() => page.evaluate(() => window.App.game.history())).toHaveLength(2);
        results.push(await page.evaluate(() => ({
            level: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.experience,
            provider: window.App.engineProviderKey, role: window.App.engineProviderRole,
            history: window.App.game.history(), isolation: window.CaissaEngineRequestIsolation.inspect()
        })));
    }
    await context.close();
    expect(results.map(item => item.level)).toEqual(levels.map(level => level.id));
    for (const result of results) {
        expect(result).toMatchObject({ provider: 'legacy-stockfish-2019', role: 'coach-active' });
        expect(result.history).toHaveLength(2);
    }
    console.log('ENGINE18_003B_ALL_COACH_LEVELS', JSON.stringify(results));
});
