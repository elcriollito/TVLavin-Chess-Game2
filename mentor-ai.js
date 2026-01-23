/**
 * CAISSA Mentor AI - Main Chat Module
 *
 * Handles the chat interface, context collection, and communication
 * between the chess app and the LLM provider.
 */

const MentorAI = {

    // State
    isOpen: false,
    isLoading: false,
    chatHistory: [],
    currentFen: null,
    currentPgn: null,
    currentEvaluation: null,

    // DOM Elements (cached after init)
    elements: {},

    // Configuration
    config: {
        maxHistoryLength: 20,
        storageKey: 'caissa_mentor_settings'
        // NOTE: API keys are stored in memory only (session-based) for security
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
            saveSettingsBtn: document.getElementById('mentorSaveSettings')
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
            const provider = this.elements.providerSelect?.value || 'openai';
            const model = this.elements.modelSelect?.value || '';
            const apiKey = this.elements.apiKeyInput?.value?.trim();

            // Save provider/model settings (NOT API key - that stays in memory only)
            localStorage.setItem(this.config.storageKey, JSON.stringify({ provider, model }));

            // Store API key in memory only (session-based, not persisted)
            if (apiKey) {
                this._sessionApiKey = apiKey;
            }

            // Initialize provider with new settings
            this.initializeProvider();

            this.showNotification('Settings saved! (API key stored for this session only)');
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
        const provider = this.elements.providerSelect?.value || 'openai';
        const model = this.elements.modelSelect?.value || '';
        const apiKey = this.elements.apiKeyInput?.value?.trim() || this._sessionApiKey;

        if (typeof LLMProvider !== 'undefined') {
            LLMProvider.initialize({ provider, model: model || undefined });
            if (apiKey) {
                LLMProvider.setApiKey(apiKey);
                this._sessionApiKey = apiKey; // Keep in memory
            }
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
        const apiKeyInput = this.elements.apiKeyInput;

        // Hide all help texts
        if (togetherHelp) togetherHelp.style.display = 'none';
        if (llamaHelp) llamaHelp.style.display = 'none';
        if (openaiHelp) openaiHelp.style.display = 'none';
        if (anthropicHelp) anthropicHelp.style.display = 'none';
        if (localHelp) localHelp.style.display = 'none';

        // Show relevant help and configure input
        switch (provider) {
            case 'together':
                if (togetherHelp) togetherHelp.style.display = '';
                if (apiKeyInput) {
                    apiKeyInput.placeholder = 'Enter your Together.ai API key';
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

        // Check API key (session-only) - not required for local provider
        const provider = this.elements.providerSelect?.value || 'openai';
        if (provider !== 'local' && !this._sessionApiKey) {
            this.showError('Please enter your API key in Settings (required each session for security).');
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
                explanationMode: mode,
                gameMode: gameMode,
                chatHistory: this.chatHistory.slice(-10),
                legalMoves: legalMoves
            });

            // Send to LLM
            const response = await LLMProvider.chat(promptData.messages);

            // Add response to chat
            this.addMessage('assistant', response.content);

            // Store in history
            this.chatHistory.push(
                { role: 'user', content: question },
                { role: 'assistant', content: response.content }
            );

            // Trim history if too long
            if (this.chatHistory.length > this.config.maxHistoryLength * 2) {
                this.chatHistory = this.chatHistory.slice(-this.config.maxHistoryLength * 2);
            }

        } catch (error) {
            console.error('Mentor AI error:', error);
            this.showError(error.message || 'Failed to get response from AI');
        } finally {
            this.setLoading(false);
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
     */
    addMessage(role, content) {
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

        // Format content (handle markdown-like formatting)
        const formattedContent = this.formatMessageContent(content);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = formattedContent;

        messageDiv.appendChild(contentDiv);
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
