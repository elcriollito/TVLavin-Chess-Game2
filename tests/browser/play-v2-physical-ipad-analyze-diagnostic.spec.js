import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('authorized diagnostic is opt-in, bounded, volatile, and exports sanitized JSON', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const response = await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    expect(response.headers()['content-security-policy']).toContain("connect-src 'self';");
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).toBeAttached();
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-diagnostic-launcher]')).toBeVisible();
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(0);
    const documentOrigin = await page.evaluate(() => location.origin);
    const offOrigin = urls => urls.filter(url => new URL(url).origin !== documentOrigin);
    expect(offOrigin(requests)).toEqual([]);
    expect(offOrigin([...requests, 'https://external.invalid/probe'])).toEqual(['https://external.invalid/probe']);
    expect(requests.filter(url => /auth|academy|lesson|curriculum|endgame|analytics|clarity/i.test(url))).toEqual([]);
    expect(requests.filter(url => /fics/i.test(url) && !/play-v2-fics-isolation\.js/i.test(url))).toEqual([]);
    expect(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.inspect())).toMatchObject({ capturing: false, count: 0, capacity: 512 });
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await expect(page.locator('[data-shell-mode][aria-selected="true"]')).toBeFocused();
    await page.evaluate(() => { for (let index = 0; index < 130; index += 1) dispatchEvent(new Event('resize')); });
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).not.toHaveAttribute('open', '');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.App.gameActive)).toBe(true);
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await expect(page.locator('[data-diagnostic-surface]')).toHaveText('Surface: Analyze');
    expect(await page.evaluate(() => {
        const launcher = document.querySelector('[data-diagnostic-launcher]').getBoundingClientRect();
        const back = document.querySelector('[data-play-v2-analyze-close]').getBoundingClientRect();
        return launcher.right > back.left && launcher.left < back.right
            && launcher.bottom > back.top && launcher.top < back.bottom;
    })).toBe(false);
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-stop]').click();
    const exported = await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.exportJson());
    const parsed = JSON.parse(exported);
    expect(parsed.contractId).toBe('PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.1.0');
    expect(parsed.records.length).toBeLessThanOrEqual(512);
    expect(parsed.captureCompleteness).toBe('complete');
    expect(parsed.missingRequiredEvents).toEqual([]);
    expect(parsed.verdictSequence).toBe(parsed.lastRetainedSequence);
    expect(parsed.requiredEventEvidence.generations.some(item => item.observed.analyzeOpen
        && item.observed.analyzeSectionOnEnter && item.observed.hostVisible && item.observed.innerBoardVisible)).toBe(true);
    expect(new Set(parsed.records.map(item => item.surface))).toEqual(new Set(['play', 'postgame', 'analyze']));
    expect(exported).not.toMatch(/fen|pgn|moves|ssid|cookie|identity|thumbprint|certificate|127\.0\.0\.1/i);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async value => { window.__diagnosticClipboard = value; } } }));
    await page.locator('[data-diagnostic-copy]').click();
    const copied = JSON.parse(await page.evaluate(() => window.__diagnosticClipboard));
    expect(copied.records.length).toBe(parsed.records.length);
    expect(copied.captureCompleteness).toBe(parsed.captureCompleteness);
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).toHaveAttribute('data-capture-completeness', copied.captureCompleteness);
    const download = page.waitForEvent('download');
    await page.locator('[data-diagnostic-download]').click(); await download;
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).toHaveAttribute('data-capture-completeness', copied.captureCompleteness);
    await page.locator('[data-diagnostic-clear]').click();
    expect(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.inspect().count)).toBe(0);
});

test('capture stopped before Analyze is explicitly partial', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-stop]').click();
    await expect(page.locator('[data-diagnostic-status]')).toHaveText('Analyze was not captured');
    const parsed = JSON.parse(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.exportJson()));
    expect(parsed.captureCompleteness).toBe('partial');
    expect(parsed.missingRequiredEvents).toEqual(expect.arrayContaining([
        'analyze-open', 'AnalyzeSection.onEnter', 'visible-analyze-host', 'visible-analyze-board'
    ]));
});

