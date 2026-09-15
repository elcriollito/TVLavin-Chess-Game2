import { test, expect } from '@playwright/test';

const LEGACY_WORKER = '/engine/stockfish-working.js';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';

async function openTrackedCoach(browser) {
    const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        ...(protectionBypass ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': protectionBypass } } : {})
    });
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await context.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        const NativeWorker = window.Worker;
        const audit = { created: [], terminated: [], active: 0, maximum: 0, messages: [], workerErrors: [] };
        window.Worker = class Engine18003BDiagnosticWorker extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                this.__url = String(url); this.__terminated = false;
                audit.created.push(this.__url); audit.active += 1;
                audit.maximum = Math.max(audit.maximum, audit.active);
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
    const page = await context.newPage();
    return { context, page };
}

async function exerciseCoachLevel(browser, label) {
    const { context, page } = await openTrackedCoach(browser);
    const consoleErrors = []; const pageErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    const response = await page.goto('/play/coach');
    await page.waitForFunction(() => window.App?.engine
        && window.CaissaSimplifiedPlayShellInstance?.getSnapshot?.().coachPanel);
    const panel = page.locator('[data-caissa-native-coach-panel]');
    if (!(await panel.getByLabel(label, { exact: true }).isVisible())) {
        await panel.getByRole('button', { name: /Show All Levels/ }).click();
    }
    await panel.getByLabel(label, { exact: true }).check({ force: true });
    await panel.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.status),
        { timeout: 15_000 }).toMatch(/active|error/);
    const started = await page.evaluate(() => ({
        route: window.CaissaPlayRouteController.getCurrent(),
        providerRole: window.App.engineProviderRole,
        providerKey: window.App.engineProviderKey,
        engineId: window.App.engine?.id,
        workerPath: window.App.engine?.workerPath,
        identity: window.App.engine?.getUciIdentity?.(),
        ready: window.App.engine?.ready,
        coach: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel,
        coachSession: window.CaissaCoachSession?.getSnapshot?.() || null,
        opponentStrength: window.CaissaOpponentStrengthSession.inspect(),
        engineStatus: document.querySelector('#engineStatus')?.textContent || null
    }));
    let moveAccepted = false;
    if (started.coach.status === 'active') {
        moveAccepted = await page.evaluate(() => window.makeMoveFromSquares('e2', 'e4'));
        await page.waitForTimeout(12_000);
    }
    const result = await page.evaluate(({ legacy, sf18 }) => ({
        history: window.App.game.history(),
        fen: window.App.game.fen(),
        isPlayerTurn: window.App.isPlayerTurn,
        engineStatus: document.querySelector('#engineStatus')?.textContent || null,
        providerRole: window.App.engineProviderRole,
        providerKey: window.App.engineProviderKey,
        engine: {
            id: window.App.engine?.id, ready: window.App.engine?.ready,
            searching: window.App.engine?.searching, analyzing: window.App.engine?.analyzing,
            identity: window.App.engine?.getUciIdentity?.(), diagnostics: window.App.engine?.getDiagnostics?.()
        },
        coach: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel,
        opponentStrength: window.CaissaOpponentStrengthSession.inspect(),
        audit: {
            ...window.__engine18003bAudit,
            legacyCreated: window.__engine18003bAudit.created.filter(url => url === legacy).length,
            sf18Created: window.__engine18003bAudit.created.filter(url => url === sf18).length
        }
    }), { legacy: LEGACY_WORKER, sf18: SF18_WORKER });
    await context.close();
    return { label, statusCode: response.status(), moveAccepted, started, result, consoleErrors, pageErrors };
}

test('ENGINE18-003B read-only deployed Coach Master versus Grandmaster diagnosis', async ({ browser }) => {
    test.setTimeout(90_000);
    const master = await exerciseCoachLevel(browser, 'Master');
    const grandmaster = await exerciseCoachLevel(browser, 'Grandmaster');
    console.log('ENGINE18_003B_COACH_DIAGNOSIS', JSON.stringify({ master, grandmaster }));
    expect(master.started.providerKey).toBe('legacy-stockfish-2019');
    expect(grandmaster.started.providerKey).toBe('legacy-stockfish-2019');
});
