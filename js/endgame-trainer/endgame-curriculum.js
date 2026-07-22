import { ENDGAME_MATERIAL_CATALOG } from './endgame-material-catalog.js';
import { getKrpvkrTemplate } from './endgame-rook-pawn-templates.js';

export const ENDGAME_CURRICULUM_VERSION = '1.0.0';

const DIFFICULTIES = new Set(['foundational', 'intermediate', 'advanced']);
const ROLES = new Set(['attack', 'defense', 'mixed']);
const RULES = new Set(['complete-sessions', 'complete-without-resigning', 'hint-limited-sessions', 'terminal-completed', 'defend-moves', 'both-roles', 'template-once', 'procedural-sessions']);
const THEMES = new Set([
    'opposition', 'key-squares', 'king-activity', 'pawn-breakthrough', 'promotion-technique', 'defensive-opposition',
    'king-restriction', 'rook-box', 'queen-box', 'bring-the-king', 'avoid-stalemate', 'finishing-technique',
    'rook-behind-pawn', 'king-cut-off', 'active-rook', 'checking-distance', 'side-check-defense', 'passive-defense',
    'lucena-like', 'philidor-like', 'rook-pawn-exception', 'stop-promotion', 'defensive-king-placement', 'rook-activity', 'practical-resistance'
]);
const unsafe = /\b(winning position|theoretical draw|tablebase|forced win|forced draw|wdl)\b/i;

const lesson = (pathId, order, id, title, shortDescription, category, difficulty, trainingRole, theme, objective, prerequisites, targetSessions, completionRule, candidatePolicy = {}) => ({
    id, pathId, order, title, shortDescription, category, pieceCount: ENDGAME_MATERIAL_CATALOG[category].exactPieceCount,
    difficulty, trainingRole, theme, objective, prerequisites, targetSessions, completionRule, candidatePolicy
});

