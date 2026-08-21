import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Mentor context route policy is explicit, immutable, and honest', () => {
    const root = { location: { pathname: '/play' } };
    vm.runInNewContext(read('js/mentor/mentor-context-contract.js'), { globalThis: root });
    const contract = root.CaissaMentorContextContract;
    assert.equal(contract.resolve('/play').availability, 'GENERAL');
    assert.equal(contract.resolve('/play').capability, 'NONE');
    for (const route of ['/analyze', '/history', '/game-library', '/endgame-trainer', '/academy', '/eco', '/opening-database', '/arena'])
        assert.equal(contract.resolve(route).availability, 'CONTEXT', route);
    for (const route of ['/play-online/playchess', '/play-online/fritz', '/watch/lichess-tv', '/watch/live-blitz'])
        assert.equal(contract.resolve(route).availability, 'GENERAL', route);
    for (const route of ['/signin', '/signup', '/auth/complete', '/premium', '/checkout', '/error'])
        assert.equal(contract.resolve(route).availability, 'NONE', route);
    assert.ok(Object.isFrozen(contract)); assert.ok(Object.isFrozen(contract.resolve('/play')));
});

test('floating shell reuses LLMProvider only inside explicit submit and owns no economic authority', () => {
    const source = read('js/mentor/mentor-floating-shell.js');
    assert.match(source, /form\.addEventListener\('submit'[\s\S]*provider\.chat/);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|Worker\s*\(|localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(source, /credits?\s*=|premium\s*=|CAISSA_MENTOR_RESERVATIONS_ENABLED|reserve_credits|consume_credits/);
    assert.match(source, /textContent = value/);
    assert.doesNotMatch(source, /innerHTML/);
});

test('generated public Play contains one lightweight Mentor shell and excludes legacy Mentor runtime', () => {
    const html = read('play-v2-public-beta.html');
    for (const resource of ['css/mentor-floating-shell.css', 'js/mentor/mentor-context-contract.js', 'js/mentor/mentor-floating-shell.js'])
        assert.equal(html.split(resource).length - 1, 1, resource);
    assert.doesNotMatch(html, /mentor-ai\.js|mentor-prompts\.js|id="mentorPanel"/);
    assert.match(html, /llm-provider\.js/);
});

test('local review remains explicitly local and report launcher joins one floating stack', () => {
    const shell = read('js/mentor/mentor-floating-shell.js');
    const report = read('js/play/play-v2-manual-qa-report.js');
    assert.match(shell, /Local Game Review[\s\S]*local analysis[\s\S]*does not use Shared AI credits/);
    assert.match(report, /data-caissa-floating-controls/);
    assert.doesNotMatch(report, /fetch\s*\(/);
});
