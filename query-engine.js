/**
 * CAISSA Query Engine — Advanced Position Search
 *
 * In-memory filter engine for positions stored in IndexedDB.
 * All filters are AND-combined. Supports: side to move, material counts,
 * piece count range, eval range, annotation, and tag filters.
 * Exposes window.QueryEngine for global access.
 */

(function() {
    'use strict';

    // ========================================
    // FEN PARSING HELPERS
    // ========================================

    /**
     * Parse material counts from FEN position string.
     * Returns { white: {K,Q,R,B,N,P}, black: {k,q,r,b,n,p}, total }
     */
    function _parseMaterial(fen) {
        const position = (fen || '').split(/\s+/)[0] || '';
        const counts = {
            white: { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0 },
            black: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 }
        };
        let total = 0;

        for (const ch of position) {
            if (ch === '/') continue;
            const n = parseInt(ch, 10);
            if (!isNaN(n)) continue; // skip empty squares

            if (ch === ch.toUpperCase()) {
                counts.white[ch] = (counts.white[ch] || 0) + 1;
            } else {
                counts.black[ch] = (counts.black[ch] || 0) + 1;
            }
            total++;
        }

        counts.total = total;
        return counts;
    }

    /**
     * Extract side to move from FEN.
     * Returns 'w' or 'b'.
     */
    function _getSideToMove(fen) {
        const parts = (fen || '').split(/\s+/);
        return parts[1] || 'w';
    }

    /**
     * Get eval in centipawns from an engine report.
     * Returns number or null if no eval available.
     */
    function _getEvalCp(engineReport) {
        if (!engineReport) return null;

        if (engineReport.mateIn !== null && engineReport.mateIn !== undefined) {
            // Convert mate to a large centipawn value
            return engineReport.mateIn > 0 ? 30000 : -30000;
        }

        if (engineReport.evalCp !== null && engineReport.evalCp !== undefined) {
            return engineReport.evalCp;
        }

        if (engineReport.evalPawns !== null && engineReport.evalPawns !== undefined) {
            return Math.round(parseFloat(engineReport.evalPawns) * 100);
        }

        return null;
    }

    // ========================================
    // FILTER MATCHING
    // ========================================

    /**
     * Check if a position matches all given filters.
     * Filters object can contain:
     *   - sideToMove: 'w' | 'b' | null (null = any)
     *   - pieceCountMin: number | null (total pieces on board)
     *   - pieceCountMax: number | null
     *   - evalMin: number | null (centipawns)
     *   - evalMax: number | null (centipawns)
     *   - hasAnnotation: boolean | null (null = don't filter)
     *   - hasEngineReport: boolean | null
     *   - tags: string[] (tag names to match)
     *   - tagMode: 'AND' | 'OR' (default 'OR')
     *   - material: { piece: minCount, ... }  e.g. { Q: 1, R: 2 } (white pieces uppercase, black lowercase)
     */
    function _matchesFilters(position, filters) {
        if (!position || !position.fen) return false;

        // Side to move filter
        if (filters.sideToMove) {
            const stm = _getSideToMove(position.fen);
            if (stm !== filters.sideToMove) return false;
        }

        // Material and piece count filters (only parse if needed)
        const needsMaterial = filters.pieceCountMin != null ||
                            filters.pieceCountMax != null ||
                            (filters.material && Object.keys(filters.material).length > 0);

        if (needsMaterial) {
            const mat = _parseMaterial(position.fen);

            // Total piece count range
            if (filters.pieceCountMin != null && mat.total < filters.pieceCountMin) return false;
            if (filters.pieceCountMax != null && mat.total > filters.pieceCountMax) return false;

            // Specific material requirements
            if (filters.material) {
                for (const [piece, minCount] of Object.entries(filters.material)) {
                    if (minCount <= 0) continue;
                    const isWhite = piece === piece.toUpperCase();
                    const side = isWhite ? mat.white : mat.black;
                    const count = side[piece] || 0;
                    if (count < minCount) return false;
                }
            }
        }

        // Eval range filter
        if (filters.evalMin != null || filters.evalMax != null) {
            const evalCp = _getEvalCp(position.engineReport);
            if (evalCp === null) return false; // no eval data = doesn't match eval filters
            if (filters.evalMin != null && evalCp < filters.evalMin) return false;
            if (filters.evalMax != null && evalCp > filters.evalMax) return false;
        }

        // Has engine report filter
        if (filters.hasEngineReport === true && !position.engineReport) return false;
        if (filters.hasEngineReport === false && position.engineReport) return false;

        // Has annotation filter
        if (filters.hasAnnotation === true) {
            const hasAnn = position.annotations && position.annotations.length > 0;
            if (!hasAnn) return false;
        }
        if (filters.hasAnnotation === false) {
            const hasAnn = position.annotations && position.annotations.length > 0;
            if (hasAnn) return false;
        }

        // Tags filter
        if (filters.tags && filters.tags.length > 0) {
            const posTags = (position.tags || []).map(t =>
                typeof t === 'string' ? t.toLowerCase() : (t.name || '').toLowerCase()
            );

            const filterTags = filters.tags.map(t => t.toLowerCase());
            const mode = (filters.tagMode || 'OR').toUpperCase();

            if (mode === 'AND') {
                // ALL filter tags must be present
                if (!filterTags.every(ft => posTags.includes(ft))) return false;
            } else {
                // ANY filter tag must be present
                if (!filterTags.some(ft => posTags.includes(ft))) return false;
            }
        }

        return true;
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.QueryEngine = {

        /**
         * Query all positions from IndexedDB with the given filters.
         * Returns a Promise resolving to an array of matching positions.
         *
         * @param {Object} filters - See _matchesFilters for filter spec
         * @param {Object} [options] - { limit, sortBy, sortOrder }
         * @returns {Promise<Array>}
         */
        queryPositions: async function(filters, options) {
            const opts = options || {};
            const limit = opts.limit || 500;
            const sortBy = opts.sortBy || 'dateModified';
            const sortOrder = opts.sortOrder || 'desc';

            // Load all positions from IndexedDB
            const db = window.LibraryDB;
            if (!db) {
                console.warn('QueryEngine: LibraryDB not available');
                return [];
            }

            let positions;
            try {
                positions = await db.getAll(db.STORES.POSITIONS);
            } catch (err) {
                console.error('QueryEngine: Failed to load positions', err);
                return [];
            }

            if (!positions || positions.length === 0) return [];

            // Filter out archived positions by default
            let results = positions.filter(p => !p.isArchived);

            // Apply filters
            if (filters && Object.keys(filters).length > 0) {
                results = results.filter(p => _matchesFilters(p, filters));
            }

            // Sort
            results.sort((a, b) => {
                const aVal = a[sortBy] || 0;
                const bVal = b[sortBy] || 0;
                return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            });

            // Limit
            if (results.length > limit) {
                results = results.slice(0, limit);
            }

            return results;
        },

        /**
         * Count positions matching filters (without returning full data).
         */
        countPositions: async function(filters) {
            const results = await this.queryPositions(filters, { limit: 10000 });
            return results.length;
        },

        /**
         * Check if any filter is active (non-null/empty).
         */
        hasActiveFilters: function(filters) {
            if (!filters) return false;
            return !!(
                filters.sideToMove ||
                filters.pieceCountMin != null ||
                filters.pieceCountMax != null ||
                filters.evalMin != null ||
                filters.evalMax != null ||
                filters.hasAnnotation != null ||
                filters.hasEngineReport != null ||
                (filters.tags && filters.tags.length > 0) ||
                (filters.material && Object.keys(filters.material).length > 0)
            );
        },

        // Expose helpers for external use
        parseMaterial: _parseMaterial,
        getSideToMove: _getSideToMove,
        getEvalCp: _getEvalCp
    };

})();
