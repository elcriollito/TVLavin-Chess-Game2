export const endgameCoachFixtures = Object.freeze({
    id: 'endgame-coach-fixtures@1.0.0',
    positive: Object.freeze([
        Object.freeze({ id: 'king-activity', fen: '7k/2p5/8/8/8/8/1P6/K7 b - - 0 1',
            move: { from: 'a2', to: 'b2' }, expected: 'endgame-activate-king' }),
        Object.freeze({ id: 'vertical-opposition', fen: '8/8/4k2p/8/4K3/P7/8/8 b - - 0 1',
            move: { from: 'e3', to: 'e4' }, expected: 'endgame-opposition' }),
        Object.freeze({ id: 'horizontal-opposition', fen: '8/8/7p/8/2K1k3/P7/8/8 b - - 0 1',
            move: { from: 'c3', to: 'c4' }, expected: 'endgame-opposition' }),
        Object.freeze({ id: 'unsupported-passer', fen: '7k/p7/8/3P4/8/8/8/K7 b - - 0 1',
            move: { from: 'd4', to: 'd5' }, expected: 'endgame-support-passer' }),
        Object.freeze({ id: 'pawn-square', fen: '7k/8/8/P7/8/8/8/7K b - - 0 1',
            move: { from: 'a4', to: 'a5' }, expected: 'endgame-pawn-square' })
    ]),
    quiet: Object.freeze([
        Object.freeze({ id: 'middlegame-heavy', fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5' }),
        Object.freeze({ id: 'king-already-active', fen: '8/7p/4k3/8/3K4/8/P7/8 b - - 0 1' }),
        Object.freeze({ id: 'false-opposition-gap', fen: '8/4k2p/8/8/4K3/P7/8/8 b - - 0 1' }),
        Object.freeze({ id: 'extra-rook-interference', fen: '8/8/4k2p/8/4K3/P7/8/R7 b - - 0 1' }),
        Object.freeze({ id: 'false-passer', fen: '7k/8/4p3/3P4/8/8/8/K7 b - - 0 1' }),
        Object.freeze({ id: 'blocked-passer', fen: '7k/8/3p4/3P4/8/8/8/K7 b - - 0 1' })
    ])
});
