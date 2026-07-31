import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const rootUrl = new URL('../../', import.meta.url);
const source = fs.readFileSync(new URL('js/play/ui/play-themes.js', rootUrl), 'utf8');
const tokens = fs.readFileSync(new URL('css/play-visual-tokens.css', rootUrl), 'utf8');
const components = fs.readFileSync(new URL('css/play-visual-components.css', rootUrl), 'utf8');

function harness(light = false) {
    const listeners = new Set();
    const media = {
        matches: light,
        addEventListener(type, handler) { if (type === 'change') listeners.add(handler); },
        removeEventListener(type, handler) { if (type === 'change') listeners.delete(handler); },
        emit(matches) { this.matches = matches; listeners.forEach(handler => handler({ matches })); }
    };
    const attrs = new Map();
    const body = {
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        hasAttribute(name) { return attrs.has(name); },
        getAttribute(name) { return attrs.get(name) || null; }
    };
    const window = { document: { body }, matchMedia: () => media };
    vm.runInNewContext(source, { window, globalThis: window, WeakSet, Set, Reflect, Object });
    return { api: window.CaissaPlayThemes, media, body, attrs, listeners };
}

test('theme API and all records are versioned, bounded, immutable, and complete', () => {
    const { api } = harness(), themes = api.getThemes();
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.themeSchemaVersion, '1.0.0');
    assert.equal(api.registrySchemaVersion, '1.0.0');
    assert.equal(api.policySchemaVersion, '1.0.0');
    assert.equal(api.compatibilitySchemaVersion, '1.0.0');
    assert.deepEqual(themes.map(theme => theme.id), ['caissa-dark', 'caissa-light', 'system']);
    assert.equal(Object.keys(api.getTheme('caissa-dark').tokens).length, api.tokenKeys.length);
    assert.equal(api.validateTheme(api.getTheme('caissa-dark')).ok, true);
    assert.equal(api.validateTheme(api.getTheme('caissa-light')).ok, true);
    assert.ok(Object.isFrozen(api) && Object.isFrozen(themes) && Object.isFrozen(themes[0].tokens));
});

test('registry rejects unknown, malformed, hostile, and unregistered theme input', () => {
    const { api } = harness();
    assert.equal(api.getTheme('unknown'), null);
    assert.equal(api.applyTheme('unknown').reasonCode, 'UNKNOWN_THEME');
    assert.equal(api.validateTheme({ schemaVersion: '2.0.0', id: 'caissa-dark' }).reasonCode,
        'UNSUPPORTED_SCHEMA_VERSION');
    assert.equal(api.validateTheme({ ...api.getTheme('caissa-dark'), id: 'unknown' }).reasonCode,
        'UNREGISTERED_THEME');
    const hostile = JSON.parse('{"schemaVersion":"1.0.0","id":"caissa-dark","__proto__":{"polluted":true}}');
    assert.equal(api.validateTheme(hostile).reasonCode, 'INVALID_THEME');
});

test('dark, light, system, explicit override, media changes, and cleanup are deterministic', () => {
    const { api, media, body, listeners } = harness(true);
    assert.equal(api.resolveTheme('caissa-dark', 'light'), 'caissa-dark');
    assert.equal(api.resolveTheme('caissa-light', 'dark'), 'caissa-light');
    assert.equal(api.resolveTheme('system', 'light'), 'caissa-light');
    assert.equal(api.applyTheme('system', body).value.resolvedThemeId, 'caissa-light');
    assert.equal(listeners.size, 1);
    media.emit(false);
    assert.equal(body.getAttribute('data-caissa-play-theme'), 'caissa-dark');
    assert.equal(api.applyTheme('caissa-light', body).value.resolvedThemeId, 'caissa-light');
    assert.equal(listeners.size, 0);
    assert.equal(api.dispose().reasonCode, 'DISPOSED');
    assert.equal(body.hasAttribute('data-caissa-play-theme'), false);
    assert.equal(api.inspect().mediaListeners, 0);
});

test('board and piece compatibility preserve every preference and warn without replacement', () => {
    const { api } = harness();
    assert.equal(api.validateBoardCompatibility('current', 'caissa-light').value.compatible, true);
    assert.equal(api.validatePieceCompatibility('wikipedia', 'caissa-dark').value.compatible, true);
    const board = api.validateBoardCompatibility('unknown-board', 'caissa-light');
    const piece = api.validatePieceCompatibility('unknown-pieces', 'caissa-dark');
    for (const result of [board, piece]) {
        assert.equal(result.reasonCode, 'PREFERENCE_PRESERVED_WITH_WARNING');
        assert.equal(result.value.preferencePreserved, true);
        assert.equal(result.value.replacement, null);
    }
});

test('theme module owns no runtime, persistence, resources, URLs, or arbitrary style injection', () => {
    assert.doesNotMatch(source, /\bApp\b|GameLifecycle|FairPlay|Chessboard|Engine|startNewGame|navigate/);
    assert.doesNotMatch(source, /\bnew\s+(?:Worker|WebSocket)\b|fetch\s*\(|XMLHttpRequest|postMessage\s*\(/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame/);
    assert.doesNotMatch(source, /createElement|appendChild|insertRule|style\.setProperty|innerHTML|https?:\/\//);
});

test('semantic token layers cover dark and light while component CSS contains no raw theme colors', () => {
    for (const token of ['background', 'panel', 'card', 'inset', 'border', 'edge', 'text',
        'text-secondary', 'text-muted', 'positive', 'warning', 'critical', 'info', 'focus',
        'selected', 'disabled', 'skeleton-base', 'skeleton-highlight', 'overlay',
        'shadow-color', 'eval-neutral', 'eval-positive', 'eval-negative', 'board-stage'])
        assert.match(tokens, new RegExp(`--play-theme-${token}:`));
    assert.match(tokens, /data-caissa-play-theme="caissa-light"/);
    assert.match(tokens, /@media \(forced-colors: active\)/);
    assert.doesNotMatch(components, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
    assert.doesNotMatch(tokens, /(^|})\s*(?:html|body(?!\.caissa-simplified-play-active)|\*)\s*(?:,|\{)/m);
});

test('light primary edge maintains WCAG AA contrast with its fixed button text', () => {
    const luminance = hex => {
        const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
            .map(value => Number.parseInt(value, 16) / 255)
            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const contrast = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
    };
    const edge = tokens.match(/data-caissa-play-theme="caissa-light"[\s\S]*?--play-theme-edge:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.equal(edge, '#a27d35');
    assert.ok(contrast('#111111', edge) >= 4.5);
});

test('SPA registration is ordered, unique, and Settings persistence is truthfully deferred', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(page, rootUrl), 'utf8');
        assert.equal((html.match(/play-themes\.js/g) || []).length, 1);
        assert.ok(html.indexOf('play-themes.js') < html.indexOf('play-visual-components.js'));
        assert.doesNotMatch(html, /data-play-theme-preference|id="playTheme"/);
    }
    const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', rootUrl), 'utf8'));
    assert.ok(packageJson.scripts['test:play:themes']);
});
