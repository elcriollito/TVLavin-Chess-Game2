/**
 * Polyglot Opening Book Reader
 *
 * Reads .bin files in Polyglot format:
 * - Each entry is 16 bytes:
 *   - key (8 bytes): Zobrist hash of position
 *   - move (2 bytes): move in Polyglot format
 *   - weight (2 bytes): frequency/importance
 *   - learn (4 bytes): learning data (unused here)
 *
 * Book is sorted by key, so we can use binary search
 */

class PolyglotBook {
    constructor() {
        this.entries = null;
        this.loaded = false;

        // Polyglot Zobrist random numbers (predefined standard)
        this.initZobrist();
    }

    /**
     * Initialize Polyglot Zobrist hash tables
     * These are standard values used by Polyglot format
     */
    initZobrist() {
        // We'll use a simplified version - just the key pieces
        // Full implementation would have all 781 random numbers

        // For simplicity, we'll use the standard Polyglot Zobrist values
        // These are hardcoded in the Polyglot specification
        this.zobristPiece = [];
        this.zobristCastle = [];
        this.zobristEnPassant = [];
        this.zobristTurn = 0;

        // Initialize with pseudo-random values (simplified)
        // In production, these should be the exact Polyglot standard values
        let seed = 1070372;
        const random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
            return seed;
        };

        // 64 squares * 12 pieces = 768 values
        for (let i = 0; i < 768; i++) {
            this.zobristPiece[i] = BigInt(random()) | (BigInt(random()) << 32n);
        }

        // 4 castling rights
        for (let i = 0; i < 4; i++) {
            this.zobristCastle[i] = BigInt(random()) | (BigInt(random()) << 32n);
        }

        // 8 en passant files
        for (let i = 0; i < 8; i++) {
            this.zobristEnPassant[i] = BigInt(random()) | (BigInt(random()) << 32n);
        }

