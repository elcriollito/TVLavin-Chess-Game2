/**
 * CAISSA Analyze Section
 * Handles game import and Stockfish analysis
 *
 * Part of Phase 2: Section Migration
 * Analyze Page Status: v1.2 Production Ready
 */

const AnalyzeSection = {
    // State
    currentSource: 'game-url',
    loadedGame: null,
    session: null,
    board: null,
    activeHandoffId: null,
    pendingPromotion: null,
    fetchedGames: [],
    selectedFetchedGameIndex: -1,
    currentMoveIndex: -1,
    isAnalyzing: false,
    analysisResults: [],
    positionAnalyses: [],
    analysisEngine: null,
    analysisToken: 0,
    analysisPhase: 'idle',
    analyzedPositions: 0,
    totalPositions: 0,
    reviewDepth: 12,
    reviewRetryDepth: 8,
    reviewPositionTimeoutMs: 10000,
    reviewContext: null,
    activeReviewSearchCancel: null,
    reviewRunMetrics: null,
    lastReviewMetrics: null,
    keyboardHandler: null,
    workspaceViewHandler: null,
    boardFlipped: false,
    studyModeInitialized: false,
    tapSource: null,
    tapTargets: [],
    liveEngineEnabled: false,
    liveEngineToken: 0,
    liveEngineTimer: null,
    liveEngineDebounceMs: 350,
    liveEngineOwner: null,
    livePositionAnalyses: {},
    liveCurrentFen: null,
    liveCurrentResult: null,
    liveMultiPvCount: 4,
    liveMultiPvLines: {},
    liveEngineGenerationId: null,
    liveUiTimer: null,
    liveUiPendingResult: null,
    liveUiLastRenderAt: 0,
    liveUiThrottleMs: 140,
    setupModeActive: false,
    setupDraft: null,
    setupSelectedPiece: null,
    setupSourceSquare: null,
    setupBoardClickHandler: null,
    setupPaletteDrag: null,
    setupPaletteDragHandlers: null,
    setupSuppressPaletteClickUntil: 0,
    boardDragCleanupTimer: null,
    gameUrlRequestToken: 0,
    gameUrlAbortController: null,
    accountFetchToken: 0,
    activeFetchedGamesTarget: null,
    pendingSetupEntryMode: null,

    // DOM cache
    elements: {},

    renderEmptyState(target, options = {}) {
        if (!target) return;
        const payload = { icon: false, ...options };
        if (window.CaissaUI?.createEmptyState) {
            const node = window.CaissaUI.createEmptyState(payload);
            node.classList.add('caissa-ui-empty-state--compact');
            target.replaceChildren(node);
            return;
        }
        target.innerHTML = `<p class="empty-state">${this.escapeHtml(payload.message || payload.title || 'Nothing to show yet.')}</p>`;
    },

    /**
     * Initialize Analyze section
     */
    init() {
        console.log('[Analyze] Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.updateNavigationControls();
        console.log('[Analyze] Ready');
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Tabs
            tabs: document.querySelectorAll('#analyzeSection .analyze-tab'),
            panels: {
                'game-url': document.getElementById('analyzePanelGameUrl'),
                'chess.com': document.getElementById('analyzePanelChessCom'),
                lichess: document.getElementById('analyzePanelLichess')
            },

            // Direct public game import
            gameUrl: document.getElementById('analyzeGameUrl'),
            gameUrlLoad: document.getElementById('analyzeGameUrlLoad'),
            gameUrlMessage: document.getElementById('analyzeGameUrlMessage'),
            gameUrlChessComUsernameGroup: document.getElementById('analyzeGameUrlChessComUsernameGroup'),
            gameUrlChessComUsername: document.getElementById('analyzeGameUrlChessComUsername'),

            // Chess.com account history
            provider: document.getElementById('analyzeProvider'),
            username: document.getElementById('analyzeUsername'),
            gameCount: document.getElementById('analyzeGameCount'),
            fetchBtn: document.getElementById('analyzeFetchBtn'),
            fetchedGames: document.getElementById('analyzeFetchedGames'),

            // Lichess account history
            lichessUsername: document.getElementById('analyzeLichessUsername'),
            lichessGameCount: document.getElementById('analyzeLichessGameCount'),
            lichessFetchBtn: document.getElementById('analyzeLichessFetchBtn'),
            lichessFetchedGames: document.getElementById('analyzeLichessFetchedGames'),

            // PGN import
            pgnInput: document.getElementById('analyzePgnInput'),
            pgnFile: document.getElementById('analyzePgnFile'),
            pgnFileName: document.getElementById('analyzePgnFileName'),
            loadPgnBtn: document.getElementById('analyzeLoadPgnBtn'),

            // CAISSA games
            openLibraryBtn: document.getElementById('analyzeOpenLibrary'),

            // Metadata
            gameSource: document.getElementById('analyzeGameSource'),
            whitePlayer: document.getElementById('analyzeWhitePlayer'),
            blackPlayer: document.getElementById('analyzeBlackPlayer'),
            gameResult: document.getElementById('analyzeGameResult'),
            termination: document.getElementById('analyzeTermination'),
            status: document.getElementById('analyzeStatus'),

            // Analysis controls
            startBtn: document.getElementById('analyzeStartBtn'),
            stopBtn: document.getElementById('analyzeStopBtn'),
            progressBar: document.getElementById('analyzeProgressBar'),
            progressFill: document.getElementById('analyzeProgressFill'),
            progressText: document.getElementById('analyzeProgressText'),
            mentor: document.getElementById('analyzeMoveEvidence'),
            evalBar: document.getElementById('analyzeEvalBar'),
            evalFill: document.getElementById('analyzeEvalFill'),
            evalScore: document.getElementById('analyzeEvalScore'),
            reviewSummary: document.getElementById('analyzeReviewSummary'),
            criticalMoments: document.getElementById('analyzeCriticalMoments'),

            // Move list
            moveList: document.getElementById('analyzeMoveList'),
            navFirst: document.getElementById('analyzeNavFirst'),
            navPrev: document.getElementById('analyzeNavPrev'),
            navNext: document.getElementById('analyzeNavNext'),
            navLast: document.getElementById('analyzeNavLast'),
            newAnalysis: document.getElementById('analyzeNewBtn'),
            saveAnalysis: document.getElementById('analyzeSaveBtn'),
            reviewAnalysis: document.getElementById('analyzeReviewBtn'),
            engineToggle: document.getElementById('analyzeEngineToggle'),
            undoMove: document.getElementById('analyzeUndoMove'),
            resetBoard: document.getElementById('analyzeResetBoard'),
            flipBoard: document.getElementById('analyzeFlipBoard'),
            setupBack: document.getElementById('analyzeSetupBack'),
            setupTurn: document.getElementById('analyzeSetupTurn'),
            setupFen: document.getElementById('analyzeSetupFen'),
            setupPgn: document.getElementById('analyzePgnInput'),
            setupMessage: document.getElementById('analyzeSetupMessage'),
            setupLoad: document.getElementById('analyzeSetupLoad'),
            setupFlip: document.getElementById('analyzeSetupFlip'),
            setupReset: document.getElementById('analyzeSetupReset'),
            setupClear: document.getElementById('analyzeSetupClear'),
            setupPieces: document.querySelectorAll('#analyzeV2PanelSetup [data-setup-piece]'),
            setupCastling: document.querySelectorAll('#analyzeV2PanelSetup [data-setup-castling]')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Tab switching
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const source = e.currentTarget.dataset.source;
                this.switchTab(source);
            });
            tab.addEventListener('keydown', (event) => this.handleSourceTabKeydown(event));
        });

        this.elements.gameUrlLoad?.addEventListener('click', () => this.importGameUrl());
        this.elements.gameUrl?.addEventListener('input', () => {
            this.cancelGameUrlImport();
            if (this.elements.gameUrlChessComUsername) this.elements.gameUrlChessComUsername.value = '';
            this.setGameUrlMessage();
            this.syncGameUrlContext();
        });
        this.elements.gameUrl?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.importGameUrl();
        });
        this.elements.gameUrlChessComUsername?.addEventListener('input', () => this.cancelGameUrlImport());
        this.elements.gameUrlChessComUsername?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.importGameUrl();
        });

        // Existing account-history fetch paths, now presented per provider.
        this.elements.fetchBtn?.addEventListener('click', () => this.fetchOnlineGames('chess.com'));
        this.elements.lichessFetchBtn?.addEventListener('click', () => this.fetchOnlineGames('lichess'));
        [
            [this.elements.username, 'chess.com'],
            [this.elements.lichessUsername, 'lichess']
        ].forEach(([input, provider]) => input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.fetchOnlineGames(provider);
        }));

        // PGN load
        this.elements.loadPgnBtn?.addEventListener('click', () => {
            this.loadPgn();
        });

        // PGN file input
        this.elements.pgnFile?.addEventListener('change', (e) => {
            this.handlePgnFile(e);
        });

        // Open library
        this.elements.openLibraryBtn?.addEventListener('click', () => {
            this.openLibrary();
        });

        // Start analysis
        this.elements.startBtn?.addEventListener('click', () => {
            this.startAnalysis();
        });

        // Stop analysis
        this.elements.stopBtn?.addEventListener('click', () => {
            this.stopAnalysis();
        });

        this.elements.navFirst?.addEventListener('click', () => this.jumpToMove(-1));
        this.elements.navPrev?.addEventListener('click', () => this.jumpToMove(this.currentMoveIndex - 1));
        this.elements.navNext?.addEventListener('click', () => this.jumpToMove(this.currentMoveIndex + 1));
        this.elements.navLast?.addEventListener('click', () => {
            this.jumpToMove(this.getLoadedMoves().length - 1);
        });
        this.elements.newAnalysis?.addEventListener('click', () => this.openNewAnalysis());
        this.elements.saveAnalysis?.addEventListener('click', () => this.saveAnalysisPgn());
        this.elements.reviewAnalysis?.addEventListener('click', () => this.startReview());
        this.elements.engineToggle?.addEventListener('click', () => this.toggleLiveEngine());
        this.elements.undoMove?.addEventListener('click', () => this.undoStudyMove());
        this.elements.resetBoard?.addEventListener('click', () => this.resetStudyBoard({ explicit: true }));
        this.elements.flipBoard?.addEventListener('click', () => this.flipAnalyzeBoard());
        this.elements.setupBack?.addEventListener('click', () => {
            window.CaissaAnalyzeV2Shell?.selectView?.('analysis', { focus: true });
        });
        this.elements.setupPieces?.forEach(button => button.addEventListener('click', () => {
            if (performance.now() < this.setupSuppressPaletteClickUntil) return;
            this.selectSetupPiece(button.dataset.setupPiece);
        }));
        this.bindSetupPaletteDrag();
        this.elements.setupTurn?.addEventListener('change', () => {
            if (!this.setupDraft?.setTurn(this.elements.setupTurn.value)) return;
            this.syncSetupDraftUI({ board: false });
        });
        this.elements.setupCastling?.forEach(input => input.addEventListener('change', () => {
            if (!this.setupDraft?.setCastling(input.dataset.setupCastling, input.checked)) return;
            this.syncSetupDraftUI({ board: false, controls: false });
        }));
        this.elements.setupFen?.addEventListener('input', () => this.applySetupFenInput());
        this.elements.setupPgn?.addEventListener('input', () => this.handleSetupPgnInput());
        this.elements.setupFlip?.addEventListener('click', () => this.flipAnalyzeBoard());
        this.elements.setupReset?.addEventListener('click', () => this.resetSetupDraft());
        this.elements.setupClear?.addEventListener('click', () => this.clearSetupDraft());
        this.elements.setupLoad?.addEventListener('click', () => this.loadSetupDraft());
        if (!this.setupBoardClickHandler) {
            this.setupBoardClickHandler = (event) => {
                if (!this.setupModeActive) return;
                const square = event.target.closest?.('[data-square]')?.dataset?.square;
                if (!square) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.detail >= 2 && this.setupDraft?.getPiece(square)) {
                    this.setupSourceSquare = null;
                    this.setupDraft.removePiece(square);
                    this.syncSetupDraftUI();
                    this.setSetupMessage(`Piece removed from ${square}.`);
                    return;
                }
                this.handleSetupBoardTap(square);
            };
            document.getElementById('analyzeChessboard')
                ?.addEventListener('click', this.setupBoardClickHandler);
        }

        if (!this.workspaceViewHandler) {
            this.workspaceViewHandler = (event) => this.handleWorkspaceViewChange(event.detail?.view);
            document.querySelector('[data-caissa-analyze-v2]')
                ?.addEventListener('caissa:analyze-v2-view-change', this.workspaceViewHandler);
        }

        this.bindKeyboardNavigation();
    },

    handleWorkspaceViewChange(view) {
        if (view !== 'games') this.cancelGameUrlImport();
        if (view !== 'analysis' && this.isAnalyzing) {
            this.stopAnalysis({ restoreLive: false, reason: 'workspace-changed' });
        }
        if (view === 'setup') {
            const entryMode = this.pendingSetupEntryMode === 'new' ? 'new' : 'edit';
            this.pendingSetupEntryMode = null;
            this.enterSetupPosition({ startClean: entryMode === 'new' });
        }
        else if (this.setupModeActive) this.cancelSetupPosition();

        if (!this.liveEngineEnabled) return;
        if (view === 'analysis') {
            this.refreshLiveEvaluation();
            return;
        }

        clearTimeout(this.liveEngineTimer);
        clearTimeout(this.liveUiTimer);
        this.liveEngineToken += 1;
        this.liveEngineOwner = null;
        this.liveEngineGenerationId = null;
        this.liveMultiPvLines = {};
        this.liveUiTimer = null;
        this.liveUiPendingResult = null;
        this.liveUiLastRenderAt = 0;
        this.liveCurrentResult = null;
        const canceled = this.analysisEngine?.cancelAttributedSearch?.();
        if (!canceled) this.analysisEngine?.stop?.();
        this.updateEvaluationBar();
        this.updateLiveMentorPanel({ off: true });
    },

    enterSetupPosition({ startClean = false } = {}) {
        if (this.setupModeActive && !startClean) return true;
        const currentFen = this.getGame()?.fen?.();
        const factory = window.CaissaAnalyzeSetupDraft;
        const draftFen = startClean ? factory?.START_FEN : currentFen;
        if (!draftFen || !factory?.create) {
            this.setSetupMessage('Position setup is unavailable.', 'error');
            return false;
        }
        this.cancelSetupPaletteDrag();
        this.setupDraft = factory.create({ fen: draftFen });
        this.setupModeActive = true;
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.setupSuppressPaletteClickUntil = 0;
        if (this.elements.setupPgn) this.elements.setupPgn.value = '';
        this.syncSetupDraftUI();
        this.setSetupMessage(startClean
            ? 'New analysis ready from the standard starting position. Changes commit only when Load is pressed.'
            : 'Choose a piece, then a square. Drag a board piece outside the board to remove it.');
        return true;
    },

    cancelSetupPosition() {
        if (!this.setupModeActive) return false;
        this.cancelSetupPaletteDrag();
        this.setupModeActive = false;
        this.setupDraft = null;
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.setupSuppressPaletteClickUntil = 0;
        this.clearSetupBoardHighlights();
        const game = this.getGame();
        if (game) this.board?.position(game.fen(), false);
        this.updateEvaluationBar();
        return true;
    },

    selectSetupPiece(piece) {
        if (!this.setupModeActive || !this.setupDraft) return false;
        this.setupSelectedPiece = this.setupSelectedPiece === piece ? null : piece;
        this.setupSourceSquare = null;
        this.elements.setupPieces?.forEach(button => {
            const selected = button.dataset.setupPiece === this.setupSelectedPiece;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        this.clearSetupBoardHighlights();
        this.setSetupMessage(this.setupSelectedPiece
            ? 'Selected piece ready. Choose a board square.'
            : 'Piece selection cleared.');
        return true;
    },

    bindSetupPaletteDrag() {
        if (this.setupPaletteDragHandlers || !this.elements.setupPieces?.length) return;
        const pointerDown = (event) => {
            if (!this.setupModeActive || !this.setupDraft) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            const button = event.currentTarget;
            const image = button.querySelector('img');
            const piece = button.dataset.setupPiece;
            if (!image || !piece) return;
            event.preventDefault();
            this.cancelSetupPaletteDrag();

            const ghost = document.createElement('span');
            ghost.className = 'caissa-analyze-v2__palette-ghost';
            ghost.setAttribute('aria-hidden', 'true');
            const ghostImage = image.cloneNode(true);
            ghostImage.draggable = false;
            ghost.appendChild(ghostImage);
            document.body.appendChild(ghost);

            this.setupPaletteDrag = {
                pointerId: event.pointerId,
                piece,
                button,
                ghost,
                startX: event.clientX,
                startY: event.clientY,
                moved: false,
                targetSquare: null,
                targetElement: null
            };
            button.classList.add('is-dragging');
            button.setPointerCapture?.(event.pointerId);
            this.positionSetupPaletteGhost(event.clientX, event.clientY);
        };
        const pointerMove = (event) => {
            const drag = this.setupPaletteDrag;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (distance >= 4) drag.moved = true;
            if (!drag.moved) return;
            event.preventDefault();
            drag.ghost.classList.add('is-moving');
            this.positionSetupPaletteGhost(event.clientX, event.clientY);
            this.updateSetupPaletteDropTarget(event.clientX, event.clientY);
        };
        const pointerEnd = (event) => {
            const drag = this.setupPaletteDrag;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (drag.moved) {
                event.preventDefault();
                this.updateSetupPaletteDropTarget(event.clientX, event.clientY);
            }
            const { moved, piece, targetSquare } = drag;
            this.cancelSetupPaletteDrag();
            if (!moved) return;
            this.setupSuppressPaletteClickUntil = performance.now() + 450;
            if (!targetSquare || !this.setupModeActive || !this.setupDraft) {
                this.setSetupMessage('Piece not placed. Drop it on a board square.', 'info');
                return;
            }
            this.setupSelectedPiece = null;
            this.setupSourceSquare = null;
            this.setupDraft.setPiece(targetSquare, piece);
            this.syncSetupDraftUI();
            this.setSetupMessage(`Piece placed on ${targetSquare}.`, 'success');
        };
        const pointerCancel = (event) => {
            if (this.setupPaletteDrag?.pointerId !== event.pointerId) return;
            this.cancelSetupPaletteDrag();
        };

        this.elements.setupPieces.forEach(button => {
            button.querySelector('img')?.setAttribute('draggable', 'false');
            button.addEventListener('pointerdown', pointerDown);
        });
        window.addEventListener('pointermove', pointerMove, { passive: false });
        window.addEventListener('pointerup', pointerEnd, { passive: false });
        window.addEventListener('pointercancel', pointerCancel);
        this.setupPaletteDragHandlers = { pointerDown, pointerMove, pointerEnd, pointerCancel };
    },

    positionSetupPaletteGhost(clientX, clientY) {
        const ghost = this.setupPaletteDrag?.ghost;
        if (!ghost) return;
        ghost.style.left = `${clientX}px`;
        ghost.style.top = `${clientY}px`;
    },

    updateSetupPaletteDropTarget(clientX, clientY) {
        const drag = this.setupPaletteDrag;
        if (!drag) return;
        drag.targetElement?.classList.remove('caissa-analyze-v2__setup-drop-target');
        const candidate = document.elementFromPoint(clientX, clientY)?.closest?.('#analyzeChessboard [data-square]');
        drag.targetElement = candidate || null;
        drag.targetSquare = candidate?.dataset?.square || null;
        candidate?.classList.add('caissa-analyze-v2__setup-drop-target');
    },

    cancelSetupPaletteDrag() {
        const drag = this.setupPaletteDrag;
        if (!drag) return;
        drag.targetElement?.classList.remove('caissa-analyze-v2__setup-drop-target');
        drag.button?.classList.remove('is-dragging');
        if (drag.button?.hasPointerCapture?.(drag.pointerId)) {
            drag.button.releasePointerCapture(drag.pointerId);
        }
        drag.ghost?.remove();
        this.setupPaletteDrag = null;
    },

    clearSetupBoardHighlights() {
        document.querySelectorAll('#analyzeChessboard .caissa-analyze-v2__setup-source')
            .forEach(square => square.classList.remove('caissa-analyze-v2__setup-source'));
        this.elements.setupPieces?.forEach(button => {
            const selected = button.dataset.setupPiece === this.setupSelectedPiece;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    },

    handleSetupBoardTap(square) {
        if (!this.setupModeActive || !this.setupDraft || !/^[a-h][1-8]$/.test(square)) return false;
        if (this.setupSelectedPiece) {
            this.setupDraft.setPiece(square, this.setupSelectedPiece);
            this.syncSetupDraftUI();
            this.setSetupMessage(`Piece placed on ${square}.`);
            return true;
        }

        if (this.setupSourceSquare) {
            const source = this.setupSourceSquare;
            this.setupSourceSquare = null;
            if (source === square) {
                this.setupDraft.removePiece(source);
                this.syncSetupDraftUI();
                this.setSetupMessage(`Piece removed from ${source}.`);
                return true;
            }
            this.setupDraft.movePiece(source, square);
            this.syncSetupDraftUI();
            this.setSetupMessage(`Piece moved from ${source} to ${square}.`);
            return true;
        }

        if (!this.setupDraft.getPiece(square)) {
            this.setSetupMessage('Select a palette piece or an occupied board square first.', 'info');
            return true;
        }
        this.setupSourceSquare = square;
        this.clearSetupBoardHighlights();
        document.querySelector(`#analyzeChessboard .square-${square}`)
            ?.classList.add('caissa-analyze-v2__setup-source');
        this.setSetupMessage(`Selected ${square}. Choose a destination or click it again to remove.`);
        return true;
    },

    handleSetupBoardDrop(source, target) {
        if (!this.setupModeActive || !this.setupDraft) return 'snapback';
        if (target === 'offboard') {
            this.setupDraft.removePiece(source);
            this.syncSetupDraftUI({ board: false });
            this.setSetupMessage(`Piece removed from ${source}.`);
            return undefined;
        }
        if (!/^[a-h][1-8]$/.test(target) || !this.setupDraft.movePiece(source, target)) return 'snapback';
        this.syncSetupDraftUI({ board: false });
        this.setSetupMessage(`Piece moved from ${source} to ${target}.`);
        return undefined;
    },

    syncSetupDraftUI({ board = true, fen = true, controls = true } = {}) {
        if (!this.setupModeActive || !this.setupDraft) return;
        if (board) this.board?.position(this.setupDraft.position(), false);
        if (fen && this.elements.setupFen) this.elements.setupFen.value = this.setupDraft.toFen();
        if (controls) {
            if (this.elements.setupTurn) this.elements.setupTurn.value = this.setupDraft.toFen().split(' ')[1];
            this.elements.setupCastling?.forEach(input => {
                input.checked = this.setupDraft.hasCastling(input.dataset.setupCastling);
            });
        }
        this.clearSetupBoardHighlights();
    },

    applySetupFenInput() {
        if (!this.setupModeActive || !this.setupDraft || !this.elements.setupFen) return false;
        const result = this.setupDraft.replaceFen(this.elements.setupFen.value, { requireKings: true });
        if (!result.ok) {
            this.setSetupMessage(result.error, 'error');
            return false;
        }
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.syncSetupDraftUI();
        this.setSetupMessage('FEN applied to the setup board.', 'success');
        return true;
    },

    handleSetupPgnInput() {
        const hasPgn = !!this.elements.setupPgn?.value?.trim();
        this.setSetupMessage(hasPgn
            ? 'PGN is present and will take priority when Load is pressed.'
            : 'PGN is empty. Load will commit the FEN draft.', 'info');
    },

    resetSetupDraft() {
        if (!this.setupDraft) return false;
        this.setupDraft.reset();
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.syncSetupDraftUI();
        this.setSetupMessage('Starting position restored.', 'success');
        return true;
    },

    clearSetupDraft() {
        if (!this.setupDraft) return false;
        this.setupDraft.clear();
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.syncSetupDraftUI();
        this.setSetupMessage('Board cleared. Add exactly one king for each side before loading.', 'info');
        return true;
    },

    loadSetupDraft() {
        if (!this.setupModeActive || !this.setupDraft) return false;
        const pgn = this.elements.setupPgn?.value?.trim() || '';
        if (pgn) {
            const loaded = this.loadGameFromPgn(pgn, 'Manual PGN');
            if (!loaded) {
                this.setSetupMessage('Could not load PGN. Check the notation and try again.', 'error');
                return false;
            }
            this.finishSetupCommit();
            return true;
        }

        const validation = this.setupDraft.validate({ requireKings: true });
        if (!validation.ok) {
            this.setSetupMessage(validation.error, 'error');
            return false;
        }
        const fen = this.setupDraft.toFen();
        const session = window.CaissaAnalyzeSession?.createSession?.({ initialFen: fen });
        const game = session?.game;
        if (!game) {
            this.setSetupMessage('Chess could not accept this study position.', 'error');
            return false;
        }
        this.session = session;
        this.loadedGame = {
            pgn: '', game, initialFen: fen, source: 'Setup Position',
            white: 'White', black: 'Black', result: '*', termination: null,
            event: 'Position Setup', date: '', eco: '', opening: '', headers: { ...game.header() },
            movesSan: [], movesVerbose: []
        };
        this.currentMoveIndex = -1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.updateMetadata();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.setStatus('Setup position loaded', 'ready');
        this.finishSetupCommit();
        return true;
    },

    finishSetupCommit() {
        this.cancelSetupPaletteDrag();
        this.setupModeActive = false;
        this.setupDraft = null;
        this.setupSelectedPiece = null;
        this.setupSourceSquare = null;
        this.setupSuppressPaletteClickUntil = 0;
        this.clearSetupBoardHighlights();
        this.board?.position(this.getGame()?.fen?.(), false);
        window.CaissaAnalyzeV2Shell?.selectView?.('analysis', { focus: true });
        if (this.liveEngineEnabled) this.refreshLiveEvaluation();
        else this.setLiveEngineEnabled(true);
    },

    openNewAnalysis() {
        if (!this.getGame()) return false;
        this.pendingSetupEntryMode = 'new';
        window.CaissaAnalyzeV2Shell?.selectView?.('setup', { focus: true });
        this.elements.newAnalysis?.blur();
        return this.setupModeActive;
    },

    buildAnalysisPgn() {
        const game = this.getGame();
        if (!game?.pgn || !this.loadedGame) return '';

        const headers = { ...(this.loadedGame.headers || {}), ...(game.header?.() || {}) };
        const moves = this.getLoadedMoves();
        const restoreIndex = this.currentMoveIndex;
        const needsFullLineReplay = game.history().length !== moves.length;
        if (needsFullLineReplay) {
            if (this.loadedGame.initialFen) game.load(this.loadedGame.initialFen);
            else game.reset();
            moves.forEach(move => game.move(move));
        }
        const values = {
            Event: this.loadedGame.event || headers.Event || 'CAISSA Analysis',
            Site: headers.Site || 'CAISSA',
            Date: this.loadedGame.date || headers.Date || new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
            Round: headers.Round || '?',
            White: this.loadedGame.white || headers.White || 'White',
            Black: this.loadedGame.black || headers.Black || 'Black',
            Result: this.loadedGame.result || headers.Result || '*'
        };
        if (this.loadedGame.eco || headers.ECO) values.ECO = this.loadedGame.eco || headers.ECO;
        if (this.loadedGame.opening || headers.Opening) values.Opening = this.loadedGame.opening || headers.Opening;
        if (this.loadedGame.termination || headers.Termination) {
            values.Termination = this.loadedGame.termination || headers.Termination;
        }
        if (this.loadedGame.initialFen) {
            values.SetUp = '1';
            values.FEN = this.loadedGame.initialFen;
        }

        const exportHeaders = { ...headers, ...values };
        this.loadedGame.headers = { ...exportHeaders };
        Object.entries(exportHeaders).forEach(([name, value]) => game.header(name, String(value)));
        const pgn = game.pgn({ max_width: 80, newline_char: '\n' });
        if (needsFullLineReplay) {
            if (this.loadedGame.initialFen) game.load(this.loadedGame.initialFen);
            else game.reset();
            moves.slice(0, restoreIndex + 1).forEach(move => game.move(move));
            Object.entries(exportHeaders).forEach(([name, value]) => game.header(name, String(value)));
        }
        return pgn;
    },

    saveAnalysisPgn() {
        const pgn = this.buildAnalysisPgn();
        if (!pgn || !window.Blob || !window.URL?.createObjectURL) {
            this.showNotification('PGN download is unavailable.', 'error');
            return false;
        }

        const blob = new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `caissa-analysis-${stamp}.pgn`;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        window.dispatchEvent(new CustomEvent('caissa:analyze-pgn-download', {
            detail: Object.freeze({ filename: link.download, pgn })
        }));
        this.showNotification('Analysis PGN downloaded.', 'success');
        return true;
    },

    setSetupMessage(message, type = 'neutral') {
        if (!this.elements.setupMessage) return;
        this.elements.setupMessage.textContent = message;
        this.elements.setupMessage.className = `caissa-analyze-v2__setup-message is-${type}`;
    },

    bindKeyboardNavigation() {
        if (this.keyboardHandler) return;
        this.keyboardHandler = (event) => this.handleKeyboardNavigation(event);
        document.addEventListener('keydown', this.keyboardHandler);
    },

    handleKeyboardNavigation(event) {
        if (!this.loadedGame || !this.isAnalyzeActive() || this.isEditableTarget(event.target)) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const lastMoveIndex = this.getLoadedMoves().length - 1;
        const destinations = {
            ArrowLeft: this.currentMoveIndex - 1,
            ArrowRight: this.currentMoveIndex + 1,
            Home: -1,
            End: lastMoveIndex
        };
        if (!Object.prototype.hasOwnProperty.call(destinations, event.key)) return;

        event.preventDefault();
        this.jumpToMove(destinations[event.key]);
    },

    isAnalyzeActive() {
        if (document.getElementById('analyzeSection')?.classList.contains('caissa-play-v2-inline-analyze')) return true;
        if (window.CaissaNavigation?.currentSection) {
            return CaissaNavigation.currentSection === 'analyze';
        }
        return document.getElementById('analyzeSection')?.classList.contains('active') || false;
    },

    isEditableTarget(target) {
        if (!(target instanceof Element)) return false;
        return target.isContentEditable
            || !!target.closest('input, select, textarea, [contenteditable="true"]');
    },

    getGame() {
        return this.loadedGame?.game || null;
    },

    ensureAnalyzeBoard() {
        if (this.board || !window.Chessboard || !document.getElementById('analyzeChessboard')) return !!this.board;
        this.board = Chessboard('analyzeChessboard', {
            draggable: true,
            dropOffBoard: 'trash',
            position: this.getGame()?.fen?.() || 'start',
            dragThrottleRate: 8,
            snapSpeed: 70,
            snapbackSpeed: 110,
            trashSpeed: 100,
            onDragStart: (source, piece) => this.beginAnalyzeBoardDrag(source, piece),
            onDrop: (source, target) => {
                const outcome = this.handleBoardDrop(source, target);
                this.finishAnalyzeBoardDrag({ delay: outcome === 'snapback' ? 120 : 90 });
                return outcome;
            },
            onSnapEnd: () => {
                this.board?.position(
                    this.setupModeActive && this.setupDraft ? this.setupDraft.position() : this.getGame()?.fen?.(), false
                );
                this.finishAnalyzeBoardDrag();
            },
            onSnapbackEnd: () => this.finishAnalyzeBoardDrag(),
            pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
            showNotation: true
        });
        return true;
    },

    beginAnalyzeBoardDrag(source, piece) {
        if (!this.canStartStudyMove(source, piece)) return false;
        clearTimeout(this.boardDragCleanupTimer);
        document.body.classList.add('caissa-analyze-board-dragging');
        document.getElementById('analyzeChessboard')?.classList.add('is-piece-dragging');
        return true;
    },

    finishAnalyzeBoardDrag({ delay = 0 } = {}) {
        clearTimeout(this.boardDragCleanupTimer);
        const cleanup = () => {
            document.body.classList.remove('caissa-analyze-board-dragging');
            document.getElementById('analyzeChessboard')?.classList.remove('is-piece-dragging');
            this.boardDragCleanupTimer = null;
        };
        if (delay > 0) this.boardDragCleanupTimer = setTimeout(cleanup, delay);
        else cleanup();
    },

    handleBoardDrop(source, target) {
        if (this.setupModeActive) return this.handleSetupBoardDrop(source, target);
        const move = this.getGame()?.moves({ verbose: true })
            .find(candidate => candidate.from === source && candidate.to === target);
        if (move?.flags?.includes('p')) {
            this.pendingPromotion = { from: source, to: target };
            window.showPromotionDialog?.();
            return undefined;
        }
        return this.playStudyMove(source, target) ? undefined : 'snapback';
    },

    completePromotion(piece) {
        if (!this.pendingPromotion) return false;
        const { from, to } = this.pendingPromotion;
        this.pendingPromotion = null;
        return this.playStudyMove(from, to, piece);
    },

    ensureStudyBoard() {
        if (!window.Chess) return false;

        if (!this.loadedGame) {
            this.resetStudyBoard({ silent: true });
        }

        const game = this.getGame();
        this.ensureAnalyzeBoard();
        if (this.board && game) {
            this.board.position(game.fen(), false);
            this.board.orientation(this.boardFlipped ? 'black' : 'white');
            this.board.resize?.();
        }

        this.updateMetadata();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        return true;
    },

    cloneGame(game = this.getGame()) {
        if (!game || !window.Chess) return null;
        const clone = new Chess();
        game.history().forEach((san) => clone.move(san));
        return clone;
    },

    syncLoadedMoveLine(game = this.getGame()) {
        if (!this.loadedGame || !game?.history) return;
        this.loadedGame.movesSan = game.history().slice();
        this.loadedGame.movesVerbose = game.history({ verbose: true }).map((move) => ({ ...move }));
    },

    getLoadedMoves({ verbose = false } = {}) {
        if (!this.loadedGame) return [];
        if (verbose && Array.isArray(this.loadedGame.movesVerbose)) {
            return this.loadedGame.movesVerbose.map((move) => ({ ...move }));
        }
        if (!verbose && Array.isArray(this.loadedGame.movesSan)) {
            return this.loadedGame.movesSan.slice();
        }
        return this.loadedGame.game.history(verbose ? { verbose: true } : undefined);
    },

    resetStudyBoard({ explicit = false, silent = false } = {}) {
        if (!window.Chess) return;

        if (this.isAnalyzing) this.stopAnalysis({ restoreLive: false, reason: 'study-reset' });
        this.livePositionAnalyses = {};
        this.liveCurrentFen = null;
        this.liveCurrentResult = null;
        const session = window.CaissaAnalyzeSession?.createSession?.() || null;
        const game = session?.game || new Chess();
        this.session = session;
        this.loadedGame = {
            pgn: '',
            game,
            initialFen: null,
            source: 'Study Board',
            white: 'White',
            black: 'Black',
            result: '*',
            event: 'Free Study',
            date: '',
            eco: '',
            opening: '',
            headers: {},
            movesSan: [],
            movesVerbose: []
        };
        this.currentMoveIndex = -1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.clearTapSelection();

        window.CaissaClockService?.stop('analyze-enter');
        this.ensureAnalyzeBoard();
        this.board?.position(game.fen(), false);

        this.updateMetadata();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus('Study board ready', 'ready');
        this.studyModeInitialized = true;
        if (explicit && !silent) {
            this.showNotification('Study board reset to the starting position.', 'success');
        }
    },

    canStartStudyMove(square) {
        if (this.setupModeActive) return !!this.setupDraft?.getPiece(square);
        const game = this.getGame();
        if (!this.isAnalyzeActive() || !game) return false;
        const piece = game.get(square);
        if (!piece) return false;
        return piece.color === game.turn() && !game.game_over();
    },

    playStudyMove(from, to, promotion) {
        const game = this.getGame();
        if (!this.isAnalyzeActive() || !game) return false;
        if (this.isAnalyzing) this.stopAnalysis({ restoreLive: false, reason: 'position-changed' });
        const move = game.move({ from, to, promotion });
        if (!move) return false;

        this.syncLoadedMoveLine(game);
        this.currentMoveIndex = game.history().length - 1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.analysisPhase = 'idle';
        this.clearTapSelection();
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`, 'ready');
        return true;
    },

    undoStudyMove() {
        const game = this.getGame();
        if (!game) return;
        if (this.isAnalyzing) this.stopAnalysis({ restoreLive: false, reason: 'position-changed' });
        const move = game.undo();
        if (!move) return;
        this.syncLoadedMoveLine(game);
        this.currentMoveIndex = game.history().length - 1;
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.analysisPhase = 'idle';
        this.clearTapSelection();
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.setStatus(`${game.turn() === 'w' ? 'White' : 'Black'} to move`, 'ready');
    },

    clearTapSelection() {
        this.tapSource = null;
        this.tapTargets = [];
        document.querySelectorAll('#analyzeSection #chessboard .analyze-tap-source, #analyzeSection #chessboard .analyze-tap-target').forEach((el) => {
            el.classList.remove('analyze-tap-source', 'analyze-tap-target');
        });
    },

    markTapSource(square) {
        this.clearTapSelection();
        this.tapSource = square;
        this.tapTargets = this.getGame().moves({ square, verbose: true }).map((move) => move.to);
        document.querySelector(`#analyzeSection #chessboard .square-${square}`)?.classList.add('analyze-tap-source');
        this.tapTargets.forEach((target) => {
            document.querySelector(`#analyzeSection #chessboard .square-${target}`)?.classList.add('analyze-tap-target');
        });
    },

    handleBoardTap(square) {
        if (this.setupModeActive) return this.handleSetupBoardTap(square);
        if (!square || !this.getGame()) return false;

        if (!this.tapSource) {
            if (this.canStartStudyMove(square)) {
                this.markTapSource(square);
                return true;
            }
            return false;
        }

        const source = this.tapSource;
        if (source === square) {
            this.clearTapSelection();
            return true;
        }

        const moved = this.playStudyMove(source, square);
        if (!moved) {
            this.clearTapSelection();
            if (this.canStartStudyMove(square)) this.markTapSource(square);
            else this.board?.position(this.getGame().fen(), false);
        }
        return true;
    },

    /**
     * Switch between tabs
     */
    switchTab(source) {
        if (!this.elements.panels[source]) return false;
        if (source !== 'game-url') this.cancelGameUrlImport();
        this.currentSource = source;

        // Update tabs
        this.elements.tabs.forEach(tab => {
            const active = tab.dataset.source === source;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });

        // Update panels
        Object.keys(this.elements.panels).forEach(key => {
            const panel = this.elements.panels[key];
            if (panel) {
                const active = key === source;
                panel.classList.toggle('active', active);
                panel.hidden = !active;
            }
        });

        console.log('[Analyze] Switched to tab:', source);
        return true;
    },

    handleSourceTabKeydown(event) {
        const tabs = Array.from(this.elements.tabs || []);
        const index = tabs.indexOf(event.currentTarget);
        if (index < 0) return;
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        this.switchTab(tabs[nextIndex].dataset.source);
        tabs[nextIndex].focus();
    },

    setGameUrlMessage(message = '', type = 'error') {
        const target = this.elements.gameUrlMessage;
        if (!target) return;
        target.textContent = message;
        target.dataset.state = type;
        target.hidden = !message;
    },

    setGameUrlUsernameVisible(visible, { focus = false } = {}) {
        if (this.elements.gameUrlChessComUsernameGroup) {
            this.elements.gameUrlChessComUsernameGroup.hidden = !visible;
        }
        if (visible && focus) this.elements.gameUrlChessComUsername?.focus();
    },

    syncGameUrlContext() {
        const importer = window.CaissaAnalyzeGameImport;
        let needsUsername = false;
        try {
            const parsed = importer?.parse?.(this.elements.gameUrl?.value || '');
            needsUsername = parsed?.provider === 'chess.com' && !parsed.username;
        } catch (_error) {
            // Invalid and incomplete URLs remain the resolver's inline concern.
        }
        this.setGameUrlUsernameVisible(needsUsername);
        return needsUsername;
    },

    cancelGameUrlImport() {
        this.gameUrlRequestToken += 1;
        this.gameUrlAbortController?.abort?.();
        this.gameUrlAbortController = null;
        window.CaissaUI?.setButtonLoading(this.elements.gameUrlLoad, false);
    },

    async importGameUrl() {
        const importer = window.CaissaAnalyzeGameImport;
        const rawUrl = this.elements.gameUrl?.value || '';
        this.cancelGameUrlImport();
        const requestToken = ++this.gameUrlRequestToken;
        if (!importer?.resolve) {
            this.setGameUrlMessage('Game URL import is unavailable right now.');
            return false;
        }

        let parsed;
        try {
            parsed = importer.parse(rawUrl);
        } catch (error) {
            this.setGameUrlMessage(importer.getMessage?.(error) || 'Could not load that game.');
            return false;
        }

        const username = this.elements.gameUrlChessComUsername?.value?.trim() || '';
        if (parsed.provider === 'chess.com' && !parsed.username && !username) {
            this.setGameUrlUsernameVisible(true, { focus: true });
            this.setGameUrlMessage(importer.errors?.MISSING_USERNAME || "Enter either player's Chess.com username.");
            return false;
        }

        if (this.isAnalyzing) this.stopAnalysis({ restoreLive: false, reason: 'game-import-started' });

        const controller = new AbortController();
        this.gameUrlAbortController = controller;
        const loadingLabel = parsed.provider === 'chess.com' ? 'Searching Chess.com games…' : 'Loading game…';
        this.setGameUrlMessage(loadingLabel, 'loading');
        window.CaissaUI?.setButtonLoading(this.elements.gameUrlLoad, true, { label: loadingLabel });
        try {
            const resolved = await importer.resolve(rawUrl, {
                username,
                signal: controller.signal,
                onProgress: ({ checked, total }) => {
                    if (requestToken !== this.gameUrlRequestToken) return;
                    this.setGameUrlMessage(`Searching Chess.com games… ${Math.min(checked + 1, total)} of ${total}`, 'loading');
                }
            });
            if (requestToken !== this.gameUrlRequestToken) return false;
            const loaded = this.loadGameFromPgn(resolved.pgn, resolved.source, {
                normalizedUrl: resolved.normalizedUrl,
                white: resolved.white,
                black: resolved.black,
                result: resolved.result,
                termination: resolved.termination,
                recordId: resolved.recordId,
                suppressErrorNotification: true
            });
            if (!loaded) {
                this.setGameUrlMessage(importer.errors?.INVALID_PGN_RESPONSE || 'The game service returned an invalid game record.');
                return false;
            }

            if (this.elements.gameUrl) this.elements.gameUrl.value = resolved.normalizedUrl;
            this.setGameUrlUsernameVisible(false);
            this.setGameUrlMessage('Game loaded.', 'success');
            this.gameUrlAbortController = null;
            window.CaissaUI?.setButtonLoading(this.elements.gameUrlLoad, false);
            window.CaissaAnalyzeV2Shell?.selectView?.('analysis', { focus: true });
            if (!this.liveEngineEnabled) this.setLiveEngineEnabled(true);
            return true;
        } catch (error) {
            if (requestToken !== this.gameUrlRequestToken) return false;
            if (error?.code === 'ABORTED') return false;
            console.warn('[Analyze] Game URL import failed:', error?.code || error);
            if (error?.code === 'MISSING_USERNAME') this.setGameUrlUsernameVisible(true, { focus: true });
            this.setGameUrlMessage(importer.getMessage?.(error) || 'Could not load that game.');
            return false;
        } finally {
            if (requestToken === this.gameUrlRequestToken) {
                if (this.gameUrlAbortController === controller) this.gameUrlAbortController = null;
                window.CaissaUI?.setButtonLoading(this.elements.gameUrlLoad, false);
            }
        }
    },

    getAccountImportContext(provider) {
        if (provider === 'chess.com') return {
            provider,
            username: this.elements.username,
            gameCount: this.elements.gameCount,
            fetchBtn: this.elements.fetchBtn,
            results: this.elements.fetchedGames
        };
        if (provider === 'lichess') return {
            provider,
            username: this.elements.lichessUsername,
            gameCount: this.elements.lichessGameCount,
            fetchBtn: this.elements.lichessFetchBtn,
            results: this.elements.lichessFetchedGames
        };
        return null;
    },

    /**
     * Fetch games from Chess.com or Lichess
     */
    async fetchOnlineGames(requestedProvider = null) {
        const fallbackProvider = this.elements.provider?.value || 'lichess';
        const provider = requestedProvider || (this.currentSource === 'chess.com' || this.currentSource === 'lichess'
            ? this.currentSource
            : fallbackProvider);
        const context = this.getAccountImportContext(provider);
        const username = context?.username?.value?.trim();
        const count = parseInt(context?.gameCount?.value || '10');

        if (!context || !username) {
            this.showNotification('Please enter a username', 'error');
            return;
        }

        const requestToken = ++this.accountFetchToken;
        this.activeFetchedGamesTarget = context.results;
        this.fetchedGames = [];
        this.selectedFetchedGameIndex = -1;
        [this.elements.fetchedGames, this.elements.lichessFetchedGames].forEach((target) => {
            if (!target) return;
            target.hidden = true;
            target.replaceChildren();
        });
        console.log('[Analyze] Fetching games via provider', { provider, username, count });
        this.setStatus('Loading games...', 'loading');
        window.CaissaUI?.setButtonLoading(context.fetchBtn, true, { label: 'Loading games...' });

        try {
            const data = provider === 'lichess'
                ? await this.fetchLichessGames(username, count)
                : await this.fetchChessComGames(username, count);
            if (requestToken !== this.accountFetchToken) return;
            if (!data.pgn || !data.count) {
                throw new Error('No games found');
            }

            this.fetchedGames = this.parsePgnCollection(data.pgn, data.source || provider);
            this.selectedFetchedGameIndex = -1;
            console.log(`[Analyze] Received ${this.fetchedGames.length} games`);
            this.renderFetchedGames(context.results);

            if (this.fetchedGames.length === 1) {
                this.selectFetchedGame(0);
            } else {
                this.setStatus('Select a game', 'ready');
            }
        } catch (error) {
            if (requestToken !== this.accountFetchToken) return;
            console.error('[Analyze] Fetch error:', error);
            const providerName = provider === 'lichess' ? 'Lichess' : 'Chess.com';
            if (String(error?.message || '').toLowerCase().includes('no games')) {
                this.setStatus('No games found', 'warning');
                if (context.results) {
                    context.results.hidden = false;
                    this.renderEmptyState(context.results, {
                        icon: 'fa-search',
                        title: 'No games found.',
                        message: `Try a different ${providerName} username.`
                    });
                }
                this.showNotification(`No games found for this ${providerName} username.`, 'warning');
                return;
            }
            this.setStatus('Could not load games', 'error');
            this.showNotification(
                `Could not fetch games from ${providerName}. Please try again.`,
                'error'
            );
        } finally {
            window.CaissaUI?.setButtonLoading(context.fetchBtn, false);
        }
    },

    async fetchLichessGames(username, count) {
        const requestUrl = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
        requestUrl.search = new URLSearchParams({
            max: String(count),
            moves: 'true',
            tags: 'true',
            clocks: 'false',
            evals: 'false',
            opening: 'false'
        }).toString();

        console.log('[Analyze] Using Lichess CORS API');
        console.log('[Analyze] Request URL:', requestUrl.toString());

        const response = await fetch(requestUrl.toString(), {
            headers: { Accept: 'application/x-chess-pgn' }
        });
        if (!response.ok) {
            throw new Error(`Lichess request failed (${response.status})`);
        }

        const pgn = (await response.text()).trim();
        return {
            pgn,
            count: (pgn.match(/\[Event\s/g) || []).length,
            source: 'Lichess'
        };
    },

    async fetchChessComGames(username, count) {
        const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
        console.log('[Analyze] Using Chess.com CORS API');
        console.log('[Analyze] Request URL:', archivesUrl);

        const archivesResponse = await fetch(archivesUrl, {
            headers: { Accept: 'application/json' }
        });
        if (!archivesResponse.ok) {
            throw new Error(`Chess.com archives request failed (${archivesResponse.status})`);
        }

        const { archives = [] } = await archivesResponse.json();
        const games = [];
        for (const archiveUrl of archives.slice().reverse()) {
            if (games.length >= count) break;
            const trustedArchiveUrl = this.getTrustedChessComArchiveUrl(archiveUrl, username);
            if (!trustedArchiveUrl) continue;
            console.log('[Analyze] Request URL:', trustedArchiveUrl);
            const response = await fetch(trustedArchiveUrl, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) continue;
            const data = await response.json();
            games.push(...(data.games || []).slice().reverse().filter((game) => (
                game.pgn && this.isLoadablePgn(game.pgn)
            )));
        }

        const selected = games.slice(0, count);
        return {
            pgn: selected.map((game) => game.pgn.trim()).join('\n\n'),
            count: selected.length,
            source: 'Chess.com'
        };
    },

    getTrustedChessComArchiveUrl(value, username) {
        try {
            const url = new URL(String(value || ''));
            const segments = url.pathname.split('/').filter(Boolean);
            const expectedUser = String(username || '').toLowerCase();
            const archiveUser = decodeURIComponent(segments[2] || '').toLowerCase();
            const month = Number(segments[5]);
            if (url.protocol !== 'https:' || url.hostname !== 'api.chess.com' || url.port
                || url.username || url.password || url.search || url.hash
                || segments.length !== 6 || segments[0] !== 'pub' || segments[1] !== 'player'
                || archiveUser !== expectedUser || segments[3] !== 'games'
                || !/^\d{4}$/.test(segments[4] || '') || !/^\d{2}$/.test(segments[5] || '')
                || month < 1 || month > 12) return null;
            return `https://api.chess.com${url.pathname}`;
        } catch (_error) {
            return null;
        }
    },

    isLoadablePgn(pgn) {
        try {
            const game = new Chess();
            return !!game.load_pgn(pgn);
        } catch (_error) {
            return false;
        }
    },

    parsePgnCollection(combinedPgn, source) {
        return String(combinedPgn || '')
            .trim()
            .split(/\r?\n\s*\r?\n(?=\[Event\s)/)
            .map((pgn, index) => {
                try {
                    const game = new Chess();
                    if (!game.load_pgn(pgn)) return null;
                    const headers = game.header();
                    return {
                        index,
                        pgn,
                        source,
                        white: headers.White || 'Unknown',
                        black: headers.Black || 'Unknown',
                        result: headers.Result || '*',
                        date: headers.Date || ''
                    };
                } catch (_error) {
                    return null;
                }
            })
            .filter(Boolean);
    },

    renderFetchedGames(target = this.activeFetchedGamesTarget || this.elements.fetchedGames) {
        if (!target) return;
        if (this.fetchedGames.length === 0) {
            target.hidden = true;
            target.innerHTML = '';
            return;
        }

        target.hidden = false;
        target.innerHTML = this.fetchedGames.map((game, index) => `
            <button type="button" class="analyze-fetched-game${index === this.selectedFetchedGameIndex ? ' active' : ''}" data-game-index="${index}" aria-label="Load game ${index + 1}: ${this.escapeHtml(game.white)} versus ${this.escapeHtml(game.black)}, ${this.escapeHtml(game.result)}">
                <span class="analyze-game-number">${index + 1}</span>
                <span class="analyze-game-label">${this.escapeHtml(game.white)} vs ${this.escapeHtml(game.black)}</span>
                <span class="analyze-game-meta">${this.escapeHtml(game.source)} · ${this.escapeHtml(game.result)}${game.date ? ` · ${this.escapeHtml(game.date)}` : ''}</span>
            </button>
        `).join('');

        target.querySelectorAll('[data-game-index]').forEach((button) => {
            button.addEventListener('click', () => this.selectFetchedGame(Number(button.dataset.gameIndex)));
        });
    },

    selectFetchedGame(index) {
        const game = this.fetchedGames[index];
        if (!game) return;
        this.selectedFetchedGameIndex = index;
        this.renderFetchedGames();
        const loaded = this.loadGameFromPgn(game.pgn, game.source, game);
        if (loaded) window.CaissaAnalyzeV2Shell?.selectView?.('analysis', { focus: true });
    },

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value ?? '');
        return div.innerHTML;
    },

    /**
     * Load PGN from textarea
     */
    loadPgn() {
        const pgn = this.elements.pgnInput?.value?.trim();

        if (!pgn) {
            this.showNotification('Please paste a PGN', 'error');
            return;
        }

        this.loadGameFromPgn(pgn, 'Manual PGN');
    },

    /**
     * Handle PGN file upload
     */
    handlePgnFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (this.elements.pgnFileName) {
            this.elements.pgnFileName.textContent = file.name;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const pgn = event.target?.result;
            if (pgn) {
                if (this.elements.pgnInput) {
                    this.elements.pgnInput.value = pgn;
                }
                this.loadGameFromPgn(pgn, 'PGN File');
            }
        };
        reader.readAsText(file);
    },

    /**
     * Load game from PGN string
     */
    loadGameFromPgn(pgn, source, metadata = {}) {
        console.log('[Analyze] Loading PGN from:', source);

        try {
            // Use global Chess.js if available
            const session = window.CaissaAnalyzeSession?.createSession?.({ pgn });
            const game = session?.game;
            if (!game) {
                throw new Error('Invalid PGN format');
            }

            // Extract headers
            const headers = game.header();

            const loadedGame = {
                pgn: pgn,
                game: game,
                initialFen: headers.SetUp === '1' && headers.FEN ? headers.FEN : null,
                source: source,
                white: metadata.white || headers.White || 'Unknown',
                black: metadata.black || headers.Black || 'Unknown',
                result: metadata.result || headers.Result || '*',
                termination: metadata.termination || headers.Termination || null,
                event: headers.Event || '',
                date: headers.Date || '',
                eco: metadata.eco || headers.ECO || '',
                opening: metadata.opening || headers.Opening || '',
                recordId: metadata.recordId || null,
                headers: { ...headers },
                movesSan: game.history().slice(),
                movesVerbose: game.history({ verbose: true }).map((move) => ({ ...move }))
            };
            // Commit both authorities together only after the full candidate is valid.
            if (this.isAnalyzing) this.stopAnalysis({ restoreLive: false, reason: 'game-loaded' });
            this.session = session;
            this.loadedGame = loadedGame;
            this.currentMoveIndex = this.getLoadedMoves().length - 1;
            this.analysisResults = [];
            this.positionAnalyses = [];
            this.analysisPhase = 'idle';
            this.updateReviewSummary();
            this.updateCriticalMoments();

            // Update metadata display
            this.updateMetadata();

            this.ensureAnalyzeBoard();
            this.updateBoardAndUI();
            this.projectCoachReviewBoardAssistance();

            // Update move list
            this.updateMoveList();
            this.updateNavigationControls();
            this.updateMentorPanel();
            this.updateEvaluationBar();

            this.setStatus('Ready to analyze', 'ready');
            console.log('[Analyze] Game loaded successfully');
            return true;

        } catch (error) {
            console.error('[Analyze] PGN load error:', error);
            if (!metadata.suppressErrorNotification) {
                this.showNotification('Could not load PGN. Check the format and try again.', 'error');
            }
            this.setStatus('Could not load PGN', 'error');
            return false;
        }
    },

    /**
     * Update metadata display
     */
    updateMetadata() {
        if (!this.loadedGame) return;

        if (this.elements.gameSource) {
            this.elements.gameSource.textContent = this.loadedGame.source;
        }
        if (this.elements.whitePlayer) {
            this.elements.whitePlayer.textContent = this.loadedGame.white;
        }
        if (this.elements.blackPlayer) {
            this.elements.blackPlayer.textContent = this.loadedGame.black;
        }
        if (this.elements.gameResult) {
            this.elements.gameResult.textContent = this.loadedGame.result;
        }
        if (this.elements.termination) {
            const value = String(this.loadedGame.termination || '').replace(/-/g, ' ');
            this.elements.termination.textContent = value ? value.replace(/^./, character => character.toUpperCase()) : 'Not recorded';
        }
    },

    /**
     * Update move list display
     */
    updateMoveList() {
        this.syncReviewAction();
        if (!this.elements.moveList || !this.loadedGame) return;

        const moves = this.getLoadedMoves();

        if (moves.length === 0) {
            this.renderEmptyState(this.elements.moveList, {
                icon: 'fa-list-ol',
                title: 'No moves yet.',
                message: 'Use the board to enter moves from a book, magazine, or PGN.'
            });
            return;
        }

        let html = '<div class="move-list-grid">';
        for (let i = 0; i < moves.length; i += 2) {
            const moveNum = Math.floor(i / 2) + 1;
            const whiteMove = moves[i] || '';
            const blackMove = moves[i + 1] || '';
            const whiteAnnotation = this.getReviewMoveSymbol(this.analysisResults[i]);
            const blackAnnotation = this.getReviewMoveSymbol(this.analysisResults[i + 1]);
            const whiteAnnotationClass = this.getAnnotationClass(whiteAnnotation);
            const blackAnnotationClass = this.getAnnotationClass(blackAnnotation);

            html += `
                <div class="move-row">
                    <span class="move-num">${moveNum}.</span>
                    <button type="button" class="move-white${i === this.currentMoveIndex ? ' active' : ''}" data-index="${i}" aria-label="${this.escapeHtml(this.getMoveAccessibleLabel(i, whiteMove))}">${whiteMove}${whiteAnnotation ? `<strong aria-hidden="true" class="analyze-move-annotation ${whiteAnnotationClass}">${this.escapeHtml(whiteAnnotation)}</strong>` : ''}</button>
                    <button type="button" class="move-black${i + 1 === this.currentMoveIndex ? ' active' : ''}" data-index="${i + 1}" aria-label="${this.escapeHtml(this.getMoveAccessibleLabel(i + 1, blackMove))}">${blackMove}${blackAnnotation ? `<strong aria-hidden="true" class="analyze-move-annotation ${blackAnnotationClass}">${this.escapeHtml(blackAnnotation)}</strong>` : ''}</button>
                </div>
            `;
        }
        html += '</div>';

        this.elements.moveList.innerHTML = html;

        // Add click handlers
        this.elements.moveList.querySelectorAll('.move-white, .move-black').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                this.jumpToMove(index);
            });
        });
    },

    /**
     * Jump to specific move
     */
    jumpToMove(index) {
        if (!this.loadedGame) return;
        const moves = this.getLoadedMoves();
        const game = this.getGame();
        const safeIndex = Math.max(-1, Math.min(index, moves.length - 1));

        // Reset to the game's actual starting position.
        if (this.loadedGame.initialFen) {
            game.load(this.loadedGame.initialFen);
        } else {
            game.reset();
        }

        // Replay moves up to index
        for (let i = 0; i <= safeIndex && i < moves.length; i++) {
            game.move(moves[i]);
        }

        this.currentMoveIndex = safeIndex;
        this.updateBoardAndUI();
        this.updateMoveList();
        this.updateNavigationControls();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.refreshLiveEvaluation();

        const selected = this.analysisPhase === 'complete' ? this.analysisResults[safeIndex] : null;
        const coachReviewActive = document.body?.classList?.contains('caissa-coach-review-summary-active');
        const botsReviewActive = document.body?.classList?.contains('caissa-bots-guided-review-active');
        const gamesReviewActive = document.body?.classList?.contains('caissa-games-guided-review-active');
        if (!coachReviewActive && !botsReviewActive && !gamesReviewActive
            && selected && ['Inaccuracy', 'Mistake', 'Blunder'].includes(selected.quality)) {
            this.board?.position?.(selected.fenBefore, false);
        }
        this.projectCoachReviewBoardAssistance();

        if (document.body?.classList?.contains('caissa-coach-review-summary-active')) {
            window.dispatchEvent(new CustomEvent('caissa:coach-review-ply-change', {
                detail: Object.freeze({ currentMoveIndex: this.currentMoveIndex })
            }));
        }
        if (botsReviewActive) {
            window.dispatchEvent(new CustomEvent('caissa:bots-review-ply-change', {
                detail: Object.freeze({ currentMoveIndex: this.currentMoveIndex })
            }));
        }
        if (gamesReviewActive) {
            window.dispatchEvent(new CustomEvent('caissa:games-review-ply-change', {
                detail: Object.freeze({ currentMoveIndex: this.currentMoveIndex })
            }));
        }

        console.log('[Analyze] Jumped to move:', safeIndex + 1);
    },

    projectCoachReviewBoardAssistance() {
        if (!document.body?.classList?.contains('caissa-coach-review-summary-active')
            && !document.body?.classList?.contains('caissa-bots-guided-review-active')
            && !document.body?.classList?.contains('caissa-games-guided-review-active')) return false;
        const projection = this.getCoachReviewProjection();
        if (!projection) return false;
        return window.App?.projectCoachReviewBoardAssistance?.({
            fen: projection.fen,
            move: projection.move
        }) === true;
    },

    getCoachReviewProjection() {
        const game = this.getGame();
        if (!game) return null;
        const selected = this.analysisPhase === 'complete' ? this.analysisResults[this.currentMoveIndex] : null;
        const displayedMoveIndex = this.currentMoveIndex;
        const move = displayedMoveIndex >= 0 ? this.getLoadedMoves({ verbose: true })[displayedMoveIndex] : null;
        return Object.freeze({
            fen: typeof selected?.fenAfter === 'string' ? selected.fenAfter : game.fen(),
            move: move?.from && move?.to ? Object.freeze({ from: move.from, to: move.to }) : null,
            authoritativeIndex: this.currentMoveIndex,
            displayedMoveIndex,
            showsFenBefore: false
        });
    },

    getMoveAccessibleLabel(index, san) {
        const result = this.analysisPhase === 'complete' ? this.analysisResults[index] : null;
        const quality = result?.quality || (result?.unavailable ? 'Analysis unavailable' : 'Not analyzed');
        return `${san || 'Empty move'}, ${quality}`;
    },

    getReviewMoveSymbol(result) {
        if (this.analysisPhase !== 'complete' || !result || result.unavailable) return '';
        const annotation = String(result.annotation || '');
        if (['!!', '!', '!?', '?!', '?', '??'].includes(annotation)) return annotation;
        const presentationSymbol = window.CaissaAnalyzeReviewPolicy?.presentationSymbol;
        if (result.quality === 'Book') return presentationSymbol?.('Book') || '📖';
        if (result.isBestMove === true) return presentationSymbol?.('Precise') || '!';
        return '';
    },

    syncReviewAction() {
        const button = this.elements.reviewAnalysis;
        if (!button) return;
        const moves = this.getLoadedMoves();
        const complete = this.analysisPhase === 'complete'
            && moves.length > 0
            && this.analysisResults.length === moves.length
            && this.analysisResults.every(Boolean);
        const failed = this.analysisPhase === 'failed';
        button.classList.toggle('is-active', complete);
        button.classList.toggle('is-error', failed);
        button.setAttribute('aria-pressed', complete ? 'true' : 'false');
        const label = button.querySelector('span');
        if (label) label.textContent = failed ? 'Retry Review' : 'Review';
        button.title = complete
            ? 'Review complete'
            : failed ? 'Review failed. Try again.' : 'Review the current game';
    },

    updateBoardAndUI() {
        const game = this.getGame();
        if (!game) return;
        if (this.board && typeof this.board.position === 'function') {
            this.board.position(game.fen(), false);
        }
        if (typeof App.updateUI === 'function') {
            App.updateUI();
        }
    },

    updateNavigationControls() {
        const moveCount = this.getLoadedMoves().length;
        const atStart = this.currentMoveIndex < 0;
        const atEnd = moveCount === 0 || this.currentMoveIndex >= moveCount - 1;
        if (this.elements.navFirst) this.elements.navFirst.disabled = atStart || moveCount === 0;
        if (this.elements.navPrev) this.elements.navPrev.disabled = atStart || moveCount === 0;
        if (this.elements.navNext) this.elements.navNext.disabled = atEnd;
        if (this.elements.navLast) this.elements.navLast.disabled = atEnd;
        if (this.elements.undoMove) {
            const disabled = moveCount === 0;
            this.elements.undoMove.disabled = disabled;
            this.elements.undoMove.setAttribute('aria-disabled', String(disabled));
        }
        if (this.elements.resetBoard) {
            this.elements.resetBoard.disabled = false;
            this.elements.resetBoard.setAttribute('aria-disabled', 'false');
        }
    },

    updateMentorPanel() {
        if (!this.elements.mentor) return;
        if (this.liveEngineEnabled && !this.isAnalyzing) {
            this.updateLiveMentorPanel();
            return;
        }
        if (this.currentMoveIndex < 0) {
            this.renderEmptyState(this.elements.mentor, {
                icon: 'fa-brain',
                title: 'No move selected.',
                message: 'Select a move to see analysis guidance.'
            });
            return;
        }

        const result = this.analysisPhase === 'complete' ? this.analysisResults[this.currentMoveIndex] : null;
        const move = this.getLoadedMoves()[this.currentMoveIndex] || '';
        if (!result) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>${this.escapeHtml(move)}</strong></div>
                <p class="analyze-mentor-copy">Analyze the game to see an engine evaluation and recommendation for this move.</p>
            `;
            return;
        }
        if (result.unavailable) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading">
                    <strong>${this.escapeHtml(move)}</strong>
                    <span class="analyze-annotation">-</span>
                    <span>Analysis unavailable</span>
                </div>
                <p class="analyze-mentor-copy">Stockfish could not evaluate this move in time. Other analyzed moves remain available.</p>
            `;
            return;
        }

        const negative = ['Inaccuracy', 'Mistake', 'Blunder'].includes(result.quality);
        const book = result.quality === 'Book' && result.bookEvidence;
        const recommendation = negative && result.recommendationAvailable;
        const accessibleEvidence = this.buildMoveEvidenceDescription(result, recommendation);
        this.elements.mentor.innerHTML = `
            <div class="analyze-evidence" role="group" aria-label="${this.escapeHtml(accessibleEvidence)}">
                <div class="analyze-evidence__visual ${negative ? 'is-comparison' : 'is-compact'}${negative && !recommendation ? ' is-without-recommendation' : ''}" aria-hidden="true">
                    <div class="analyze-evidence__classification ${this.getAnnotationClass(result.annotation)}">
                        <strong>${this.escapeHtml(result.quality)}</strong>
                        ${result.annotation ? `<span>${this.escapeHtml(result.annotation)}</span>` : ''}
                    </div>
                    ${book ? `<div class="analyze-evidence__field analyze-evidence__played"><span>Played</span><strong>${this.escapeHtml(result.move)}</strong></div>
                    <div class="analyze-evidence__field analyze-evidence__opening"><span>Opening</span><strong>${this.escapeHtml(book.name)}</strong></div>
                    <a class="analyze-review-opening__explore" href="/eco/${book.eco}" target="_blank" rel="noopener">Explore in ECO Database</a>` : ''}
                    ${negative ? `<div class="analyze-evidence__field analyze-evidence__played"><span>Played</span><strong>${this.escapeHtml(result.move)}</strong></div>
                    ${recommendation ? `<div class="analyze-evidence__field analyze-evidence__recommendation"><span>Engine recommends</span><strong>${this.escapeHtml(result.bestMoveSan)}</strong></div>` : ''}
                    <div class="analyze-evidence__field analyze-evidence__evaluation"><span>Evaluation</span><strong>${this.formatEvaluation(result.beforePlayerEval, result.mateBefore)} → ${this.formatEvaluation(result.afterPlayerEval, result.mateAfter)}</strong></div>
                    <div class="analyze-evidence__field analyze-evidence__loss"><span>Loss</span><strong>${result.loss.toFixed(2)}</strong></div>` : ''}
                </div>
                ${negative ? `<p class="analyze-position-note">Position shown: before ${this.escapeHtml(result.move)}.</p>` : ''}
            </div>
        `;
    },

    describeSan(san) {
        const clean = String(san || '').replace(/[+#?!]/g, '');
        const names = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' };
        return `${names[clean[0]] ? `${names[clean[0]]} ` : ''}${clean}`.trim();
    },

    describeEvaluation(value, mate) {
        if (mate !== null && mate !== undefined) return `mate ${mate}`;
        if (!Number.isFinite(value)) return 'unavailable';
        return `${value >= 0 ? 'plus' : 'minus'} ${Math.abs(value).toFixed(2)}`;
    },

    buildMoveEvidenceDescription(result, recommendation) {
        const parts = [`${result.quality}.`];
        if (!['Inaccuracy', 'Mistake', 'Blunder'].includes(result.quality))
            return `${result.quality} move. ${this.describeSan(result.move)}.`;
        parts.push(`Played ${this.describeSan(result.move)}.`);
        if (recommendation) parts.push(`Engine recommends ${this.describeSan(result.bestMoveSan)}.`);
        parts.push(`Evaluation changed from ${this.describeEvaluation(result.beforePlayerEval, result.mateBefore)} to ${this.describeEvaluation(result.afterPlayerEval, result.mateAfter)}.`);
        parts.push(`Evaluation loss ${result.loss.toFixed(2)} pawns.`);
        parts.push(`The board shows the position before ${this.describeSan(result.move)}.`);
        return parts.join(' ');
    },

    updateReviewSummary() {
        if (!this.elements.reviewSummary) return;
        if (this.analysisPhase !== 'complete') {
            const states = {
                preparing: ['Preparing local engine.', 'Results will appear only after every position is evaluated.'],
                analyzing: ['Analysis in progress.', `Analyzing position ${this.analyzedPositions} of ${this.totalPositions}.`],
                failed: ['Analysis unavailable.', 'No accuracy or move-quality claims were produced. Retry when ready.'],
                cancelled: ['Analysis cancelled.', 'The completed game is preserved and no partial results are shown.']
            };
            const copy = states[this.analysisPhase] || ['Ready to analyze.', 'Start local analysis to calculate evidence-backed results.'];
            this.renderEmptyState(this.elements.reviewSummary, { icon: 'fa-chart-pie', title: copy[0], message: copy[1] });
            return;
        }
        const analyzed = this.analysisResults.filter((result) => result && !result.unavailable);
        if (analyzed.length === 0) {
            this.renderEmptyState(this.elements.reviewSummary, {
                icon: 'fa-chart-pie',
                title: 'No review yet.',
                message: 'Analyze a loaded game to see accuracy and move quality.'
            });
            return;
        }

        const white = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 0));
        const black = this.buildSideReview(analyzed.filter((result) => result.moveIndex % 2 === 1));
        const qualities = ['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder'];
        const opening = this.getAnalyzeOpening();
        const trustedOpening = this.getTrustedEcoOpening(opening);

        this.elements.reviewSummary.innerHTML = `
            <div class="analyze-review-opening">
                <span>Opening</span>
                <strong>${this.escapeHtml(trustedOpening?.name || opening?.name || 'Opening not identified')}</strong>
                ${trustedOpening ? `<span class="analyze-review-opening__code">${trustedOpening.eco}</span>
                <a class="analyze-review-opening__explore" href="/eco/${trustedOpening.eco}" target="_blank" rel="noopener" aria-label="Explore ${this.escapeHtml(trustedOpening.name)} ${trustedOpening.eco} in ECO Database (opens in a new tab)">Explore in ECO Database <span aria-hidden="true">↗</span></a>` : ''}
            </div>
            <div class="analyze-accuracy-grid">
                <div class="analyze-accuracy-card"><span>White accuracy</span><strong>${this.formatAccuracy(white.accuracy)}</strong></div>
                <div class="analyze-accuracy-card"><span>Black accuracy</span><strong>${this.formatAccuracy(black.accuracy)}</strong></div>
            </div>
            <div class="analyze-quality-table">
                <div class="analyze-quality-row analyze-quality-header"><span>Quality</span><strong>White</strong><strong>Black</strong></div>
                ${qualities.map((quality) => `
                    <div class="analyze-quality-row">
                        <span class="quality-${quality.toLowerCase()}">${quality}</span>
                        <strong>${white.counts[quality]}</strong>
                        <strong>${black.counts[quality]}</strong>
                    </div>
                `).join('')}
            </div>
            <p class="analyze-accuracy-note">Accuracy estimates consistency from average evaluation loss.</p>
        `;
    },

    getAnalyzeOpening() {
        if (!this.loadedGame) return null;
        const played = this.getLoadedMoves().map((move) => this.normalizeEcoSan(move));
        let best = null;
        let bestDepth = -1;

        for (const opening of window.App?.openings || []) {
            const moves = (Array.isArray(opening.moves) ? opening.moves : String(opening.moves || '').split(/\s+/))
                .map((move) => this.normalizeEcoSan(move))
                .filter(Boolean);
            if (!moves.length || moves.length > played.length || moves.length <= bestDepth) continue;
            if (moves.every((move, index) => move === played[index])) {
                best = { name: opening.name || '', eco: opening.eco || opening.code || '' };
                bestDepth = moves.length;
            }
        }

        if (best) return best;
        if (this.loadedGame.opening || this.loadedGame.eco) {
            return { name: this.loadedGame.opening || 'ECO opening', eco: this.loadedGame.eco || '' };
        }
        return null;
    },

    getTrustedEcoOpening(opening) {
        const code = String(opening?.eco || '').toUpperCase();
        if (!/^[A-E]\d{2}$/.test(code)) return null;
        const row = (window.App?.ecoCodeRows || []).find(item =>
            String(item.eco || item.code || '').toUpperCase() === code);
        if (!row || !String(row.name || '').trim()) return null;
        if (opening?.name && String(opening.name).trim() !== String(row.name).trim()) return null;
        return { eco: code, name: String(row.name).trim() };
    },

    isRecognizedBookPly(moveIndex) {
        const played = this.getLoadedMoves().map((move) => this.normalizeEcoSan(move));
        return (window.App?.openings || []).some(opening => {
            const line = (Array.isArray(opening.moves) ? opening.moves : String(opening.moves || '').split(/\s+/))
                .map(move => this.normalizeEcoSan(move)).filter(Boolean);
            return line.length > moveIndex && line.slice(0, moveIndex + 1)
                .every((move, index) => move === played[index]);
        });
    },

    normalizeEcoSan(move) {
        return String(move || '').replace(/[+#?!]/g, '').trim();
    },

    buildSideReview(results) {
        const qualities = ['Book', 'Acceptable', 'Inaccuracy', 'Mistake', 'Blunder'];
        const counts = Object.fromEntries(qualities.map((quality) => [quality, 0]));
        if (results.length === 0) return { accuracy: null, counts };

        results.forEach((result) => {
            counts[this.getMoveQuality(result)] += 1;
        });
        const accuracy = window.CaissaAnalyzeReviewPolicy?.accuracy?.(results);
        return { accuracy: accuracy?.ok ? accuracy.value : null, counts };
    },

    formatAccuracy(accuracy) {
        return accuracy === null ? '-' : `${accuracy}%`;
    },

    getMoveQuality(result) {
        return result.quality || 'Acceptable';
    },

    updateCriticalMoments() {
        if (!this.elements.criticalMoments) return;
        if (this.analysisPhase !== 'complete') {
            this.renderEmptyState(this.elements.criticalMoments, {
                icon: 'fa-exclamation-triangle',
                title: this.analysisPhase === 'failed' ? 'Critical moments unavailable.' : 'Critical moments pending.',
                message: 'Critical moments require a successfully completed analysis.'
            });
            return;
        }
        const critical = this.analysisResults.filter((result) => result && !result.unavailable && this.isCriticalMoment(result));
        if (critical.length === 0) {
            this.renderEmptyState(this.elements.criticalMoments, {
                icon: 'fa-exclamation-triangle',
                title: 'No critical moments yet.',
                message: 'Run analysis to highlight training moments.'
            });
            return;
        }

        this.elements.criticalMoments.innerHTML = critical.map((result) => {
            const moveNumber = Math.floor(result.moveIndex / 2) + 1;
            const sideSuffix = result.moveIndex % 2 === 1 ? '...' : '';
            const label = `Jump to critical moment move ${moveNumber}${sideSuffix} ${result.move}: ${this.getCriticalMomentText(result)}`;
            return `
                <button class="analyze-critical-moment" type="button" data-index="${result.moveIndex}" aria-label="${this.escapeHtml(label)}">
                    <span class="analyze-critical-move">Move ${moveNumber}${sideSuffix} · ${this.escapeHtml(result.move)} <strong class="${this.getAnnotationClass(result.annotation)}">${result.annotation}</strong></span>
                    <span class="analyze-critical-swing">${this.getCriticalMomentText(result)}</span>
                </button>
            `;
        }).join('');

        this.elements.criticalMoments.querySelectorAll('.analyze-critical-moment').forEach((button) => {
            button.addEventListener('click', () => this.jumpToMove(Number(button.dataset.index)));
        });
    },

    isCriticalMoment(result) {
        return window.CaissaAnalyzeReviewPolicy?.critical?.(result) === true;
    },

    getCriticalMomentText(result) {
        if (result.mateSwing) return 'Decisive mate swing';
        if (result.beforePlayerEval >= 1.5 && result.afterPlayerEval < 0.5) {
            return `Missed winning chance · lost ${result.loss.toFixed(1)} pawns`;
        }
        return `Lost ${result.loss.toFixed(1)} pawns`;
    },

    flipAnalyzeBoard() {
        if (document.body?.classList?.contains('caissa-coach-guided-review-active') && window.App?.board) {
            window.flipBoard?.();
            this.boardFlipped = window.App.isFlipped === true;
            return;
        }
        this.boardFlipped = !this.boardFlipped;
        this.applyAnalyzeOrientation();
    },

    applyAnalyzeOrientation() {
        if (!this.board || typeof this.board.orientation !== 'function') return;
        this.board.orientation(this.boardFlipped ? 'black' : 'white');
        this.elements.evalBar?.classList.toggle('eval-flipped', this.boardFlipped);
        this.elements.flipBoard?.classList.toggle('active', this.boardFlipped);
        setTimeout(() => this.board?.resize?.(), 0);
    },

    updateEvaluationBar() {
        const fill = this.elements.evalFill;
        const score = this.elements.evalScore;
        if (!fill || !score) return;

        const current = this.getCurrentEvaluation();
        const evaluation = current.evaluation;
        const mate = current.mate;
        const available = Number.isFinite(evaluation) || Number.isFinite(mate);
        if (!available) {
            fill.style.height = '50%'; score.textContent = '\u2014';
            score.classList.remove('white-advantage', 'black-advantage');
            score.classList.toggle('engine-off', !this.liveEngineEnabled && !this.isAnalyzing);
            return;
        }
        const centipawns = mate !== null && mate !== undefined
            ? (mate > 0 ? 1500 : -1500)
            : evaluation * 100;
        const bounded = Math.max(-1500, Math.min(1500, centipawns));
        const whitePercent = (1 / (1 + Math.exp(-bounded / 200))) * 100;

        fill.style.height = `${whitePercent}%`;
        score.textContent = this.formatEvalBarScore(evaluation, mate);
        score.classList.toggle('white-advantage', centipawns > 75);
        score.classList.toggle('black-advantage', centipawns < -75);
        score.classList.toggle('engine-off', !this.liveEngineEnabled && !this.isAnalyzing);
    },

    getCurrentEvaluation() {
        const positionIndex = Math.max(0, this.currentMoveIndex + 1);
        if (this.liveEngineEnabled && this.livePositionAnalyses[positionIndex]) {
            const live = this.livePositionAnalyses[positionIndex];
            return { evaluation: live.eval, mate: live.mate };
        }

        const positionAnalysis = this.positionAnalyses[positionIndex];
        if (positionAnalysis) {
            return { evaluation: positionAnalysis.eval, mate: positionAnalysis.mate };
        }

        if (this.currentMoveIndex < 0) return { evaluation: null, mate: null };

        const selected = this.analysisResults[this.currentMoveIndex];
        return selected && !selected.unavailable
            ? { evaluation: selected.evalAfter, mate: selected.mateAfter }
            : { evaluation: null, mate: null };
    },

    formatEvalBarScore(evaluation, mate) {
        if (mate !== null && mate !== undefined) return mate > 0 ? `M+${mate}` : `M${mate}`;
        const value = evaluation ?? 0;
        if (Math.abs(value) < 0.05) return '0.0';
        return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
    },

    toggleLiveEngine() {
        this.setLiveEngineEnabled(!this.liveEngineEnabled);
    },

    setLiveEngineEnabled(enabled, { silent = false } = {}) {
        this.liveEngineEnabled = !!enabled;
        this.liveEngineToken += 1;
        this.updateLiveEngineButton();

        if (!this.liveEngineEnabled) {
            clearTimeout(this.liveEngineTimer);
            clearTimeout(this.liveUiTimer);
            this.liveEngineToken += 1;
            this.liveEngineOwner = null;
            this.liveEngineGenerationId = null;
            this.liveMultiPvLines = {};
            this.liveUiTimer = null;
            this.liveUiPendingResult = null;
            this.liveUiLastRenderAt = 0;
            this.liveCurrentResult = null;
            const canceled = this.analysisEngine?.cancelAttributedSearch?.();
            if (!canceled) this.analysisEngine?.stop?.();
            if (this.analysisEngine) {
                this.analysisEngine.onInfo = null;
                this.analysisEngine.onBestMove = null;
            }
            this.setStatus('Engine off - study board ready', 'ready');
            this.updateEvaluationBar();
            this.updateLiveMentorPanel({ off: true });
            return;
        }

        if (!silent) this.setStatus('Engine loading...', 'loading');
        this.refreshLiveEvaluation();
    },

    updateLiveEngineButton() {
        const button = this.elements.engineToggle;
        if (!button) return;
        button.classList.toggle('active', this.liveEngineEnabled);
        button.setAttribute('aria-pressed', String(this.liveEngineEnabled));
        button.setAttribute('aria-label', this.liveEngineEnabled
            ? 'Turn live engine evaluation off'
            : 'Turn live engine evaluation on');
        const label = button.querySelector('span');
        if (label) label.textContent = this.liveEngineEnabled ? 'Engine On' : 'Engine Off';
    },

    refreshLiveEvaluation() {
        if (!this.liveEngineEnabled || !this.getGame() || this.isAnalyzing) return;
        clearTimeout(this.liveEngineTimer);
        this.liveEngineTimer = setTimeout(() => {
            this.runLiveEvaluation();
        }, this.liveEngineDebounceMs);
    },

    async runLiveEvaluation() {
        if (!this.liveEngineEnabled || !this.getGame() || this.isAnalyzing) return;
        const token = ++this.liveEngineToken;
        const fen = this.getGame().fen();
        const positionIndex = Math.max(0, this.currentMoveIndex + 1);
        clearTimeout(this.liveUiTimer);
        this.liveUiTimer = null;
        this.liveUiPendingResult = null;
        this.liveUiLastRenderAt = 0;
        this.liveMultiPvLines = {};
        this.liveEngineGenerationId = null;
        this.liveCurrentFen = fen;
        this.liveCurrentResult = null;
        delete this.livePositionAnalyses[positionIndex];
        this.liveEngineOwner = 'analyze-live';

        this.setStatus('Engine analyzing...', 'loading');
        this.updateEvaluationBar();
        this.updateLiveMentorPanel({ loading: true, fen });
        const engine = await this.ensureAnalysisEngine();
        if (!engine || token !== this.liveEngineToken || !this.liveEngineEnabled) {
            if (this.liveEngineEnabled) this.setStatus('Engine unavailable', 'error');
            return;
        }

        const generationId = engine.startInfiniteAnalysisAttributed?.(fen, (info, generation) => {
            this.handleLiveEngineInfo({ info, generation, token, fen, positionIndex });
        }, { multiPv: this.liveMultiPvCount });
        if (!generationId) {
            if (token !== this.liveEngineToken || !this.liveEngineEnabled) return;
            this.setStatus('Engine evaluation unavailable', 'warning');
            this.updateLiveMentorPanel({ unavailable: true, fen });
            return;
        }
        this.liveEngineGenerationId = generationId;
        this.setStatus('Continuous analysis running', 'success');
    },

    updateLiveMentorPanel({ loading = false, result = null, unavailable = false, off = false, fen = null } = {}) {
        if (!this.elements.mentor) return;
        if (off || !this.liveEngineEnabled) {
            this.renderEmptyState(this.elements.mentor, {
                icon: 'fa-chess-board',
                title: 'Study board ready.',
                message: 'Turn Engine On for live evaluation of the current position.'
            });
            return;
        }

        const activeFen = fen || window.App?.game?.fen?.() || '';
        if (loading) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine analyzing...</strong></div>
                <p class="analyze-mentor-copy">Stockfish is evaluating the current Study Board position.</p>
                <div class="analyze-live-fen">${this.escapeHtml(activeFen)}</div>
            `;
            return;
        }

        if (unavailable) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine unavailable</strong></div>
                <p class="analyze-mentor-copy">Toggle Engine Off and On to retry. The Study Board remains fully interactive.</p>
            `;
            return;
        }

        const live = result || this.liveCurrentResult;
        if (!live) {
            this.elements.mentor.innerHTML = `
                <div class="analyze-mentor-heading"><strong>Engine on</strong></div>
                <p class="analyze-mentor-copy">Waiting for the current position evaluation.</p>
            `;
            return;
        }

        const bestMoveSan = this.uciToSan(activeFen, live.bestMove || live.pv?.[0]) || live.bestMove || live.pv?.[0] || '-';
        const pv = Array.isArray(live.pv) && live.pv.length ? live.pv.slice(0, 5).join(' ') : '-';
        this.elements.mentor.innerHTML = `
            <div class="analyze-mentor-heading">
                <strong>Live evaluation</strong>
                <span>${this.formatEvaluation(live.eval, live.mate)}</span>
            </div>
            <p class="analyze-mentor-copy">Stockfish is evaluating this position only. It will not move pieces or start a game.</p>
            <div class="analyze-eval-grid">
                <div class="analyze-eval-item">Best move<strong>${this.escapeHtml(bestMoveSan)}</strong></div>
                <div class="analyze-eval-item">Depth<strong>${Number(live.depth || 0)}</strong></div>
                <div class="analyze-eval-item">PV<strong>${this.escapeHtml(pv)}</strong></div>
            </div>
        `;
    },

    /**
     * Start Stockfish analysis
     */
    async startReview() {
        if (this.isAnalyzing || ['preparing', 'analyzing'].includes(this.analysisPhase)) return false;
        window.CaissaUI?.setButtonLoading(this.elements.reviewAnalysis, true, { label: 'Reviewing…' });
        try {
            return await this.startAnalysis();
        } finally {
            window.CaissaUI?.setButtonLoading(this.elements.reviewAnalysis, false);
            this.syncReviewAction();
        }
    },

    updateReviewProgress(reviewedMoves, totalMoves) {
        const reviewed = Math.max(0, Math.min(totalMoves, Number(reviewedMoves) || 0));
        const label = `Reviewing ${reviewed} / ${totalMoves}`;
        this.updateProgress(totalMoves > 0 ? Math.round((reviewed / totalMoves) * 100) : 0, label);
        this.setStatus(label, 'loading');
        if (this.elements.reviewAnalysis?.classList.contains('caissa-ui-button-loading')) {
            window.CaissaUI?.setButtonLoading(this.elements.reviewAnalysis, true, { label });
        }
    },

    isReviewContextActive(context) {
        return !!context
            && this.reviewContext === context
            && this.isAnalyzing
            && this.analysisToken === context.token
            && this.loadedGame?.game === context.game
            && this.session === context.session
            && this.isAnalyzeActive();
    },

    finishReviewEngineMode(context) {
        if (this.reviewContext !== context) return;
        this.reviewContext = null;
        this.activeReviewSearchCancel = null;
        const sameSource = this.loadedGame?.game === context.game && this.session === context.session;
        if (sameSource && context.restoreLive) {
            if (!this.liveEngineEnabled) this.setLiveEngineEnabled(true, { silent: true });
            else this.refreshLiveEvaluation();
        } else if (this.analysisEngine?.isReady?.()) {
            this.analysisEngine.setMultiPV?.(1);
        }
    },

    finalizeReviewMetrics(status) {
        const metrics = this.reviewRunMetrics;
        if (!metrics) return;
        const totalTimeMs = Math.max(0, performance.now() - metrics.startedAt);
        this.lastReviewMetrics = Object.freeze({
            ...metrics,
            status,
            totalTimeMs,
            averagePositionTimeMs: metrics.completedPositions > 0
                ? totalTimeMs / metrics.completedPositions
                : 0
        });
        this.reviewRunMetrics = null;
    },

    async startAnalysis() {
        if (this.isAnalyzing || ['preparing', 'analyzing'].includes(this.analysisPhase)) return false;
        if (!this.loadedGame) {
            this.showNotification('Load a game before starting analysis.', 'error');
            return false;
        }

        const moves = this.getLoadedMoves({ verbose: true });
        const totalMoves = moves.length;
        if (totalMoves === 0) {
            this.analysisPhase = 'failed';
            this.setStatus('No moves to review', 'warning');
            this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
            this.showNotification('Load or play moves before starting Review.', 'error');
            return false;
        }

        console.log('[Analyze] Starting analysis...');
        const context = {
            game: this.loadedGame.game,
            session: this.session,
            cursor: this.currentMoveIndex,
            restoreLive: this.liveEngineEnabled,
            token: ++this.analysisToken
        };
        this.reviewContext = context;
        this.isAnalyzing = true;
        this.analysisPhase = 'preparing'; this.analyzedPositions = 0; this.totalPositions = totalMoves + 1;
        this.reviewRunMetrics = {
            startedAt: performance.now(), plies: totalMoves, positions: totalMoves + 1,
            completedPositions: 0, depth: this.reviewDepth, retryDepth: this.reviewRetryDepth,
            timeouts: 0, retries: 0
        };
        if (context.restoreLive) this.setLiveEngineEnabled(false, { silent: true });
        this.analysisResults = [];
        this.positionAnalyses = [];
        this.updateMoveList();
        this.updateMentorPanel();
        this.updateEvaluationBar();
        this.updateReviewSummary();
        this.updateCriticalMoments();
        this.updateReviewProgress(0, totalMoves);
        window.CaissaUI?.setButtonLoading(this.elements.startBtn, true, { label: 'Loading engine...' });
        this.elements.startBtn.style.display = 'none';
        this.elements.stopBtn.style.display = 'block';
        this.elements.progressBar.style.display = 'block';

        try {
            const engine = await this.ensureAnalysisEngine();
            if (!engine) {
                throw Object.assign(new Error('Review engine could not start.'), { code: 'REVIEW_ENGINE_UNAVAILABLE' });
            }
            if (!this.isReviewContextActive(context)) {
                throw Object.assign(new Error('Review canceled.'), { code: 'REVIEW_CANCELLED' });
            }

            const tempGame = this.loadedGame.initialFen
                ? new Chess(this.loadedGame.initialFen)
                : new Chess();
            const positions = [tempGame.fen()];
            moves.forEach((move) => {
                tempGame.move(move.san);
                positions.push(tempGame.fen());
            });

            const positionAnalyses = [];
            let skippedPositions = 0;
            for (let i = 0; i < positions.length && this.isReviewContextActive(context); i++) {
                this.analysisPhase = 'analyzing'; this.analyzedPositions = i;
                this.updateReviewProgress(Math.max(0, i - 1), totalMoves);
                const analysis = await this.analyzePositionWithRetry(positions[i], context.token);
                if (!this.isReviewContextActive(context)) break;
                positionAnalyses.push(analysis);
                this.positionAnalyses[i] = analysis;
                if (!analysis) skippedPositions += 1;
                else if (this.reviewRunMetrics) this.reviewRunMetrics.completedPositions += 1;

                if (i > 0) {
                    this.analysisResults[i - 1] = positionAnalyses[i - 1] && positionAnalyses[i]
                        ? this.buildMoveAnalysis(i - 1, moves[i - 1], positions[i - 1], positions[i], positionAnalyses[i - 1], positionAnalyses[i])
                        : this.buildUnavailableMoveAnalysis(i - 1, moves[i - 1]);
                    this.updateReviewProgress(i, totalMoves);
                }
            }

            if (this.isReviewContextActive(context)) {
                this.updateProgress(100, `Analyzed ${totalMoves} moves`);
                const analyzedPositions = positions.length - skippedPositions;
                this.analyzedPositions = analyzedPositions;
                if (analyzedPositions === positions.length) {
                    this.analysisPhase = 'complete';
                    this.updateMoveList(); this.updateMentorPanel(); this.updateEvaluationBar();
                    this.updateReviewSummary(); this.updateCriticalMoments();
                    this.setAnalysisCompletionStatus(analyzedPositions, positions.length);
                } else {
                    this.analysisPhase = 'failed'; this.analysisResults = []; this.positionAnalyses = [];
                    this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
                    this.setStatus(`Analysis unavailable Â· ${analyzedPositions}/${positions.length} positions evaluated`, 'error');
                    this.showNotification('Review could not complete. Live analysis has been restored.', 'error');
                }
            }
            return this.analysisPhase === 'complete';

        } catch (error) {
            if (error?.code === 'REVIEW_CANCELLED' || this.analysisToken !== context.token) {
                if (this.analysisPhase !== 'cancelled') this.analysisPhase = 'cancelled';
                return false;
            }
            console.error('[Analyze] Analysis error:', error);
            this.analysisPhase = 'failed'; this.analysisResults = []; this.positionAnalyses = [];
            this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
            this.setStatus('Review failed. Try again.', 'error');
            this.showNotification('Review failed. Live analysis has been restored.', 'error');
            return false;
        } finally {
            if (this.reviewContext === context) {
                this.isAnalyzing = false;
                this.elements.startBtn.style.display = 'block';
                this.elements.stopBtn.style.display = 'none';
                this.elements.progressBar.style.display = 'none';
                window.CaissaUI?.setButtonLoading(this.elements.startBtn, false);
                const retryLabel = this.elements.startBtn?.lastChild;
                if (this.analysisPhase === 'failed' && retryLabel) retryLabel.textContent = ' Retry analysis';
                this.finalizeReviewMetrics(this.analysisPhase);
                this.finishReviewEngineMode(context);
            }
        }
    },

    buildMoveAnalysis(moveIndex, move, fenBefore, fenAfter, before, after) {
        const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
        const bestMove = before.bestMove || before.pv?.[0] || null;
        const bestMoveSan = this.uciToSan(fenBefore, bestMove);
        const isBestMove = !!bestMove && playedUci.toLowerCase() === bestMove.toLowerCase();
        const beforePlayerEval = this.playerPerspectiveEval(before, move.color);
        const afterPlayerEval = this.playerPerspectiveEval(after, move.color);
        const playV2Review = !!window.CaissaPlayV2ProductBoundary;
        const samplesComparable = !playV2Review || Number.isFinite(beforePlayerEval) && Number.isFinite(afterPlayerEval)
            && before.completed === true && after.completed === true
            && before.requestedDepth === after.requestedDepth
            && before.depth >= before.requestedDepth && after.depth >= after.requestedDepth;
        if (!samplesComparable) return this.buildUnavailableMoveAnalysis(moveIndex, move, 'EVALUATION_NOT_COMPARABLE');
        const loss = isBestMove ? 0 : Math.max(0, beforePlayerEval - afterPlayerEval);
        const gain = afterPlayerEval - beforePlayerEval;
        const mateSwing = this.hasMateSwing(before, after, move.color);
        const bookEvidence = playV2Review ? window.CaissaAnalyzeOpeningEvidence?.lookup?.({
            ply: moveIndex + 1, playedSan: move.san, playedUci, legal: true, fenAfter,
            positionMap: window.App?.ecoPositionMap, lookupComplete: !!window.App?.ecoPositionMap,
            recordId: this.loadedGame?.recordId || this.activeHandoffId || null,
            generation: this.analysisToken, stale: !this.isAnalyzing
        }) : null;
        const classification = this.classifyMove(loss, mateSwing, bookEvidence, moveIndex);

        return {
            moveIndex,
            move: move.san,
            fenBefore,
            fenAfter,
            playedUci,
            bestMove,
            bestMoveSan,
            recommendationAvailable: !!bestMoveSan && !!(this.loadedGame?.recordId || this.activeHandoffId)
                && before.depth > 0 && this.isAnalyzing,
            bestMoveEval: before.eval,
            recordId: this.loadedGame?.recordId || this.activeHandoffId || null,
            ply: moveIndex + 1,
            generation: this.analysisToken,
            depth: before.depth || 0,
            isBestMove,
            evalBefore: before.eval,
            evalAfter: after.eval,
            mateBefore: before.mate,
            mateAfter: after.mate,
            loss,
            gain,
            mateSwing,
            beforePlayerEval,
            afterPlayerEval,
            quality: classification.quality,
            accuracyIncluded: classification.accuracyIncluded !== false,
            book: classification.quality === 'Book',
            bookEvidence: classification.quality === 'Book' ? bookEvidence : null,
            annotation: classification.annotation,
            label: classification.label,
            mentorText: this.buildMentorText(classification, loss)
        };
    },

    buildUnavailableMoveAnalysis(moveIndex, move, reasonCode = 'POSITION_ANALYSIS_UNAVAILABLE') {
        return {
            moveIndex,
            move: move.san,
            unavailable: true,
            reasonCode,
            annotation: '-',
            label: 'Analysis unavailable'
        };
    },

    playerPerspectiveEval(analysis, color) {
        if (analysis.mate !== null && analysis.mate !== undefined) {
            const mateValue = analysis.mate > 0 ? 100 : -100;
            return color === 'w' ? mateValue : -mateValue;
        }
        const evaluation = analysis.eval;
        if (!Number.isFinite(evaluation)) return null;
        return color === 'w' ? evaluation : -evaluation;
    },

    hasMateSwing(before, after, color) {
        const beforeMate = before.mate;
        const afterMate = after.mate;
        const beforeForPlayer = beforeMate === null || beforeMate === undefined
            ? null
            : (color === 'w' ? beforeMate : -beforeMate);
        const afterForPlayer = afterMate === null || afterMate === undefined
            ? null
            : (color === 'w' ? afterMate : -afterMate);
        const allowedLosingMate = afterForPlayer !== null
            && afterForPlayer < 0
            && (beforeForPlayer === null || beforeForPlayer >= 0);
        const lostWinningMate = beforeForPlayer !== null
            && beforeForPlayer > 0
            && (afterForPlayer === null || afterForPlayer <= 0);
        return allowedLosingMate || lostWinningMate;
    },

    classifyMove(loss, mateSwing = false, bookEvidence = null, moveIndex = -1) {
        const input = window.CaissaPlayV2ProductBoundary
            ? { loss, mateSwing, bookEvidence }
            : { loss, mateSwing, book: this.isRecognizedBookPly(moveIndex) };
        const classified = window.CaissaAnalyzeReviewPolicy?.classify?.(input);
        if (!classified?.ok) return { annotation: '-', label: 'Analysis unavailable' };
        return { ...classified, label: `${classified.quality} move` };
    },

    buildMentorText(classification, loss) {
        if (classification.quality === 'Blunder') return `Blunder. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Mistake') return `Mistake. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Inaccuracy') return `Inaccuracy. The evaluation loss was ${loss.toFixed(2)} pawns.`;
        if (classification.quality === 'Book') return 'Book move from a repository-recognized opening line.';
        return 'Acceptable move. No meaningful negative threshold was crossed.';
    },

    setAnalysisCompletionStatus(analyzedPositions, totalPositions) {
        const ratio = totalPositions > 0 ? analyzedPositions / totalPositions : 0;
        if (ratio >= 0.9) {
            this.setStatus(`Analysis complete · ${analyzedPositions}/${totalPositions} positions analyzed`, 'success');
            console.log(`[Analyze] Analysis complete; ${analyzedPositions}/${totalPositions} positions analyzed`);
        } else if (ratio >= 0.5) {
            this.setStatus(`Partial analysis complete · ${analyzedPositions}/${totalPositions} positions analyzed`, 'warning');
            console.warn(`[Analyze] Partial analysis complete; ${analyzedPositions}/${totalPositions} positions analyzed`);
        } else {
            this.setStatus(`Analysis failed · only ${analyzedPositions}/${totalPositions} positions analyzed`, 'error');
            console.error(`[Analyze] Analysis failed; only ${analyzedPositions}/${totalPositions} positions analyzed`);
        }
    },

    getAnnotationClass(annotation) {
        const classes = {
            '!!': 'annotation-brilliant',
            '!': 'annotation-good',
            '!?': 'annotation-interesting',
            '?!': 'annotation-dubious',
            '?': 'annotation-mistake',
            '??': 'annotation-blunder',
            '📖': 'annotation-book',
            '-': 'annotation-unavailable'
        };
        return classes[annotation] || '';
    },

    uciToSan(fen, uci) {
        if (!uci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
        try {
            const game = new Chess(fen);
            const move = game.move({
                from: uci.slice(0, 2),
                to: uci.slice(2, 4),
                promotion: uci.slice(4, 5) || undefined
            });
            return move?.san || null;
        } catch (_error) {
            return null;
        }
    },

    uciLineToSan(fen, pv, maxMoves = 7) {
        if (!Array.isArray(pv) || !pv.length) return [];
        try {
            const game = new Chess(fen);
            const san = [];
            for (const uci of pv.slice(0, maxMoves)) {
                if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) break;
                const move = game.move({
                    from: uci.slice(0, 2),
                    to: uci.slice(2, 4),
                    promotion: uci.slice(4, 5) || undefined
                });
                if (!move) break;
                san.push(move.san);
            }
            return san;
        } catch (_error) {
            return [];
        }
    },

    formatEvaluation(evaluation, mate) {
        if (mate !== null && mate !== undefined) return `Mate ${mate}`;
        if (evaluation === null || evaluation === undefined) return '-';
        return `${evaluation >= 0 ? '+' : ''}${evaluation.toFixed(2)}`;
    },

    /**
     * Stop ongoing analysis
     */
    stopAnalysis({ restoreLive = true, reason = 'user-cancelled' } = {}) {
        console.log('[Analyze] Stopping analysis...');
        if (this.reviewContext && !restoreLive) this.reviewContext.restoreLive = false;
        this.isAnalyzing = false;
        this.analysisToken += 1;
        this.analysisPhase = 'cancelled'; this.analysisResults = []; this.positionAnalyses = [];
        const cancelSearch = this.activeReviewSearchCancel;
        if (cancelSearch) cancelSearch(reason);
        else this.analysisEngine?.cancelAttributedSearch?.();
        this.updateMoveList(); this.updateReviewSummary(); this.updateCriticalMoments();
        this.setStatus('Analysis cancelled', 'warning');
    },

    teardownAnalysisEngine(reason = 'owner-exit') {
        if (!this.analysisEngine) return;
        this.analysisEngine.cancelAttributedSearch?.();
        this.analysisEngine.onInfo = null; this.analysisEngine.onBestMove = null;
        this.analysisEngine.stop?.(); this.analysisEngine.terminate?.(reason);
        this.analysisEngine = null; this.liveEngineOwner = null;
    },

    /**
     * Analyze single position with Stockfish
     */
    async ensureAnalysisEngine() {
        if (this.analysisEngine?.isReady?.()) return this.analysisEngine;
        if (!this.analysisEngine && window.EngineRegistry?.createAnalyzeEngine) {
            this.analysisEngine = EngineRegistry.createAnalyzeEngine('stockfish-18-lite', {
                autoStart: false, owner: 'analyze-v2-stockfish-18', handshakeTimeoutMs: 8000, searchTimeoutMs: 12000
            });
        }
        if (!this.analysisEngine) return null;
        try { await this.analysisEngine.start?.(); }
        catch (_) { this.teardownAnalysisEngine('handshake-failed'); return null; }
        return this.analysisEngine?.isReady?.() ? this.analysisEngine : null;
    },

    async analyzePositionWithRetry(fen, token) {
        try {
            return await this.analyzePosition(fen, token, this.reviewDepth, this.reviewPositionTimeoutMs,
                { tokenType: 'review', owner: 'analyze-review' });
        } catch (error) {
            if (token !== this.analysisToken || !this.isAnalyzing) return null;
            if (error?.code === 'REVIEW_POSITION_TIMEOUT' && this.reviewRunMetrics) {
                this.reviewRunMetrics.timeouts += 1;
            }
            if (this.reviewRunMetrics) this.reviewRunMetrics.retries += 1;
            console.warn('[Analyze] Position analysis failed; retrying at lower depth');
            try {
                return await this.analyzePosition(fen, token, this.reviewRetryDepth, this.reviewPositionTimeoutMs,
                    { tokenType: 'review', owner: 'analyze-review' });
            } catch (retryError) {
                if (retryError?.code === 'REVIEW_POSITION_TIMEOUT' && this.reviewRunMetrics) {
                    this.reviewRunMetrics.timeouts += 1;
                }
                if (token !== this.analysisToken || !this.isAnalyzing) return null;
                console.warn('[Analyze] Position analysis unavailable after retry');
                throw Object.assign(new Error('Stockfish could not evaluate the current review position.'), {
                    code: 'REVIEW_POSITION_UNAVAILABLE',
                    cause: retryError
                });
            }
        }
    },

    isAnalyzeTokenActive(token, tokenType = 'review') {
        if (tokenType === 'live') {
            return this.liveEngineEnabled
                && !this.isAnalyzing
                && token === this.liveEngineToken
                && this.isAnalyzeActive();
        }
        return this.isAnalyzing && token === this.analysisToken && this.isAnalyzeActive();
    },

    handleLiveEngineInfo({ info, generation, token, fen, positionIndex }) {
        if (!info?.pv?.length
            || generation !== this.liveEngineGenerationId
            || !this.isAnalyzeTokenActive(token, 'live')
            || fen !== this.liveCurrentFen
            || fen !== this.getGame()?.fen?.()) return;

        const multipv = Math.max(1, Math.min(this.liveMultiPvCount, Number(info.multipv) || 1));
        const previous = this.liveMultiPvLines[multipv];
        if (previous && Number(previous.depth || 0) > Number(info.depth || 0)) return;
        this.liveMultiPvLines[multipv] = {
            multipv,
            eval: Number.isFinite(info.score) ? info.score : null,
            mate: Number.isFinite(info.mate) ? info.mate : null,
            bestMove: info.pv[0],
            depth: info.depth ?? 0,
            pv: [...info.pv]
        };

        const lines = Object.values(this.liveMultiPvLines)
            .sort((left, right) => left.multipv - right.multipv)
            .slice(0, this.liveMultiPvCount);
        const primary = lines.find((line) => line.multipv === 1) || lines[0];
        this.queueLiveEngineUi({
            ...primary,
            fen,
            lines
        }, { token, fen, positionIndex });
    },

    queueLiveEngineUi(result, context) {
        this.liveUiPendingResult = { result, context };
        const elapsed = Date.now() - this.liveUiLastRenderAt;
        if (!this.liveCurrentResult || elapsed >= this.liveUiThrottleMs) {
            this.flushLiveEngineUi();
            return;
        }
        if (this.liveUiTimer !== null) return;
        this.liveUiTimer = setTimeout(() => this.flushLiveEngineUi(), this.liveUiThrottleMs - elapsed);
    },

    flushLiveEngineUi() {
        clearTimeout(this.liveUiTimer);
        this.liveUiTimer = null;
        const pending = this.liveUiPendingResult;
        this.liveUiPendingResult = null;
        if (!pending) return;
        const { result, context } = pending;
        if (!this.isAnalyzeTokenActive(context.token, 'live')
            || context.fen !== this.liveCurrentFen
            || context.fen !== this.getGame()?.fen?.()) return;

        this.liveCurrentResult = result;
        this.livePositionAnalyses[context.positionIndex] = result;
        this.liveUiLastRenderAt = Date.now();
        this.updateEvaluationBar();
        this.updateLiveMentorPanel({ result, fen: context.fen });
    },

    analyzePosition(fen, token, depth = 12, timeoutMs = 12000, options = {}) {
        return new Promise((resolve, reject) => {
            const engine = this.analysisEngine;
            if (!engine?.isReady?.()) {
                reject(Object.assign(new Error('Stockfish engine is not ready'), { code: 'REVIEW_ENGINE_NOT_READY' }));
                return;
            }

            const tokenType = options.tokenType || 'review';
            const owner = options.owner || (tokenType === 'live' ? 'analyze-live' : 'analyze-review');
            let latestInfo = null;
            let settled = false;
            let requestGeneration = null;
            let cancelSearch = null;
            const cleanup = () => {
                clearTimeout(timeout);
                if (this.activeReviewSearchCancel === cancelSearch) this.activeReviewSearchCancel = null;
                if (this.liveEngineOwner === owner) this.liveEngineOwner = null;
            };
            const finish = (result) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };
            const fail = (code, message) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(Object.assign(new Error(message), { code }));
            };
            const timeout = setTimeout(() => {
                engine.cancelAttributedSearch?.();
                fail('REVIEW_POSITION_TIMEOUT', 'Stockfish review position timed out');
            }, timeoutMs);

            cancelSearch = () => {
                engine.cancelAttributedSearch?.();
                fail('REVIEW_CANCELLED', 'Review search canceled');
            };
            if (tokenType === 'review') this.activeReviewSearchCancel = cancelSearch;
            this.liveEngineOwner = owner;
            requestGeneration = engine.getBestMoveAttributed?.(fen, (bestMove, _ponder, generation) => {
                if (generation !== requestGeneration || !this.isAnalyzeTokenActive(token, tokenType)) {
                    fail('REVIEW_STALE_RESULT', 'Stale analysis result rejected');
                    return;
                }
                const score = latestInfo?.score;
                const mate = latestInfo?.mate;
                if (!Number.isFinite(score) && !Number.isFinite(mate)) {
                    fail('REVIEW_MISSING_EVALUATION', 'Stockfish returned no attributable evaluation');
                    return;
                }
                const terminal = !bestMove;
                finish({
                    eval: Number.isFinite(score) ? score : null,
                    mate: Number.isFinite(mate) ? mate : null,
                    bestMove,
                    depth: terminal ? depth : latestInfo?.depth ?? 0,
                    requestedDepth: depth,
                    completed: terminal || (latestInfo?.depth ?? 0) >= depth,
                    pv: latestInfo?.pv ?? []
                });
            }, {
                depth,
                multiPv: 1,
                onInfo: (info, generation) => {
                    if (generation !== requestGeneration || !this.isAnalyzeTokenActive(token, tokenType)) return;
                    latestInfo = info;
                }
            });
            if (!requestGeneration) {
                fail('REVIEW_SEARCH_NOT_STARTED', 'Stockfish review search could not start');
            }
        });
    },

    /**
     * Update progress bar
     */
    updateProgress(percent, text) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percent}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text || `${percent}%`;
        }
    },

    /**
     * Set status display
     */
    setStatus(text, type = 'ready') {
        if (!this.elements.status) return;

        this.elements.status.textContent = text;
        this.elements.status.setAttribute('role', 'status');
        this.elements.status.setAttribute('aria-live', 'polite');
        this.elements.status.className = 'metadata-value badge';

        switch (type) {
            case 'loading':
                this.elements.status.style.background = 'var(--accent-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'success':
                this.elements.status.style.background = 'var(--success-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'error':
                this.elements.status.style.background = 'var(--danger-color)';
                this.elements.status.style.color = 'white';
                break;
            case 'warning':
                this.elements.status.style.background = '#ffc107';
                this.elements.status.style.color = '#333';
                break;
            default:
                this.elements.status.style.background = 'var(--success-color)';
                this.elements.status.style.color = 'white';
        }
    },

    /**
     * Open Library panel
     */
    openLibrary() {
        if (window.LibraryUI && typeof window.LibraryUI.open === 'function') {
            window.LibraryUI.open();
        } else {
            const toggleBtn = document.getElementById('libraryToggleBtn');
            if (toggleBtn) toggleBtn.click();
        }
    },

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        if (window.CaissaNotify) {
            CaissaNotify[type](message);
        } else if (window.showNotification) {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    },

    /**
     * Section lifecycle: Enter
     */
    onEnter(options = {}) {
        console.log('[Analyze] Section entered');
        window.CaissaClockService?.stop('analyze-enter');
        this.analysisPhase = 'idle'; this.analyzedPositions = 0; this.analysisResults = []; this.positionAnalyses = [];
        const requestedToken = new URLSearchParams(window.location.search).get('handoff');
        const handoff = options.handoff ? { ok: true, value: options.handoff }
            : window.CaissaAnalyzeHandoff?.resolve?.(requestedToken);
        if (handoff?.ok && handoff.value?.handoffId !== this.activeHandoffId) {
            this.activeHandoffId = handoff.value.handoffId;
            const payload = handoff.value.payload;
            if (payload.pgn) {
                this.loadGameFromPgn(payload.pgn, 'Play handoff', {
                    white: payload.whiteLabel || 'White', black: payload.blackLabel || 'Black',
                    result: payload.result || '*', termination: payload.termination || null,
                    recordId: payload.recordId
                });
            } else if (payload.finalFen) {
                const session = window.CaissaAnalyzeSession?.createSession?.({ initialFen: payload.finalFen });
                const game = session?.game;
                if (game) {
                    this.session = session;
                    this.loadedGame = {
                        pgn: '', game, initialFen: payload.finalFen, source: 'Play position',
                        white: 'White', black: 'Black', result: payload.result || '*',
                        event: '', date: '', eco: '', opening: '', headers: { ...game.header() },
                        movesSan: [], movesVerbose: []
                    };
                    this.currentMoveIndex = -1;
                }
            }
            this.boardFlipped = payload.boardOrientation === 'black';
        }
        this.analysisPhase = 'idle'; this.analyzedPositions = 0;
        this.totalPositions = this.getLoadedMoves().length + 1;
        this.analysisResults = []; this.positionAnalyses = [];
        this.updateReviewSummary(); this.updateCriticalMoments(); this.updateEvaluationBar();
        this.updateLiveEngineButton();
        if (!this.loadedGame) {
            this.resetStudyBoard({ silent: true });
        } else {
            this.ensureStudyBoard();
        }
        setTimeout(() => {
            this.ensureAnalyzeBoard();
            this.ensureStudyBoard();
            this.applyAnalyzeOrientation();
            this.board?.resize?.();
            if (this.liveEngineEnabled && window.CaissaAnalyzeV2Shell?.activeView === 'analysis') {
                this.refreshLiveEvaluation();
            }
        }, 0);
    },

    /**
     * Section lifecycle: Exit
     */
    onExit() {
        this.cancelGameUrlImport();
        if (this.setupModeActive) {
            this.cancelSetupPosition();
            window.CaissaAnalyzeV2Shell?.selectView?.('analysis', { focus: false, announce: false });
        }
        if (document.body?.classList?.contains('caissa-coach-review-summary-active')
            || document.body?.classList?.contains('caissa-bots-guided-review-active')) {
            window.App?.restorePlayBoardAfterCoachReview?.();
        }
        if (this.liveEngineEnabled) {
            clearTimeout(this.liveEngineTimer);
            clearTimeout(this.liveUiTimer);
            this.liveUiTimer = null;
            this.liveUiPendingResult = null;
            this.liveEngineToken += 1;
            const canceled = this.analysisEngine?.cancelAttributedSearch?.();
            if (!canceled) this.analysisEngine?.stop?.();
            if (this.analysisEngine) {
                this.analysisEngine.onInfo = null;
                this.analysisEngine.onBestMove = null;
            }
            this.liveEngineOwner = null;
            this.liveEngineGenerationId = null;
            this.liveMultiPvLines = {};
        }
        // Stop analysis if running
        if (this.isAnalyzing) {
            this.stopAnalysis();
        }
        this.teardownAnalysisEngine('analyze-exit');
    }
};

// Add move list styles inline
const style = document.createElement('style');
style.textContent = `
    .move-list-grid {
        font-size: 13px;
    }
    .move-row {
        display: grid;
        grid-template-columns: 30px 1fr 1fr;
        gap: 4px;
        padding: 4px 0;
        border-bottom: 1px solid var(--border-color);
    }
    .move-row:hover {
        background: var(--bg-primary);
    }
    .move-num {
        color: var(--text-secondary);
        font-weight: 500;
    }
    .move-white, .move-black {
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 3px;
    }
    .move-white:hover, .move-black:hover {
        background: var(--primary-color);
        color: white;
    }
    .move-white.active, .move-black.active {
        background: var(--primary-color);
        color: white;
    }
`;
document.head.appendChild(style);

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AnalyzeSection.init();
    });
} else {
    AnalyzeSection.init();
}

// Register with navigation system
if (window.CaissaNavigation) {
    CaissaNavigation.sections.analyze = AnalyzeSection;
}

// Expose globally
window.AnalyzeSection = AnalyzeSection;
