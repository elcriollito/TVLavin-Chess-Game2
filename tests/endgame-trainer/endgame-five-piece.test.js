import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { ENDGAME_MATERIAL_CATALOG, materialFor } from '../../js/endgame-trainer/endgame-material-catalog.js';
import { generateEndgamePosition } from '../../js/endgame-trainer/endgame-position-generator.js';
import { validateEndgamePosition } from '../../js/endgame-trainer/endgame-position-validator.js';
import { extractPositionFeatures } from '../../js/endgame-trainer/endgame-position-features.js';
import { scoreEndgamePosition } from '../../js/endgame-trainer/endgame-position-scorer.js';
import { classifyExercise } from '../../js/endgame-trainer/endgame-exercise-classifier.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';
import { EndgameSessionController } from '../../js/endgame-trainer/endgame-session-controller.js';
import { KRPVKR_TEMPLATES, matchesKrpvkrTemplateTheme } from '../../js/endgame-trainer/endgame-rook-pawn-templates.js';
import { createEndgameProgressStore, ENDGAME_PROGRESS_STORAGE_KEY } from '../../js/endgame-trainer/endgame-progress-store.js';

const category = ENDGAME_MATERIAL_CATALOG.KRPvKR;
const generated = seed => generateEndgamePosition({ categoryId: 'KRPvKR', seed });
const memoryStorage = initial => { let value = initial ?? null; return { getItem: key => key === ENDGAME_PROGRESS_STORAGE_KEY ? value : null, setItem: (key, next) => { if (key === ENDGAME_PROGRESS_STORAGE_KEY) value = next; }, value: () => value }; };

test('KRPvKR catalog is exact and curriculum-ready', () => {
    assert.equal(category.exactPieceCount, 5);
    assert.equal(category.label, 'Rook and Pawn vs Rook');
    assert.equal(category.shortLabel, 'Rook + Pawn vs Rook');
    assert.deepEqual(materialFor(category, 'white'), { white: ['k', 'r', 'p'], black: ['k', 'r'] });
    assert.deepEqual(materialFor(category, 'black'), { white: ['k', 'r'], black: ['k', 'r', 'p'] });
    assert.deepEqual(category.curriculum.trainingRoles, ['attack', 'defense']);
});

test('procedural generation supports both strong colors and turns deterministically', () => {
    for (const strongSide of ['white', 'black']) for (const sideToMove of ['white', 'black']) {
        const left = generateEndgamePosition({ categoryId: 'KRPvKR', seed: `${strongSide}-${sideToMove}`, strongSide, sideToMove });
        const right = generateEndgamePosition({ categoryId: 'KRPvKR', seed: `${strongSide}-${sideToMove}`, strongSide, sideToMove });
        assert.equal(left.ok, true); assert.equal(left.fen, right.fen);
        assert.equal(left.metadata.strongSide, strongSide); assert.equal(left.metadata.sideToMove, sideToMove);
    }
});

test('procedural positions preserve five-piece legality and pawn ranks', () => {
    const keys = new Set();
    for (let index = 0; index < 200; index += 1) {
        const result = generated(`legal-${index}`); assert.equal(result.ok, true);
        const validation = validateEndgamePosition(result.fen, result.metadata); assert.equal(validation.valid, true, validation.errors.join(','));
        assert.equal(validation.metadata.pieceCount, 5); assert.doesNotMatch(result.fen.split(' ')[0].split('/')[0] + result.fen.split(' ')[0].split('/')[7], /p/i);
        keys.add(result.fen.split(' ').slice(0, 4).join(' '));
    }
    assert.ok(keys.size > 190);
});

test('validator rejects missing pawn, extra pawn, missing rook and extra rook', () => {
    const cases = [
        '8/8/6k1/8/3K4/8/R7/7r w - - 0 1',
        '8/8/6k1/3P4/3K4/P7/R7/7r w - - 0 1',
        '8/8/6k1/3P4/3K4/8/8/7r w - - 0 1',
        '8/8/6k1/3P4/3K4/R7/R7/7r w - - 0 1'
    ];
    for (const fen of cases) assert.equal(validateEndgamePosition(fen, { categoryId: 'KRPvKR', strongSide: 'white' }).valid, false);
});

test('validator rejects illegal kings, terminal positions and accidental rook captures', () => {
    assert.ok(validateEndgamePosition('8/8/8/8/8/8/KkP5/R6r w - - 0 1', { categoryId: 'KRPvKR', strongSide: 'white' }).errors.includes('kings-adjacent'));
    assert.ok(validateEndgamePosition('7k/5K1R/6P1/8/8/8/8/r7 b - - 0 1', { categoryId: 'KRPvKR', strongSide: 'white' }).errors.includes('game-already-over'));
    assert.ok(validateEndgamePosition('8/5k2/8/3P4/3K4/8/8/3R2r1 w - - 0 1', { categoryId: 'KRPvKR', strongSide: 'white' }).errors.includes('immediate-rook-capture'));
    assert.ok(validateEndgamePosition('7r/8/4k3/4P3/8/8/R7/K7 b - - 0 1', { categoryId: 'KRPvKR', strongSide: 'white' }).errors.includes('immediate-pawn-capture'));
});

