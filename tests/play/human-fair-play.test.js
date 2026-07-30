import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = [
    'human-fair-play-contracts.js', 'human-runtime-authority.js', 'human-clock-authority.js',
    'human-move-authority.js', 'human-game-readiness.js', 'fics-human-fair-play-adapter.js',
    'classic-human-fair-play-adapter.js', 'caissa-human-fair-play-adapter.js'
];
function runtime() {
    const window = {};
    const context = vm.createContext({ window, globalThis: window });
    for (const file of files) vm.runInContext(fs.readFileSync(
        new URL(`../../js/play/players/${file}`, import.meta.url), 'utf8'), context);
    return window;
}
const providerAuthority = { server: 'provider', clock: 'provider', move: 'provider',
    result: 'provider', reconnect: 'provider' };
const live = overrides => ({ provider: 'fics', providerGameId: 'g-1', gameType: 'human-rated',
    ratingMode: 'rated', assistanceMode: 'prohibited', playerRole: 'player',
    authority: providerAuthority, enginePolicy: 'deny-request', evaluationPolicy: 'frozen',
    postGamePolicy: 'provider-terminal-required', sourceConfidence: 'provider-confirmed',
    reconnectState: 'connected', ...overrides });

test('versioned human context is immutable, bounded, and defaults unknown rather than assisted', () => {
    const w = runtime();
    const context = w.CaissaHumanFairPlay.createContext({ provider: 'x'.repeat(100) });
    assert.equal(context.schemaVersion, '1.0.0');
    assert.equal(context.provider.length, 48);
    assert.equal(context.assistanceMode, 'unknown');
    assert.ok(Object.isFrozen(context));
    assert.ok(Object.isFrozen(context.authority));
});

test('rated and ordinary casual live engine requests are denied before dispatch', () => {
    const w = runtime();
    for (const input of [live(), live({ gameType: 'human-casual', ratingMode: 'casual',
        assistanceMode: 'post-game-only' })]) {
        const decision = w.CaissaHumanGameReadiness.evaluate(input);
        let dispatched = 0;
        const result = w.CaissaHumanGameReadiness.gateEngineRequest(decision, () => { dispatched += 1; });
        assert.equal(result.reasonCode, 'HUMAN_ENGINE_PROHIBITED');
        assert.equal(dispatched, 0);
        assert.equal(decision.evaluationMode, 'frozen');
    }
});

test('assisted casual requires provider capability and mutual evidence', () => {
    const w = runtime();
    const denied = w.CaissaHumanGameReadiness.evaluate(live({ gameType: 'human-assisted-casual',
        ratingMode: 'casual', assistanceMode: 'mutually-assisted' }));
    assert.equal(denied.status, 'blocked');
    assert.ok(denied.reasonCodes.includes('MUTUAL_ASSISTANCE_UNPROVEN'));
    const ready = w.CaissaHumanGameReadiness.evaluate(live({ gameType: 'human-assisted-casual',
        ratingMode: 'casual', assistanceMode: 'mutually-assisted',
        mutualAssistanceEvidence: true, providerAssistanceCapability: true }));
    assert.equal(ready.status, 'assisted-ready');
});

test('post-game engine eligibility requires provider terminal evidence', () => {
    const w = runtime();
    const denied = w.CaissaHumanGameReadiness.evaluate(live({ enginePolicy: 'post-game-allow' }));
    assert.equal(denied.postGameAnalysisEligible, false);
    assert.ok(denied.reasonCodes.includes('PROVIDER_TERMINAL_REQUIRED'));
    const allowed = w.CaissaHumanGameReadiness.evaluate(live({
        enginePolicy: 'post-game-allow', providerTerminal: true
    }));
    let dispatched = 0;
    const result = w.CaissaHumanGameReadiness.gateEngineRequest(allowed,
        () => ({ ok: true, dispatched: ++dispatched }));
    assert.equal(result.ok, true);
    assert.equal(dispatched, 1);
});

test('missing authorities fail closed and adapters tell the runtime truth', () => {
    const w = runtime();
    const decision = w.CaissaHumanGameReadiness.evaluate(live({
        authority: { ...providerAuthority, clock: 'unknown', move: 'unknown' }
    }));
    assert.equal(decision.status, 'blocked');
    assert.ok(decision.reasonCodes.includes('CLOCK_AUTHORITY_REQUIRED'));
    assert.ok(decision.reasonCodes.includes('MOVE_AUTHORITY_REQUIRED'));
    assert.equal(w.CaissaFicsHumanFairPlayAdapter.inspect().status, 'incomplete');
    assert.equal(w.CaissaClassicHumanFairPlayAdapter.inspect().handoff, 'inherits-fics-external-entry');
    assert.equal(w.CaissaHumanFairPlayUnavailableAdapter.inspect().status, 'unsupported');
});

test('move authority blocks double intents, stale acknowledgments, and resets on reconnect', () => {
    const w = runtime();
    const moves = w.CaissaHumanMoveAuthority.create({ authority: 'provider' });
    assert.equal(moves.submitIntent('m1').ok, true);
    assert.equal(moves.submitIntent('m2').reasonCode, 'MOVE_INTENT_PENDING');
    assert.equal(moves.confirm('stale').reasonCode, 'STALE_PROVIDER_ACKNOWLEDGMENT');
    assert.equal(moves.confirm('m1').ok, true);
    moves.submitIntent('m3'); moves.reconnect();
    assert.equal(moves.inspect().pendingIntentId, null);
});

test('production files contain no runtime, worker, socket, storage, or record creation', () => {
    const source = files.map(file => fs.readFileSync(
        new URL(`../../js/play/players/${file}`, import.meta.url), 'utf8')).join('\n');
    assert.doesNotMatch(source, /new\s+(Worker|WebSocket)\b|localStorage|sessionStorage|createGameRecord|startHumanGame/);
    for (const page of ['../../index.html', '../../yahoo-classic.html']) {
        const html = fs.readFileSync(new URL(page, import.meta.url), 'utf8');
        for (const file of files)
            assert.equal((html.match(new RegExp(file.replaceAll('.', '\\.'), 'g')) || []).length, 1);
    }
});
