import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as shared from '../../js/caissa-board-interaction.js';
import * as adapter from '../../js/endgame-trainer/endgame-board-interaction.js';

const rules = () => ({
    sideToMove: () => 'white',
    pieces: () => [{ type: 'p', color: 'white', square: 'e2' }],
    legalMoves: ({ square }) => square === 'e2' ? [{ from: 'e2', to: 'e3', color: 'w', lan: 'e2e3' }] : []
});
const view = () => ({
    enabled: true, selectedSquare: null, selections: [], pending: [], submitting: [], rollbacks: 0, errors: [],
    canInteract() { return this.enabled; },
    getState() { return { selectedSquare: this.selectedSquare }; },
    setSelectedSquare(square, moves = []) { this.selectedSquare = square; this.selections.push([square, moves.length]); },
    setPendingVisualMove(move, rendered) { this.pending.push([move.from, move.to, rendered]); },
    setSubmitting(value) { this.submitting.push(value); },
    rollbackPendingVisualMove() { this.rollbacks += 1; },
    reportError(code) { this.errors.push(code); }
});

test('v1.0 exposes only the stable shared symbols', () => {
    assert.equal(shared.CAISSA_BOARD_INTERACTION_API_VERSION, '1.0');
    assert.deepEqual(Object.keys(shared).sort(), ['CAISSA_BOARD_INTERACTION_API_VERSION', 'CaissaBoardInteraction', 'CaissaBoardInteractionError']);
});

test('constructor creates a ready controller and tap selects then submits once', async () => {
    const target = view(), intents = [];
    const interaction = new shared.CaissaBoardInteraction({ rules: rules(), boardView: target, onMove: move => { intents.push(move); return true; } });
    assert.equal(await interaction.activate('e2'), true);
    assert.equal(target.selectedSquare, 'e2');
    assert.equal(await interaction.activate('e3'), true);
    assert.equal(intents.length, 1);
    assert.equal(intents[0].lan, 'e2e3');
});

test('desktop drop remains synchronous for Chessboard.js and submits once', async () => {
    const target = view(), intents = [];
    const interaction = new shared.CaissaBoardInteraction({ rules: rules(), boardView: target, onMove: move => { intents.push(move); return true; } });
    assert.equal(interaction.beginDrop('e2', 'e3'), true);
    await Promise.resolve();
    assert.deepEqual(target.pending, [['e2', 'e3', true]]);
    assert.equal(intents.length, 1);
});

test('disabled input prevents tap and drag without side effects', async () => {
    const target = view(); target.enabled = false;
    const interaction = new shared.CaissaBoardInteraction({ rules: rules(), boardView: target });
    assert.equal(await interaction.activate('e2'), false);
    assert.equal(interaction.beginDrop('e2', 'e3'), false);
    assert.equal(target.selections.length, 0);
});

test('rule replacement invalidates pending ownership without remount responsibility', () => {
    const target = view(), interaction = new shared.CaissaBoardInteraction({ rules: rules(), boardView: target });
    interaction.setRules(rules()); interaction.invalidate();
    assert.equal(interaction.isPending(), false);
});

test('dispose is idempotent, clears references and rejects later use', () => {
    const interaction = new shared.CaissaBoardInteraction({ rules: rules(), boardView: view() });
    interaction.dispose(); interaction.dispose();
    assert.throws(() => interaction.legalMoves('e2'), { name: 'CaissaBoardInteractionError', code: 'board-disposed' });
});

test('Endgame adapter preserves legacy constructor and error aliases', () => {
    assert.equal(adapter.EndgameBoardInteraction, shared.CaissaBoardInteraction);
    assert.equal(adapter.EndgameBoardInteractionError, shared.CaissaBoardInteractionError);
    assert.equal(adapter.CAISSA_BOARD_INTERACTION_API_VERSION, '1.0');
});

test('shared source has no Endgame, DOM, lesson, engine or session dependencies', () => {
    const source = readFileSync(new URL('../../js/caissa-board-interaction.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /endgame|querySelector|document|lesson|engine|session-controller/i);
    assert.doesNotMatch(source, /^\s*import\s/m);
});
