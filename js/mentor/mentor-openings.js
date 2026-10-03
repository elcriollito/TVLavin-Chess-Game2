import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

export function parseEcoCatalog(data) {
    if (!Array.isArray(data) || data.length > 500) throw new Error('Invalid ECO catalog.');
    const seen = new Set();
    return Object.freeze(data.map(item => {
        if (!item || !/^[A-E]\d{2}$/.test(item.code) || seen.has(item.code) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || typeof item.moves !== 'string' || item.moves.length > 2000) throw new Error('Invalid ECO entry.');
        seen.add(item.code);
        let san = [], playable = false;
        try {
            const game = new Chess(); game.loadPgn(item.moves); san = game.history();
            playable = san.length > 0 && san.length <= 100;
        } catch { /* Preserve the entry without allowing an invalid line onto the board. */ }
        const first = san[0] || item.moves.replace(/^\s*1\.\s*/, '').split(/\s/)[0];
        return Object.freeze({ code: item.code, name: item.name, notation: item.moves, san: Object.freeze(san), playable,
            group: first === 'e4' ? 'e4' : first === 'd4' ? 'd4' : 'other' });
    }));
}

export async function loadEcoCatalog() {
    const response = await fetch('/data/eco/eco_codes.json');
    if (!response.ok) throw new Error('ECO catalog unavailable.');
    const text = await response.text();
    if (text.length > 512000) throw new Error('ECO catalog exceeds its limit.');
    return parseEcoCatalog(JSON.parse(text));
}

export function prepareEcoLesson(entry) {
    if (!entry?.playable || !/^[A-E]\d{2}$/.test(entry.code) || !Array.isArray(entry.san) || entry.san.length > 100) throw new Error('Opening line unavailable.');
    const game = new Chess(), positions = [game.fen()], notes = ['Follow the opening line from the starting position.'];
    const moves = entry.san.map(san => {
        const move = game.move(san); positions.push(game.fen());
        notes.push(`${move.san} · ${game.turn() === 'w' ? 'White' : 'Black'} to move.`);
        return { san: move.san, from: move.from, to: move.to, promotion: move.promotion };
    });
    return { id: `eco-${entry.code}`, title: entry.name, category: `Opening · ECO ${entry.code}`, positions, moves, notes,
        prompt: `Explain the plans for both sides in ${entry.name} (ECO ${entry.code}), using the current study-board position. Distinguish general plans from a verified engine evaluation.` };
}
