import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRulesError, ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { ENDGAME_MATERIAL_CATALOG, materialFor } from '../../js/endgame-trainer/endgame-material-catalog.js';
import { createSeededRng, generateEndgamePosition } from '../../js/endgame-trainer/endgame-position-generator.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import {
    boardFromFen, boardToFen, canonicalizeFen, countPieces, hasPawnOnInvalidRank,
    kingsAreAdjacent, materialSignature, positionKey
} from '../../js/endgame-trainer/endgame-fen-utils.js';
import { INVALID_FIXTURES, VALID_FIXTURES } from './fixtures.js';

function expectedSignature(category, strongSide) {
    const material = materialFor(category, strongSide);
    const board = ['white', 'black'].flatMap((color) =>
        material[color].map((type, index) => ({ color, type, square: `${color === 'white' ? 'a' : 'h'}${index + 1}` }))
    );
    return materialSignature(board);
}

test('facade exposes normalized rules operations', () => {
    const game = ChessRulesFacade.fromFen('7k/8/8/8/8/8/4Q3/4K3 w - - 7 22');
    assert.equal(game.sideToMove(), 'white');
    assert.ok(game.legalMoveCount() > 0);
    assert.equal(game.pieces().length, 3);
    const before = game.fen();
    const move = game.legalMoves({ verbose: true })[0];
    assert.ok(game.move({ from: move.from, to: move.to, promotion: move.promotion }));
    assert.ok(game.undo());
    assert.equal(game.fen(), before);
    assert.equal(ChessRulesFacade.validateFen('bad fen').valid, false);
    assert.deepEqual(ChessRulesFacade.validateFen('bad fen').error, { code: 'invalid-fen' });
});

test('facade remains atomic, private and independent under adversarial calls', () => {
    const fen = '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1';
    const first = ChessRulesFacade.fromFen(fen);
    const second = ChessRulesFacade.fromFen(fen);
    assert.equal('chess' in first, false);
    assert.throws(() => first.loadFen('bad fen'), (error) => error instanceof ChessRulesError && error.code === 'invalid-fen');
    assert.equal(first.fen(), fen);
    assert.throws(() => first.move('a1a8'), (error) => error instanceof ChessRulesError && error.code === 'invalid-move');
    assert.equal(first.fen(), fen);
    assert.equal(first.undo(), null);
    const pieces = first.pieces();
    pieces[0].type = 'p';
    assert.notEqual(first.pieces()[0].type, 'p');
    const legal = first.legalMoves({ verbose: true });
    legal[0].from = 'a1';
    assert.notEqual(first.legalMoves({ verbose: true })[0].from, 'a1');
    first.move(first.legalMoves({ verbose: true })[0]);
    assert.equal(second.fen(), fen);
});

test('FEN utilities canonicalize, key and inspect positions', () => {
    const first = '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1';
    const second = '7k/8/8/8/8/8/4Q3/4K3 w - - 99 87';
    assert.equal(positionKey(first), positionKey(second));
    assert.equal(canonicalizeFen(first), first);
    const board = boardFromFen(first);
    assert.equal(countPieces(board), 3);
    assert.equal(kingsAreAdjacent(board), false);
    assert.equal(hasPawnOnInvalidRank(board), false);
});

test('FEN utilities reject malformed fields and preserve key fields', () => {
    for (const fen of [
        '7k/8/8/8/8/8/4Q3/4K3 x - - 0 1',
        '7k/8/8/8/8/8/4Q3/4K3 w AX - 0 1',
        '7k/8/8/8/8/8/4Q3/4K3 w - e4 0 1',
        '7k/8/8/8/8/8/4Q3/4K3 w - - x 1',
        '7k/8/8/8/8/8/4Q3/4K3 w - - 0 0',
        '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1 extra'
    ]) assert.throws(() => canonicalizeFen(fen), fen);

    const base = '7k/8/8/8/8/8/4Q3/4K3';
    assert.notEqual(positionKey(`${base} w KQ e3 7 22`), positionKey(`${base} b KQ e3 7 22`));
    assert.notEqual(positionKey(`${base} w KQ e3 7 22`), positionKey(`${base} w - e3 7 22`));
    assert.notEqual(positionKey(`${base} w KQ e3 7 22`), positionKey(`${base} w KQ - 7 22`));
    assert.equal(positionKey(`${base} w KQ e3 7 22`), positionKey(`${base} w KQ e3 0 1`));
    assert.throws(() => boardToFen([{ square: 'a1', type: 'k', color: 'white' }, { square: 'a1', type: 'k', color: 'black' }]));
    assert.throws(() => boardToFen([], 'invalid'));
});

test('supported FEN board round trip independently preserves placement and turn', () => {
    for (const fen of ['7k/8/8/8/8/8/4Q3/4K3 w - - 4 9', '4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1']) {
        const fields = fen.split(' ');
        const rebuilt = boardToFen(boardFromFen(fen), fields[1] === 'w' ? 'white' : 'black');
        const rebuiltFields = rebuilt.split(' ');
        assert.equal(rebuiltFields[0], fields[0]);
        assert.equal(rebuiltFields[1], fields[1]);
        assert.deepEqual(boardFromFen(rebuilt), boardFromFen(fen));
    }
});

test('catalog preserves Season ET.1 categories and adds isolated KRPvKR', () => {
    assert.deepEqual(Object.keys(ENDGAME_MATERIAL_CATALOG), ['KQK', 'KRK', 'KPK', 'KPKP', 'KRPvKR']);
    for (const category of Object.values(ENDGAME_MATERIAL_CATALOG)) {
        assert.ok(category.id && category.internalName && category.description && category.provisionalObjective);
        assert.ok([3, 4, 5].includes(category.exactPieceCount));
        assert.equal(Object.isFrozen(category), true);
        assert.equal(Object.isFrozen(category.allowedStrongSides), true);
        assert.doesNotMatch(category.provisionalObjective, /\b(?:won|winning|drawn|lost|losing|exact win)\b/i);
    }
    assert.throws(() => ENDGAME_MATERIAL_CATALOG.KQK.allowedStrongSides.push('invalid'));
});

