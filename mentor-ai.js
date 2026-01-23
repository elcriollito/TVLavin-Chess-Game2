/**
 * CAISSA Mentor AI - Main Chat Module
 *
 * Handles the chat interface, context collection, and communication
 * between the chess app and the LLM provider.
 *
 * Features:
 * - Engine-backed analysis with Stockfish WASM
 * - Engine lock to prevent analysis collisions
 * - FEN-based cache for performance
 * - Shared API support (no key required for casual users)
 */

const MentorAI = {

    // State
    isOpen: false,
    isLoading: false,
    chatHistory: [],
    currentFen: null,
    currentPgn: null,
    currentEvaluation: null,

    // MultiPV analysis results (for engineReport)
    multiPvResults: [],  // Array of { multipv, evalCp, mateIn, pv, uci }
    lastAnalysisDepth: 0,

    // Engine lock state
    engineLock: {
        isLocked: false,
        lockOwner: null,
        previousMultiPV: 1,
        wasAnalyzing: false
    },

    // FEN-based cache for engine analysis
    analysisCache: new Map(),
    CACHE_TTL_MS: 30000, // 30 seconds
    CACHE_MAX_ENTRIES: 50,

    // DOM Elements (cached after init)
    elements: {},

    // Configuration
    config: {
        maxHistoryLength: 20,
        storageKey: 'caissa_mentor_settings',
        useStockfishGuidance: true,  // Default: ON
        multiPvCount: 3,  // Number of candidate moves to collect
        analysisDepth: 14,
        analysisTimeout: 1500  // 1.5 seconds
    },

    // Session-only API key (not persisted)
    _sessionApiKey: null,

    /**
     * Initialize the Mentor AI module
     */
    init() {
        this.cacheElements();
        this.loadSettings();
        this.bindEvents();
        this.updateContextDisplay();

        console.log('CAISSA Mentor AI initialized');
    },

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            panel: document.getElementById('mentorPanel'),
            toggleBtn: document.getElementById('mentorToggleBtn'),
            closeBtn: document.getElementById('mentorCloseBtn'),
            messages: document.getElementById('mentorMessages'),
            input: document.getElementById('mentorInput'),
            sendBtn: document.getElementById('mentorSendBtn'),
            sendPositionBtn: document.getElementById('mentorSendPosition'),
            analyzeBtn: document.getElementById('mentorAnalyze'),
            modeSelect: document.getElementById('mentorMode'),
            fenPreview: document.getElementById('mentorFenPreview'),
            context: document.getElementById('mentorContext'),
            settingsToggle: document.getElementById('mentorSettingsToggle'),
            settingsContent: document.getElementById('mentorSettingsContent'),
            providerSelect: document.getElementById('mentorProvider'),
            modelSelect: document.getElementById('mentorModel'),
            apiKeyInput: document.getElementById('mentorApiKey'),
            saveSettingsBtn: document.getElementById('mentorSaveSettings'),
            stockfishToggle: document.getElementById('mentorStockfishToggle'),
            engineBadge: document.getElementById('mentorEngineBadge'),
            rateLimitInfo: document.getElementById('mentorRateLimitInfo')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Panel toggle
        this.elements.toggleBtn?.addEventListener('click', () => this.toggle());
        this.elements.closeBtn?.addEventListener('click', () => this.close());

        // Send message
        this.elements.sendBtn?.addEventListener('click', () => this.sendMessage());
        this.elements.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Quick actions
        this.elements.sendPositionBtn?.addEventListener('click', () => this.sendPosition());
        this.elements.analyzeBtn?.addEventListener('click', () => this.quickAnalyze());

        // Settings
        this.elements.settingsToggle?.addEventListener('click', () => this.toggleSettings());
        this.elements.saveSettingsBtn?.addEventListener('click', () => this.saveSettings());

        // Provider change updates model options
        this.elements.providerSelect?.addEventListener('change', () => this.updateModelOptions());

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Click outside to close (mobile)
        document.addEventListener('click', (e) => {
            if (this.isOpen &&
                !this.elements.panel?.contains(e.target) &&
                !this.elements.toggleBtn?.contains(e.target)) {
                // Only on mobile
                if (window.innerWidth <= 768) {
                    this.close();
                }
            }
        });
    },

    /**
     * Load saved settings from localStorage
     * NOTE: API keys are NOT persisted - session only for security
     */
    loadSettings() {
        try {
            // Load provider/model settings (NOT API key)
            const settings = localStorage.getItem(this.config.storageKey);
            if (settings) {
                const parsed = JSON.parse(settings);
                if (this.elements.providerSelect && parsed.provider) {
                    this.elements.providerSelect.value = parsed.provider;
                }
                if (this.elements.modelSelect && parsed.model) {
                    this.elements.modelSelect.value = parsed.model;
                }
                // Load Stockfish guidance preference
                if (parsed.useStockfishGuidance !== undefined) {
                    this.config.useStockfishGuidance = parsed.useStockfishGuidance;
                }
            }

            // Update Stockfish toggle UI
            if (this.elements.stockfishToggle) {
                this.elements.stockfishToggle.checked = this.config.useStockfishGuidance;
            }

            // Initialize provider with saved settings (no API key yet)
            this.initializeProvider();
        } catch (e) {
            console.warn('Failed to load mentor settings:', e);
        }
    },

    /**
     * Save settings to localStorage
     * NOTE: API key is stored in memory only (session-based) for security
     */
    saveSettings() {
        try {
            const provider = this.elements.providerSelect?.value || 'together';
            const model = this.elements.modelSelect?.value || '';
            const apiKey = this.elements.apiKeyInput?.value?.trim();
            const useStockfishGuidance = this.elements.stockfishToggle?.checked ?? true;

            // Update config
            this.config.useStockfishGuidance = useStockfishGuidance;

            // Save provider/model/stockfish settings (NOT API key - that stays in memory only)
            localStorage.setItem(this.config.storageKey, JSON.stringify({
                provider,
                model,
                useStockfishGuidance
            }));

            // Store API key in memory only (session-based, not persisted)
            if (apiKey) {
                this._sessionApiKey = apiKey;
            }

            // Initialize provider with new settings
            this.initializeProvider();

            // Show appropriate message based on API key status
            if (apiKey) {
                this.showNotification('Settings saved! API key stored for this session.');
            } else if (provider === 'together') {
                this.showNotification('Settings saved! Using shared API (rate limited).');
            } else {
                this.showNotification('Settings saved! Add an API key to use this provider.');
            }

            this.toggleSettings(); // Close settings panel
        } catch (e) {
            console.error('Failed to save settings:', e);
            this.showError('Failed to save settings');
        }
    },

    /**
     * Initialize the LLM provider with current settings
     */
    initializeProvider() {
        const provider = this.elements.providerSelect?.value || 'together';
        const model = this.elements.modelSelect?.value || '';
        const apiKey = this.elements.apiKeyInput?.value?.trim() || this._sessionApiKey;

        if (typeof LLMProvider !== 'undefined') {
            LLMProvider.initialize({ provider, model: model || undefined });
            if (apiKey) {
                LLMProvider.setApiKey(apiKey);
                this._sessionApiKey = apiKey; // Keep in memory
            }

            // Update UI to show if shared API is available
            this.updateApiKeyHelp(provider);
        }
    },

    /**
     * Toggle settings panel
     */
    toggleSettings() {
        const content = this.elements.settingsContent;
        if (content) {
            const isOpening = content.style.display === 'none';
            content.style.display = isOpening ? 'block' : 'none';
            if (isOpening) {
                this.updateModelOptions();
            }
        }
    },

    /**
     * Update model dropdown based on selected provider
     */
    updateModelOptions() {
        const provider = this.elements.providerSelect?.value || 'together';
        const modelSelect = this.elements.modelSelect;
        if (!modelSelect) return;

        // Hide all optgroups
        const togetherGroup = document.getElementById('mentorModelTogether');
        const llamaGroup = document.getElementById('mentorModelLlama');
        const openaiGroup = document.getElementById('mentorModelOpenai');
        const anthropicGroup = document.getElementById('mentorModelAnthropic');
        const localGroup = document.getElementById('mentorModelLocal');

        if (togetherGroup) togetherGroup.style.display = 'none';
        if (llamaGroup) llamaGroup.style.display = 'none';
        if (openaiGroup) openaiGroup.style.display = 'none';
        if (anthropicGroup) anthropicGroup.style.display = 'none';
        if (localGroup) localGroup.style.display = 'none';

        // Show selected provider's optgroup
        let activeGroup;
        switch (provider) {
            case 'together':
                if (togetherGroup) togetherGroup.style.display = '';
                activeGroup = togetherGroup;
                break;
            case 'llama':
                if (llamaGroup) llamaGroup.style.display = '';
                activeGroup = llamaGroup;
                break;
            case 'openai':
                if (openaiGroup) openaiGroup.style.display = '';
                activeGroup = openaiGroup;
                break;
            case 'anthropic':
                if (anthropicGroup) anthropicGroup.style.display = '';
                activeGroup = anthropicGroup;
                break;
            case 'local':
                if (localGroup) localGroup.style.display = '';
                activeGroup = localGroup;
                break;
            default:
                // For custom or unknown, show nothing specific
                break;
        }

        // Select first option in active group if current selection is hidden
        if (activeGroup && modelSelect.selectedOptions[0]?.parentElement !== activeGroup) {
            const firstOption = activeGroup.querySelector('option');
            if (firstOption) {
                modelSelect.value = firstOption.value;
            }
        }

        // Update API key help text based on provider
        this.updateApiKeyHelp(provider);
    },

    /**
     * Update API key help text and input state based on provider
     */
    updateApiKeyHelp(provider) {
        const togetherHelp = document.getElementById('mentorKeyHelpTogether');
        const llamaHelp = document.getElementById('mentorKeyHelpLlama');
        const openaiHelp = document.getElementById('mentorKeyHelpOpenai');
        const anthropicHelp = document.getElementById('mentorKeyHelpAnthropic');
        const localHelp = document.getElementById('mentorKeyHelpLocal');
        const sharedApiNote = document.getElementById('mentorSharedApiNote');
        const apiKeyInput = this.elements.apiKeyInput;

        // Hide all help texts
        if (togetherHelp) togetherHelp.style.display = 'none';
        if (llamaHelp) llamaHelp.style.display = 'none';
        if (openaiHelp) openaiHelp.style.display = 'none';
        if (anthropicHelp) anthropicHelp.style.display = 'none';
        if (localHelp) localHelp.style.display = 'none';
        if (sharedApiNote) sharedApiNote.style.display = 'none';

        // Show relevant help and configure input
        switch (provider) {
            case 'together':
                if (togetherHelp) togetherHelp.style.display = '';
                if (sharedApiNote) sharedApiNote.style.display = ''; // Show shared API option
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Optional - leave empty for shared API';
                    apiKeyInput.disabled = false;
                }
                break;
            case 'llama':
                if (llamaHelp) llamaHelp.style.display = '';
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Enter your Llama API key';
                    apiKeyInput.disabled = false;
                }
                break;
            case 'anthropic':
                if (anthropicHelp) anthropicHelp.style.display = '';
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Enter your Anthropic API key';
                    apiKeyInput.disabled = false;
                }
                break;
            case 'local':
                if (localHelp) localHelp.style.display = '';
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Not required for local models';
                    apiKeyInput.disabled = true;
                    apiKeyInput.value = '';
                }
                break;
            case 'openai':
                if (openaiHelp) openaiHelp.style.display = '';
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Enter your OpenAI API key';
                    apiKeyInput.disabled = false;
                }
                break;
            default:
                // Custom or unknown provider
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Enter your API key';
                    apiKeyInput.disabled = false;
                }
                break;
        }
    },

    /**
     * Toggle mentor panel open/closed
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    /**
     * Open the mentor panel
     */
    open() {
        this.isOpen = true;
        this.elements.panel?.classList.add('open');
        this.elements.toggleBtn?.classList.add('active');

        // Add push layout on desktop (> 768px)
        if (window.innerWidth > 768) {
            document.body.classList.add('mentor-push-layout');
        }

        this.updateContext();
        this.elements.input?.focus();
    },

    /**
     * Close the mentor panel
     */
    close() {
        this.isOpen = false;
        this.elements.panel?.classList.remove('open');
        this.elements.toggleBtn?.classList.remove('active');
        document.body.classList.remove('mentor-push-layout');
    },

    /**
     * Update chess context from the main app
     */
    updateContext() {
        // Get current position from App
        if (typeof App !== 'undefined' && App.game) {
            this.currentFen = App.game.fen();
            this.currentPgn = App.game.pgn();

            // Get evaluation if available
            if (App.currentEvaluation) {
                this.currentEvaluation = {
                    score: App.currentEvaluation.score,
                    depth: App.currentEvaluation.depth,
                    bestMove: App.currentEvaluation.bestMove,
                    pv: App.currentEvaluation.pv,
                    mate: App.currentEvaluation.mate
                };
            }
        }

        this.updateContextDisplay();
    },

    // ============================================
    // ENGINE LOCK SYSTEM
    // ============================================

    /**
     * Acquire engine lock for exclusive access
     * @param {string} owner - Identifier for the lock owner
     * @returns {boolean} - True if lock acquired
     */
    acquireEngineLock(owner) {
        if (this.engineLock.isLocked && this.engineLock.lockOwner !== owner) {
            console.log(`Engine lock denied to ${owner} - owned by ${this.engineLock.lockOwner}`);
            return false;
        }

        if (typeof App !== 'undefined' && App.engine) {
            // Store current state
            this.engineLock.previousMultiPV = App.engine.multiPV || 1;
            this.engineLock.wasAnalyzing = App.engine.isAnalyzing || false;

            // Stop any ongoing analysis
            if (this.engineLock.wasAnalyzing) {
                App.engine.stop();
            }
        }

        this.engineLock.isLocked = true;
        this.engineLock.lockOwner = owner;
        console.log(`Engine lock acquired by ${owner}`);
        return true;
    },

    /**
     * Release engine lock and restore previous state
     * @param {string} owner - Must match the lock owner
     */
    releaseEngineLock(owner) {
        if (this.engineLock.lockOwner !== owner) {
            console.warn(`Cannot release engine lock - not owned by ${owner}`);
            return;
        }

        if (typeof App !== 'undefined' && App.engine) {
            // Restore previous MultiPV setting
            App.engine.setMultiPV(this.engineLock.previousMultiPV);

            // Optionally resume analysis if it was running before
            // (Usually the main app handles this via its own triggers)
        }

        this.engineLock.isLocked = false;
        this.engineLock.lockOwner = null;
        console.log(`Engine lock released by ${owner}`);
    },

    // ============================================
    // ANALYSIS CACHE SYSTEM
    // ============================================

    /**
     * Generate cache key from FEN and analysis parameters
     */
    getCacheKey(fen, depth, multiPv) {
        return `${fen}|d${depth}|pv${multiPv}`;
    },

    /**
     * Get cached analysis result if valid
     * @returns {Object|null} - Cached engineReport or null
     */
    getCachedAnalysis(fen) {
        const key = this.getCacheKey(fen, this.config.analysisDepth, this.config.multiPvCount);
        const cached = this.analysisCache.get(key);

        if (!cached) return null;

        // Check if cache is still valid
        if (Date.now() - cached.timestamp > this.CACHE_TTL_MS) {
            this.analysisCache.delete(key);
            return null;
        }

        console.log('Using cached analysis for FEN');
        return cached.report;
    },

    /**
     * Store analysis result in cache
     */
    setCachedAnalysis(fen, report) {
        const key = this.getCacheKey(fen, this.config.analysisDepth, this.config.multiPvCount);

        // Enforce cache size limit
        if (this.analysisCache.size >= this.CACHE_MAX_ENTRIES) {
            // Remove oldest entry
            const oldestKey = this.analysisCache.keys().next().value;
            this.analysisCache.delete(oldestKey);
        }

        this.analysisCache.set(key, {
            report,
            timestamp: Date.now()
        });
    },

    /**
     * Clear analysis cache
     */
    clearCache() {
        this.analysisCache.clear();
    },

    // ============================================
    // ENGINE REPORT BUILDING
    // ============================================

    /**
     * Build engineReport from current analysis data
     * Normalizes evaluations to decimal format
     * @returns {Object|null} engineReport for LLM prompt
     */
    buildEngineReport() {
        if (!this.currentFen) return null;

        // Extract side to move from FEN
        const fenParts = this.currentFen.split(' ');
        const sideToMove = fenParts[1] === 'w' ? 'White' : 'Black';

        // If we don't have any evaluation data, return null
        if (!this.currentEvaluation && this.multiPvResults.length === 0) {
            return null;
        }

        // Build the report
        const report = {
            fen: this.currentFen,
            sideToMove: sideToMove,
            depth: this.lastAnalysisDepth || this.currentEvaluation?.depth || 0,
            evalCp: null,
            evalPawns: null, // Normalized decimal format
            mateIn: null,
            topMoves: [],
            moveComparison: null // Will note if moves are roughly equal
        };

        // Use MultiPV results if available
        if (this.multiPvResults.length > 0) {
            // Main eval from PV 1
            const mainLine = this.multiPvResults.find(r => r.multipv === 1);
            if (mainLine) {
                if (mainLine.mateIn !== undefined && mainLine.mateIn !== null) {
                    report.mateIn = mainLine.mateIn;
                } else {
                    report.evalCp = mainLine.evalCp;
                    report.evalPawns = (mainLine.evalCp / 100).toFixed(2);
                }
            }

            // Build topMoves array with normalized evals
            report.topMoves = this.multiPvResults
                .sort((a, b) => a.multipv - b.multipv)
                .slice(0, 3)
                .map(r => ({
                    uci: r.uci,
                    san: r.san || null,
                    evalCp: r.evalCp,
                    evalPawns: r.evalCp !== null ? (r.evalCp / 100).toFixed(2) : null,
                    mateIn: r.mateIn,
                    pv: r.pv
                }));

            // Check if top moves are roughly equal (within 0.10 pawns)
            if (report.topMoves.length >= 2) {
                const move1Eval = report.topMoves[0].evalCp;
                const move2Eval = report.topMoves[1].evalCp;
                if (move1Eval !== null && move2Eval !== null) {
                    const diff = Math.abs(move1Eval - move2Eval) / 100;
                    if (diff < 0.10) {
                        report.moveComparison = 'roughly_equal';
                        report.topMoves[0].note = 'best';
                        report.topMoves[1].note = 'equally good';
                    } else if (diff < 0.30) {
                        report.moveComparison = 'slight_difference';
                    } else {
                        report.moveComparison = 'significant_difference';
                    }
                }
            }
        }
        // Fallback to basic evaluation
        else if (this.currentEvaluation) {
            if (this.currentEvaluation.mate !== undefined && this.currentEvaluation.mate !== null) {
                report.mateIn = this.currentEvaluation.mate;
            } else if (this.currentEvaluation.score !== undefined) {
                // score is already in pawns (e.g., 0.35), convert to centipawns
                report.evalCp = Math.round(this.currentEvaluation.score * 100);
                report.evalPawns = this.currentEvaluation.score.toFixed(2);
            }

            // Create single topMove from bestMove
            if (this.currentEvaluation.bestMove) {
                report.topMoves = [{
                    uci: this.currentEvaluation.bestMove,
                    san: null,
                    evalCp: report.evalCp,
                    evalPawns: report.evalPawns,
                    mateIn: report.mateIn,
                    pv: this.currentEvaluation.pv || null
                }];
            }
        }

        // Only return if we have some useful data
        if (report.evalCp !== null || report.mateIn !== null || report.topMoves.length > 0) {
            return report;
        }

        return null;
    },

    /**
     * Request MultiPV analysis from the engine (if available)
     * Uses engine lock to prevent collisions
     * Call this before sending to get fresh top moves
     */
    async requestMultiPvAnalysis() {
        return new Promise((resolve) => {
            // Check if engine is available
            if (typeof App === 'undefined' || !App.engine || !App.engine.ready) {
                console.log('Engine not available for MultiPV analysis');
                resolve(false);
                return;
            }

            const fen = this.currentFen;
            if (!fen) {
                resolve(false);
                return;
            }

            // Check cache first
            const cached = this.getCachedAnalysis(fen);
            if (cached) {
                // Restore from cache
                this.multiPvResults = cached.topMoves.map((m, idx) => ({
                    multipv: idx + 1,
                    evalCp: m.evalCp,
                    mateIn: m.mateIn,
                    uci: m.uci,
                    san: m.san,
                    pv: m.pv
                }));
                this.lastAnalysisDepth = cached.depth;
                resolve(true);
                return;
            }

            // Try to acquire engine lock
            if (!this.acquireEngineLock('mentor')) {
                console.log('Could not acquire engine lock - using existing data');
                resolve(false);
                return;
            }

            // Clear previous results
            this.multiPvResults = [];
            this.lastAnalysisDepth = 0;

            // Set MultiPV to 3
            App.engine.setMultiPV(this.config.multiPvCount);

            // Set up analysis with timeout
            const timeout = setTimeout(() => {
                console.log('MultiPV analysis timeout - using partial results');
                App.engine.stop();
                App.engine.onInfo = originalOnInfo;
                this.releaseEngineLock('mentor');

                // Cache partial results
                const report = this.buildEngineReport();
                if (report) {
                    this.setCachedAnalysis(fen, report);
                }

                resolve(true);
            }, this.config.analysisTimeout);

            let lastDepth = 0;

            // Store original onInfo callback
            const originalOnInfo = App.engine.onInfo;

            App.engine.onInfo = (info) => {
                // Track depth
                if (info.depth > lastDepth) {
                    lastDepth = info.depth;
                    this.lastAnalysisDepth = info.depth;
                }

                // Store MultiPV result
                if (info.pv && info.pv.length > 0) {
                    const multipv = info.multipv || 1;
                    const uciMove = info.pv[0];

                    // Convert UCI to SAN if possible
                    let sanMove = null;
                    if (typeof App !== 'undefined' && App.game) {
                        try {
                            const tempGame = new Chess(fen);
                            const moveObj = tempGame.move({
                                from: uciMove.slice(0, 2),
                                to: uciMove.slice(2, 4),
                                promotion: uciMove.length > 4 ? uciMove[4] : undefined
                            });
                            if (moveObj) sanMove = moveObj.san;
                        } catch (e) {
                            // SAN conversion failed, use UCI
                        }
                    }

                    // Update or add result for this multipv
                    const existingIdx = this.multiPvResults.findIndex(r => r.multipv === multipv);
                    const result = {
                        multipv: multipv,
                        evalCp: info.score !== undefined ? Math.round(info.score * 100) : null,
                        mateIn: info.mate,
                        uci: uciMove,
                        san: sanMove,
                        pv: info.pv.slice(0, 8).join(' ') // First 8 moves of PV
                    };

                    if (existingIdx >= 0) {
                        this.multiPvResults[existingIdx] = result;
                    } else {
                        this.multiPvResults.push(result);
                    }
                }

                // Check if we have enough data (depth 12+ with all PVs)
                if (lastDepth >= 12 && this.multiPvResults.length >= this.config.multiPvCount) {
                    clearTimeout(timeout);
                    App.engine.stop();
                    App.engine.onInfo = originalOnInfo;
                    this.releaseEngineLock('mentor');

                    // Cache the results
                    const report = this.buildEngineReport();
                    if (report) {
                        this.setCachedAnalysis(fen, report);
                    }

                    resolve(true);
                }
            };

            // Start analysis at depth 14
            App.engine.setPosition(fen);
            App.engine.go({ depth: this.config.analysisDepth });
        });
    },

    /**
     * Update the context display in the UI
     */
    updateContextDisplay() {
        if (this.elements.fenPreview) {
            if (this.currentFen) {
                // Show abbreviated FEN
                const shortFen = this.currentFen.split(' ')[0];
                const displayFen = shortFen.length > 30
                    ? shortFen.substring(0, 30) + '...'
                    : shortFen;
                this.elements.fenPreview.textContent = displayFen;
                this.elements.fenPreview.title = this.currentFen;
            } else {
                this.elements.fenPreview.textContent = 'No position loaded';
            }
        }
    },

    /**
     * Send a message to the mentor
     */
    async sendMessage() {
        const input = this.elements.input;
        const question = input?.value?.trim();

        if (!question || this.isLoading) return;

        // Update context before sending
        this.updateContext();

        if (!this.currentFen) {
            this.showError('No chess position available. Load a position first.');
            return;
        }

        // Check if LLM provider is ready (has API key or supports shared API)
        const provider = this.elements.providerSelect?.value || 'together';
        if (typeof LLMProvider !== 'undefined' && !LLMProvider.isReady()) {
            this.showError('Please configure your API key in Settings, or use Together.ai with shared API.');
            this.toggleSettings();
            return;
        }

        // Clear input
        input.value = '';

        // Add user message to chat
        this.addMessage('user', question);

        // Show loading indicator
        this.setLoading(true);

        try {
            // Request fresh MultiPV analysis if Stockfish guidance is enabled
            let engineReport = null;
            if (this.config.useStockfishGuidance) {
                // Show "analyzing" status
                this.updateEngineBadge('analyzing');

                // Request quick MultiPV analysis
                await this.requestMultiPvAnalysis();

                // Build engine report from results
                engineReport = this.buildEngineReport();

                // Update badge
                this.updateEngineBadge(engineReport ? 'active' : 'none');
            }

            // Build prompt with context
            const mode = this.elements.modeSelect?.value || 'human';
            const gameMode = typeof App !== 'undefined' ? App.gameMode : 'analysis';

            // Get legal moves from chess.js to prevent LLM hallucination
            let legalMoves = [];
            if (typeof App !== 'undefined' && App.game) {
                legalMoves = App.game.moves(); // Returns SAN notation
            }

            const promptData = MentorPrompts.buildPrompt({
                userQuestion: question,
                fen: this.currentFen,
                pgn: this.currentPgn,
                evaluation: this.currentEvaluation,
                engineReport: engineReport,
                explanationMode: mode,
                gameMode: gameMode,
                chatHistory: this.chatHistory.slice(-10),
                legalMoves: legalMoves,
                useStockfishGuidance: this.config.useStockfishGuidance
            });

            // Send to LLM (with engineReport for server-side injection)
            const response = await LLMProvider.chat(promptData.messages, {
                engineReport: engineReport,
                temperature: engineReport ? 0.3 : 0.7  // Lower temperature when engine-guided
            });

            // Add response to chat
            this.addMessage('assistant', response.content, engineReport !== null, response.isSharedApi);

            // Store in history
            this.chatHistory.push(
                { role: 'user', content: question },
                { role: 'assistant', content: response.content }
            );

            // Trim history if too long
            if (this.chatHistory.length > this.config.maxHistoryLength * 2) {
                this.chatHistory = this.chatHistory.slice(-this.config.maxHistoryLength * 2);
            }

            // Update rate limit display if using shared API
            if (response.isSharedApi) {
                this.updateRateLimitDisplay();
            }

        } catch (error) {
            console.error('Mentor AI error:', error);
            this.showError(error.message || 'Failed to get response from AI');
            this.updateEngineBadge('none');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Update the engine badge display
     */
    updateEngineBadge(state) {
        const badge = this.elements.engineBadge;
        if (!badge) return;

        badge.classList.remove('analyzing', 'active', 'hidden', 'error');

        switch (state) {
            case 'analyzing':
                badge.textContent = 'Analyzing...';
                badge.classList.add('analyzing');
                badge.style.display = '';
                break;
            case 'active':
                badge.textContent = 'Engine-backed';
                badge.classList.add('active');
                badge.style.display = '';
                break;
            case 'error':
                badge.textContent = 'Engine unavailable';
                badge.classList.add('error');
                badge.style.display = '';
                break;
            case 'none':
            default:
                badge.style.display = 'none';
                break;
        }
    },

    /**
     * Update rate limit display for shared API users
     */
    updateRateLimitDisplay() {
        const rateLimitInfo = this.elements.rateLimitInfo;
        if (!rateLimitInfo) return;

        if (typeof LLMProvider !== 'undefined') {
            const status = LLMProvider.getRateLimitStatus();
            if (status && status.isSharedApi) {
                rateLimitInfo.textContent = `Shared API: ${status.remainingDaily ?? '?'} requests remaining today`;
                rateLimitInfo.style.display = '';
            } else {
                rateLimitInfo.style.display = 'none';
            }
        }
    },

    /**
     * Send current position with a default question
     */
    sendPosition() {
        this.updateContext();

        if (!this.currentFen) {
            this.showError('No chess position available');
            return;
        }

        this.elements.input.value = "What's happening in this position? What should I be thinking about?";
        this.sendMessage();
    },

    /**
     * Quick analyze - send position for immediate analysis
     */
    quickAnalyze() {
        this.updateContext();

        if (!this.currentFen) {
            this.showError('No chess position available');
            return;
        }

        const mode = this.elements.modeSelect?.value || 'human';
        let question;

        switch (mode) {
            case 'engine':
                question = "Give me a concrete analysis of this position with variations.";
                break;
            case 'classical':
                question = "How would a classical master evaluate this position?";
                break;
            case 'beginner':
                question = "Can you explain what's happening here in simple terms?";
                break;
            default:
                question = "Analyze this position. What are the key features and plans for both sides?";
        }

        this.elements.input.value = question;
        this.sendMessage();
    },

    /**
     * Add a message to the chat display
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - Message content
     * @param {boolean} engineBacked - Whether this response used engine analysis
     * @param {boolean} isSharedApi - Whether using shared API
     */
    addMessage(role, content, engineBacked = false, isSharedApi = false) {
        const messagesContainer = this.elements.messages;
        if (!messagesContainer) return;

        // Remove welcome message if present
        const welcome = messagesContainer.querySelector('.mentor-welcome');
        if (welcome) {
            welcome.remove();
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `mentor-message ${role}`;
        if (engineBacked && role === 'assistant') {
            messageDiv.classList.add('engine-backed');
        }

        // Format content (handle markdown-like formatting)
        const formattedContent = this.formatMessageContent(content);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formattedContent;

        messageDiv.appendChild(contentDiv);

        // Add badges for assistant messages
        if (role === 'assistant') {
            const badgesDiv = document.createElement('div');
            badgesDiv.className = 'message-badges';

            if (engineBacked) {
                const engineBadge = document.createElement('span');
                engineBadge.className = 'message-engine-badge';
                engineBadge.innerHTML = '<i class="fas fa-microchip"></i> Engine-backed';
                badgesDiv.appendChild(engineBadge);
            }

            if (isSharedApi) {
                const sharedBadge = document.createElement('span');
                sharedBadge.className = 'message-shared-badge';
                sharedBadge.innerHTML = '<i class="fas fa-users"></i> Shared API';
                badgesDiv.appendChild(sharedBadge);
            }

            if (badgesDiv.children.length > 0) {
                messageDiv.appendChild(badgesDiv);
            }
        }

        messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },

    /**
     * Format message content with basic markdown support
     */
    formatMessageContent(content) {
        // Escape HTML
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Code blocks (```code```)
        formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');

        // Inline code (`code`)
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold (**text**)
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic (*text*)
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Chess moves (e.g., 1.e4, Nf3, O-O-O)
        formatted = formatted.replace(
            /\b(\d+\.+\s*)?(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g,
            '<code>$&</code>'
        );

        // Preserve line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    },

    /**
     * Show/hide loading indicator
     */
    setLoading(loading) {
        this.isLoading = loading;
        const messagesContainer = this.elements.messages;

        if (loading) {
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'mentor-message assistant loading';
            loadingDiv.id = 'mentorLoading';
            loadingDiv.innerHTML = `
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            `;
            messagesContainer?.appendChild(loadingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            // Disable input
            this.elements.sendBtn?.setAttribute('disabled', 'true');
        } else {
            // Remove loading indicator
            const loadingEl = document.getElementById('mentorLoading');
            loadingEl?.remove();

            // Enable input
            this.elements.sendBtn?.removeAttribute('disabled');
        }
    },

    /**
     * Show error message in chat
     */
    showError(message) {
        const messagesContainer = this.elements.messages;
        if (!messagesContainer) return;

        const errorDiv = document.createElement('div');
        errorDiv.className = 'mentor-error';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        messagesContainer.appendChild(errorDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Auto-remove after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
    },

    /**
     * Show notification (uses app's notification if available)
     */
    showNotification(message) {
        if (typeof showNotification === 'function') {
            showNotification(message);
        } else {
            console.log('Mentor:', message);
        }
    },

    /**
     * Clear chat history
     */
    clearHistory() {
        this.chatHistory = [];
        const messagesContainer = this.elements.messages;
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="mentor-welcome">
                    <div class="mentor-avatar">
                        <i class="fas fa-chess-queen"></i>
                    </div>
                    <p>Hello! I'm CAISSA Mentor, your chess learning companion.</p>
                    <p>Send me the current position and ask any question about:</p>
                    <ul>
                        <li>Position analysis & plans</li>
                        <li>Move explanations</li>
                        <li>Strategic concepts</li>
                        <li>Tactical patterns</li>
                    </ul>
                </div>
            `;
        }
    },

    // ============================================
    // INTEGRATION HOOKS (for future features)
    // ============================================

    /**
     * Hook: Called when a move is made on the board
     * Can be used for automatic commentary in EVE mode
     */
    onMoveMade(move, fen) {
        this.currentFen = fen;

        // Invalidate cache for this FEN since position changed
        // (Analysis might be different after the move was made)

        if (this.isOpen) {
            this.updateContextDisplay();
        }

        // Future: Auto-commentary for EVE mode
        // if (App.gameMode === 'eve' && this.autoCommentary) {
        //     this.generateMoveCommentary(move);
        // }
    },

    /**
     * Hook: Called when CAISSA Insight data is available
     * Can inject player tendency information
     */
    onInsightDataAvailable(insightData) {
        // Store insight data for context injection
        this.insightData = insightData;

        // Future: Can be used to personalize advice
        // "Based on your games, you tend to struggle in..."
    },

    /**
     * Hook: Called when engine evaluation changes
     */
    onEvaluationUpdate(evaluation) {
        this.currentEvaluation = evaluation;
        if (this.isOpen) {
            this.updateContextDisplay();
        }
    },

    /**
     * Generate commentary for a move (future EVE feature)
     */
    async generateMoveCommentary(move) {
        // Future implementation for live EVE commentary
        // This would automatically explain engine moves during EVE battles
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization slightly to ensure App is ready
    setTimeout(() => {
        MentorAI.init();
    }, 500);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MentorAI;
}
