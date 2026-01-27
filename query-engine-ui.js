/**
 * CAISSA Query Engine UI — Advanced Filters Panel
 *
 * Injects a collapsible "Advanced Filters" panel into the Library page.
 * Collects filter inputs and delegates to QueryEngine for matching.
 * Exposes window.QueryEngineUI for global access.
 */

(function() {
    'use strict';

    // Unicode chess piece symbols for the material filter
    const PIECE_SYMBOLS = {
        K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659',
        k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F'
    };

    let _panel = null;
    let _lastResults = null;

    // ========================================
    // PANEL HTML TEMPLATE
    // ========================================

    function _buildPanelHTML() {
        return `
            <button type="button" class="qe-toggle">
                <span class="qe-toggle-label">
                    <i class="fas fa-filter"></i> Advanced Filters
                    <span class="qe-active-badge" id="qeActiveBadge">Active</span>
                </span>
                <i class="fas fa-chevron-down qe-toggle-chevron"></i>
            </button>

            <div class="qe-body">
                <!-- Side to Move -->
                <div class="qe-row">
                    <span class="qe-label">Side to move</span>
                    <select class="qe-select" id="qeSideToMove">
                        <option value="">Any</option>
                        <option value="w">White</option>
                        <option value="b">Black</option>
                    </select>
                </div>

                <!-- Piece Count Range -->
                <div class="qe-row">
                    <span class="qe-label">Piece count</span>
                    <input type="number" class="qe-input" id="qePieceMin" min="2" max="32" placeholder="Min">
                    <span class="qe-range-sep">&ndash;</span>
                    <input type="number" class="qe-input" id="qePieceMax" min="2" max="32" placeholder="Max">
                </div>

                <!-- Eval Range -->
                <div class="qe-row">
                    <span class="qe-label">Eval (cp)</span>
                    <input type="number" class="qe-input" id="qeEvalMin" placeholder="Min">
                    <span class="qe-range-sep">&ndash;</span>
                    <input type="number" class="qe-input" id="qeEvalMax" placeholder="Max">
                </div>

                <!-- Material (White pieces) -->
                <div class="qe-row">
                    <span class="qe-label">White</span>
                    <div class="qe-material-grid">
                        ${_materialInputs('Q', 'R', 'B', 'N', 'P')}
                    </div>
                </div>

                <!-- Material (Black pieces) -->
                <div class="qe-row">
                    <span class="qe-label">Black</span>
                    <div class="qe-material-grid">
                        ${_materialInputs('q', 'r', 'b', 'n', 'p')}
                    </div>
                </div>

                <!-- Checkboxes row -->
                <div class="qe-row">
                    <span class="qe-label">Filters</span>
                    <div class="qe-checkbox-row">
                        <input type="checkbox" class="qe-checkbox" id="qeHasAnnotation">
                        <label class="qe-checkbox-label" for="qeHasAnnotation">Has annotations</label>
                    </div>
                    <div class="qe-checkbox-row" style="margin-left: 12px;">
                        <input type="checkbox" class="qe-checkbox" id="qeHasEngine">
                        <label class="qe-checkbox-label" for="qeHasEngine">Analyzed</label>
                    </div>
                </div>

                <!-- Tags -->
                <div class="qe-row">
                    <span class="qe-label">Tags</span>
                    <input type="text" class="qe-input" id="qeTags" placeholder="tag1, tag2, ...">
                    <select class="qe-select" id="qeTagMode" style="max-width: 70px;">
                        <option value="OR">OR</option>
                        <option value="AND">AND</option>
                    </select>
                </div>

                <!-- Actions -->
                <div class="qe-actions">
                    <button type="button" class="qe-btn secondary" id="qeClearBtn">
                        <i class="fas fa-times"></i> Clear
                    </button>
                    <button type="button" class="qe-btn primary" id="qeSearchBtn">
                        <i class="fas fa-search"></i> Search
                    </button>
                </div>

                <!-- Results count placeholder -->
                <div class="qe-results-count" id="qeResultsCount" style="display:none;"></div>
            </div>
        `;
    }

    /**
     * Generate material input cells for a set of piece types.
     */
    function _materialInputs(...pieces) {
        return pieces.map(p => `
            <div class="qe-material-item">
                <span class="piece-symbol">${PIECE_SYMBOLS[p]}</span>
                <input type="number" class="qe-input" id="qeMat_${p}" min="0" max="9" placeholder="0">
            </div>
        `).join('');
    }

    // ========================================
    // FILTER COLLECTION
    // ========================================

    /**
     * Read all filter values from the panel inputs.
     * Returns a filters object compatible with QueryEngine.queryPositions().
     */
    function _collectFilters() {
        const filters = {};

        const stm = document.getElementById('qeSideToMove')?.value;
        if (stm) filters.sideToMove = stm;

        const pieceMin = document.getElementById('qePieceMin')?.value;
        if (pieceMin !== '' && pieceMin != null) filters.pieceCountMin = parseInt(pieceMin, 10);

        const pieceMax = document.getElementById('qePieceMax')?.value;
        if (pieceMax !== '' && pieceMax != null) filters.pieceCountMax = parseInt(pieceMax, 10);

        const evalMin = document.getElementById('qeEvalMin')?.value;
        if (evalMin !== '' && evalMin != null) filters.evalMin = parseInt(evalMin, 10);

        const evalMax = document.getElementById('qeEvalMax')?.value;
        if (evalMax !== '' && evalMax != null) filters.evalMax = parseInt(evalMax, 10);

        const hasAnn = document.getElementById('qeHasAnnotation')?.checked;
        if (hasAnn) filters.hasAnnotation = true;

        const hasEngine = document.getElementById('qeHasEngine')?.checked;
        if (hasEngine) filters.hasEngineReport = true;

        // Material
        const materialPieces = ['Q', 'R', 'B', 'N', 'P', 'q', 'r', 'b', 'n', 'p'];
        const material = {};
        for (const p of materialPieces) {
            const val = document.getElementById('qeMat_' + p)?.value;
            if (val !== '' && val != null && parseInt(val, 10) > 0) {
                material[p] = parseInt(val, 10);
            }
        }
        if (Object.keys(material).length > 0) filters.material = material;

        // Tags
        const tagsInput = document.getElementById('qeTags')?.value?.trim();
        if (tagsInput) {
            filters.tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
            filters.tagMode = document.getElementById('qeTagMode')?.value || 'OR';
        }

        return filters;
    }

    /**
     * Clear all filter inputs.
     */
    function _clearFilters() {
        const ids = ['qeSideToMove', 'qePieceMin', 'qePieceMax', 'qeEvalMin', 'qeEvalMax',
                     'qeTags', 'qeTagMode'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.tagName === 'SELECT' ? el.options[0].value : '';
        });

        ['qeHasAnnotation', 'qeHasEngine'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });

        const materialPieces = ['Q', 'R', 'B', 'N', 'P', 'q', 'r', 'b', 'n', 'p'];
        materialPieces.forEach(p => {
            const el = document.getElementById('qeMat_' + p);
            if (el) el.value = '';
        });

        _updateActiveBadge(false);
        _hideResultsCount();

        // Dispatch event to reset library view
        window.dispatchEvent(new CustomEvent('caissa-query-clear'));
    }

    /**
     * Show/hide the "Active" badge on the toggle.
     */
    function _updateActiveBadge(active) {
        if (_panel) {
            _panel.classList.toggle('has-filters', active);
        }
    }

    /**
     * Show results count.
     */
    function _showResultsCount(count, total) {
        const el = document.getElementById('qeResultsCount');
        if (el) {
            el.style.display = 'block';
            el.innerHTML = `<strong>${count}</strong> of ${total} positions match`;
        }
    }

    /**
     * Hide results count.
     */
    function _hideResultsCount() {
        const el = document.getElementById('qeResultsCount');
        if (el) el.style.display = 'none';
    }

    // ========================================
    // SEARCH EXECUTION
    // ========================================

    /**
     * Run the search with current filters.
     */
    async function _runSearch() {
        const qe = window.QueryEngine;
        if (!qe) {
            console.warn('QueryEngineUI: QueryEngine not loaded');
            return;
        }

        const filters = _collectFilters();
        const hasFilters = qe.hasActiveFilters(filters);

        _updateActiveBadge(hasFilters);

        if (!hasFilters) {
            _hideResultsCount();
            window.dispatchEvent(new CustomEvent('caissa-query-clear'));
            return;
        }

        const searchBtn = document.getElementById('qeSearchBtn');
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
        }

        try {
            const results = await qe.queryPositions(filters);
            const total = await qe.countPositions({});
            _lastResults = results;

            _showResultsCount(results.length, total);

            // Dispatch results for Library UI to render
            window.dispatchEvent(new CustomEvent('caissa-query-results', {
                detail: { results, filters }
            }));
        } catch (err) {
            console.error('QueryEngineUI: Search failed', err);
        } finally {
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
            }
        }
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.QueryEngineUI = {

        /**
         * Initialize — inject the filter panel into the Library page.
         * Looks for a container with id="queryEngineMount" or inserts
         * after the library search bar.
         */
        init: function() {
            if (_panel) return; // Already initialized

            // Find mount point
            let mountPoint = document.getElementById('queryEngineMount');

            if (!mountPoint) {
                // Try to insert after the library search section
                const searchSection = document.querySelector('.library-search-section') ||
                                     document.querySelector('.library-search') ||
                                     document.querySelector('#librarySearch');
                if (searchSection) {
                    mountPoint = document.createElement('div');
                    mountPoint.id = 'queryEngineMount';
                    searchSection.parentNode.insertBefore(mountPoint, searchSection.nextSibling);
                }
            }

            if (!mountPoint) {
                console.warn('QueryEngineUI: No mount point found');
                return;
            }

            // Create panel
            _panel = document.createElement('div');
            _panel.className = 'qe-panel';
            _panel.innerHTML = _buildPanelHTML();
            mountPoint.appendChild(_panel);

            // Bind events
            const toggle = _panel.querySelector('.qe-toggle');
            if (toggle) {
                toggle.addEventListener('click', () => {
                    _panel.classList.toggle('expanded');
                });
            }

            const searchBtn = document.getElementById('qeSearchBtn');
            if (searchBtn) {
                searchBtn.addEventListener('click', () => _runSearch());
            }

            const clearBtn = document.getElementById('qeClearBtn');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => _clearFilters());
            }

            // Enter key in inputs triggers search
            _panel.querySelectorAll('.qe-input, .qe-select').forEach(el => {
                el.addEventListener('keydown', e => {
                    if (e.key === 'Enter') _runSearch();
                });
            });

            console.log('QueryEngineUI: Initialized');
        },

        /**
         * Get the last search results.
         */
        getLastResults: function() {
            return _lastResults;
        },

        /**
         * Programmatically trigger a search.
         */
        search: function() {
            return _runSearch();
        },

        /**
         * Programmatically clear filters.
         */
        clear: function() {
            _clearFilters();
        },

        /**
         * Check if the panel is expanded.
         */
        isExpanded: function() {
            return _panel?.classList.contains('expanded') || false;
        }
    };

})();
