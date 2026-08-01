import { expect } from '@playwright/test';

export const READINESS_SCHEMA_VERSION = 'PlayResponsiveReadiness@1.0.0';
export const GEOMETRY_TOLERANCE_PX = 2;
const PANEL_SELECTORS = Object.freeze({
    games: '[data-games-primary]', bots: '[data-bot-primary]',
    coach: '[data-coach-primary]', players: '[data-players-panel]'
});

export function validateReadinessSnapshot(value) {
    return !!value && value.schemaVersion === READINESS_SCHEMA_VERSION
        && ['games', 'bots', 'coach', 'players'].includes(value.expectedMode)
        && value.settledMode === value.expectedMode && value.shellCount === 1
        && value.boardCount === 1 && value.boardReady === true && value.panelReady === true
        && value.liveRegionCount === 2 && value.reasonCode === 'READY'
        && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0;
}

export function validateBotsReadinessSnapshot(value) {
    return !!value && value.schemaVersion === 'PlayBotsReadiness@1.0.0'
        && value.routeMode === 'bots' && value.shellMode === 'bots'
        && value.shellStatus === 'ready' && value.lazyState === 'loaded'
        && value.contractsReady === true && value.registryReady === true
        && value.panelReady === true && value.cardCount === 4
        && value.loadingCount === 0 && value.unavailableCount === 0
        && value.boardCount === 1 && value.workerCount <= 1
        && value.accessibilityReady === true && value.reasonCode === 'READY';
}

export function geometryDelta(before, after) {
    if (!before || !after) return Number.POSITIVE_INFINITY;
    return Math.max(...['top', 'right', 'bottom', 'left', 'width', 'height']
        .map(key => Math.abs(before[key] - after[key])),
    Math.abs(before.scrollTop - after.scrollTop), Math.abs(before.scrollLeft - after.scrollLeft),
    Math.abs(before.viewportWidth - after.viewportWidth), Math.abs(before.viewportHeight - after.viewportHeight),
    Math.abs(before.boardWidth - after.boardWidth), Math.abs(before.boardHeight - after.boardHeight));
}

export async function waitForResponsiveGeometry(page, selector = '.caissa-simplified-shell__context') {
    return page.evaluate(async ({ selector, tolerance }) => {
        const sample = () => {
            const node = document.querySelector(selector);
            const board = document.querySelector('#playSection #chessboard');
            if (!node || !board) return null;
            const box = node.getBoundingClientRect(), boardBox = board.getBoundingClientRect();
            const owner = node.closest('[data-scroll-owner]')?.dataset.scrollOwner === 'panel' ? node : document.scrollingElement;
            return { top: box.top, right: box.right, bottom: box.bottom, left: box.left,
                width: box.width, height: box.height, scrollTop: owner?.scrollTop || 0,
                scrollLeft: owner?.scrollLeft || 0, viewportWidth: innerWidth, viewportHeight: innerHeight,
                boardWidth: boardBox.width, boardHeight: boardBox.height };
        };
        const delta = (a, b) => !a || !b ? Infinity : Math.max(
            ...['top','right','bottom','left','width','height','scrollTop','scrollLeft','viewportWidth',
                'viewportHeight','boardWidth','boardHeight'].map(key => Math.abs(a[key] - b[key])));
        let previous = sample(), stableFrames = 0, maximumDelta = 0;
        for (let frame = 0; frame < 120; frame += 1) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const current = sample(), change = delta(previous, current);
            maximumDelta = Math.max(maximumDelta, Number.isFinite(change) ? change : 0);
            stableFrames = change <= tolerance ? stableFrames + 1 : 0;
            if (stableFrames >= 3) return { stable: true, frames: frame + 1, maximumDelta, sample: current };
            previous = current;
        }
        return { stable: false, frames: 120, maximumDelta, sample: previous };
    }, { selector, tolerance: GEOMETRY_TOLERANCE_PX });
}

export async function ensureResponsivePanelReachable(page) {
    let stability = await waitForResponsiveGeometry(page);
    expect(stability.stable, `context geometry delta ${stability.maximumDelta}px`).toBe(true);
    const result = await page.evaluate(() => {
        const panel = document.querySelector('.caissa-simplified-shell__context');
        const before = panel.getBoundingClientRect();
        const needsScroll = before.top < -2 || before.bottom > innerHeight + 2;
        if (needsScroll) panel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const box = panel.getBoundingClientRect(), style = getComputedStyle(panel);
        return { needsScroll, visible: style.display !== 'none' && style.visibility !== 'hidden'
            && box.width > 0 && box.height > 0, width: box.width, height: box.height,
            horizontallyReachable: box.left >= -2 && box.right <= innerWidth + 2 };
    });
    if (result.needsScroll) {
        stability = await waitForResponsiveGeometry(page);
        expect(stability.stable, `post-scroll geometry delta ${stability.maximumDelta}px`).toBe(true);
    }
    expect(result).toMatchObject({ visible: true, horizontallyReachable: true });
    expect(result.width).toBeGreaterThan(0); expect(result.height).toBeGreaterThan(0);
    return { ...result, stability };
}

