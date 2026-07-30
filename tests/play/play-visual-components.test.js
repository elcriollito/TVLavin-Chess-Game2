import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/ui/play-visual-components.js', import.meta.url), 'utf8');
function load() {
    const window = {};
    vm.runInNewContext(source, { window, globalThis: window, WeakMap, WeakSet, Set });
    return window.CaissaPlayVisualComponents;
}

test('visual API is versioned, frozen, minimal, and publishes fixed vocabularies', () => {
    const api = load();
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.componentSchemaVersion, '1.0.0');
    assert.deepEqual([...api.variants], ['standard', 'compact', 'mobile-scroll']);
    assert.deepEqual([...api.states], ['default', 'selected', 'disabled', 'loading',
        'empty', 'locked', 'coming-later', 'unavailable']);
    assert.deepEqual([...api.tones], ['neutral', 'info', 'positive', 'warning', 'danger']);
    assert.deepEqual([...api.densities], ['compact', 'standard', 'large']);
    assert.ok(Object.isFrozen(api));
});

test('all eleven required component factories are exposed without business APIs', () => {
    const api = load();
    for (const name of ['createModeTabs', 'createProfileCard', 'createRatingBadge',
        'createCountryFlag', 'createTimeControlSelector', 'createCollapsibleOptions',
        'createCtaFooter', 'createGameOverCard', 'createLoadingSkeleton',
        'createEmptyState', 'createLockedState', 'update', 'dispose'])
        assert.equal(typeof api[name], 'function');
    for (const forbidden of ['startGame', 'navigate', 'connect', 'evaluateFairPlay', 'createWorker'])
        assert.equal(api[forbidden], undefined);
});

test('module load is passive and diagnostics contain no identities or view models', () => {
    const api = load(), diagnostics = api.inspect();
    assert.deepEqual(JSON.parse(JSON.stringify(diagnostics)), {
        created: 0, updated: 0, disposed: 0, actionsEmitted: 0,
        rejected: 0, listeners: 0, nodes: 0, lastComponent: null
    });
});

test('static guardrails exclude business ownership, unsafe rendering, resources, and persistence', () => {
    for (const forbidden of [
        /\bApp\b|GameLifecycle|FairPlayPolicy|Engine|Chessboard|Presence|Challenge|GameRecord/,
        /\bnew\s+(?:Worker|WebSocket)\b|postMessage\s*\(/,
        /localStorage|sessionStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame/,
        /\.innerHTML|insertAdjacentHTML|eval\s*\(|new Function/,
        /location\.|history\.|fetch\s*\(|XMLHttpRequest/,
        /fixture|mockPlayer|fakePlayer/
    ]) assert.doesNotMatch(source, forbidden);
});

test('visual assets are registered once, scoped, dependency-free, and ordered before panels', () => {
    const packageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.ok(!packageJson.dependencies || !Object.keys(packageJson.dependencies).some(name => /bootstrap|tailwind|react/i.test(name)));
    const css = fs.readFileSync(new URL('../../css/play-visual-components.css', import.meta.url), 'utf8');
    assert.match(css, /body\.caissa-simplified-play-active \.caissa-vc/);
    assert.doesNotMatch(css, /(^|})\s*(?:html|body(?!\.caissa-simplified-play-active)|\*|button|section)\s*(?:,|\{)/m);
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        for (const asset of ['play-visual-components.js', 'play-visual-components.css', 'play-visual-tokens.css'])
            assert.equal((html.match(new RegExp(asset.replaceAll('.', '\\.'), 'g')) || []).length, 1);
        assert.ok(html.indexOf('play-visual-components.js') < html.indexOf('games-panel.js'));
    }
});

test('representative existing surfaces declare shared presentation classes without ownership changes', () => {
    const files = ['bots-panel.js', 'coach-panel.js', 'games-panel.js', 'players-panel.js', 'post-game-experience.js'];
    const combined = files.map(file => fs.readFileSync(new URL(`../../js/play/${file}`, import.meta.url), 'utf8')).join('\n');
    for (const component of ['profile-card', 'time-control-selector', 'cta-footer', 'empty-state', 'game-over-card'])
        assert.match(combined, new RegExp(`data-visual-component['\"]?:? ['\"]${component}|data-visual-component['\"]?, ['\"]${component}`));
});
