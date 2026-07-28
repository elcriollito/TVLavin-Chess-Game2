export const endgameCoachFixtures = Object.freeze({
    id: 'endgame-coach-fixtures@1.1.0',
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
            move: { from: 'a4', to: 'a5' }, expected: 'endgame-pawn-square' }),
        Object.freeze({ id: 'pawn-square-white-turn', fen: '7k/8/8/P7/8/8/8/7K w - - 0 1', expected: 'endgame-pawn-square' }),
        Object.freeze({ id: 'pawn-square-double-step', fen: '7k/8/8/8/8/8/P7/7K w - - 0 1', expected: 'endgame-pawn-square' }),
        Object.freeze({ id: 'pawn-square-black', fen: 'K7/8/8/8/7p/8/8/7k b - - 0 1',
            expected: 'endgame-pawn-square', playerColor: 'black' }),
        Object.freeze({ id: 'king-activity-black', fen: 'k7/1p6/8/8/8/8/2P5/7K w - - 0 1',
            expected: 'endgame-activate-king', playerColor: 'black' }),
        Object.freeze({ id: 'vertical-opposition-reversed', fen: '8/8/4k3/7p/4K3/P7/8/8 w - - 0 1',
            expected: 'endgame-opposition' }),
        Object.freeze({ id: 'horizontal-opposition-reversed', fen: '8/8/8/8/2K1k3/P6p/8/8 w - - 0 1',
            expected: 'endgame-opposition' }),
        Object.freeze({ id: 'unsupported-passer-black', fen: 'k7/8/8/8/4p3/8/7P/7K w - - 0 1',
            expected: 'endgame-support-passer', playerColor: 'black' }),
        Object.freeze({ id: 'king-activity-route', fen: '7k/6p1/8/8/8/8/P7/1K6 b - - 0 1',
            expected: 'endgame-activate-king' }),
        Object.freeze({ id: 'pawn-square-inside', fen: '8/8/2k5/P7/8/8/8/7K b - - 0 1',
            expected: 'endgame-pawn-square' }),
        Object.freeze({ id: 'pawn-square-outside', fen: '7k/8/8/P7/8/8/8/7K w - - 0 1',
            expected: 'endgame-pawn-square' }),
        Object.freeze({ id: 'king-activity-edge', fen: '6k1/7p/8/8/8/8/P7/K7 b - - 0 1',
            expected: 'endgame-activate-king' })
    ]),
    quiet: Object.freeze([
        Object.freeze({ id: 'middlegame-heavy', fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 7 5' }),
        Object.freeze({ id: 'king-already-active', fen: '8/7p/4k3/8/3K4/8/P7/8 b - - 0 1' }),
        Object.freeze({ id: 'false-opposition-gap', fen: '8/4k2p/8/8/4K3/P7/8/8 b - - 0 1' }),
        Object.freeze({ id: 'extra-rook-interference', fen: '8/8/4k2p/8/4K3/P7/8/R7 b - - 0 1' }),
        Object.freeze({ id: 'false-passer', fen: '7k/8/4p3/3P4/8/8/8/K7 b - - 0 1' }),
        Object.freeze({ id: 'blocked-passer', fen: '7k/8/3p4/3P4/8/8/8/K7 b - - 0 1' }),
        Object.freeze({ id: 'distant-opposition', fen: '8/4k3/8/8/8/4K3/P6p/8 b - - 0 1' }),
        Object.freeze({ id: 'diagonal-kings', fen: '8/8/4k3/8/3K4/P6p/8/8 b - - 0 1' }),
        Object.freeze({ id: 'reserve-tempo-complexity', fen: '8/8/4k3/6pp/4K3/PP6/8/8 b - - 0 1' }),
        Object.freeze({ id: 'minor-ending-unsupported', fen: '7k/7p/8/8/8/8/P7/K1N5 b - - 0 1' }),
        Object.freeze({ id: 'rook-ending-unsupported', fen: '7k/7p/8/8/8/8/P7/KR6 b - - 0 1' }),
        Object.freeze({ id: 'queen-ending-unsupported', fen: '7k/7p/8/8/8/8/P7/KQ6 b - - 0 1' }),
        Object.freeze({ id: 'both-pawns-racing', fen: '7k/7p/8/P7/8/8/8/7K w - - 0 1' }),
        Object.freeze({ id: 'connected-passers-specific', fen: '7k/8/8/3PP3/8/8/8/K7 b - - 0 1' }),
        Object.freeze({ id: 'protected-passer-specific', fen: '7k/8/8/3P4/2P5/8/8/K7 b - - 0 1' }),
        Object.freeze({ id: 'active-central-king', fen: '7k/7p/8/8/3K4/8/P7/8 b - - 0 1' }),
        Object.freeze({ id: 'no-pawns', fen: '7k/8/8/8/8/8/8/K7 w - - 0 1' }),
        Object.freeze({ id: 'invalid-fen', fen: 'not-a-fen' }),
        Object.freeze({ id: 'transition-heavy', fen: '4k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K3 w Qk - 0 20' })
    ]),
    sessions: Object.freeze([
        Object.freeze({ id: 'activity-then-opposition', initialFen: '7k/2p5/8/8/8/8/1P6/K7 b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/2p5/8/8/8/8/1P6/K7 b - - 0 1', expected: 'endgame-activate-king' }),
                Object.freeze({ fen: '8/8/4k2p/8/4K3/P7/8/8 b - - 0 1', expected: 'endgame-opposition' })
            ]), summary: 'facts-only' }),
        Object.freeze({ id: 'passer-support', initialFen: '7k/p7/8/3P4/8/8/8/K7 b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/p7/8/3P4/8/8/8/K7 b - - 0 1', expected: 'endgame-support-passer' }),
                Object.freeze({ fen: '7k/p7/8/3P4/3K4/8/8/8 b - - 0 1', expectedAbsent: 'endgame-support-passer' })
            ]), summary: 'facts-only' }),
        Object.freeze({ id: 'pawn-race', initialFen: '7k/8/8/P7/8/8/8/7K b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/8/8/P7/8/8/8/7K b - - 0 1', expected: 'endgame-pawn-square' }),
                Object.freeze({ fen: '8/7k/8/P7/8/8/8/7K w - - 1 2', expected: 'endgame-pawn-square' })
            ]), summary: 'facts-only' }),
        Object.freeze({ id: 'quiet-ending', initialFen: '7k/7p/8/8/3K4/8/P7/8 b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/7p/8/8/3K4/8/P7/8 b - - 0 1', expectedAbsent: 'endgame-activate-king' }),
                Object.freeze({ fen: '7k/7p/8/3K4/8/8/P7/8 b - - 0 1', expectedAbsent: 'endgame-opposition' })
            ]), summary: 'quiet' }),
        Object.freeze({ id: 'tactical-outranks', initialFen: '7k/8/8/P7/8/8/8/7K b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/8/8/P7/8/8/8/7K b - - 0 1', expected: 'endgame-pawn-square',
                    tacticalFacts: Object.freeze({ opponentLegalChecks: 1 }) }),
                Object.freeze({ fen: '7k/8/8/P7/8/8/8/7K w - - 0 2', expected: 'endgame-pawn-square' })
            ]), summary: 'facts-only' }),
        Object.freeze({ id: 'rematch-reset', initialFen: '7k/8/8/P7/8/8/8/7K b - - 0 1',
            observations: Object.freeze([
                Object.freeze({ fen: '7k/8/8/P7/8/8/8/7K b - - 0 1', expected: 'endgame-pawn-square' }),
                Object.freeze({ fen: '7k/8/8/P7/8/8/8/7K b - - 0 1', expected: 'endgame-pawn-square', reset: true })
            ]), summary: 'reset' })
    ])
});
