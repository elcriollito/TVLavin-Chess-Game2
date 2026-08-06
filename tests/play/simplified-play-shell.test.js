import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/simplified-play-shell.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../css/play-simplified-shell.css', import.meta.url), 'utf8');

function load() {
    const listeners = new Map();
    const document = {
        addEventListener(type, listener) { listeners.set(type, listener); },
        createElement() { throw new Error('module load must not create shell DOM'); }
    };
    const window = { document };
    vm.runInNewContext(source, { window, globalThis: window });
    return { api: window.CaissaSimplifiedPlayShell, listeners };
}

test('publishes frozen versioned shell and snapshot contracts', () => {
    const { api } = load();
    assert.equal(api.schemaVersion, '1.7.0');
    assert.equal(api.snapshotSchemaVersion, '1.7.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.statuses));
    assert.ok(Object.isFrozen(api.regions));
    assert.ok(Object.isFrozen(api.layoutModes));
});

test('mode availability is truthful and inactive modes remain disabled', () => {
    const { api } = load();
    assert.deepEqual({ ...api.modes }, { games: true, bots: true, coach: true, players: false });
});

test('layout mode selection is deterministic across phone, tablet, desktop, and constrained height', () => {
    const { api } = load();
    const cases = [
        [320, 568, 'phone-compact'], [390, 844, 'phone-standard'],
        [844, 390, 'phone-landscape'], [768, 1024, 'tablet-portrait-stacked'],
        [1024, 768, 'tablet-landscape-split'], [1440, 900, 'desktop-split'],
        [1200, 560, 'constrained-height']
    ];
    for (const [width, height, expected] of cases)
        assert.equal(api.selectLayoutMode({ width, height }), expected);
});

test('geometry subtracts rail, gaps, padding, and safe areas while preserving square size', () => {
    const { api } = load();
    const base = api.calculateGeometry({ width: 390, height: 844 });
    const safe = api.calculateGeometry({ width: 390, height: 844, safeLeft: 20, safeRight: 10 });
    assert.equal(base.mode, 'phone-standard');
    assert.equal(base.railWidth, 12);
    assert.equal(base.squareSize, base.boardSize / 8);
    assert.equal(base.boardSize - safe.boardSize, 30);
    assert.ok(safe.boardSize >= 180);
    assert.ok(Object.isFrozen(safe));
});

test('desktop beta geometry uses viewport height instead of the former 760px ceiling', () => {
    const { api } = load();
    const targets = [[1440, 900, 700], [1920, 1080, 880], [2560, 1440, 1240], [3840, 2160, 1960]];
    for (const [width, height, minimum] of targets) {
        const setup = api.calculateGeometry({ width, height, viewportOwnedDesktop: true });
        const active = api.calculateGeometry({ width, height, viewportOwnedDesktop: true, activeGame: true });
        assert.ok(setup.boardSize >= minimum, `${width}x${height}`);
        assert.ok(setup.boardSize > 760 || width === 1440, `${width}x${height} must defeat the old cap`);
        assert.equal(setup.boardOwnerSize, setup.boardSize + setup.railWidth + setup.railGap + setup.stagePadding * 2);
        assert.ok(active.boardSize <= setup.boardSize);
        assert.ok(active.boardSize >= height * .70, `${width}x${height} active board remains viewport-dominant`);
    }
});

test('malformed geometry inputs are bounded and cannot inject a layout class', () => {
    const { api } = load();
    const geometry = api.calculateGeometry({
        width: -1, height: Number.NaN, mode: 'phone-standard\" onclick=\"alert(1)'
    });
    assert.equal(geometry.width, 0);
    assert.equal(geometry.height, 0);
    assert.equal(geometry.mode, 'phone-compact');
    assert.equal(geometry.boardSize, 0);
});

test('module load is passive until DOM ready', () => {
    const { listeners } = load();
    assert.deepEqual([...listeners.keys()], ['DOMContentLoaded']);
});

test('static guard excludes runtime ownership while allowing one canonical clock teardown call', () => {
    for (const forbidden of [
        /\bApp\.game\s*=/, /\.move\s*\(/, /switchLocalClock|startTimer/,
        /new\s+[A-Za-z0-9_$]*Clock|createClock\s*\(/,
        /CaissaClockService\?*\.(?:create|configure|start|reset|update|switchTurn)/,
        /CaissaClockService\s*=|CaissaClockService\.[A-Za-z0-9_$]+\s*=/,
        /EngineAdapter|engineSend|postMessage/, /localStorage|sessionStorage/,
        /pushState|replaceState/, /MentorAI|gameResult\s*=/,
        /analyzeChessboard|arenaBoard|fics|spectator/i
    ]) assert.doesNotMatch(source, forbidden);
    assert.equal((source.match(/CaissaClockService\?\.stop\?\.\('postgame-mode-transition'\)/g) || []).length, 1);
});

test('shell CSS layout rules are scoped to the explicit QA body state', () => {
    const layoutRules = css.split('}').filter(rule => rule.includes('{') && !rule.trim().startsWith('/*') &&
        !rule.trim().startsWith('@media') && !rule.trim().startsWith('@'));
    for (const rule of layoutRules) {
        const selector = rule.slice(0, rule.indexOf('{')).trim();
        assert.match(selector, /caissa-simplified-play-active|caissa-simplified-shell\[hidden\]|caissa-play-v2-inline-analyze/);
    }
});

test('SPA pages register shell assets once and no sitemap entry or dependency was added', () => {
    for (const page of ['index.html', 'yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
        assert.equal((html.match(/play-simplified-shell\.css/g) || []).length, 1);
        assert.equal((html.match(/simplified-play-shell\.js/g) || []).length, 1);
    }
    const sitemap = fs.readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
    assert.doesNotMatch(sitemap, /simplified/);
});

test('route controller preserves the explicit QA flag without making it default', () => {
    const routeSource = fs.readFileSync(new URL('../../js/play/play-route-controller.js', import.meta.url), 'utf8');
    assert.match(routeSource, /AVAILABILITY\[requestedMode\] === 'qa-only' && query\.simplified === '1'/);
    assert.match(routeSource, /players: false/);
    assert.match(source, /route\.query\?\.simplified === '1'/);
});