test('all ten templates parse, validate, move and retain explicit pedagogy', () => {
    assert.equal(KRPVKR_TEMPLATES.length, 10);
    for (const template of KRPVKR_TEMPLATES) {
        const result = generateEndgamePosition({ categoryId: 'KRPvKR', template: template.id });
        assert.equal(result.ok, true, template.id); assert.equal(result.metadata.theme, template.theme);
        assert.ok(result.metadata.objective); assert.ok(['attack', 'defense'].includes(result.metadata.trainingRole));
        const game = ChessRulesFacade.fromFen(result.fen); assert.ok(game.legalMoveCount() > 1);
        const features = extractPositionFeatures(result.fen, { categoryId: 'KRPvKR', strongSide: template.strongSide });
        assert.equal(matchesKrpvkrTemplateTheme(template, features), true, `${template.id}:${template.theme}`);
        const move = game.legalMoves({ verbose: true })[0]; assert.doesNotThrow(() => game.move(move));
        const reflected = generateEndgamePosition({ categoryId: 'KRPvKR', template: template.id, reflectTemplate: true });
        assert.equal(reflected.ok, true); assert.notEqual(reflected.metadata.strongSide, template.strongSide);
    }
});

test('rook-pawn features expose descriptive geometry without WDL', () => {
    const template = KRPVKR_TEMPLATES[0];
    const features = extractPositionFeatures(template.fen, { categoryId: 'KRPvKR', strongSide: 'white' });
    assert.equal(features.rookPawn.bridgeBuildingPotential, true);
    assert.equal(features.rookPawn.pawnRankProgress, 6);
    assert.equal(features.rookPawn.pawnFile, 'c');
    assert.equal(features.rookPawn.attackingKingDistanceToPawn, 1);
    assert.equal(features.rookPawn.promotionSquareControl, true);
    assert.ok(features.rookPawn.kingCutOffFiles >= 2);
    assert.equal(typeof features.rookPawn.checkingDistance, 'number');
    assert.equal(features.rookPawn.connectednessApplicable, false);
    assert.equal('wdl' in features, false);
});

test('scoring accepts pedagogical templates and penalizes material tactics', () => {
    const template = KRPVKR_TEMPLATES[0];
    const accepted = scoreEndgamePosition(template.fen, { categoryId: 'KRPvKR', strongSide: 'white', allowPromotionInOne: true });
    assert.equal(accepted.accepted, true);
    const tactical = scoreEndgamePosition('8/5k2/8/3P4/3K4/8/8/3R2r1 w - - 0 1', { categoryId: 'KRPvKR', strongSide: 'white' });
    assert.ok(tactical.penalties.some(item => item.code === 'immediate-rook-trade'));
});

test('classification produces attack/defense tags and no exact result claim', () => {
    const observedTags = new Set();
    for (const template of [KRPVKR_TEMPLATES[0], KRPVKR_TEMPLATES[1]]) {
        const features = extractPositionFeatures(template.fen, { categoryId: 'KRPvKR', strongSide: template.strongSide });
        const scoring = scoreEndgamePosition(template.fen, { categoryId: 'KRPvKR', strongSide: template.strongSide, allowPromotionInOne: true });
        const classification = classifyExercise(template.fen, features, scoring);
        assert.ok(['conversion', 'defense'].includes(classification.type));
        assert.ok(classification.tags.length); assert.doesNotMatch(JSON.stringify(classification), /winning|drawn|lost/i);
        classification.tags.forEach(tag => observedTags.add(tag));
    }
    assert.ok(observedTags.has('lucena-like')); assert.ok(observedTags.has('philidor-like'));
    assert.ok(observedTags.has('conversion-technique')); assert.ok(observedTags.has('defensive-hold'));
});

test('candidate selector is deterministic and template fallback is bounded', () => {
    const left = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: 'selection', candidateCount: 8 });
    const right = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: 'selection', candidateCount: 8 });
    assert.equal(left.ok, true); assert.equal(left.selected.fen, right.selected.fen);
    const fallback = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: 'fallback', candidateCount: 2, generatorOptions: { rng: () => 0.5 } });
    assert.equal(fallback.ok, true); assert.equal(fallback.fallbackUsed, true); assert.equal(fallback.selected.metadata.source, 'template');
});

