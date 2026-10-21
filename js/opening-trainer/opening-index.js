import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

export const positionKey = fen => String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
const normalizeSan = value => String(value || '').replace(/^\d+\.(?:\.\.)?/, '').replace(/[!?+#]+/g, '').trim();

export function parseCatalogMoves(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(/\s+/);
    return source
        .map(normalizeSan)
        .filter(token => token && !/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

export function buildOpeningIndex(rows = []) {
    const byPosition = new Map();
    const bySequence = new Map();
    for (const raw of Array.isArray(rows) ? rows : []) {
        const moves = parseCatalogMoves(raw?.moves);
        if (!moves.length) continue;
        const chess = new Chess();
        const canonical = [];
        let valid = true;
        for (const san of moves) {
            let move = null;
            try { move = chess.move(san); } catch { move = null; }
            if (!move) { valid = false; break; }
            canonical.push(move.san);
        }
        if (!valid) continue;
        const entry = Object.freeze({
            eco: String(raw.eco || raw.code || '').toUpperCase(),
            name: String(raw.name || raw.opening || 'Unknown opening'),
            moves: Object.freeze(canonical),
            fen: chess.fen(),
            depth: canonical.length
        });
        const sequenceKey = canonical.map(normalizeSan).join(' ');
        const currentAtSequence = bySequence.get(sequenceKey);
        if (!currentAtSequence || entry.depth >= currentAtSequence.depth) bySequence.set(sequenceKey, entry);
        const key = positionKey(entry.fen);
        const currentAtPosition = byPosition.get(key);
        if (!currentAtPosition || entry.depth >= currentAtPosition.depth) byPosition.set(key, entry);
    }
    return Object.freeze({
        size: byPosition.size,
        resolve(fen, playedMoves = []) {
            const sequenceKey = parseCatalogMoves(playedMoves).map(normalizeSan).join(' ');
            const exact = bySequence.get(sequenceKey);
            const positioned = byPosition.get(positionKey(fen));
            const match = exact || positioned || null;
            return match ? Object.freeze({
                ...match,
                matchType: exact ? 'sequence' : 'transposition',
                transpositionVerified: !exact && Boolean(positioned)
            }) : null;
        }
    });
}

export default buildOpeningIndex;
