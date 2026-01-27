/**
 * CAISSA Position Forge — FEN Manipulation Engine
 *
 * Pure FEN string operations: flip, mirror, color swap, clear.
 * No DOM dependencies. Maintains undo/redo stack.
 * Exposes window.PositionForge for global access.
 */

(function() {
    'use strict';

    const MAX_UNDO = 50;
    const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // Internal state
    let _currentFen = START_FEN;
    let _undoStack = [];
    let _redoStack = [];

    // ========================================
    // FEN UTILITY HELPERS
    // ========================================

    /**
     * Expand a FEN rank string into an 8-char array.
     * e.g. 'r1bk3r' → ['r','1','b','k','1','1','1','r']
     * Numbers become that many '1' characters.
     */
    function _expandRank(rank) {
        const chars = [];
        for (const ch of rank) {
            const n = parseInt(ch, 10);
            if (!isNaN(n)) {
                for (let i = 0; i < n; i++) chars.push('1');
            } else {
                chars.push(ch);
            }
        }
        return chars;
    }

    /**
     * Compact an 8-char array back into FEN rank notation.
     * e.g. ['r','1','1','1','k','1','1','r'] → 'r3k2r'
     */
    function _compactRank(chars) {
        let result = '';
        let emptyCount = 0;
        for (const ch of chars) {
            if (ch === '1') {
                emptyCount++;
            } else {
                if (emptyCount > 0) { result += emptyCount; emptyCount = 0; }
                result += ch;
            }
        }
        if (emptyCount > 0) result += emptyCount;
        return result;
    }

    /**
     * Parse FEN into components.
     * Returns { position, sideToMove, castling, enPassant, halfmove, fullmove }
     */
    function _parseFen(fen) {
        const parts = (fen || START_FEN).trim().split(/\s+/);
        return {
            position: parts[0] || '8/8/8/8/8/8/8/8',
            sideToMove: parts[1] || 'w',
            castling: parts[2] || '-',
            enPassant: parts[3] || '-',
            halfmove: parts[4] || '0',
            fullmove: parts[5] || '1'
        };
    }

    /**
     * Reassemble FEN from components.
     */
    function _buildFen(parts) {
        return [parts.position, parts.sideToMove, parts.castling, parts.enPassant, parts.halfmove, parts.fullmove].join(' ');
    }

    /**
     * Swap piece color: uppercase ↔ lowercase.
     */
    function _swapColor(ch) {
        if (ch === '1') return '1';
        return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
    }

    /**
     * Mirror a file letter: a↔h, b↔g, c↔f, d↔e.
     */
    function _mirrorFile(file) {
        const map = { a:'h', b:'g', c:'f', d:'e', e:'d', f:'c', g:'b', h:'a' };
        return map[file] || file;
    }

    /**
     * Mirror an en-passant rank: 3↔6 (the only valid en-passant ranks).
     */
    function _mirrorEpRank(rank) {
        return rank === '3' ? '6' : rank === '6' ? '3' : rank;
    }

    /**
     * Swap castling rights case: K↔k, Q↔q.
     */
    function _swapCastlingColor(castling) {
        if (castling === '-') return '-';
        let result = '';
        // Build from scratch: new white rights = old black, new black = old white
        if (castling.includes('k')) result += 'K';
        if (castling.includes('q')) result += 'Q';
        if (castling.includes('K')) result += 'k';
        if (castling.includes('Q')) result += 'q';
        return result || '-';
    }

    /**
     * Mirror castling kingside ↔ queenside: K↔Q, k↔q.
     */
    function _mirrorCastlingSide(castling) {
        if (castling === '-') return '-';
        let result = '';
        if (castling.includes('Q')) result += 'K';
        if (castling.includes('K')) result += 'Q';
        if (castling.includes('q')) result += 'k';
        if (castling.includes('k')) result += 'q';
        return result || '-';
    }

    /**
     * Push current state to undo stack before a transformation.
     */
    function _pushUndo() {
        _undoStack.push(_currentFen);
        if (_undoStack.length > MAX_UNDO) {
            _undoStack.shift();
        }
        _redoStack = []; // clear redo on new action
    }

    // ========================================
    // TRANSFORMATION FUNCTIONS
    // ========================================

    /**
     * Flip the board 180° (rotate).
     * - Reverse rank order AND reverse each rank
     * - Swap piece colors
     * - Swap side to move
     * - Swap castling colors
     * - Mirror en-passant file and rank
     */
    function flipBoard(fen) {
        const f = _parseFen(fen);
        const ranks = f.position.split('/');

        // Reverse rank order, then reverse each rank's pieces and swap colors
        const newRanks = ranks.reverse().map(rank => {
            const expanded = _expandRank(rank);
            const reversed = expanded.reverse().map(_swapColor);
            return _compactRank(reversed);
        });

        f.position = newRanks.join('/');
        f.sideToMove = f.sideToMove === 'w' ? 'b' : 'w';
        f.castling = _swapCastlingColor(f.castling);

        if (f.enPassant !== '-') {
            f.enPassant = _mirrorFile(f.enPassant[0]) + _mirrorEpRank(f.enPassant[1]);
        }

        f.halfmove = '0';
        return _buildFen(f);
    }

    /**
     * Mirror horizontally (reflect across d/e file axis).
     * - Reverse each rank
     * - Mirror castling kingside ↔ queenside
     * - Mirror en-passant file
     */
    function mirrorHorizontal(fen) {
        const f = _parseFen(fen);
        const ranks = f.position.split('/');

        const newRanks = ranks.map(rank => {
            const expanded = _expandRank(rank);
            expanded.reverse();
            return _compactRank(expanded);
        });

        f.position = newRanks.join('/');
        f.castling = _mirrorCastlingSide(f.castling);

        if (f.enPassant !== '-') {
            f.enPassant = _mirrorFile(f.enPassant[0]) + f.enPassant[1];
        }

        return _buildFen(f);
    }

    /**
     * Mirror vertically (reflect across 4th/5th rank boundary).
     * - Reverse rank order
     * - Mirror en-passant rank
     */
    function mirrorVertical(fen) {
        const f = _parseFen(fen);
        const ranks = f.position.split('/');
        ranks.reverse();

        f.position = ranks.join('/');

        if (f.enPassant !== '-') {
            f.enPassant = f.enPassant[0] + _mirrorEpRank(f.enPassant[1]);
        }

        return _buildFen(f);
    }

    /**
     * Swap colors (all white pieces become black and vice versa).
     * - Swap piece colors in position
     * - Swap side to move
     * - Swap castling colors
     * - Mirror en-passant rank (since pawn direction reverses)
     */
    function colorSwap(fen) {
        const f = _parseFen(fen);
        const ranks = f.position.split('/');

        const newRanks = ranks.map(rank => {
            const expanded = _expandRank(rank);
            const swapped = expanded.map(_swapColor);
            return _compactRank(swapped);
        });

        f.position = newRanks.join('/');
        f.sideToMove = f.sideToMove === 'w' ? 'b' : 'w';
        f.castling = _swapCastlingColor(f.castling);

        if (f.enPassant !== '-') {
            f.enPassant = f.enPassant[0] + _mirrorEpRank(f.enPassant[1]);
        }

        return _buildFen(f);
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.PositionForge = {

        /**
         * Set current FEN.
         */
        setFromFEN: function(fen) {
            _pushUndo();
            _currentFen = fen || START_FEN;
            return _currentFen;
        },

        /**
         * Get current FEN.
         */
        getFEN: function() {
            return _currentFen;
        },

        /**
         * Flip board 180° and update state.
         */
        flipBoard: function(fen) {
            const input = fen || _currentFen;
            _pushUndo();
            _currentFen = flipBoard(input);
            return _currentFen;
        },

        /**
         * Mirror horizontally and update state.
         */
        mirrorHorizontal: function(fen) {
            const input = fen || _currentFen;
            _pushUndo();
            _currentFen = mirrorHorizontal(input);
            return _currentFen;
        },

        /**
         * Mirror vertically and update state.
         */
        mirrorVertical: function(fen) {
            const input = fen || _currentFen;
            _pushUndo();
            _currentFen = mirrorVertical(input);
            return _currentFen;
        },

        /**
         * Swap all piece colors and update state.
         */
        colorSwap: function(fen) {
            const input = fen || _currentFen;
            _pushUndo();
            _currentFen = colorSwap(input);
            return _currentFen;
        },

        /**
         * Clear board to empty position.
         */
        clearBoard: function() {
            _pushUndo();
            _currentFen = EMPTY_FEN;
            return _currentFen;
        },

        /**
         * Reset to starting position.
         */
        resetBoard: function() {
            _pushUndo();
            _currentFen = START_FEN;
            return _currentFen;
        },

        /**
         * Undo the last operation. Returns the restored FEN or null if nothing to undo.
         */
        undo: function() {
            if (_undoStack.length === 0) return null;
            _redoStack.push(_currentFen);
            _currentFen = _undoStack.pop();
            return _currentFen;
        },

        /**
         * Redo the last undone operation. Returns the restored FEN or null.
         */
        redo: function() {
            if (_redoStack.length === 0) return null;
            _undoStack.push(_currentFen);
            _currentFen = _redoStack.pop();
            return _currentFen;
        },

        /**
         * Check if undo is available.
         */
        canUndo: function() {
            return _undoStack.length > 0;
        },

        /**
         * Check if redo is available.
         */
        canRedo: function() {
            return _redoStack.length > 0;
        },

        /**
         * Clear undo/redo history.
         */
        clearHistory: function() {
            _undoStack = [];
            _redoStack = [];
        },

        // Expose pure functions (no state mutation) for external use
        pure: {
            flipBoard,
            mirrorHorizontal,
            mirrorVertical,
            colorSwap,
            parseFen: _parseFen,
            buildFen: _buildFen
        },

        EMPTY_FEN,
        START_FEN
    };

})();
