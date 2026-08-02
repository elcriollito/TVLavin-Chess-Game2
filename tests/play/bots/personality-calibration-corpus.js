export const PERSONALITY_CORPUS_VERSION = '1.0.0';
export const PERSONALITY_CORPUS_PROVENANCE = 'Repository-owned synthetic positions and bounded candidate evaluations.';

const fixture = (id, category, fen, property, candidates) => Object.freeze({
    schemaVersion: PERSONALITY_CORPUS_VERSION, id, category, fen, sideToMove: fen.split(' ')[1],
    expectedBehavioralProperty: property, evaluationMethod: 'fixed centipawn candidate window',
    candidates: Object.freeze(candidates.map(Object.freeze)),
    limitations: 'Synthetic policy calibration; not human-rating evidence.'
});

export const PERSONALITY_CALIBRATION_CORPUS = Object.freeze([
    fixture('forcing-check-safe', 'forcing-tactics', '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1',
        'Tactical selects the safe checking alternative; other profiles need not.', [
            { move: 'e2d2', multipv: 1, score: 0.5 }, { move: 'e2b5', multipv: 2, score: 0.2 }]),
    fixture('forcing-check-unsafe', 'unsafe-forcing', '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1',
        'Tactical rejects a checking move outside its evaluation-loss boundary.', [
            { move: 'e2d2', multipv: 1, score: 0.5 }, { move: 'e2b5', multipv: 2, score: -1 }]),
    fixture('stable-exposure', 'stability', 'rnbqkbnr/1pp1ppp1/p2p3p/8/1P6/2B5/P1PPPPPP/RN1QKBNR w KQkq - 0 4',
        'Solid selects the lower-exposure near-best move.', [
            { move: 'b4b5', multipv: 1, score: 0.5 }, { move: 'c3d4', multipv: 2, score: 0.45 },
            { move: 'c3e5', multipv: 3, score: 0.4 }]),
    fixture('mate-priority', 'mate', '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
        'Every profile selects forced mate over style.', [
            { move: 'f7e7', multipv: 1, score: 4 }, { move: 'f7g7', multipv: 2, mate: 1 }]),
    fixture('promotion-priority', 'promotion', '8/P7/8/8/8/8/7k/4K3 w - - 0 1',
        'Every profile preserves the immediate promotion.', [
            { move: 'a7a8q', multipv: 1, score: 8 }, { move: 'e1d2', multipv: 2, score: 6 }])
]);
