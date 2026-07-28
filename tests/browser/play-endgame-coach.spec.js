import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

async function open(page, viewport = { width: 390, height: 844 }) {
    await page.setViewportSize(viewport);
    await page.goto('/play/coach?simplified=1');
    await expect(page.locator('.caissa-coach-panel')).toBeVisible();
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('publication gate exposes one truthful QA-only Endgame Coach that starts on the existing worker', async ({ page }) => {
    await open(page);
    await expect(page.locator('.caissa-coach-panel__card')).toHaveCount(3);
    await page.getByLabel(/Endgame Guide/).check();
    await expect(page.locator('[data-coach-detail]')).toContainText('king activity, opposition, passed-pawn support');
    await expect(page.locator('[data-coach-detail]')).toContainText('No rook or queen ending guidance');
    await page.locator('[data-coach-primary]').click();
    const proof = await page.evaluate(() => ({
        gate: window.CaissaEndgamePublicationGate.snapshot,
        session: window.CaissaCoachSession.getSnapshot(),
        harness: window.__caissaPlayHarness.snapshot()
    }));
    expect(proof.gate.canPublish).toBe(true);
    expect(proof.session.active.coachId).toBe('caissa-endgame-guide');
    expect(proof.session.search).toEqual({ depth: 9 });
    expect(proof.harness.boardConstructions).toBe(1);
    expect(proof.harness.workersCreated).toBe(1);
});

test('deterministic endgame lessons render one message, Why disclosure, and verified public Knowledge link', async ({ page }) => {
    await open(page);
    await page.getByLabel(/Endgame Guide/).check();
    await page.locator('[data-coach-assistance]').selectOption('teaching');
    await page.locator('[data-coach-primary]').click();
    const before = await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages
        .filter(message => message.startsWith('go')).length);
    const result = await page.evaluate(() => {
        const profile = window.CaissaCoachRegistry.get('caissa-endgame-guide');
        const observation = window.CaissaCoachObservationService.observe({
            actor: 'user', fen: '7k/8/8/P7/8/8/8/7K b - - 0 1', ply: 30,
            playerColor: 'white', profile, move: { from: 'a4', to: 'a5' },
            session: { learnerLevel: 'intermediate', assistanceLevel: 'teaching',
                interventionCount: 0, lastInterventionPly: null, cooldowns: {} }
        });
        window.dispatchEvent(new CustomEvent('caissa-coach-observation', { detail: observation }));
        return observation;
    });
    expect(result.trigger).toBe('endgame-pawn-square');
    await expect(page.locator('[data-coach-intervention]')).toBeVisible();
    await expect(page.locator('[data-coach-message]')).not.toContainText(/\b[a-h][1-8]\b|centipawn|principal variation/i);
    await page.locator('[data-coach-why] summary').click();
    await expect(page.locator('[data-coach-explanation]')).toContainText('geometric');
    const link = page.locator('[data-coach-knowledge]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/endgame-library?unit=endgames%2Frule-of-the-square');
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workerMessages
        .filter(message => message.startsWith('go')).length)).toBe(before);
});

test('false-positive context stays silent and responsive mode isolation remains bounded', async ({ page }) => {
    await open(page, { width: 320, height: 568 });
    const quiet = await page.evaluate(() => window.CaissaEndgameDetectors.evaluate({
        fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5',
        ply: 30, playerColor: 'white'
    }));
    expect(quiet.supported).toBe(false);
    await expect(page.locator('[data-coach-intervention]')).toBeHidden();
    await page.getByLabel(/Endgame Guide/).check();
    await page.locator('[data-coach-primary]').click();
    await page.getByRole('tab', { name: 'Bots' }).click();
    expect(await page.evaluate(() => window.CaissaCoachSession.getSnapshot().active)).toBeNull();
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth
            - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
});

test('Endgame Coach PostGame is factual and Rematch clears its history', async ({ page }) => {
    await open(page);
    await page.getByLabel(/Endgame Guide/).check();
    await page.locator('[data-coach-primary]').click();
    await page.evaluate(() => {
        window.CaissaCoachSession.recordIntervention({
            ply: 30, triggerCode: 'endgame-opposition', category: 'opposition', confidence: 'high',
            severity: 'notice', cooldownGroup: 'opposition', messageTemplateId: 'endgame-opposition',
            evidence: { conceptId: 'ku:endgames:pawn-foundations:direct-opposition' }
        });
        window.confirm = () => true;
        window.resignGame();
    });
    await expect(page.locator('[data-post-game-summary]')).toContainText('Caissa Endgame Guide');
    await expect(page.locator('[data-post-game-summary]')).toContainText('king geometry');
    await page.locator('[data-post-game-action="rematch"]').click();
    const active = await page.evaluate(() => window.CaissaCoachSession.getSnapshot().active);
    expect(active.coachId).toBe('caissa-endgame-guide');
    expect(active.interventionHistory).toEqual([]);
    expect(active.cooldowns).toEqual({});
});
