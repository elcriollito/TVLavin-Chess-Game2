/**
 * CAISSA Position Forge UI — Modal Editor
 *
 * Provides a modal with a chessboard.js instance and a toolbar
 * for flip, mirror, color swap, clear, undo, and redo operations.
 * Exposes window.PositionForgeUI for global access.
 */

(function() {
    'use strict';

    let _board = null;
    let _isOpen = false;
    let _overlay = null;

    // ========================================
    // MODAL HTML TEMPLATE
    // ========================================

    const MODAL_HTML = `
        <div class="forge-modal">
            <div class="forge-header">
                <h3 class="forge-title"><i class="fas fa-hammer"></i> Position Forge</h3>
                <button type="button" class="forge-close-btn" data-forge="close" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="forge-board-container">
                <div id="forgeBoard" style="width: 100%; max-width: 400px;"></div>
            </div>

            <div class="forge-toolbar">
                <button type="button" class="forge-toolbar-btn" data-forge="flip" title="Rotate 180°">
                    <i class="fas fa-sync-alt"></i> Flip
                </button>
                <button type="button" class="forge-toolbar-btn" data-forge="mirrorH" title="Mirror Horizontally">
                    <i class="fas fa-arrows-alt-h"></i> Mirror H
                </button>
                <button type="button" class="forge-toolbar-btn" data-forge="mirrorV" title="Mirror Vertically">
                    <i class="fas fa-arrows-alt-v"></i> Mirror V
                </button>
                <button type="button" class="forge-toolbar-btn" data-forge="colorSwap" title="Swap Colors">
                    <i class="fas fa-exchange-alt"></i> Colors
                </button>
                <span class="forge-toolbar-divider"></span>
                <button type="button" class="forge-toolbar-btn" data-forge="clear" title="Clear Board">
                    <i class="fas fa-eraser"></i> Clear
                </button>
                <button type="button" class="forge-toolbar-btn" data-forge="reset" title="Starting Position">
                    <i class="fas fa-chess-board"></i> Reset
                </button>
                <span class="forge-toolbar-divider"></span>
                <button type="button" class="forge-toolbar-btn" data-forge="undo" title="Undo" disabled>
                    <i class="fas fa-undo"></i> Undo
                </button>
                <button type="button" class="forge-toolbar-btn" data-forge="redo" title="Redo" disabled>
                    <i class="fas fa-redo"></i> Redo
                </button>
            </div>

            <div class="forge-fen-row">
                <input type="text" class="forge-fen-input" id="forgeFenInput" readonly aria-label="FEN string">
            </div>

            <div class="forge-actions">
                <button type="button" class="forge-action-btn secondary" data-forge="loadAnalysis">
                    <i class="fas fa-chess"></i> Load into Analysis
                </button>
                <button type="button" class="forge-action-btn primary" data-forge="saveLibrary">
                    <i class="fas fa-bookmark"></i> Save to Library
                </button>
            </div>
        </div>
    `;

    // ========================================
    // INTERNAL HELPERS
    // ========================================

    /**
     * Extract just the position part of a FEN (first field) for chessboard.js.
     */
    function _fenToPosition(fen) {
        return fen.split(/\s+/)[0];
    }

    /**
     * Update the board display and FEN input.
     */
    function _refreshUI() {
        const forge = window.PositionForge;
        if (!forge) return;

        const fen = forge.getFEN();

        // Update chessboard.js
        if (_board) {
            _board.position(_fenToPosition(fen), false);
        }

        // Update FEN input
        const fenInput = document.getElementById('forgeFenInput');
        if (fenInput) {
            fenInput.value = fen;
        }

        // Update undo/redo button states
        const undoBtn = _overlay?.querySelector('[data-forge="undo"]');
        const redoBtn = _overlay?.querySelector('[data-forge="redo"]');
        if (undoBtn) undoBtn.disabled = !forge.canUndo();
        if (redoBtn) redoBtn.disabled = !forge.canRedo();
    }

    /**
     * Handle toolbar button clicks.
     */
    function _handleAction(action) {
        const forge = window.PositionForge;
        if (!forge) return;

        switch (action) {
            case 'close':
                window.PositionForgeUI.close();
                break;

            case 'flip':
                forge.flipBoard();
                _refreshUI();
                break;

            case 'mirrorH':
                forge.mirrorHorizontal();
                _refreshUI();
                break;

            case 'mirrorV':
                forge.mirrorVertical();
                _refreshUI();
                break;

            case 'colorSwap':
                forge.colorSwap();
                _refreshUI();
                break;

            case 'clear':
                forge.clearBoard();
                _refreshUI();
                break;

            case 'reset':
                forge.resetBoard();
                _refreshUI();
                break;

            case 'undo':
                if (forge.undo()) _refreshUI();
                break;

            case 'redo':
                if (forge.redo()) _refreshUI();
                break;

            case 'saveLibrary':
                _saveToLibrary();
                break;

            case 'loadAnalysis':
                _loadIntoAnalysis();
                break;
        }
    }

    /**
     * Save current FEN to the CAISSA Library.
     */
    function _saveToLibrary() {
        const forge = window.PositionForge;
        if (!forge) return;

        const fen = forge.getFEN();
        const lib = window.CaissaLibrary;

        if (lib && typeof lib.savePosition === 'function') {
            lib.savePosition({
                fen: fen,
                title: 'Forge Position',
                source: 'forge',
                notes: 'Created with Position Forge'
            }).then(result => {
                if (result) {
                    _showToast('Position saved to library');
                }
            }).catch(err => {
                console.error('Forge: Failed to save position', err);
                _showToast('Failed to save position', true);
            });
        } else {
            // Fallback: dispatch event for library to pick up
            window.dispatchEvent(new CustomEvent('caissa-forge-save', {
                detail: { fen }
            }));
            _showToast('Position ready — open Library to save');
        }
    }

    /**
     * Load current FEN into the main analysis board.
     */
    function _loadIntoAnalysis() {
        const forge = window.PositionForge;
        if (!forge) return;

        const fen = forge.getFEN();

        // Try the main app's loadFEN function
        if (window.App && typeof window.App.loadFEN === 'function') {
            window.App.loadFEN(fen);
            window.PositionForgeUI.close();
            _showToast('Position loaded into analysis');
            return;
        }

        // Try setting the game FEN directly
        if (window.game && typeof window.game.load === 'function') {
            window.game.load(fen);
            if (window.board && typeof window.board.position === 'function') {
                window.board.position(_fenToPosition(fen), false);
            }
            window.PositionForgeUI.close();
            _showToast('Position loaded');
            return;
        }

        // Dispatch event as fallback
        window.dispatchEvent(new CustomEvent('caissa-forge-load', {
            detail: { fen }
        }));
        window.PositionForgeUI.close();
    }

    /**
     * Show a brief toast notification.
     */
    function _showToast(message, isError) {
        // Use the PremiumPage notification if available
        if (typeof PremiumPage !== 'undefined' && PremiumPage.showNotification) {
            PremiumPage.showNotification(message, isError ? 'error' : 'success');
            return;
        }

        // Minimal fallback toast
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
            'padding:10px 20px;border-radius:8px;font-size:0.85rem;z-index:10001;' +
            'color:#e8e6e3;background:' + (isError ? '#c0392b' : '#27ae60') + ';' +
            'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ========================================
    // PUBLIC API
    // ========================================

    window.PositionForgeUI = {

        /**
         * Initialize — inject modal HTML into document body.
         * Call once on page load.
         */
        init: function() {
            if (_overlay) return; // Already initialized

            _overlay = document.createElement('div');
            _overlay.className = 'forge-overlay';
            _overlay.innerHTML = MODAL_HTML;
            document.body.appendChild(_overlay);

            // Delegate click events
            _overlay.addEventListener('click', function(e) {
                // Click on overlay background to close
                if (e.target === _overlay) {
                    window.PositionForgeUI.close();
                    return;
                }

                // Find closest button with data-forge attribute
                const btn = e.target.closest('[data-forge]');
                if (btn) {
                    _handleAction(btn.dataset.forge);
                }
            });

            // Keyboard: Escape to close, Ctrl+Z to undo, Ctrl+Y to redo
            document.addEventListener('keydown', function(e) {
                if (!_isOpen) return;

                if (e.key === 'Escape') {
                    window.PositionForgeUI.close();
                    e.preventDefault();
                } else if (e.ctrlKey && e.key === 'z') {
                    _handleAction('undo');
                    e.preventDefault();
                } else if (e.ctrlKey && e.key === 'y') {
                    _handleAction('redo');
                    e.preventDefault();
                }
            });
        },

        /**
         * Open the Forge modal with a given FEN.
         */
        open: function(fen) {
            if (!_overlay) this.init();

            const forge = window.PositionForge;
            if (!forge) {
                console.error('PositionForge engine not loaded');
                return;
            }

            // Set FEN and clear history for this editing session
            forge.clearHistory();
            forge.setFromFEN(fen);
            // Clear undo from the setFromFEN call (first load isn't undoable)
            forge.clearHistory();

            // Show modal
            _overlay.classList.add('active');
            _isOpen = true;
            document.body.style.overflow = 'hidden';

            // Create or update chessboard.js instance
            const boardEl = document.getElementById('forgeBoard');
            if (boardEl && typeof Chessboard !== 'undefined') {
                if (_board) {
                    _board.destroy();
                }
                _board = Chessboard('forgeBoard', {
                    position: _fenToPosition(fen),
                    pieceTheme: 'https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/img/chesspieces/wikipedia/{piece}.png',
                    showNotation: true,
                    draggable: false
                });
            }

            _refreshUI();
        },

        /**
         * Close the Forge modal.
         */
        close: function() {
            if (_overlay) {
                _overlay.classList.remove('active');
            }
            _isOpen = false;
            document.body.style.overflow = '';
        },

        /**
         * Check if the Forge is currently open.
         */
        isOpen: function() {
            return _isOpen;
        }
    };

})();
