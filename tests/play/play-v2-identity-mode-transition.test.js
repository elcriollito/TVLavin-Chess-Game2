import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const load = async file => {
    const context = vm.createContext({ window: null, globalThis: null });
    context.window = context; context.globalThis = context;
    new vm.Script(await readFile(new URL(file, root), 'utf8')).runInContext(context);
    return context;
};

test('PlayV2IdentityPolicy@1.0.0 owns CAISSA without changing technical or historical identity', async () => {
    const context = await load('js/play/play-v2-identity-policy.js');
    const policy = context.CaissaPlayV2IdentityPolicy;
    assert.equal(policy.contractId, 'PlayV2IdentityPolicy@1.0.0');
    assert.equal(policy.gamesOpponentName(), 'CAISSA');
    assert.equal(policy.normalizePlayV2Display('CAISSA Engine', 'engine'), 'CAISSA');
    assert.equal(policy.normalizePlayV2Display('Solid', 'bot'), 'Solid');
    assert.equal(policy.technicalEngineAttribution, 'preserved');
    assert.equal(policy.savedHistoricalRecords, 'immutable');
    assert.equal(policy.publicReady, false);
    assert(Object.isFrozen(policy));
});

test('PlayV2ModeTransitionPolicy@1.0.0 admits only different-mode PostGame transitions', async () => {
    const context = await load('js/play/play-v2-mode-transition-policy.js');
    const policy = context.CaissaPlayV2ModeTransitionPolicy;
    assert.equal(policy.contractId, 'PlayV2ModeTransitionPolicy@1.0.0');
    for (const sourceMode of ['games', 'bots', 'coach']) for (const targetMode of ['games', 'bots', 'coach']) {
        const result = policy.authorize({ sourceState: 'postgame', sourceMode, targetMode });
        assert.equal(result.ok, sourceMode !== targetMode, `${sourceMode}->${targetMode}`);
    }
    for (const sourceState of ['setup', 'starting', 'active', 'analyzing', 'reviewing', 'error', 'unavailable'])
        assert.equal(policy.authorize({ sourceState, sourceMode: 'games', targetMode: 'bots' }).ok, false);
    assert.equal(policy.workerPolicy, 'zero-before-play');
    assert.equal(policy.boardResetPolicy, 'legal-standard-initial-position');
    assert.equal(policy.publicReady, false);
    assert(Object.isFrozen(policy)); assert(Object.isFrozen(policy.cleanup));
});

test('transition and identity owners add no transport, persistence, provider or Worker implementation', async () => {
    const sources = await Promise.all(['js/play/play-v2-identity-policy.js', 'js/play/play-v2-mode-transition-policy.js']
        .map(file => readFile(new URL(file, root), 'utf8')));
    for (const source of sources) assert.doesNotMatch(source,
        /fetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|new\s+Worker|stockfish/i);
});