const PATHS = [
    {
        id: 'pawn-foundations', title: 'Pawn Endgame Foundations', shortDescription: 'Build king activity, opposition and promotion technique.',
        lessons: [
            lesson('pawn-foundations', 1, 'pawn-opposition', 'Meet the opposition', 'Recognize direct opposition before committing the pawn.', 'KPK', 'foundational', 'mixed', 'opposition', 'Use opposition to improve the king.', [], 2, { type: 'procedural-sessions', target: 2 }),
            lesson('pawn-foundations', 2, 'pawn-key-squares', 'Reach the key squares', 'Coordinate the king with the pawn route.', 'KPK', 'foundational', 'attack', 'key-squares', 'Bring the king toward useful squares around the pawn.', ['pawn-opposition'], 2, { type: 'hint-limited-sessions', target: 2, maxHints: 2 }),
            lesson('pawn-foundations', 3, 'pawn-king-activity', 'Activate the king', 'Improve king placement before advancing.', 'KPKP', 'foundational', 'mixed', 'king-activity', 'Improve king activity while preserving the pawn structure.', ['pawn-key-squares'], 2, { type: 'complete-sessions', target: 2 }),
            lesson('pawn-foundations', 4, 'pawn-breakthrough', 'Create a breakthrough', 'Practice practical pawn-race decisions.', 'KPKP', 'intermediate', 'attack', 'pawn-breakthrough', 'Create useful pawn progress without assuming an exact result.', ['pawn-king-activity'], 2, { type: 'complete-without-resigning', target: 2 }),
            lesson('pawn-foundations', 5, 'pawn-defense', 'Defend with opposition', 'Slow promotion through king placement.', 'KPK', 'intermediate', 'defense', 'defensive-opposition', 'Use the king to contain the pawn and resist promotion.', ['pawn-opposition'], 2, { type: 'defend-moves', target: 2, minMoves: 6 })
        ]
    },
    {
        id: 'basic-checkmates', title: 'Basic Checkmates', shortDescription: 'Coordinate a major piece and king without allowing stalemate.',
        lessons: [
            lesson('basic-checkmates', 1, 'mate-rook-box', 'Build the rook box', 'Restrict the lone king with the rook.', 'KRK', 'foundational', 'attack', 'rook-box', 'Reduce the defending king\'s available space safely.', [], 2, { type: 'procedural-sessions', target: 2 }),
            lesson('basic-checkmates', 2, 'mate-bring-king', 'Bring the king', 'Coordinate the king after restricting space.', 'KRK', 'foundational', 'attack', 'bring-the-king', 'Bring the king closer while keeping the rook safe.', ['mate-rook-box'], 1, { type: 'terminal-completed', target: 1 }),
            lesson('basic-checkmates', 3, 'mate-queen-box', 'Build the queen box', 'Restrict safely with the queen.', 'KQK', 'foundational', 'attack', 'queen-box', 'Use the queen to restrict without creating stalemate.', [], 2, { type: 'hint-limited-sessions', target: 2, maxHints: 2 }),
            lesson('basic-checkmates', 4, 'mate-finish', 'Finish with coordination', 'Combine restriction and king support.', 'KQK', 'intermediate', 'attack', 'finishing-technique', 'Coordinate king and queen to complete the exercise.', ['mate-queen-box'], 1, { type: 'terminal-completed', target: 1 })
        ]
    },
    {
        id: 'rook-essentials', title: 'Rook Endgame Essentials', shortDescription: 'Practice active-rook principles and landmark KRPvKR structures.',
        lessons: [
            lesson('rook-essentials', 1, 'rook-behind-pawn', 'Put the rook behind the pawn', 'Learn the basic active-rook placement.', 'KRPvKR', 'foundational', 'attack', 'rook-behind-pawn', 'Keep the rook active behind the pawn.', ['mate-rook-box', 'pawn-key-squares'], 1, { type: 'template-once', target: 1 }, { source: 'template', template: 'rook-behind-pawn' }),
            lesson('rook-essentials', 2, 'rook-cutoff', 'Cut off the defending king', 'Use files and ranks to restrict the king.', 'KRPvKR', 'intermediate', 'attack', 'king-cut-off', 'Cut off the defending king and improve the rook.', ['rook-behind-pawn'], 1, { type: 'template-once', target: 1 }, { source: 'template', template: 'king-cut-off' }),
            lesson('rook-essentials', 3, 'rook-active-defense', 'Keep the rook active', 'Prefer active checks over passive waiting.', 'KRPvKR', 'intermediate', 'defense', 'active-rook', 'Use active rook checks to contain the pawn.', ['rook-behind-pawn'], 2, { type: 'defend-moves', target: 2, minMoves: 6 }, { source: 'template', template: 'active-defense' }),
            lesson('rook-essentials', 4, 'rook-checking-distance', 'Use checking distance', 'Create room for safe checking moves.', 'KRPvKR', 'intermediate', 'defense', 'checking-distance', 'Maintain checking distance and keep the rook active.', ['rook-active-defense'], 2, { type: 'hint-limited-sessions', target: 2, maxHints: 2 }, { source: 'procedural' }),
            lesson('rook-essentials', 5, 'rook-side-checks', 'Defend with side checks', 'Practice lateral checking patterns.', 'KRPvKR', 'advanced', 'defense', 'side-check-defense', 'Use side checks to hold practical resistance.', ['rook-checking-distance'], 1, { type: 'template-once', target: 1 }, { source: 'template', template: 'side-check-defense' }),
            lesson('rook-essentials', 6, 'rook-lucena', 'Recognize a Lucena-like setup', 'Practice bridge-building geometry.', 'KRPvKR', 'intermediate', 'attack', 'lucena-like', 'Build a bridge and promote the pawn.', ['rook-cutoff'], 1, { type: 'template-once', target: 1 }, { source: 'template', template: 'lucena-like' }),
            lesson('rook-essentials', 7, 'rook-philidor', 'Recognize a Philidor-like defense', 'Practice active defensive placement.', 'KRPvKR', 'intermediate', 'defense', 'philidor-like', 'Keep the rook active and test the defensive setup.', ['rook-active-defense'], 1, { type: 'template-once', target: 1 }, { source: 'template', template: 'philidor-like' })
        ]
    },
    {
        id: 'defensive-technique', title: 'Defensive Technique', shortDescription: 'Build practical resistance across supported pawn and rook endings.',
        lessons: [
            lesson('defensive-technique', 1, 'defense-hold-opposition', 'Hold the opposition', 'Use king placement to slow the attacker.', 'KPK', 'foundational', 'defense', 'defensive-opposition', 'Use opposition to contain the pawn.', ['pawn-opposition'], 2, { type: 'defend-moves', target: 2, minMoves: 6 }),
            lesson('defensive-technique', 2, 'defense-stop-promotion', 'Stop the promotion race', 'Balance king activity and pawn threats.', 'KPKP', 'intermediate', 'defense', 'stop-promotion', 'Resist promotion while preserving practical counterplay.', ['pawn-king-activity'], 2, { type: 'complete-without-resigning', target: 2 }),
            lesson('defensive-technique', 3, 'defense-rook-activity', 'Defend with rook activity', 'Use checks instead of passive waiting.', 'KRPvKR', 'intermediate', 'defense', 'rook-activity', 'Keep the rook active and contain the pawn.', ['rook-active-defense'], 2, { type: 'defend-moves', target: 2, minMoves: 8 }, { source: 'procedural' }),
            lesson('defensive-technique', 4, 'defense-practical-resistance', 'Offer practical resistance', 'Alternate king placement and active checks.', 'KRPvKR', 'advanced', 'mixed', 'practical-resistance', 'Coordinate king and rook for practical resistance.', ['defense-rook-activity'], 2, { type: 'complete-sessions', target: 2 }, { source: 'procedural' })
        ]
    }
];

