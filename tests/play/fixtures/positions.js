// Valid, synthetic positions used to characterize the legacy Play runtime.
export const positions = Object.freeze({
    opening: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    legalBasicMove: Object.freeze({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', from: 'e2', to: 'e4' }),
    illegalMove: Object.freeze({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', from: 'e2', to: 'e5' }),
    castle: Object.freeze({ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', from: 'e1', to: 'g1' }),
    enPassant: Object.freeze({ fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', from: 'e5', to: 'd6' }),
    whitePromotion: Object.freeze({ fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', from: 'a7', to: 'a8' }),
    blackPromotion: Object.freeze({ fen: '4k3/8/8/8/8/8/p7/4K3 b - - 0 1', from: 'a2', to: 'a1' }),
    checkmateInOne: Object.freeze({ fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', from: 'f7', to: 'g7' }),
    stalemate: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
    insufficientMaterial: '8/8/8/8/8/8/3k4/5K2 w - - 0 1',
    fiftyMove: '8/8/8/8/8/8/3k4/R4K2 w - - 100 51',
    positiveEvaluation: Object.freeze({ cp: 125, pv: 'e2e4 e7e5' }),
    negativeEvaluation: Object.freeze({ cp: -210, pv: 'd2d4 d7d5' }),
    mateEvaluation: Object.freeze({ mate: 3, pv: 'f7g7' })
});
