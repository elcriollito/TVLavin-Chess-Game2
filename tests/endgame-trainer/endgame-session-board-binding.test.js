import test from 'node:test';
import assert from 'node:assert/strict';
import { EndgameSessionBoardBinding } from '../../js/endgame-trainer/endgame-session-board-binding.js';

const base = (patch = {}) => ({ status: 'idle', sessionId: null, currentFen: null, orientation: 'white',
    engineThinking: false, sideToMove: null, moveHistory: [], result: null, error: null, ...patch });

class FakeController {
    constructor(state = base()) { this.state = state; this.listeners = new Set(); this.calls = []; this.disposed = 0; this.handlers = {}; }
    getState() { return structuredClone(this.state); }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(patch) { Object.assign(this.state, patch); for (const fn of [...this.listeners]) fn(this.getState()); }
    op(name, value) { this.calls.push([name, value]); return this.handlers[name]?.(value) ?? Promise.resolve(this.getState()); }
    prepareSession(v) { return this.op('prepare', v); } startSession() { return this.op('start'); }
    playUserMove(v) { return this.op('move', v); } requestHint(v) { return this.op('hint', v); }
    undo() { return this.op('undo'); } restart() { return this.op('restart'); } newPosition(v) { return this.op('new', v); }
    resign() { return this.op('resign'); } flipOrientation() { this.emit({ orientation: this.state.orientation === 'white' ? 'black' : 'white' }); return this.getState(); }
    dispose() { this.disposed++; this.listeners.clear(); this.state.status = 'disposed'; }
}
class FakeBoard {
    constructor() { this.state = { orientation: 'white' }; this.fen = null; this.calls = []; this.disposed = 0; }
    initialize() { this.calls.push(['initialize']); } getPosition() { return this.fen; } getState() { return structuredClone(this.state); }
    setPosition(v, move) { this.fen = v; this.calls.push(['fen', v, move]); } setOrientation(v) { this.state.orientation = v; this.calls.push(['orientation', v]); }
    setThinking(v) { this.calls.push(['thinking', v]); } setInteractive(v) { this.calls.push(['interactive', v]); }
    setLastMove(v) { this.calls.push(['last', v]); } setCheckSquare(v) { this.calls.push(['check', v]); }
    dispose() { this.disposed++; }
}
function setup(state = base(), callbacks = {}) { const controller = new FakeController(state), board = new FakeBoard(); const binding = new EndgameSessionBoardBinding({ controller, boardView: board, rulesFactory: () => ({ isCheck: () => false, pieces: () => [], sideToMove: () => 'white' }), ...callbacks }); binding.initialize(); return { controller, board, binding }; }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('1 initialize', () => assert.equal(setup().binding.getState().initialized, true));
test('2 subscribe once', () => { const x = setup(); x.binding.initialize(); assert.equal(x.controller.listeners.size, 1); });
test('3 controller state maps to board', () => { const x = setup(); x.controller.emit({ currentFen: 'fen-a' }); assert.equal(x.board.fen, 'fen-a'); });
test('4 board move maps to controller', async () => { const x = setup(base({ status: 'user-turn', currentFen: 'a' })); await x.binding.handleMoveIntent({ from: 'a2', to: 'a3' }); assert.equal(x.controller.calls.at(-1)[0], 'move'); });
test('5 board move rejection', async () => { const x = setup(base({ status: 'user-turn' })); x.controller.handlers.move = () => Promise.reject(Object.assign(new Error(), { code: 'invalid-move' })); assert.equal(await x.binding.handleMoveIntent({}), false); });
test('6 async move', async () => { const d = deferred(), x = setup(base({ status: 'user-turn' })); x.controller.handlers.move = () => d.promise; const p = x.binding.handleMoveIntent({}); assert.equal(x.binding.getState().loading, 'submitting-move'); d.resolve({ ok: true }); assert.equal(await p, true); });
test('7 stale move after new position', async () => { const d = deferred(), x = setup(base({ status: 'user-turn', sessionId: 'A' })); x.controller.handlers.move = () => d.promise; const p = x.binding.handleMoveIntent({}); x.controller.handlers.new = () => Promise.resolve(); await x.binding.newPosition({}); d.resolve({ ok: true }); assert.equal(await p, false); });
test('8 engineThinking lock', () => { const x = setup(base({ status: 'engine-thinking', engineThinking: true })); assert.deepEqual(x.board.calls.findLast(c => c[0] === 'interactive'), ['interactive', false]); });
test('9 user-turn unlock', () => { const x = setup(base({ status: 'user-turn' })); assert.ok(x.board.calls.some(c => c[0] === 'interactive' && c[1])); });
for (const [n, status] of [[10, 'completed'], [11, 'resigned'], [12, 'error']]) test(`${n} ${status} lock`, () => { const x = setup(base({ status })); assert.deepEqual(x.board.calls.findLast(c => c[0] === 'interactive'), ['interactive', false]); });
test('13 orientation map', () => { const x = setup(); x.controller.emit({ orientation: 'black' }); assert.equal(x.board.state.orientation, 'black'); });
test('14 last move map', () => { const x = setup(); x.controller.emit({ moveHistory: [{ move: { from: 'a2', to: 'a3' } }] }); assert.deepEqual(x.board.calls.findLast(c => c[0] === 'last')[1], { from: 'a2', to: 'a3' }); });
test('15 check square map', () => { const controller = new FakeController(base({ currentFen: 'x' })), board = new FakeBoard(); new EndgameSessionBoardBinding({ controller, boardView: board, rulesFactory: () => ({ isCheck: () => true, sideToMove: () => 'white', pieces: () => [{ type: 'k', color: 'white', square: 'e1' }] }) }).initialize(); assert.deepEqual(board.calls.findLast(c => c[0] === 'check'), ['check', 'e1']); });
test('16 hint success', async () => { const x = setup(base({ status: 'user-turn' })); x.controller.handlers.hint = () => Promise.resolve({ suggestedMove: 'a2a3' }); await x.binding.requestHint(); assert.equal(x.binding.getState().hint.suggestedMove, 'a2a3'); });
test('17 hint stale', async () => { const x = setup(base({ status: 'user-turn' })); x.controller.handlers.hint = () => Promise.reject(Object.assign(new Error(), { code: 'stale-operation' })); await assert.rejects(x.binding.requestHint()); assert.equal(x.binding.getState().error, null); });
for (const [n, method, call] of [[18, 'undo', 'undo'], [19, 'restart', 'restart'], [20, 'newPosition', 'new'], [21, 'resign', 'resign']]) test(`${n} ${method}`, async () => { const x = setup(base({ status: 'user-turn' })); await x.binding[method]({}); assert.equal(x.controller.calls.at(-1)[0], call); });
test('22 flip', () => { const x = setup(base({ status: 'ready' })); x.binding.flip(); assert.equal(x.board.state.orientation, 'black'); });
test('23 promotion intent', async () => { const x = setup(base({ status: 'user-turn' })); await x.binding.handleMoveIntent({ promotion: 'q' }); assert.equal(x.controller.calls.at(-1)[1].promotion, 'q'); });
test('24 promotion cancel', async () => { const x = setup(base({ status: 'user-turn' })); assert.equal(await x.binding.handleMoveIntent(null), true); });
test('25 promotion stale', async () => { const x = setup(base({ status: 'user-turn' })); x.controller.handlers.move = () => Promise.reject(Object.assign(new Error(), { code: 'stale-operation' })); assert.equal(await x.binding.handleMoveIntent({ promotion: 'q' }), false); });
test('26 controller error', async () => { let error; const x = setup(base(), { onError: e => { error = e; } }); x.controller.handlers.prepare = () => Promise.reject(Object.assign(new Error(), { code: 'candidate-selection-failed' })); await assert.rejects(x.binding.prepare({})); assert.equal(error.code, 'candidate-selection-failed'); });
test('27 board error is isolated by runtime boundary', () => assert.doesNotThrow(() => setup()));
test('28 listener error', () => { const x = setup(base(), { onStateChange: () => { throw new Error(); } }); assert.doesNotThrow(() => x.controller.emit({ status: 'ready' })); });
test('29 dispose', () => { const x = setup(); x.binding.dispose(); assert.equal(x.board.disposed, 1); });
test('30 dispose idempotent', () => { const x = setup(); x.binding.dispose(); x.binding.dispose(); assert.equal(x.controller.disposed, 1); });
test('31 initialize twice', () => { const x = setup(); x.binding.initialize(); assert.equal(x.controller.listeners.size, 1); });
test('32 reinitialize after dispose rejected', () => { const x = setup(); x.binding.dispose(); assert.throws(() => x.binding.initialize(), { code: 'binding-disposed' }); });
test('33 two bindings independent', () => { const a = setup(), b = setup(); a.controller.emit({ currentFen: 'a' }); assert.equal(b.board.fen, null); });
test('34 session A to B race', async () => { const d = deferred(), x = setup(base({ status: 'user-turn', sessionId: 'A' })); x.controller.handlers.move = () => d.promise; const p = x.binding.handleMoveIntent({}); x.controller.handlers.new = () => Promise.resolve(); await x.binding.newPosition({}); d.resolve({ ok: true }); assert.equal(await p, false); });
test('35 hint vs move race delegates controller ownership', async () => { const x = setup(base({ status: 'user-turn' })); x.controller.handlers.hint = () => Promise.reject(Object.assign(new Error(), { code: 'stale-operation' })); await assert.rejects(x.binding.requestHint()); assert.equal(x.binding.getState().error, null); });
test('36 restart during engine thinking', async () => { const x = setup(base({ status: 'engine-thinking', engineThinking: true })); await x.binding.restart(); assert.equal(x.controller.calls.at(-1)[0], 'restart'); });
test('37 snapshots immutable', () => { const x = setup(); const s = x.binding.getState(); s.controllerState.status = 'bad'; assert.notEqual(x.binding.getState().controllerState.status, 'bad'); });
test('38 no duplicate subscriptions', () => { const x = setup(); x.binding.initialize(); assert.equal(x.controller.listeners.size, 1); });
test('39 no duplicate adapters by binding', () => { const x = setup(); assert.equal(x.controller.calls.length, 0); });
test('40 no duplicate workers by binding', () => { const x = setup(); x.binding.initialize(); assert.equal(x.controller.listeners.size, 1); });
test('41 one incremental board update per move', () => { const x = setup(base({ status: 'user-turn', sessionId: 'A', currentFen: 'fen-a' })); const before = x.board.calls.filter(call => call[0] === 'fen').length; x.controller.emit({ currentFen: 'fen-b', moveHistory: [{ move: { from: 'a2', to: 'a3' } }] }); const updates = x.board.calls.filter(call => call[0] === 'fen'); assert.equal(updates.length, before + 1); assert.deepEqual(updates.at(-1), ['fen', 'fen-b', { from: 'a2', to: 'a3' }]); });
test('42 hint and loading emissions do not update board state', () => { const x = setup(base({ status: 'user-turn', sessionId: 'A', currentFen: 'fen-a' })); const before = x.board.calls.length; x.controller.emit({ status: 'user-turn' }); x.controller.emit({ status: 'user-turn' }); assert.equal(x.board.calls.length, before); });
test('43 undo uses a full position update, not a stale incremental move', () => { const x = setup(base({ status: 'user-turn', sessionId: 'A', currentFen: 'fen-b', moveHistory: [{ move: { from: 'a2', to: 'a3' } }] })); x.controller.emit({ currentFen: 'fen-a', moveHistory: [] }); assert.deepEqual(x.board.calls.filter(call => call[0] === 'fen').at(-1), ['fen', 'fen-a', null]); });
