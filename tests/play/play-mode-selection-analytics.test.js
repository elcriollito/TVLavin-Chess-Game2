import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sources = ['play-analytics-contracts.js', 'play-analytics-privacy-policy.js',
    'play-analytics-dispatcher.js', 'play-mode-selection-analytics.js']
    .map(file => fs.readFileSync(`js/play/analytics/${file}`, 'utf8'));
function load(route = null) {
    let listener = null;
    const controller = { subscribe(value) { listener = value; return () => { listener = null; }; }, getCurrent() { return route; } };
    const window = { CaissaPlayRouteController: controller };
    sources.forEach(source => vm.runInNewContext(source, { window, globalThis: window }));
    return { window, publish: value => listener(value), events: () => window.CaissaPlayAnalytics.getSnapshot({ qa: true, includeEvents: true }).events };
}
const route = (mode, options = {}) => ({ section: 'play', mode, requestedMode: options.requestedMode || mode,
    status: options.status || 'resolved', source: options.source || 'mode-tab', query: options.qa === false ? {} : { simplified: '1' } });

test('Games, Bots, Coach, and QA Players selected events preserve previous mode and source', () => {
    const fixture = load();
    for (const mode of ['games', 'bots', 'coach', 'players']) fixture.publish(route(mode));
    const selected = fixture.events().filter(event => event.eventId === 'play_mode_selected');
    assert.deepEqual(Array.from(selected, event => event.payload.mode), ['games', 'bots', 'coach', 'players']);
    assert.deepEqual(Array.from(selected, event => event.payload.previousMode), ['none', 'games', 'bots', 'coach']);
    assert.equal(selected.at(-1).payload.accessState, 'qa-only'); assert.equal(selected.at(-1).payload.productionEligible, false);
});

test('non-QA Players emits blocked and normalized Games without a false Players selection', () => {
    const fixture = load();
    fixture.publish(route('games', { requestedMode: 'players', status: 'inactive-mode', source: 'direct-path', qa: false }));
    const events = fixture.events();
    assert.deepEqual(Array.from(events, event => event.eventId), ['play_mode_selection_blocked', 'play_mode_route_normalized', 'play_mode_selected']);
    assert.equal(events[0].payload.mode, 'players'); assert.equal(events[0].payload.accessState, 'blocked');
    assert.equal(events.filter(event => event.eventId === 'play_mode_selected' && event.payload.mode === 'players').length, 0);
});

test('cold, history, legacy, primary, and mode-tab sources are allowlisted without URL data', () => {
    const actual = [];
    for (const source of ['cold-load', 'popstate', 'legacy-section', 'primary-navigation', 'mode-tab']) {
        const fixture = load(); fixture.publish(route('games', { source }));
        actual.push(fixture.events().find(event => event.eventId === 'play_mode_selected').payload.routeSource);
    }
    assert.deepEqual(actual, ['cold-restore', 'browser-history', 'legacy-bridge', 'primary-navigation', 'mode-tab']);
});

test('lazy start, deduplication, success, and bounded failure correlate to the active selection', () => {
    const fixture = load(); fixture.publish(route('bots'));
    assert.equal(fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('bots-stack', 'started'), true);
    assert.equal(fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('bots-stack', 'deduplicated'), true);
    assert.equal(fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('bots-stack', 'succeeded'), true);
    fixture.publish(route('coach'));
    fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('coach-stack', 'started');
    fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('coach-stack', 'failed', 'readiness-failed');
    assert.deepEqual(Array.from(fixture.events().filter(event => event.eventId.includes('_load_')), event => event.payload.loadState),
        ['started', 'deduplicated', 'succeeded', 'started', 'failed']);
    assert.equal(fixture.events().at(-1).payload.failureReason, 'readiness-failed');
});

test('stale lazy completion is ignored after a route change', () => {
    const fixture = load(); fixture.publish(route('bots'));
    fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('bots-stack', 'started');
    fixture.publish(route('games'));
    assert.equal(fixture.window.CaissaPlayModeSelectionAnalytics.observeLoad('bots-stack', 'succeeded'), false);
    assert.equal(fixture.events().filter(event => event.eventId === 'play_mode_load_succeeded').length, 0);
});

test('direct resolution plus cold initialization suppresses a duplicate route-cycle selection', () => {
    const fixture = load(); fixture.publish(route('games', { source: 'direct-path' }));
    fixture.publish(route('games', { source: 'cold-load' }));
    assert.equal(fixture.events().filter(event => event.eventId === 'play_mode_selected').length, 1);
    assert.equal(fixture.window.CaissaPlayAnalytics.inspect().diagnostics.duplicatesSuppressed, 1);
});
