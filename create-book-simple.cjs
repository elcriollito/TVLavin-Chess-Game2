/**
 * Create opening book with correct hash for starting position
 */

const fs = require('fs');

// Hash from actual calculation: 61d86120249aa8c0
const START_HASH = 0x61d86120249aa8c0n;

/**
 * Encode a move in Polyglot format
 * bits 0-5: from square (0=a1, 7=h1, 56=a8, 63=h8)
 * bits 6-11: to square
 * bits 12-14: promotion piece
 */
function encodeMove(fromSquare, toSquare) {
    return fromSquare | (toSquare << 6);
}

// Opening moves for White from starting position
const openingMoves = [
    // e2e4: from e2 (file=4, rank=1) = 12, to e4 (file=4, rank=3) = 28
    { from: 12, to: 28, weight: 100, name: 'e2e4' },

    // d2d4: from d2 (file=3, rank=1) = 11, to d4 (file=3, rank=3) = 27
    { from: 11, to: 27, weight: 80, name: 'd2d4' },

    // g1f3: from g1 (file=6, rank=0) = 6, to f3 (file=5, rank=2) = 21
    { from: 6, to: 21, weight: 60, name: 'g1f3' },

    // c2c4: from c2 (file=2, rank=1) = 10, to c4 (file=2, rank=3) = 26
    { from: 10, to: 26, weight: 40, name: 'c2c4' },
];

// Create entries
const entries = [];

for (const move of openingMoves) {
    const encodedMove = encodeMove(move.from, move.to);
    entries.push({
        key: START_HASH,
        move: encodedMove,
        weight: move.weight,
        name: move.name
    });
}

// Create buffer (16 bytes per entry)
const buffer = Buffer.alloc(entries.length * 16);

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

    // Write learn (4 bytes, zeros)
    buffer.writeUInt32BE(0, offset + 12);

    console.log(`Entry ${i}: ${entry.name} (from=${entry.from}, to=${entry.to}, encoded=${entry.move.toString(16)}, weight=${entry.weight})`);
}

// Write to file
fs.writeFileSync('book.bin', buffer);

console.log('\n✅ Created book.bin with', entries.length, 'opening moves');
console.log('📖 Starting position hash:', START_HASH.toString(16));