test('valid fixtures pass operational validation', () => {
    for (const fixture of VALID_FIXTURES) {
        const result = validateEndgamePosition(fixture.fen, fixture);
        assert.equal(result.valid, true, `${fixture.categoryId}: ${result.errors.join(', ')}`);
        assert.equal(result.metadata.historicallyReachable, null);
    }
});

test('invalid fixtures expose stable error codes', () => {
    for (const fixture of INVALID_FIXTURES) {
        const result = validateEndgamePosition(fixture.fen, fixture);
        assert.equal(result.valid, false, fixture.fen);
        for (const expected of fixture.errors) assert.ok(result.errors.includes(expected), `${expected}: ${result.errors}`);
    }
});

test('every category preserves count, signature and structural rules', () => {
    for (const category of Object.values(ENDGAME_MATERIAL_CATALOG)) {
        for (const strongSide of category.allowedStrongSides) {
            for (let index = 0; index < 100; index += 1) {
                const result = generateEndgamePosition({ categoryId: category.id, strongSide, seed: `unit-${index}` });
                assert.equal(result.ok, true, JSON.stringify(result.error));
                const board = boardFromFen(result.fen);
                assert.equal(countPieces(board), category.exactPieceCount);
                assert.equal(materialSignature(board), expectedSignature(category, strongSide));
                assert.equal(board.filter((piece) => piece.type === 'k').length, 2);
                assert.equal(kingsAreAdjacent(board), false);
                assert.equal(hasPawnOnInvalidRank(board), false);
                assert.equal(ChessRulesFacade.validateFen(result.fen).valid, true);
                assert.ok(result.metadata.legalMoveCount > 0);
            }
        }
    }
});

test('same seed reproduces the same FEN and metadata core', () => {
    const options = { categoryId: 'KPKP', seed: 'repeatable', strongSide: 'black', sideToMove: 'white' };
    assert.deepEqual(generateEndgamePosition(options), generateEndgamePosition(options));
});

test('different seeds provide reasonable diversity', () => {
    const fens = new Set(Array.from({ length: 100 }, (_, index) =>
        generateEndgamePosition({ categoryId: 'KPKP', seed: `diversity-${index}` }).fen
    ));
    assert.ok(fens.size >= 90, `unique positions: ${fens.size}`);
});

test('attempt limits return structured errors and cannot loop forever', () => {
    const alwaysZero = () => 0;
    const result = generateEndgamePosition({ categoryId: 'KQK', maxAttempts: 3, rng: alwaysZero });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'generation-attempts-exhausted');
    assert.equal(result.error.maxAttempts, 3);
    assert.ok(Object.values(result.error.rejectionCounts).some((count) => count === 3));
});

test('generator validates hostile options with structured errors', () => {
    const cases = [
        [{ categoryId: 'unknown' }, 'unknown-category'],
        [{ categoryId: 'KQK', maxAttempts: 0 }, 'invalid-max-attempts'],
        [{ categoryId: 'KQK', maxAttempts: -1 }, 'invalid-max-attempts'],
        [{ categoryId: 'KQK', maxAttempts: '3' }, 'invalid-max-attempts'],
        [{ categoryId: 'KQK', maxAttempts: 10001 }, 'invalid-max-attempts'],
        [{ categoryId: 'KQK', strongSide: 'invalid' }, 'invalid-strong-side'],
        [{ categoryId: 'KQK', sideToMove: 'invalid' }, 'invalid-side-to-move'],
        [{ categoryId: 'KQK', rng: 42 }, 'invalid-rng'],
        [{ categoryId: 'KQK', seed: 'x', rng: () => 0.5 }, 'seed-and-rng-conflict'],
        [{ categoryId: 'KQK', rng: () => 1 }, 'invalid-rng-output'],
        [{ categoryId: 'KQK', rng: () => -0.1 }, 'invalid-rng-output']
    ];
    for (const [options, code] of cases) assert.equal(generateEndgamePosition(options).error.code, code);
});

test('RNG handles seed types reproducibly with independent state and valid range', () => {
    for (const seed of [0, -1, 1.5, undefined, null, '', '0']) {
        const first = createSeededRng(seed);
        const second = createSeededRng(seed);
        const firstValues = Array.from({ length: 100 }, () => first());
        const secondValues = Array.from({ length: 100 }, () => second());
        assert.deepEqual(firstValues, secondValues);
        assert.ok(firstValues.every((value) => value >= 0 && value < 1));
        first();
        assert.notEqual(first(), second());
    }
});

test('validator distinguishes check, impossible prior-side check and terminal states', () => {
    const inCheck = validateEndgamePosition('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
    assert.equal(inCheck.valid, true);
    assert.equal(inCheck.metadata.inCheck, true);
    const both = validateEndgamePosition('4k3/4R3/8/8/8/8/4r3/4K3 w - - 0 1');
    assert.ok(both.errors.includes('both-kings-in-check'));
    const priorSide = validateEndgamePosition('4k3/4R3/8/8/8/8/8/4K3 w - - 0 1');
    assert.deepEqual(priorSide.errors, ['impossible-side-state']);
    const insufficient = ChessRulesFacade.fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    assert.equal(insufficient.isInsufficientMaterial(), true);
    assert.equal(insufficient.isGameOver(), true);
});