function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
const CATALOG = deepFreeze(PATHS);
const clone = value => structuredClone(value);
const allLessons = () => CATALOG.flatMap(path => path.lessons);

function validationErrors() {
    const errors = [], pathIds = new Set(), lessonIds = new Set();
    for (const path of CATALOG) {
        if (!path.id || pathIds.has(path.id)) errors.push('invalid-path-id'); pathIds.add(path.id);
        path.lessons.forEach((item, index) => {
            if (item.pathId !== path.id || item.order !== index + 1) errors.push('invalid-lesson-order');
            if (!item.id || lessonIds.has(item.id)) errors.push('invalid-lesson-id'); lessonIds.add(item.id);
            if (!ENDGAME_MATERIAL_CATALOG[item.category]) errors.push('unsupported-category');
            if (!THEMES.has(item.theme)) errors.push('unsupported-theme');
            if (!DIFFICULTIES.has(item.difficulty) || !ROLES.has(item.trainingRole)) errors.push('invalid-lesson-metadata');
            if (!Number.isInteger(item.targetSessions) || item.targetSessions < 1 || item.targetSessions > 5) errors.push('invalid-target-sessions');
            if (!RULES.has(item.completionRule?.type) || item.completionRule.target !== item.targetSessions) errors.push('invalid-completion-rule');
            if (!item.objective || unsafe.test(item.objective)) errors.push('unsafe-objective');
            if (item.candidatePolicy.template && !getKrpvkrTemplate(item.candidatePolicy.template)) errors.push('unknown-template');
        });
    }
    for (const item of allLessons()) for (const prerequisite of item.prerequisites) if (!lessonIds.has(prerequisite)) errors.push('unknown-prerequisite');
    return [...new Set(errors)];
}

function lessonProgress(snapshot, lessonId) { return snapshot?.curriculum?.lessons?.[lessonId] ?? { sessionsStarted: 0, sessionsCompleted: 0, resignations: 0, hintsUsed: 0, undosUsed: 0, moveCount: 0, completed: false }; }
function pathProgress(path, snapshot) { const completed = path.lessons.filter(item => lessonProgress(snapshot, item.id).completed).length; return { completed, total: path.lessons.length, percent: Math.round(completed * 100 / path.lessons.length) }; }

export function createEndgameCurriculum() {
    const paths = CATALOG;
    const path = pathId => paths.find(item => item.id === pathId) ?? null;
    const lessonBy = (pathId, lessonId) => path(pathId)?.lessons.find(item => item.id === lessonId) ?? null;
    return Object.freeze({
        getPaths: () => clone(paths.map(({ lessons, ...item }) => ({ ...item, lessonCount: lessons.length }))),
        getPath: pathId => { const value = path(pathId); return value ? clone(value) : null; },
        getLesson: (pathId, lessonId) => { const value = lessonBy(pathId, lessonId); return value ? clone(value) : null; },
        getNextLesson(pathId, lessonId) { const value = path(pathId), index = value?.lessons.findIndex(item => item.id === lessonId) ?? -1; return index >= 0 && index + 1 < value.lessons.length ? clone(value.lessons[index + 1]) : null; },
        getPreviousLesson(pathId, lessonId) { const value = path(pathId), index = value?.lessons.findIndex(item => item.id === lessonId) ?? -1; return index > 0 ? clone(value.lessons[index - 1]) : null; },
        getRecommendedLesson(progressSnapshot = {}) { const selected = path(progressSnapshot?.curriculum?.selectedPathId) ?? paths[0]; return clone(selected.lessons.find(item => !lessonProgress(progressSnapshot, item.id).completed) ?? selected.lessons.at(-1)); },
        resolveTrainingOptions(pathId, lessonId) {
            const item = lessonBy(pathId, lessonId); if (!item) return null;
            const template = item.candidatePolicy.template ? getKrpvkrTemplate(item.candidatePolicy.template) : null;
            const userColor = 'white';
            const strongSide = item.trainingRole === 'defense' ? 'black' : 'white';
            const generatorOptions = template ? { template: template.id, strongSide, sideToMove: 'white' } : { strongSide, sideToMove: 'white' };
            return clone({ categoryId: item.category, userColor, betaWhiteOnly: true, candidateCount: 24, generatorOptions, lesson: { pathId, lessonId, theme: item.theme, trainingRole: item.trainingRole, difficulty: item.difficulty } });
        },
        getProgress(progressSnapshot = {}) { return clone({ paths: Object.fromEntries(paths.map(item => [item.id, pathProgress(item, progressSnapshot)])), lessonsCompleted: allLessons().filter(item => lessonProgress(progressSnapshot, item.id).completed).length, totalLessons: allLessons().length }); },
        validate: () => ({ valid: validationErrors().length === 0, errors: validationErrors() }),
        getSnapshot: () => clone({ version: ENDGAME_CURRICULUM_VERSION, paths })
    });
}
