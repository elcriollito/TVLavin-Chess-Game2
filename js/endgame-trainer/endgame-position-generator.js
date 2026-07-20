import { getEndgameCategory, materialFor } from './endgame-material-catalog.js';
import { boardToFen } from './endgame-fen-utils.js';
import { validateEndgamePosition } from './endgame-position-validator.js';
import { getKrpvkrTemplate, reflectKrpvkrTemplate } from './endgame-rook-pawn-templates.js';

function seedToUint32(seed) {
    const text = String(seed);
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}

export function createSeededRng(seed) {
    let state = seedToUint32(seed);
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function nextRandom(rng) {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError('RNG must return a finite number in [0, 1)');
    }
    return value;
}

function choose(list, rng) { return list[Math.floor(nextRandom(rng) * list.length)]; }

function placeMaterial(material, rng) {
    const available = Array.from({ length: 64 }, (_, index) => `${String.fromCharCode(97 + (index % 8))}${Math.floor(index / 8) + 1}`);
    const board = [];
    for (const color of ['white', 'black']) {
        for (const type of material[color]) {
            const eligible = type === 'p' ? available.filter((square) => !/[18]$/.test(square)) : available;
            const square = choose(eligible, rng);
            available.splice(available.indexOf(square), 1);
            board.push({ square, type, color });
        }
    }
    return board;
}

function rookPawnMetadata(board, strongSide, sideToMove) {
    const pawn = board.find(piece => piece.type === 'p');
    const attackingRook = board.find(piece => piece.type === 'r' && piece.color === strongSide);
    const defendingRook = board.find(piece => piece.type === 'r' && piece.color !== strongSide);
    const defendingKing = board.find(piece => piece.type === 'k' && piece.color !== strongSide);
    const rank = Number(pawn.square[1]);
    const progress = strongSide === 'white' ? rank - 1 : 8 - rank;
    const behind = attackingRook.square[0] === pawn.square[0] && (strongSide === 'white' ? Number(attackingRook.square[1]) < rank : Number(attackingRook.square[1]) > rank);
    const defenderBehind = defendingRook.square[0] === pawn.square[0] && (strongSide === 'white' ? Number(defendingRook.square[1]) > rank : Number(defendingRook.square[1]) < rank);
    const cutOff = Math.abs(defendingKing.square.charCodeAt(0) - pawn.square.charCodeAt(0)) >= 2;
    let theme = 'conversion-technique';
    if (/^[ah]/.test(pawn.square)) theme = 'rook-pawn-exception';
    else if (progress >= 6) theme = 'seventh-rank-pawn';
    else if (progress === 5) theme = 'sixth-rank-pawn';
    else if (behind) theme = 'rook-behind-pawn';
    else if (defenderBehind) theme = 'active-defense';
    else if (cutOff) theme = 'king-cut-off';
    const trainingRole = sideToMove === strongSide ? 'attack' : 'defense';
    const objective = trainingRole === 'attack'
        ? theme === 'rook-behind-pawn' ? 'Keep the rook active behind the pawn.' : theme === 'king-cut-off' ? 'Cut off the defending king and improve the rook.' : 'Coordinate the rook, king and pawn without allowing a simple material loss.'
        : 'Use active rook checks to contain the pawn.';
    return { source: 'procedural', theme, trainingRole, difficulty: progress >= 5 ? 'advanced' : 'intermediate', objective, recommendedPrerequisites: ['KRK', 'KPK'] };
}

/** Generates an operationally legal candidate or a structured exhaustion result. */
export function generateEndgamePosition(options = {}) {
    const { categoryId, seed = 'caissa-endgame', maxAttempts = 250 } = options;
    const category = getEndgameCategory(categoryId);
    if (!category) return { ok: false, error: { code: 'unknown-category', categoryId } };
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10000) {
        return { ok: false, error: { code: 'invalid-max-attempts', maxAttempts } };
    }
    if (Object.hasOwn(options, 'rng') && typeof options.rng !== 'function') {
        return { ok: false, error: { code: 'invalid-rng' } };
    }
    if (Object.hasOwn(options, 'rng') && Object.hasOwn(options, 'seed')) {
        return { ok: false, error: { code: 'seed-and-rng-conflict' } };
    }
    if (options.reflectTemplate !== undefined && typeof options.reflectTemplate !== 'boolean') {
        return { ok: false, error: { code: 'invalid-template-reflection' } };
    }
    if (options.template !== undefined) {
        if (categoryId !== 'KRPvKR' || typeof options.template !== 'string') return { ok: false, error: { code: 'invalid-template' } };
        const sourceTemplate = getKrpvkrTemplate(options.template);
        const template = options.reflectTemplate ? reflectKrpvkrTemplate(sourceTemplate) : sourceTemplate;
        if (!template) return { ok: false, error: { code: 'unknown-template' } };
        const validation = validateEndgamePosition(template.fen, { categoryId, strongSide: template.strongSide, allowImmediateMaterialChange: true });
        if (!validation.valid) return { ok: false, error: { code: 'invalid-template-position', errors: validation.errors } };
        return { ok: true, fen: validation.metadata.normalizedFen, metadata: { ...template, pieceCount: 5, sideToMove: validation.metadata.sideToMove, materialSignature: validation.metadata.materialSignature, legalMoveCount: validation.metadata.legalMoveCount, inCheck: validation.metadata.inCheck, attempts: 1, source: 'template' }, diagnostics: { rejectionCounts: {} } };
    }
    const rng = options.rng || createSeededRng(seed);
    let strongSide;
    let sideToMove;
    try {
        strongSide = options.strongSide || choose(category.allowedStrongSides, rng);
        sideToMove = options.sideToMove || choose(category.allowedSidesToMove, rng);
    } catch (error) {
        return { ok: false, error: { code: 'invalid-rng-output', message: error.message } };
    }
    if (!category.allowedStrongSides.includes(strongSide)) {
        return { ok: false, error: { code: 'invalid-strong-side', strongSide } };
    }
    if (!category.allowedSidesToMove.includes(sideToMove)) {
        return { ok: false, error: { code: 'invalid-side-to-move', sideToMove } };
    }

    const rejectionCounts = {};
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let board;
        try {
            board = placeMaterial(materialFor(category, strongSide), rng);
        } catch (error) {
            return { ok: false, error: { code: 'invalid-rng-output', message: error.message } };
        }
        const fen = boardToFen(board, sideToMove);
        const validation = validateEndgamePosition(fen, { categoryId, strongSide });
        if (validation.valid) {
            return {
                ok: true, fen: validation.metadata.normalizedFen,
                metadata: {
                    categoryId, seed, strongSide, sideToMove,
                    pieceCount: validation.metadata.pieceCount,
                    materialSignature: validation.metadata.materialSignature,
                    legalMoveCount: validation.metadata.legalMoveCount,
                    inCheck: validation.metadata.inCheck,
                    ...(categoryId === 'KRPvKR' ? rookPawnMetadata(board, strongSide, sideToMove) : {}),
                    attempts: attempt
                },
                diagnostics: { rejectionCounts: { ...rejectionCounts } }
            };
        }
        for (const error of validation.errors) rejectionCounts[error] = (rejectionCounts[error] || 0) + 1;
    }
    return {
        ok: false,
        error: { code: 'generation-attempts-exhausted', categoryId, seed, maxAttempts, rejectionCounts }
    };
}