test('progress schema v1 adds KRPvKR without losing legacy data', () => {
    const storage = memoryStorage(JSON.stringify({ version: 1, totals: { sessionsStarted: 2 }, categories: { KQK: { sessionsStarted: 2 } }, recentSessions: [], updatedAt: 1 }));
    const store = createEndgameProgressStore({ storage, now: () => 2 });
    const loaded = store.load(); assert.equal(loaded.categories.KQK.sessionsStarted, 2); assert.equal(loaded.categories.KRPvKR.sessionsStarted, 0);
    store.recordSessionStarted({ id: 'five', category: 'KRPvKR' });
    store.recordSessionResigned({ id: 'five', category: 'KRPvKR', pieceCount: 5, userColor: 'black' });
    const snapshot = store.getSnapshot(); assert.equal(snapshot.categories.KRPvKR.sessionsStarted, 1); assert.equal(snapshot.categories.KRPvKR.resignations, 1);
    assert.equal(snapshot.categories.KQK.sessionsStarted, 2); assert.equal(snapshot.version, 1);
});

test('KRPvKR progress rebases concurrent writes and refreshes cross-tab state', () => {
    const storage = memoryStorage();
    const first = createEndgameProgressStore({ storage, now: () => 10 });
    const second = createEndgameProgressStore({ storage, now: () => 20 });
    first.load(); second.load();
    first.recordSessionStarted({ id: 'tab-a', category: 'KRPvKR' });
    first.recordSessionResigned({ id: 'tab-a', category: 'KRPvKR', pieceCount: 5, userColor: 'white' });
    second.recordSessionStarted({ id: 'tab-b', category: 'KRPvKR' });
    second.recordSessionResigned({ id: 'tab-b', category: 'KRPvKR', pieceCount: 5, userColor: 'black' });
    const refreshed = first.refreshFromStorage();
    assert.equal(refreshed.categories.KRPvKR.sessionsStarted, 2);
    assert.equal(refreshed.categories.KRPvKR.resignations, 2);
    assert.deepEqual(refreshed.recentSessions.map(item => item.id), ['tab-a', 'tab-b']);
});

test('mixed KQK and KRPvKR terminal writes survive in either order', () => {
    for (const reverse of [false, true]) {
        const storage = memoryStorage();
        const first = createEndgameProgressStore({ storage, now: () => 10 });
        const second = createEndgameProgressStore({ storage, now: () => 20 });
        first.load(); second.load();
        const legacy = () => { first.recordSessionStarted({ id: 'legacy', category: 'KQK' }); first.recordSessionResigned({ id: 'legacy', category: 'KQK', pieceCount: 3, userColor: 'white' }); };
        const five = () => { second.recordSessionStarted({ id: 'five', category: 'KRPvKR' }); second.recordSessionResigned({ id: 'five', category: 'KRPvKR', pieceCount: 5, userColor: 'black' }); };
        if (reverse) { five(); legacy(); } else { legacy(); five(); }
        const snapshot = JSON.parse(storage.value());
        assert.equal(snapshot.version, 1); assert.equal(snapshot.totals.sessionsStarted, 2); assert.equal(snapshot.totals.resignations, 2);
        assert.equal(snapshot.categories.KQK.resignations, 1); assert.equal(snapshot.categories.KRPvKR.resignations, 1);
        assert.deepEqual(new Set(snapshot.recentSessions.map(item => item.id)), new Set(['legacy', 'five']));
    }
});

test('controller objectives follow user role without changing ownership paths', async () => {
    const selection = selectBestEndgameCandidate({ categoryId: 'KRPvKR', seed: 'objective-role', candidateCount: 4 });
    assert.equal(selection.ok, true);
    const strongSide = selection.selected.metadata.strongSide;
    const defendingSide = strongSide === 'white' ? 'black' : 'white';
    const prepare = async userColor => {
        const controller = new EndgameSessionController({ createEngineAdapter: () => ({ initialize: async () => true, dispose() {} }), candidateSelector: async () => selection });
        const state = await controller.prepareSession({ categoryId: 'KRPvKR', seed: 'objective-role', userColor });
        controller.dispose(); return state;
    };
    const attack = await prepare(strongSide), defense = await prepare(defendingSide);
    assert.match(attack.objective, /promote|cut off|coordinate|improve|keep the rook active/i);
    assert.doesNotMatch(attack.objective, /hold|contain the pawn/i);
    assert.match(defense.objective, /checks|hold|stop the pawn|contain the pawn/i);
    assert.doesNotMatch(defense.objective, /promote|cut off the defending king/i);
});

test('product markup enables only supported five-piece category and keeps random policy', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../../endgame-trainer.html', import.meta.url), 'utf8');
    const page = await readFile(new URL('../../js/endgame-trainer/endgame-trainer-page.js', import.meta.url), 'utf8');
    assert.match(html, /value="5">5 — Rook and Pawn vs Rook/); assert.match(html, /6 — Coming later/);
    assert.match(html, /value="KRPvKR">Rook and Pawn vs Rook/); assert.match(page, /pieces === '5' \? \['KRPvKR'\]/);
    assert.match(page, /RANDOM_CATEGORIES = \['KQK', 'KRK', 'KPK', 'KPKP'\]/);
    assert.doesNotMatch(page, /innerHTML\s*=/);
});
