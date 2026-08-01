import test from 'node:test';
import assert from 'node:assert/strict';
import { geometryDelta, validateBotsReadinessSnapshot,
    validateReadinessSnapshot } from '../browser/helpers/play-responsive-readiness.js';

const ready = overrides => ({ schemaVersion: 'PlayResponsiveReadiness@1.0.0', expectedMode: 'games',
    settledMode: 'games', shellCount: 1, boardCount: 1, boardReady: true, panelReady: true,
    liveRegionCount: 2, elapsedMs: 12, reasonCode: 'READY', ...overrides });

test('responsive readiness snapshot accepts only the exact ready categories', () => {
    assert(validateReadinessSnapshot(ready()));
    for (const invalid of [ready({ settledMode: 'bots' }), ready({ boardCount: 0 }),
        ready({ panelReady: false }), ready({ liveRegionCount: 1 }), ready({ reasonCode: 'LOADING' })])
        assert.equal(validateReadinessSnapshot(invalid), false);
});

test('geometry delta detects stable and moving panel, scroll, viewport, and board dimensions', () => {
    const sample = { top: 1, right: 101, bottom: 101, left: 1, width: 100, height: 100,
        scrollTop: 0, scrollLeft: 0, viewportWidth: 390, viewportHeight: 844, boardWidth: 300, boardHeight: 300 };
    assert.equal(geometryDelta(sample, { ...sample, top: 3 }), 2);
    assert.equal(geometryDelta(sample, { ...sample, boardWidth: 304 }), 4);
    assert.equal(geometryDelta(null, sample), Number.POSITIVE_INFINITY);
});

test('Bots readiness requires the loaded group, four cards, one board, and accessibility composition', () => {
    const readyBots = { schemaVersion: 'PlayBotsReadiness@1.0.0', routeMode: 'bots', shellMode: 'bots',
        shellStatus: 'ready', lazyState: 'loaded', contractsReady: true, registryReady: true,
        panelReady: true, cardCount: 4, loadingCount: 0, unavailableCount: 0, boardCount: 1,
        workerCount: 1, accessibilityReady: true, reasonCode: 'READY' };
    assert.equal(validateBotsReadinessSnapshot(readyBots), true);
    for (const invalid of [{ cardCount: 3 }, { lazyState: 'loading' }, { workerCount: 2 },
        { accessibilityReady: false }, { unavailableCount: 1 }])
        assert.equal(validateBotsReadinessSnapshot({ ...readyBots, ...invalid }), false);
});

test('readiness helper is test-only and contains no forbidden product or analytics data', async () => {
    const source = await import('node:fs').then(fs => fs.readFileSync(
        'tests/browser/helpers/play-responsive-readiness.js', 'utf8'));
    assert.doesNotMatch(source, /(?:localStorage|sessionStorage|document\.cookie|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|\bpgn\b|\bfen\b|\bsan\b|\buci\b|mentorContent|providerPayload)/i);
});