test('collapsed diagnostic does not alter board geometry or overflow at target layouts', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    for (const profile of [{ width: 320, height: 568 }, { width: 390, height: 844 },
        { width: 834, height: 1194 }, { width: 1194, height: 834 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(profile);
        if (await page.locator('[data-ipad-analyze-diagnostic]').getAttribute('open') !== null)
            await page.locator('[data-diagnostic-close]').click();
        const before = await page.locator('#chessboard').boundingBox();
        await page.locator('[data-diagnostic-launcher]').click();
        await page.locator('[data-diagnostic-start]').click();
        const after = await page.locator('#chessboard').boundingBox();
        expect(after).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height });
        const launcher = await page.locator('[data-diagnostic-launcher]').boundingBox();
        expect(launcher.x + launcher.width <= after.x || launcher.x >= after.x + after.width
            || launcher.y + launcher.height <= after.y || launcher.y >= after.y + after.height).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.locator('[data-diagnostic-launcher]').click();
        await page.locator('[data-diagnostic-stop]').click();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('Analyze Back and reopen attributes two real Analyze generations', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await page.locator('[data-play-v2-analyze-close]').click();
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-stop]').click();
    const parsed = JSON.parse(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.exportJson()));
    expect(parsed.captureCompleteness).toBe('complete');
    expect(parsed.records.filter(item => item.eventType === 'analyze-open')).toHaveLength(2);
    expect(Math.max(...parsed.records.map(item => item.generation))).toBe(2);
    expect(parsed.requiredEventEvidence.generations.map(item => item.generation)).toEqual([1, 2]);
});

test('eviction preserves required evidence and reports exact ring-buffer truncation', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('dialog', { name: 'Analyze completed game' })).toBeVisible();
    await page.evaluate(() => { for (let index = 0; index < 150; index += 1) dispatchEvent(new Event('resize')); });
    await expect.poll(() => page.evaluate(() => JSON.parse(window.CaissaIpadAnalyzeDiagnostic.exportJson()).recordsDropped)).toBeGreaterThan(0);
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-stop]').click();
    const parsed = JSON.parse(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.exportJson()));
    expect(parsed.recordsRetained).toBe(512);
    expect(parsed.recordsDropped).toBeGreaterThan(0);
    expect(parsed.firstRetainedSequence).toBe(parsed.recordsDropped + 1);
    expect(parsed.lastRetainedSequence).toBe(parsed.verdictSequence);
    expect(parsed.captureCompleteness).toBe('complete');
    expect(parsed.missingRequiredEvents).toEqual([]);
    expect(parsed.requiredEventEvidence.generations[0].observed.analyzeOpen).toBe(true);
});

test('geometry applicability ignores hidden Analyze and uses scale-aware material thresholds', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    const assessment = await page.evaluate(() => ({
        zoomRounding: window.CaissaIpadAnalyzeDiagnostic.assessBoardGeometry({ width: 417, height: 420,
            devicePixelRatio: 2, scale: 1.626, applicable: true }),
        strip: window.CaissaIpadAnalyzeDiagnostic.assessBoardGeometry({ width: 420, height: 40,
            devicePixelRatio: 2, scale: 1, applicable: true }),
        zeroVisible: window.CaissaIpadAnalyzeDiagnostic.assessBoardGeometry({ width: 420, height: 0,
            devicePixelRatio: 2, scale: 1, applicable: true }),
        zeroHidden: window.CaissaIpadAnalyzeDiagnostic.assessBoardGeometry({ width: 420, height: 0,
            devicePixelRatio: 2, scale: 1, applicable: false })
    }));
    expect(assessment.zoomRounding.violations).toEqual([]);
    expect(assessment.strip.violations).toContain('BOARD_MATERIAL_STRIP');
    expect(assessment.zeroVisible.violations).toContain('BOARD_NON_POSITIVE');
    expect(assessment.zeroHidden).toMatchObject({ applicable: false, violations: [] });

    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await page.locator('[data-play-v2-analyze-close]').click();
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-stop]').click();
    const parsed = JSON.parse(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.exportJson()));
    const hidden = parsed.records.filter(item => item.surface !== 'analyze');
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every(item => item.geometryApplicability.applicable === false
        && !item.violations.includes('BOARD_NON_POSITIVE'))).toBe(true);
});

