export const fixtureSuite = Object.freeze({
    id: 'coach-intervention-fixtures@1.0.0',
    fixtures: Object.freeze([
        Object.freeze({ id: 'hanging-minor', category: 'tactical', expected: 'hanging-piece',
            fen: '4k3/8/8/2p5/3N4/8/8/4K3 b - - 0 1', ply: 21, move: { from: 'f3', to: 'd4' } }),
        Object.freeze({ id: 'defended-attacked-piece', category: 'false-positive', expected: null,
            forbiddenCandidate: 'hanging-piece', fen: '4k3/8/8/2p5/3Q4/4P3/8/4K3 b - - 0 1',
            ply: 21, move: { from: 'd2', to: 'd4' } }),
        Object.freeze({ id: 'development-reminder', category: 'development', expected: 'development-reminder',
            fen: 'rnbqkbnr/ppp2ppp/8/3pp3/3PP3/7P/PPP2PP1/RNBQKBNR b KQkq - 0 4',
            ply: 7, move: { from: 'h2', to: 'h3' } }),
        Object.freeze({ id: 'king-safety-open-center', category: 'king-safety', expected: 'king-safety',
            fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5',
            ply: 9, move: { from: 'g1', to: 'f3' } }),
        Object.freeze({ id: 'immediate-check-danger', category: 'tactical', expected: 'immediate-danger',
            fen: '4k3/8/8/3r4/3Q4/8/8/4K3 b - - 0 1', ply: 21,
            move: { from: 'd2', to: 'd4' } }),
        Object.freeze({ id: 'completed-development-positive', category: 'positive', expected: 'development-positive',
            fen: 'rnbqkbnr/pppppppp/8/1B6/8/2N2N2/PPPPPPPP/R1BQK2R b kq - 0 5',
            ply: 9, move: { from: 'f1', to: 'b5' } }),
        Object.freeze({ id: 'endgame-development-suppressed', category: 'false-positive', expected: null,
            fen: '8/8/8/3k4/8/4K3/8/8 b - - 0 20', ply: 39, move: { from: 'e2', to: 'e3' } }),
        Object.freeze({ id: 'quiet-opening-before-window', category: 'no-message', expected: null,
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
            ply: 1, move: { from: 'e2', to: 'e4' } })
    ])
});
