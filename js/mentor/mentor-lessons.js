import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

export const LESSONS = Object.freeze({
    development: { title: 'Develop with a plan', category: 'Principles · Italian Game',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
        notes: ['Take space in the center. Try 1. e4.', 'White opens lines for the bishop and queen.', 'Black also takes central space.', 'The knight develops and attacks e5.', 'Black develops while defending e5.', 'The bishop develops toward the sensitive f7 square.', 'Both sides have developed toward the center.'],
        prompt: 'Explain why developing pieces toward the center is useful in this Italian Game example.' },
    london: { title: 'London System', category: 'Openings · Queen’s pawn',
        moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6'],
        notes: ['Start with 1. d4 and build a central foothold.', 'The d-pawn controls e5 and c5.', 'Black establishes central space.', 'Develop a knight before committing the structure.', 'Black develops naturally.', 'Bring the bishop outside the future pawn chain.', 'Black prepares development.', 'Support d4 and open a path for the other bishop.', 'Black challenges the active bishop.'],
        prompt: 'Explain the plans for both sides in this London System position. Distinguish plans from engine evaluations.' },
    sicilian: { title: 'Sicilian Defense', category: 'Openings · Open Sicilian',
        moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'],
        notes: ['Begin with 1. e4.', 'White occupies the center.', 'Black challenges d4 from the flank.', 'White prepares d4.', 'Black supports e5 and develops a flexible structure.', 'White opens the center.', 'Black trades a flank pawn for a central pawn.', 'White recaptures with an active knight.', 'Black develops and attacks e4.'],
        prompt: 'Explain the central pawn trade and piece activity in this Open Sicilian example.' },
    fork: { title: 'Find a knight fork', category: 'Tactics · Double attack',
        fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', moves: ['Nc7+', 'Kd7', 'Nxa8'],
        notes: ['Find a knight move that checks the king and attacks the rook.', 'Nc7+ attacks the king on e8 and the rook on a8.', 'After the king moves, the rook remains attacked.', 'The knight captures the rook.'],
        prompt: 'Explain how a knight fork creates two threats and why a check can force the opponent’s response.' },
    opposition: { title: 'Understand opposition', category: 'Endgames · King activity',
        fen: '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1', moves: ['Kd5', 'Kd7', 'e5'],
        notes: ['The kings oppose each other. White must move; explore Kd5.', 'The king steps around rather than into an illegal adjacent square.', 'Black keeps the king close to the pawn’s path.', 'The pawn advances with support. This is an illustration, not a tablebase verdict.'],
        prompt: 'Explain direct opposition using this legal king-and-pawn example, without claiming a verified win or draw.' }
});

// Chess.js validates every authored line. The page owns exactly one live game;
// this temporary construction is only used when preparing a lesson snapshot.
export function prepareLesson(id) {
    const lesson = LESSONS[id];
    if (!lesson) throw new Error('Unknown lesson.');
    const game = new Chess(lesson.fen);
    const positions = [game.fen()];
    const moves = lesson.moves.map(san => {
        const move = game.move(san);
        positions.push(game.fen());
        return { san: move.san, from: move.from, to: move.to, promotion: move.promotion };
    });
    return { ...lesson, id, positions, moves };
}
