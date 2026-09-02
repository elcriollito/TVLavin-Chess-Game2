import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = process.cwd();
const load = (context, file) => vm.runInContext(fs.readFileSync(`${root}/${file}`, 'utf8'), context, { filename: file });
const context = vm.createContext({ globalThis: null }); context.globalThis = context;
load(context, 'js/play/native-coach/coach-assistance-policy.js');
load(context, 'js/play/native-coach/coach-dialogue.js');

test('dialogue contract is immutable and versioned', () => {
    const api = context.CaissaNativeCoachDialogue;
    assert.equal(api.schemaVersion, '1.1.0');
    assert.equal(Object.isFrozen(api), true);
    assert.equal(Object.isFrozen(api.messages), true);
});

test('Caissa speaks at lifecycle moments and deliberately stays quiet between them', () => {
    const dialogue = context.CaissaNativeCoachDialogue.create({ minimumPlyGap: 4 });
    const ready = dialogue.observe({ type: 'game-ready', category: 'general', messageKey: 'GAME_READY', ply: 0, requested: true });
    assert.equal(ready.ok, true);
    const cadence = dialogue.observe({ type: 'user-turn', category: 'encouragement', messageKey: 'TAKE_YOUR_TIME', ply: 3 });
    assert.equal(cadence.reasonCode, 'QUIET_CADENCE');
    const spoken = dialogue.observe({ type: 'user-turn', category: 'encouragement', messageKey: 'PAUSE_AND_SCAN', ply: 8 });
    assert.equal(spoken.ok, true);
    const cooldown = dialogue.observe({ type: 'user-turn', category: 'encouragement', messageKey: 'KEEP_BUILDING', ply: 10 });
    assert.equal(cooldown.reasonCode, 'QUIET_COOLDOWN');
});

test('check intervention bypasses cadence but not bounded cooldown', () => {
    const dialogue = context.CaissaNativeCoachDialogue.create({ minimumPlyGap: 4 });
    const check = dialogue.observe({ type: 'user-turn', category: 'check', messageKey: 'CHECK_ALERT', ply: 5 });
    assert.equal(check.ok, true);
    assert.match(check.message, /check/i);
    assert.equal(dialogue.observe({ type: 'user-turn', category: 'check', messageKey: 'CHECK_ALERT', ply: 6 }).ok, false);
});

test('raw chess analysis and invented messages fail closed', () => {
    const dialogue = context.CaissaNativeCoachDialogue.create();
    for (const hostile of [
        { type: 'user-turn', category: 'check', messageKey: 'CHECK_ALERT', ply: 4, fen: 'raw' },
        { type: 'user-turn', category: 'check', messageKey: 'CHECK_ALERT', ply: 4, bestMove: 'e2e4' },
        { type: 'user-turn', category: 'check', messageKey: 'CHECK_ALERT', ply: 4, pv: ['e2e4'] },
        { type: 'user-turn', category: 'check', messageKey: 'INVENTED', ply: 4 }
    ]) assert.equal(dialogue.observe(hostile).ok, false);
    assert.equal(dialogue.inspect().rawAnalysisAccepted, 0);
    assert.equal(dialogue.inspect().bestMoveDisclosures, 0);
});

test('only allowlisted assistance text can enter the dialogue surface', () => {
    const dialogue = context.CaissaNativeCoachDialogue.create();
    const allowed = dialogue.presentAssistance({ messageKey: 'KING_SAFETY', message: 'Check your king\'s safety.' });
    assert.equal(allowed.ok, true);
    assert.equal(dialogue.presentAssistance({ message: 'Play Qh7#.' }).reasonCode, 'UNALLOWLISTED_ASSISTANCE');
});

test('panel and lazy stack consume the bounded dialogue owner', () => {
    const panel = fs.readFileSync(`${root}/js/play/native-coach/coach-panel.js`, 'utf8');
    const registry = fs.readFileSync(`${root}/js/play/performance/play-load-registry.js`, 'utf8');
    assert.match(panel, /CaissaNativeCoachDialogue\.create/);
    assert.match(panel, /caissa-turn-change/);
    assert.match(panel, /caissa-game-end/);
    assert.ok(registry.indexOf('coach-dialogue.js?v=1.1.0') < registry.indexOf('coach-panel.js?v=2.3.2'));
});

test('dialogue module owns no board, worker, network, storage, or move execution', () => {
    const source = fs.readFileSync(`${root}/js/play/native-coach/coach-dialogue.js`, 'utf8');
    for (const forbidden of [/new\s+Worker/i, /fetch\s*\(/i, /localStorage/i, /sessionStorage/i,
        /\.move\s*\(/i, /chessboard/i, /stockfish/i]) assert.doesNotMatch(source, forbidden);
});
