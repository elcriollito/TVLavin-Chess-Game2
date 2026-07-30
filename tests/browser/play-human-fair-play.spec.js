import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('PlayersPanel exposes truthful Human Fair Play readiness without starting a game', async ({ page }) => {
    await page.goto('/play/players?simplified=1');
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    const workersBefore = await page.evaluate(() =>
        performance.getEntriesByType('resource').filter(entry => entry.name.includes('worker')).length);
    await page.getByRole('tab', { name: 'Challenges' }).click();
    const readiness = page.locator('[data-human-fair-play-readiness]');
    await expect(readiness).toBeVisible();
    await expect(readiness).toContainText('fics: incomplete');
    await expect(readiness).toContainText('Classic is presentation over the existing FICS runtime');
    await expect(readiness).toContainText('No proprietary CAISSA multiplayer backend exists');
    await expect(readiness.getByText(/Play Now/i)).toHaveCount(0);
    const snapshot = await page.evaluate(() => ({
        workers: performance.getEntriesByType('resource').filter(entry => entry.name.includes('worker')).length,
        records: window.CaissaGameRecordInstance?.inspect?.()?.recordsCreated || 0,
        lifecycle: window.CaissaGameLifecycleInstance?.getSnapshot?.()?.rotation || 0
    }));
    expect(snapshot.workers).toBe(workersBefore);
    expect(snapshot.records).toBe(0);
});

test('human evaluation policy clears stale score and exposes no numeric or mate value', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('#evalBar')).toBeVisible();
    const state = await page.evaluate(() => {
        const context = window.CaissaHumanFairPlay.createContext({
            provider: 'fics', gameType: 'human-rated', ratingMode: 'rated',
            assistanceMode: 'prohibited', playerRole: 'player',
            authority: { server: 'provider', clock: 'provider', move: 'provider',
                result: 'provider', reconnect: 'provider' },
            enginePolicy: 'deny-request', evaluationPolicy: 'frozen',
            postGamePolicy: 'provider-terminal-required', sourceConfidence: 'provider-confirmed'
        });
        const decision = window.CaissaHumanGameReadiness.evaluate(context);
        const applied = window.CaissaEvaluationRailInstance.applyHumanPolicy(decision);
        const root = document.querySelector('#evalBar');
        return { applied, text: root.textContent, aria: root.getAttribute('aria-label'),
            value: root.getAttribute('aria-valuenow'), height: document.querySelector('#evalFill').style.height };
    });
    expect(state.applied.ok).toBe(true);
    expect(state.text).toContain('Evaluation available after the game.');
    expect(state.text).not.toMatch(/[+-]\d|M\d/i);
    expect(state.aria).toBe('Evaluation available after the game.');
    expect(state.value).toBeNull();
    expect(state.height).toBe('50%');
});

test('readiness remains reachable across eight responsive viewports', async ({ page }) => {
    const viewports = [
        { width: 320, height: 568 }, { width: 360, height: 800 },
        { width: 390, height: 844 }, { width: 412, height: 915 },
        { width: 768, height: 1024 }, { width: 1024, height: 768 },
        { width: 1280, height: 720 }, { width: 1440, height: 900 }
    ];
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto('/play/players?simplified=1');
        await page.getByRole('tab', { name: 'Challenges' }).click();
        const readiness = page.locator('[data-human-fair-play-readiness]');
        await expect(readiness).toBeVisible();
        await expect(readiness).toContainText('FICS owns games, moves, clocks, results, and reconnect');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
});