test('diagnostic mode routing retains gate, UI, capture, and never enters Classic', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    for (const [label, suffix] of [['Play Bots', '/bots'], ['Play Coach', '/coach'], ['Play Game', '']]) {
        await page.getByRole('tab', { name: label }).click();
        await expect(page).toHaveURL(new RegExp(`/play/beta/qa/ipad-analyze-diagnostic${suffix}$`));
        await expect(page.locator('[data-diagnostic-launcher]')).toBeVisible();
        expect(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.inspect().capturing)).toBe(true);
        await expect(page).not.toHaveURL(/\/$/);
    }
    expect(requests.filter(url => /auth-config|fics-client|academy|caissa-clarity/i.test(url))).toEqual([]);
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic/players');
    await expect(page).toHaveTitle(/Play Beta Unavailable/);
    await expect(page.locator('script')).toHaveCount(0);
});

test('launcher exclusively owns dialog focus, close lifecycle, and one idempotent instance', async ({ page }) => {
    await page.goto('/play/beta/qa/ipad-analyze-diagnostic');
    const launcher = page.locator('[data-diagnostic-launcher]');
    const dialog = page.locator('[data-ipad-analyze-diagnostic]');
    await expect(dialog).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.querySelector('[data-ipad-analyze-diagnostic]').contains(document.activeElement))).toBe(false);
    await launcher.click();
    await expect(dialog).toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.querySelector('[data-ipad-analyze-diagnostic]').contains(document.activeElement))).toBe(true);
    await expect(dialog).toHaveAccessibleName('iPad Analyze diagnostic');
    for (const name of ['Start capture', 'Stop capture', 'Copy diagnostic JSON',
        'Download diagnostic JSON', 'Clear', 'Close'])
        await expect(page.getByRole('button', { name, exact: true })).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', '');
    await expect(launcher).toBeFocused();
    await launcher.click(); await page.locator('[data-diagnostic-close]').click();
    await expect(launcher).toBeFocused();
    expect(await page.locator('[data-ipad-analyze-diagnostic]').count()).toBe(1);
    expect(await page.locator('[data-diagnostic-launcher]').count()).toBe(1);
});

test('refresh, Back, Forward, and route reopen restore a closed empty diagnostic', async ({ page }) => {
    const route = '/play/beta/qa/ipad-analyze-diagnostic';
    await page.goto(route); await page.locator('[data-diagnostic-launcher]').click();
    await page.locator('[data-diagnostic-start]').click();
    await page.reload();
    const assertFresh = async () => {
        await expect(page.locator('[data-ipad-analyze-diagnostic]')).not.toHaveAttribute('open', '');
        expect(await page.evaluate(() => window.CaissaIpadAnalyzeDiagnostic.inspect())).toMatchObject({ capturing: false, count: 0 });
    };
    await assertFresh();
    await page.goto('/play/beta'); await page.goBack(); await assertFresh();
    await page.goForward(); await page.goBack(); await assertFresh();
    await page.goto(route); await assertFresh();
});

test('diagnostic URL manipulation fails closed in the client owner', async ({ page }) => {
    for (const path of ['/play/beta/qa/ipad-analyze-diagnostic?attempt=1',
        '/play/beta/qa/ipad-analyze-diagnostic#attempt', '/play-v2-ipad-analyze-diagnostic.html']) {
        await page.goto(path); await expect(page).toHaveTitle(/Play Beta Unavailable/);
        await expect(page.locator('script')).toHaveCount(0);
    }
});

test('normal Play does not load the iPad diagnostic', async ({ page }) => {
    await openPlay(page, 'play/beta');
    await expect(page.locator('[data-ipad-analyze-diagnostic]')).toHaveCount(0);
    expect(await page.evaluate(() => 'CaissaIpadAnalyzeDiagnostic' in window)).toBe(false);
});
