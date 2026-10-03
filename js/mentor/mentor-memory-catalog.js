import { PuzzleSession } from '../puzzles/model.js';

const INITIAL_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const LOCAL_URL = '/data/puzzles/lichess-curated-preview.json';

// Density measures this exercise's piece load, never the player's chess Elo.
export function memoryPieceLoad(fen) {
    const placement = String(fen).split(' ')[0];
    const pieces = placement.match(/[prnbqk]/gi) || [];
    return Object.freeze({ count: pieces.length, density: Math.round(100 * Math.max(0, Math.min(29, pieces.length - 3)) / 29) });
}

export function memoryPuzzlePosition(puzzle, source) {
    try {
        if (!puzzle || typeof puzzle.id !== 'string' || !puzzle.id || puzzle.id.length > 100
            || typeof puzzle.fen !== 'string' || puzzle.fen.length > 120
            || typeof puzzle.moves !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?(?:\s+[a-h][1-8][a-h][1-8][qrbn]?)*$/.test(puzzle.moves)) return null;
        // Reuse Puzzles' established opponent-setup semantics; no study game is mutated.
        const fen = new PuzzleSession({ ...puzzle, themes: Array.isArray(puzzle.themes) ? puzzle.themes : [] }).setupFen;
        const placement = fen.split(' ')[0], load = memoryPieceLoad(fen);
        if (placement === INITIAL_PLACEMENT || load.count < 3 || load.count > 32) return null;
        return Object.freeze({ id: `puzzle-${puzzle.id}`, fen, placement, source,
            pattern: 'Position memory', pieceCount: load.count, density: load.density });
    } catch { return null; }
}

function aborted(signal) {
    if (signal?.aborted) throw new DOMException('Memory selection cancelled', 'AbortError');
}
function pick(items, rng) {
    if (!items.length) return null;
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid random source');
    return items[Math.floor(value * items.length)];
}

export function createMemoryCatalog({ fetchFn = (...args) => globalThis.fetch(...args), rng = Math.random, timeoutMs = 4000 } = {}) {
    const pools = new Map(), cursors = new Map(), ended = new Set();
    let local = null;
    async function read(url, signal) {
        aborted(signal);
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, timeoutMs);
        try {
            const response = await fetchFn(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Puzzle collection HTTP ${response.status}`);
            const payload = await response.json(); aborted(signal); return payload;
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    }
    return Object.freeze({
        async next(level, { signal, excludedPlacements = new Set() } = {}) {
            if (!level || !Number.isInteger(level.min) || !Number.isInteger(level.max)
                || level.min < 3 || level.max > 32 || level.max < level.min) throw new TypeError('Invalid memory level');
            const key = `${level.min}:${level.max}`;
            const pool = pools.get(key) || new Map(); pools.set(key, pool);
            const eligible = () => [...pool.values()].filter(item => !excludedPlacements.has(item.placement));
            const add = (rows, source) => {
                for (const row of rows) {
                    const item = memoryPuzzlePosition(row, source);
                    if (item && item.pieceCount >= level.min && item.pieceCount <= level.max) pool.set(item.placement, item);
                }
            };
            aborted(signal);
            if (eligible().length) return pick(eligible(), rng);
            // Existing API has no piece-count index. Sample at most 64 candidates,
            // with its normal signed cursor and limits; never scan the full catalog.
            for (let page = 0; page < 4 && !ended.has(key); page++) {
                const themes = level.max <= 12 ? 'endgame' : level.min >= 23 ? 'opening' : 'middlegame';
                const params = new URLSearchParams({ themes, minRating: '1600', maxRating: '2200', limit: '16' });
                if (cursors.get(key)) params.set('cursor', cursors.get(key));
                let payload;
                try { payload = await read(`/api/puzzles/select?${params}`, signal); }
                catch (error) { aborted(signal); break; }
                if (!Array.isArray(payload?.puzzles) || payload.puzzles.length > 16) break;
                add(payload.puzzles, payload.source === 'local-full-catalog' ? 'local-full-catalog' : 'full-catalog');
                const cursor = payload.hasMore === true && typeof payload.cursor === 'string' && payload.cursor.length <= 1024 ? payload.cursor : null;
                if (!cursor || cursor === cursors.get(key)) ended.add(key); else cursors.set(key, cursor);
                if (eligible().length) return pick(eligible(), rng);
            }
            if (!local) {
                try {
                    const payload = await read(LOCAL_URL, signal);
                    if (!Array.isArray(payload?.puzzles) || payload.puzzles.length > 2000) throw new Error('Invalid curated collection');
                    local = payload.puzzles;
                } catch (error) { aborted(signal); return null; }
            }
            aborted(signal); add(local, 'curated-fallback');
            return pick(eligible(), rng);
        },
        clear() { pools.clear(); cursors.clear(); ended.clear(); local = null; }
    });
}
