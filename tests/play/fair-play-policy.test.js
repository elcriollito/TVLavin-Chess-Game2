import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/play/fair-play-policy.js', import.meta.url), 'utf8');
function fixture() {
    const window = {};
    vm.runInNewContext(source, { window, Object, Set, WeakSet, WeakMap, JSON });
    return window.CaissaFairPlayPolicy;
}
const context = (overrides = {}) => ({
    source: 'local-play', gameMode: 'engine', opponentType: 'engine',
    authority: 'local-client', gameStatus: 'active', ...overrides
});

test('contract metadata, contexts, and decisions are versioned, frozen, and serializable', () => {
    const api = fixture();
    const normalized = api.normalizeContext(context({ purpose: 'live-evaluation' }));
    const decision = api.evaluatePurpose('live-evaluation', normalized);
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(normalized), true);
    assert.equal(Object.isFrozen(decision.capabilities), true);
    assert.doesNotThrow(() => JSON.stringify(decision));
});

test('local machine and bot work is allowed with live evaluation capabilities', () => {
    const api = fixture();
    for (const opponentType of ['engine', 'bot']) {
        assert.equal(api.evaluatePurpose('opponent-move', context({ opponentType })).allowed, true);
        const evaluation = api.evaluatePurpose('live-evaluation', context({ opponentType }));
        assert.equal(evaluation.allowed, true);
        assert.equal(evaluation.capabilities.evaluationMode, 'live');
    }
});

test('training and explicit coach contexts are allowed only by contract', () => {
    const api = fixture();
    assert.equal(api.evaluatePurpose('live-evaluation', context({
        source: 'training', opponentType: 'none', authority: 'training-runtime', trainingMode: true
    })).allowed, true);
    assert.equal(api.evaluatePurpose('coach-assistance', context({
        opponentType: 'coach', coachMode: true
    })).allowed, true);
});

test('active rated, casual, and assisted human contexts deny live assistance', () => {
    const api = fixture();
    for (const extra of [{ rated: true }, { casual: true }, { casual: true, assisted: true }]) {
        const decision = api.evaluatePurpose('live-evaluation', context({ opponentType: 'human', ...extra }));
        assert.equal(decision.allowed, false);
    }
    assert.equal(api.evaluatePurpose('opponent-move', context({ opponentType: 'human' })).allowed, false);
    assert.equal(api.evaluatePurpose('hint', context({ opponentType: 'human' })).allowed, false);
});

test('FICS and external authority deny live work but allow completed analysis', () => {
    const api = fixture();
    const fics = context({ source: 'fics', opponentType: 'external-human', authority: 'external-server' });
    for (const purpose of ['opponent-move', 'live-evaluation', 'hint'])
        assert.equal(api.evaluatePurpose(purpose, fics).allowed, false);
    assert.equal(api.evaluatePurpose('post-game-analysis', { ...fics, gameStatus: 'completed' }).allowed, true);
});

test('completed human and imported records allow analysis but active records do not', () => {
    const api = fixture();
    assert.equal(api.evaluatePurpose('post-game-analysis', context({
        opponentType: 'human', gameStatus: 'completed'
    })).allowed, true);
    assert.equal(api.evaluatePurpose('post-game-analysis', context({ opponentType: 'human' })).allowed, false);
    assert.equal(api.evaluatePurpose('mentor-analysis', context({
        source: 'imported', opponentType: 'none', authority: 'analysis-workspace',
        gameStatus: 'reviewing', imported: true
    })).allowed, true);
});

test('spectator, unknown, incomplete, malformed, and unsupported contexts fail closed', () => {
    const api = fixture();
    assert.equal(api.evaluatePurpose('live-evaluation', context({
        source: 'spectator', opponentType: 'none', spectator: true
    })).allowed, false);
    assert.equal(api.evaluatePurpose('live-evaluation', {}).allowed, false);
    assert.equal(api.evaluatePurpose('invalid-purpose', context()).status, 'unsupported');
    assert.equal(api.evaluatePurpose('live-evaluation', null).allowed, false);
});

test('issued decision identity prevents forgery and purpose substitution', () => {
    const api = fixture();
    const decision = api.evaluatePurpose('live-evaluation', context());
    assert.equal(api.validateDecision(decision, 'live-evaluation'), true);
    assert.equal(api.validateDecision(decision, 'live-evaluation'), false);
    assert.equal(api.validateDecision({ ...decision }, 'live-evaluation'), false);
    assert.equal(api.validateDecision({ allowed: true }, 'live-evaluation'), false);
    assert.equal(api.validateDecision(decision, 'opponent-move'), false);
});

test('presentation validator authenticates allowed and denied evaluation decisions once', () => {
    const api = fixture();
    const allowed = api.evaluatePurpose('live-evaluation', context());
    const denied = api.evaluatePurpose('live-evaluation', context({ opponentType: 'human' }));
    assert.equal(api.validateDisplayDecision(allowed, 'live-evaluation'), true);
    assert.equal(api.validateDisplayDecision(allowed, 'live-evaluation'), false);
    assert.equal(api.validateDisplayDecision(denied, 'live-evaluation'), true);
    assert.equal(api.validateDisplayDecision({ ...denied }, 'live-evaluation'), false);
});

test('diagnostics are detached, bounded, and resettable', () => {
    const api = fixture();
    api.evaluatePurpose('live-evaluation', context());
    api.evaluatePurpose('live-evaluation', {});
    assert.equal(api.inspect().counters.decisions, 2);
    assert.equal(Object.isFrozen(api.inspect()), true);
    api.resetDiagnostics();
    assert.equal(api.inspect().counters.decisions, 0);
});

test('static guard excludes workers, App, UI, storage, timers, and migrated runtimes', () => {
    for (const pattern of [
        /\bnew\s+Worker\b/, /\bApp\b/, /\bdocument\b/, /localStorage|sessionStorage/,
        /setTimeout|setInterval|requestAnimationFrame/, /AnalyzeSection|CaissaArena|FICSClient/,
        /createElement|innerHTML|textContent/
    ]) assert.doesNotMatch(source, pattern);
});
