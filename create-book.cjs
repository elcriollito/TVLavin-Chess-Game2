/**
 * Create a minimal Polyglot opening book for testing
 *
 * Format: Each entry is 16 bytes:
 * - key (8 bytes): Zobrist hash of position (big-endian)
 * - move (2 bytes): move in Polyglot format (big-endian)
 * - weight (2 bytes): frequency/importance (big-endian)
 * - learn (4 bytes): learning data (unused, set to 0)
 */

const fs = require('fs');

/**
 * Encode a move in Polyglot format
 *
 * Polyglot move encoding (16 bits):
 * bits 0-5: from square (0=a1, 7=h1, 56=a8, 63=h8)
 * bits 6-11: to square
 * bits 12-14: promotion piece (0=none, 1=knight, 2=bishop, 3=rook, 4=queen)
 */
function encodeMove(from, to, promotion = 0) {
    return from | (to << 6) | (promotion << 12);
}

/**
 * Convert square notation to Polyglot square index
 * a1=0, b1=1, ..., h1=7, a2=8, ..., h8=63
 */
function squareToIndex(square) {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const rank = parseInt(square[1]) - 1; // 0-7
    return rank * 8 + file;
}

// Simplified Zobrist initialization (same as polyglot-book.js)
const zobristPiece = [];
const zobristCastle = [];
const zobristEnPassant = [];
let zobristTurn = 0n;

function initZobrist() {
    let seed = 1070372;
    const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
        return seed;
    };

    // 64 squares * 12 pieces = 768 values
    for (let i = 0; i < 768; i++) {
        zobristPiece[i] = BigInt(random()) | (BigInt(random()) << 32n);
    }

    // 4 castling rights
    for (let i = 0; i < 4; i++) {
        zobristCastle[i] = BigInt(random()) | (BigInt(random()) << 32n);
    }

    // 8 en passant files
    for (let i = 0; i < 8; i++) {
        zobristEnPassant[i] = BigInt(random()) | (BigInt(random()) << 32n);
    }

    // Side to move
    zobristTurn = BigInt(random()) | (BigInt(random()) << 32n);
}

/**
 * Calculate hash for starting position
 * This is a simplified version - for a real book you'd need proper FEN parsing
 */
function hashStartPosition() {
    let hash = 0n;

    // Starting position pieces
    const startPieces = [
        // White pieces (rank 1 and 2)
        { square: 0, piece: 7 },   // a1: white rook
        { square: 1, piece: 3 },   // b1: white knight
        { square: 2, piece: 5 },   // c1: white bishop
        { square: 3, piece: 9 },   // d1: white queen
        { square: 4, piece: 11 },  // e1: white king
        { square: 5, piece: 5 },   // f1: white bishop
        { square: 6, piece: 3 },   // g1: white knight
        { square: 7, piece: 7 },   // h1: white rook

        // White pawns (rank 2)
        { square: 8, piece: 1 },   // a2: white pawn
        { square: 9, piece: 1 },   // b2: white pawn
        { square: 10, piece: 1 },  // c2: white pawn
        { square: 11, piece: 1 },  // d2: white pawn
        { square: 12, piece: 1 },  // e2: white pawn
        { square: 13, piece: 1 },  // f2: white pawn
        { square: 14, piece: 1 },  // g2: white pawn
        { square: 15, piece: 1 },  // h2: white pawn

        // Black pawns (rank 7)
        { square: 48, piece: 0 },  // a7: black pawn
        { square: 49, piece: 0 },  // b7: black pawn
        { square: 50, piece: 0 },  // c7: black pawn
        { square: 51, piece: 0 },  // d7: black pawn
        { square: 52, piece: 0 },  // e7: black pawn
        { square: 53, piece: 0 },  // f7: black pawn
        { square: 54, piece: 0 },  // g7: black pawn
        { square: 55, piece: 0 },  // h7: black pawn

        // Black pieces (rank 8)
        { square: 56, piece: 6 },  // a8: black rook
        { square: 57, piece: 2 },  // b8: black knight
        { square: 58, piece: 4 },  // c8: black bishop
        { square: 59, piece: 8 },  // d8: black queen
        { square: 60, piece: 10 }, // e8: black king
        { square: 61, piece: 4 },  // f8: black bishop
        { square: 62, piece: 2 },  // g8: black knight
        { square: 63, piece: 6 },  // h8: black rook
    ];

    // Hash pieces
    for (const { square, piece } of startPieces) {
        const index = square * 12 + piece;
        hash ^= zobristPiece[index];
    }

    // Hash castling (all available at start: KQkq)
    hash ^= zobristCastle[0]; // K
    hash ^= zobristCastle[1]; // Q
    hash ^= zobristCastle[2]; // k
    hash ^= zobristCastle[3]; // q

    // No en passant at start
    // White to move (don't XOR turn)

    return hash;
}

// Initialize Zobrist tables
initZobrist();

// Create opening book entries
const entries = [];

// Starting position - common opening moves
const startHash = hashStartPosition();

// Add popular first moves for White
const openingMoves = [
    { from: 'e2', to: 'e4', weight: 100 },  // e4 - most popular
    { from: 'd2', to: 'd4', weight: 80 },   // d4 - second most popular
    { from: 'g1', to: 'f3', weight: 60 },   // Nf3 - Reti
    { from: 'c2', to: 'c4', weight: 40 },   // c4 - English
];

for (const { from, to, weight } of openingMoves) {
    const fromIndex = squareToIndex(from);
    const toIndex = squareToIndex(to);
    const move = encodeMove(fromIndex, toIndex);

    entries.push({
        key: startHash,
        move: move,
        weight: weight
    });
}

// Create buffer
const buffer = Buffer.alloc(entries.length * 16);

// Write entries
for (let i = 0; i < entries.length; i++) {
    const offset = i * 16;
    const entry = entries[i];

    // Write key (8 bytes, big-endian)
    const keyHigh = Number(entry.key >> 32n);
    const keyLow = Number(entry.key & 0xFFFFFFFFn);
    buffer.writeUInt32BE(keyHigh, offset);
    buffer.writeUInt32BE(keyLow, offset + 4);

    // Write move (2 bytes, big-endian)
    buffer.writeUInt16BE(entry.move, offset + 8);

    // Write weight (2 bytes, big-endian)
    buffer.writeUInt16BE(entry.weight, offset + 10);

    // Write learn (4 bytes, all zeros)
    buffer.writeUInt32BE(0, offset + 12);
}

// Write to file
fs.writeFileSync('book.bin', buffer);

console.log('✅ Created book.bin with', entries.length, 'opening moves');
console.log('📖 Starting position hash:', startHash.toString(16));
console.log('📖 Moves included:');
for (const { from, to, weight } of openingMoves) {
    console.log(`   ${from}${to} (weight: ${weight})`);
}
