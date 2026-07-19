import { getEndgameCategory, materialFor } from './endgame-material-catalog.js';
import { boardToFen } from './endgame-fen-utils.js';
import { validateEndgamePosition } from './endgame-position-validator.js';

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