export async function navigateToReadySimplifiedPlay(page, route, expectedMode) {
    const started = Date.now();
    const response = await page.goto(route, { waitUntil: 'commit', timeout: 10_000 });
    expect(response, 'main-document response').not.toBeNull();
    expect(response.status(), 'main-document HTTP status').toBeGreaterThanOrEqual(200);
    expect(response.status(), 'main-document HTTP status').toBeLessThan(400);
    expect(response.headers()['content-type'] || '', 'main-document content type').toContain('text/html');
    const expectedPath = `/play/${expectedMode}`;
    expect(new URL(response.url()).pathname, 'committed response route').toBe(expectedPath);
    await page.waitForFunction(({ expectedMode, selector }) => {
        const shell = window.CaissaSimplifiedPlayShellInstance?.getSnapshot?.();
        const route = window.CaissaPlayRouteController?.getCurrent?.();
        const board = document.querySelector('#playSection #chessboard');
        const boardBox = board?.getBoundingClientRect?.();
        const adapter = window.App?.boardAdapter?.getSnapshot?.();
        const panel = document.querySelector('.caissa-simplified-shell__context');
        const panelBox = panel?.getBoundingClientRect?.();
        return shell?.mounted && shell.active && shell.status === 'ready' && shell.mode === expectedMode
            && route?.section === 'play' && route.mode === expectedMode && route.query?.simplified === '1'
            && document.querySelectorAll('.caissa-simplified-shell').length === 1
            && document.querySelectorAll('#playSection #chessboard .board-b72b1').length === 1
            && boardBox?.width > 0 && boardBox?.height > 0 && !!adapter?.adapterId
            && panelBox?.width > 0 && panelBox?.height > 0 && !!document.querySelector(selector)
            && document.querySelectorAll('.caissa-simplified-shell [aria-live]').length === 2
            && document.querySelector(`[data-shell-mode="${expectedMode}"]`)?.getAttribute('aria-selected') === 'true';
    }, { expectedMode, selector: PANEL_SELECTORS[expectedMode] }, { timeout: 25_000 });
    const snapshot = await page.evaluate(({ expectedMode, started }) => ({
        schemaVersion: 'PlayResponsiveReadiness@1.0.0', expectedMode,
        settledMode: window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,
        shellCount: document.querySelectorAll('.caissa-simplified-shell').length,
        boardCount: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        boardReady: !!window.App?.boardAdapter?.getSnapshot?.().adapterId,
        panelReady: document.querySelector('.caissa-simplified-shell__context').getBoundingClientRect().width > 0,
        liveRegionCount: document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        elapsedMs: Date.now() - started, reasonCode: 'READY'
    }), { expectedMode, started });
    expect(validateReadinessSnapshot(snapshot)).toBe(true);
    expect(new URL(page.url()).pathname, 'final page route').toBe(expectedPath);
    await ensureResponsivePanelReachable(page);
    return Object.freeze(snapshot);
}

export async function navigateToReadyBotsPanel(page, route = '/play/bots?simplified=1') {
    const navigation = await navigateToReadySimplifiedPlay(page, route, 'bots');
    const snapshot = await page.evaluate(() => {
        const shell = window.CaissaSimplifiedPlayShellInstance?.getSnapshot?.();
        const routeState = window.CaissaPlayRouteController?.getCurrent?.();
        const lazy = window.CaissaPlayLazyLoader?.getState?.('bots-stack');
        const context = document.querySelector('.caissa-simplified-shell__context');
        const cards = context?.querySelectorAll?.('[data-bot-card][data-visual-component="profile-card"]') || [];
        const transient = context?.querySelectorAll?.('[data-visual-component="loading-skeleton"], [aria-busy="true"]') || [];
        const unavailable = context?.querySelectorAll?.('[data-state="unavailable"], [data-state="error"]') || [];
        return {
            schemaVersion: 'PlayBotsReadiness@1.0.0', routeMode: routeState?.mode || null,
            shellMode: shell?.mode || null, shellStatus: shell?.status || null,
            lazyState: lazy?.state || null,
            contractsReady: !!window.CaissaBotProfile?.validate && !!window.CaissaBotPresets?.get,
            registryReady: !!window.CaissaBotRegistry?.list && window.CaissaBotRegistry.list({ enabled: true }).length === 4,
            panelReady: !!window.CaissaBotsPanel?.create && !!shell?.botsPanel?.mounted,
            cardCount: cards.length, loadingCount: transient.length, unavailableCount: unavailable.length,
            boardCount: document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
            workerCount: window.App?.engine?.worker ? 1 : 0,
            accessibilityReady: !!shell?.accessibility && document.querySelectorAll('.caissa-simplified-shell [aria-live]').length === 2,
            reasonCode: 'READY'
        };
    });
    expect(validateBotsReadinessSnapshot(snapshot), JSON.stringify(snapshot)).toBe(true);
    return Object.freeze({ navigation, bots: snapshot });
}