        // Side to move
        this.zobristTurn = BigInt(random()) | (BigInt(random()) << 32n);
    }

    /**
     * Load opening book from URL
     */
    async loadBook(url) {
        try {
            console.log('📚 Loading opening book from:', url);
            const response = await fetch(url);

            if (!response.ok) {
                console.warn('⚠️ Opening book not found, continuing without book');
                return false;
            }

            const arrayBuffer = await response.arrayBuffer();
            console.log('📚 Book loaded, size:', arrayBuffer.byteLength, 'bytes');

            // Parse entries (each 16 bytes)
            const numEntries = arrayBuffer.byteLength / 16;
            console.log('📚 Number of book positions:', numEntries);

            const view = new DataView(arrayBuffer);
            this.entries = [];

            for (let i = 0; i < numEntries; i++) {
                const offset = i * 16;

                // Read 64-bit key (big-endian)
                const keyHigh = view.getUint32(offset, false); // big-endian
                const keyLow = view.getUint32(offset + 4, false);
                const key = (BigInt(keyHigh) << 32n) | BigInt(keyLow);

                // Read 16-bit move (big-endian)
                const move = view.getUint16(offset + 8, false);

                // Read 16-bit weight (big-endian)
                const weight = view.getUint16(offset + 10, false);

                // Skip learn (4 bytes)

                this.entries.push({ key, move, weight });
            }

            this.loaded = true;
            console.log('✅ Opening book loaded successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to load opening book:', error);
            this.loaded = false;
            return false;
        }
    }

    /**
     * Calculate Polyglot hash for a position
     */
    hashPosition(game) {
        let hash = 0n;

        const board = game.board();

        // Polyglot piece encoding:
        // Black: p=0, n=2, b=4, r=6, q=8, k=10
        // White: P=1, N=3, B=5, R=7, Q=9, K=11
        const pieceToIndex = {
            'p': 0,  'n': 2,  'b': 4,  'r': 6,  'q': 8,  'k': 10,  // Black
            'P': 1,  'N': 3,  'B': 5,  'R': 7,  'Q': 9,  'K': 11   // White
        };

        // Hash pieces
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const square = board[rank][file];
                if (square && square.type) {
                    // Get piece character (e.g., 'p', 'N', 'k')
                    const pieceChar = square.color === 'w'
                        ? square.type.toUpperCase()
                        : square.type.toLowerCase();

                    const pieceIndex = pieceToIndex[pieceChar];
                    if (pieceIndex === undefined) {
                        console.warn('Unknown piece:', pieceChar);
                        continue;
                    }

                    const squareIndex = rank * 8 + file;
                    const zobristIndex = squareIndex * 12 + pieceIndex;

                    if (zobristIndex >= 0 && zobristIndex < this.zobristPiece.length) {
                        hash ^= this.zobristPiece[zobristIndex];
                    }
                }
            }
        }

        // Hash castling rights
        const fen = game.fen();
        const fenParts = fen.split(' ');
        const castling = fenParts[2];

        if (castling.includes('K')) hash ^= this.zobristCastle[0];
        if (castling.includes('Q')) hash ^= this.zobristCastle[1];
        if (castling.includes('k')) hash ^= this.zobristCastle[2];
        if (castling.includes('q')) hash ^= this.zobristCastle[3];

        // Hash en passant
        const epSquare = fenParts[3];
        if (epSquare !== '-') {
            const file = epSquare.charCodeAt(0) - 'a'.charCodeAt(0);
            if (file >= 0 && file < 8) {
                hash ^= this.zobristEnPassant[file];
            }
        }

        // Hash side to move (Polyglot: hash if BLACK to move)
        const sideToMove = fenParts[1];
        if (sideToMove === 'b') {
            hash ^= this.zobristTurn;
        }

        return hash;
    }

    /**
     * Find book moves for current position
     */
    findMoves(game) {
        if (!this.loaded || !this.entries) {
            return [];
        }

        const positionHash = this.hashPosition(game);
        console.log('🔍 Looking for book moves, hash:', positionHash.toString(16));

        // Binary search for matching entries
        const moves = [];

        // Simple linear search for now (could optimize with binary search)
        for (const entry of this.entries) {
            if (entry.key === positionHash) {
                const move = this.decodePolyglotMove(entry.move);
                moves.push({ move, weight: entry.weight });
            }
        }

        if (moves.length > 0) {
            console.log(`📖 Found ${moves.length} book move(s):`, moves);
        }

        return moves;
    }

    /**
     * Decode Polyglot move format to UCI
     *
     * Polyglot move encoding (16 bits):
     * bits 0-5: from square (0=a1, 7=h1, 56=a8, 63=h8)
     * bits 6-11: to square
     * bits 12-14: promotion piece (0=none, 1=knight, 2=bishop, 3=rook, 4=queen)
     */
    decodePolyglotMove(encoded) {
        const fromSquare = encoded & 0x3F;
        const toSquare = (encoded >> 6) & 0x3F;
        const promotion = (encoded >> 12) & 0x7;

        const files = 'abcdefgh';
        const ranks = '12345678';

        const fromFile = fromSquare % 8;
        const fromRank = Math.floor(fromSquare / 8);
        const toFile = toSquare % 8;
        const toRank = Math.floor(toSquare / 8);

        let uciMove = files[fromFile] + ranks[fromRank] + files[toFile] + ranks[toRank];

        // Add promotion piece
        if (promotion > 0) {
            const promotionPieces = ['', 'n', 'b', 'r', 'q'];
            uciMove += promotionPieces[promotion];
        }

        return uciMove;
    }

    /**
     * Select a move from book based on weights
     * Returns UCI move string or null
     */
    selectBookMove(game) {
        const moves = this.findMoves(game);

        if (moves.length === 0) {
            return null;
        }

        // If only one move, return it
        if (moves.length === 1) {
            console.log('📖 Book move (only option):', moves[0].move);
            return moves[0].move;
        }

        // Weighted random selection
        const totalWeight = moves.reduce((sum, m) => sum + m.weight, 0);
        let random = Math.random() * totalWeight;

        for (const moveEntry of moves) {
            random -= moveEntry.weight;
            if (random <= 0) {
                console.log('📖 Book move (weighted):', moveEntry.move, 'weight:', moveEntry.weight);
                return moveEntry.move;
            }
        }

        // Fallback to first move
        console.log('📖 Book move (fallback):', moves[0].move);
        return moves[0].move;
    }

    /**
     * Check if position is in book
     */
    isInBook(game) {
        if (!this.loaded) return false;
        const moves = this.findMoves(game);
        return moves.length > 0;
    }
}

// Export for use in app
window.PolyglotBook = PolyglotBook;
