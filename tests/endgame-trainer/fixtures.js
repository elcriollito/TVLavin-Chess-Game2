export const VALID_FIXTURES = [
    { categoryId: 'KQK', strongSide: 'white', fen: '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1' },
    { categoryId: 'KRK', strongSide: 'black', fen: '4k3/3r4/8/8/8/8/8/7K b - - 0 1' },
    { categoryId: 'KPK', strongSide: 'white', fen: '7k/8/8/8/4P3/8/8/4K3 w - - 0 1' },
    { categoryId: 'KPKP', strongSide: 'white', fen: '7k/6p1/8/8/8/8/P7/K7 w - - 0 1' }
];

export const INVALID_FIXTURES = [
    { fen: 'not-a-fen', errors: ['invalid-fen'] },
    { fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', errors: ['missing-black-king'] },
    { fen: '4k3/8/8/8/8/8/4K3/3K4 w - - 0 1', errors: ['multiple-white-kings'] },
    { fen: '8/8/8/8/8/8/4k3/4K3 w - - 0 1', errors: ['kings-adjacent'] },
    { fen: '7k/8/8/8/8/8/8/P3K3 w - - 0 1', errors: ['pawn-on-invalid-rank'] },
    { fen: '7k/8/8/8/8/8/4R3/4K3 w - - 0 1', categoryId: 'KQK', strongSide: 'white', errors: ['material-signature-mismatch'] },
    { fen: '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', categoryId: 'KQK', strongSide: 'white', errors: ['no-legal-moves', 'game-already-over'] },
    { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', errors: ['no-legal-moves', 'game-already-over'] },
    { fen: '4k3/4R3/8/8/8/8/4r3/4K3 w - - 0 1', errors: ['both-kings-in-check', 'impossible-side-state'] },
    { fen: '4k3/4R3/8/8/8/8/8/4K3 w - - 0 1', errors: ['impossible-side-state'] },
    { fen: 'P6k/8/8/8/8/8/8/4K3 w - - 0 1', errors: ['pawn-on-invalid-rank'] },
    { fen: '4k2p/8/8/8/8/8/8/4K3 w - - 0 1', errors: ['pawn-on-invalid-rank'] },
    { fen: '4k2k/8/8/8/8/8/8/4K3 w - - 0 1', errors: ['multiple-black-kings'] },
    { fen: '9/8/8/8/8/8/8/4K3 w - - 0 1', errors: ['invalid-fen'] },
    { fen: '7k/8/8/8/8/8/4Q3/4K3 x - - 0 1', errors: ['invalid-fen'] },
    { fen: '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1', categoryId: 'KPK', strongSide: 'white', errors: ['material-signature-mismatch'] }
];
