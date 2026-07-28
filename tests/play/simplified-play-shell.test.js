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
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.snapshotSchemaVersion, '1.0.0');
    assert.ok(Object.isFrozen(api));
    assert.ok(Object.isFrozen(api.statuses));
    assert.ok(Object.isFrozen(api.regions));
    assert.ok(Object.isFrozen(api.layoutModes));
});

test('mode availability is truthful and inactive modes remain disabled', () => {
    const { api } = load();
    assert.deepEqual({ ...api.modes }, { games: true, bots: false, coach: false, players: false });
});

test('module load is passive until DOM ready', () => {
    const { listeners } = load();
    assert.deepEqual([...listeners.keys()], ['DOMContentLoaded']);
});

test('static guard excludes game, engine, clock, persistence, routing mutation, and other boards', () => {
    for (const forbidden of [
        /\bApp\.game\s*=/, /\.move\s*\(/, /ClockService|switchLocalClock|startTimer/,
        /EngineAdapter|engineSend|postMessage/, /localStorage|sessionStorage/,
        /pushState|replaceState/, /MentorAI|gameResult\s*=/,
        /analyzeChessboard|arenaBoard|fics|spectator/i
    ]) assert.doesNotMatch(source, forbidden);
});

test('shell CSS layout rules are scoped to the explicit QA body state', () => {
    const layoutRules = css.split('}').filter(rule => rule.includes('{') && !rule.trim().startsWith('/*') &&
        !rule.trim().startsWith('@media') && !rule.trim().startsWith('@'));
    for (const rule of layoutRules) {
        const selector = rule.slice(0, rule.indexOf('{')).trim();
        assert.match(selector, /caissa-simplified-play-active|caissa-simplified-shell\[hidden\]/);
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
    assert.doesNotMatch(routeSource, /simplified[^]*===\s*['"]1['"][^]*CLASSIC_DEFAULT_PRESERVED/);
    assert.match(source, /route\.query\?\.simplified === '1'/);
});
