/**
 * CAISSA FICS Client
 *
 * Frontend module to connect to FICS via WebSocket gateway
 * Handles game state, board updates, and commands
 */

console.log('[FICS Client] Module loaded');

const CaissaFICSClient = {
    // WebSocket connection
    ws: null,
    connected: false,
    authenticated: false,
    connectionState: 'disconnected',
    rawBuffer: '',
    lineBuffer: '',
    guestLoginSent: false,
    guestReturnSent: false,
    loginMode: 'guest',
    accountUsername: '',
    accountLoginSent: false,
    accountPasswordSent: false,
    pendingAccountPassword: null,
    authFailed: false,
    connectionStartedAt: 0,
    latencyMs: null,
    manualDisconnect: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    ficsUsername: 'Guest',

    // Game state
    chess: null, // chess.js instance
    board: null, // chessboard.js instance
    gameActive: false,
    myColor: null,
    gameNumber: null,
    opponent: null,
    pendingMove: null,
    pendingPromotionMove: null,
    liveGame: {
        gameNumber: null,
        whiteName: null,
        blackName: null,
        userColor: null,
        relation: null,
        sideToMove: null,
        lastMove: null,
        whiteClock: null,
        blackClock: null,
        initialTime: null,
        increment: null,
        currentFen: null,
        gameActive: false,
        observedGame: false,
        result: null,
        status: 'idle'
    },
    seekActions: [],
    activeTables: [],
    pendingSeek: null,
    lobbyRefreshTimer: null,
    lobbyRefreshInFlight: false,
    lobbyLastRefreshAt: 0,
    moveHistory: [],
    lastMoveKey: null,
    pgnResult: '*',
    soundsEnabled: false,
    audioContext: null,
    lastSoundAt: {},

    // UI elements
    elements: {},

    // Message buffer for console
    messageBuffer: [],
    maxBufferSize: 500,

    // Local development may use ws://. Production requires an explicitly
    // configured secure endpoint via window.CAISSA_FICS_GATEWAY_URL.
    gatewayUrl: null,
    gatewayMode: 'unconfigured',

    // ===== INITIALIZATION =====
    init() {
        console.log('[FICS Client] Initializing...');
        this.cacheElements();
        this.configureGateway();
        this.bindEvents();
        this.initChessEngine();
        this.loadSoundPreference();
        this.setConnectionState('disconnected');
        this.updateGatewayStatus();
        this.setLoginMode(this.loginMode);
        this.renderRoomTables();
    },

    cacheElements() {
        this.elements = {
            // Connection
            connectBtn: document.getElementById('ficsConnectBtn'),
            accountConnectBtn: document.getElementById('ficsAccountConnectBtn'),
            disconnectBtn: document.getElementById('ficsDisconnectBtn'),
            testGatewayBtn: document.getElementById('ficsTestGatewayBtn'),
            differentUserBtn: document.getElementById('ficsDifferentUserBtn'),
            connectionStatus: document.getElementById('ficsConnectionStatus'),
            identityStatus: document.getElementById('ficsIdentityStatus'),
            gatewayStatus: document.getElementById('ficsGatewayStatus'),
            gatewayUrl: document.getElementById('ficsGatewayUrl'),
            gatewayLatency: document.getElementById('ficsGatewayLatency'),
            loginModeInputs: document.querySelectorAll('input[name="ficsLoginMode"]'),
            accountFields: document.getElementById('ficsAccountFields'),
            accountUsernameInput: document.getElementById('ficsAccountUsername'),
            accountPasswordInput: document.getElementById('ficsAccountPassword'),

            // Seek buttons
            seekBlitz1: document.getElementById('ficsSeek1_0'),
            seekBlitz3: document.getElementById('ficsSeek3_0'),
            seekBlitz5: document.getElementById('ficsSeek5_0'),
            seekRapid10: document.getElementById('ficsSeek10_0'),
            customSeekBtn: document.getElementById('ficsCustomSeekBtn'),
            customTimeInput: document.getElementById('ficsCustomTime'),
            customIncInput: document.getElementById('ficsCustomInc'),
            seekActions: document.getElementById('ficsSeekActions'),
            lobbyNote: document.getElementById('ficsLobbyNote'),
            refreshLobbyBtn: document.getElementById('ficsRefreshLobbyBtn'),
            roomStatus: document.getElementById('ficsRoomStatus'),
            lobbyRows: document.getElementById('ficsLobbyRows'),
            activeTables: document.getElementById('ficsActiveTables'),
            waitingPlayers: document.getElementById('ficsWaitingPlayers'),
            openTables: document.getElementById('ficsOpenTables'),

            // Game info
            gameStatus: document.getElementById('ficsGameStatus'),
            opponentInfo: document.getElementById('ficsOpponentInfo'),
            whiteClock: document.getElementById('ficsWhiteClock'),
            blackClock: document.getElementById('ficsBlackClock'),
            topPlayerBar: document.getElementById('ficsTopPlayerBar'),
            bottomPlayerBar: document.getElementById('ficsBottomPlayerBar'),
            pendingState: document.getElementById('ficsPendingState'),
            moveList: document.getElementById('ficsMoveList'),
            downloadPgnBtn: document.getElementById('ficsDownloadPgnBtn'),
            gameControls: document.getElementById('ficsGameControls'),
            resignBtn: document.getElementById('ficsResignBtn'),
            drawBtn: document.getElementById('ficsDrawBtn'),
            abortBtn: document.getElementById('ficsAbortBtn'),
            soundToggle: document.getElementById('ficsSoundToggle'),
            promotionSelector: document.getElementById('ficsPromotionSelector'),
            promotionButtons: document.querySelectorAll('#ficsPromotionSelector [data-promotion]'),
            promotionCancelBtn: document.getElementById('ficsPromotionCancel'),

            // Board
            boardContainer: document.getElementById('ficsBoardContainer'),

            // Console
            console: document.getElementById('ficsConsole'),
            consoleToggle: document.getElementById('ficsConsoleToggle'),
            consoleContainer: document.getElementById('ficsConsoleContainer'),
            commandInput: document.getElementById('ficsCommandInput'),
            sendCommandBtn: document.getElementById('ficsSendCommandBtn')
        };
    },

    configureGateway() {
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const configuredUrl = typeof window.CAISSA_FICS_GATEWAY_URL === 'string'
            ? window.CAISSA_FICS_GATEWAY_URL.trim()
            : '';

        if (isLocal) {
            this.gatewayUrl = configuredUrl || 'ws://localhost:8081';
            this.gatewayMode = this.gatewayUrl.startsWith('wss://') ? 'local wss' : 'local ws';
        } else {
            this.gatewayUrl = configuredUrl.startsWith('wss://')
                ? configuredUrl
                : 'wss://fics-gateway.caissa-chess.org/ws';
            this.gatewayMode = 'production wss';
        }
    },

    isGatewayConfigured() {
        return !!this.gatewayUrl
            && (window.location.protocol !== 'https:' || this.gatewayUrl.startsWith('wss://'));
    },

    updateGatewayStatus() {
        const configured = this.isGatewayConfigured();
        const message = configured
            ? `Gateway ready (${this.gatewayMode})`
            : 'FICS gateway requires a secure WSS endpoint in production.';

        if (this.elements.gatewayStatus) {
            this.elements.gatewayStatus.textContent = message;
            this.elements.gatewayStatus.className = configured
                ? 'fics-gateway-status fics-gateway-ready'
                : 'fics-gateway-status fics-gateway-unconfigured';
        }
        if (this.elements.gatewayUrl) {
            this.elements.gatewayUrl.textContent = this.gatewayUrl || 'Not configured';
        }
        this.updateLatency();
        if (!configured) {
            this.elements.connectBtn?.setAttribute('disabled', 'true');
            this.elements.testGatewayBtn?.setAttribute('disabled', 'true');
            this.updateGameStatus(message, 'error');
        }
    },

    bindEvents() {
        // Connection
        document.querySelector('[data-section="fics"]')?.addEventListener('click', () => {
            setTimeout(() => this.onEnter(), 0);
        });
        this.elements.connectBtn?.addEventListener('click', () => this.connect('guest'));
        this.elements.accountConnectBtn?.addEventListener('click', () => this.connect('account'));
        this.elements.disconnectBtn?.addEventListener('click', () => this.disconnect());
        this.elements.differentUserBtn?.addEventListener('click', () => this.loginAsDifferentUser());
        this.elements.testGatewayBtn?.addEventListener('click', () => this.testGateway());
        this.elements.loginModeInputs?.forEach((input) => {
            input.addEventListener('change', () => this.setLoginMode(input.value));
        });
        this.elements.accountPasswordInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.connect('account');
        });

        // Seek buttons
        this.elements.seekBlitz1?.addEventListener('click', () => this.seek(1, 0));
        this.elements.seekBlitz3?.addEventListener('click', () => this.seek(3, 0));
        this.elements.seekBlitz5?.addEventListener('click', () => this.seek(5, 0));
        this.elements.seekRapid10?.addEventListener('click', () => this.seek(10, 0));
        this.elements.customSeekBtn?.addEventListener('click', () => {
            const time = parseInt(this.elements.customTimeInput.value) || 5;
            const inc = parseInt(this.elements.customIncInput.value) || 0;
            this.seek(time, inc);
        });
        this.elements.customTimeInput?.addEventListener('input', () => this.updateOpenTables(this.authenticated));
        this.elements.customIncInput?.addEventListener('input', () => this.updateOpenTables(this.authenticated));
        this.elements.refreshLobbyBtn?.addEventListener('click', () => this.refreshLobby(true));
        this.elements.openTables?.addEventListener('click', (event) => {
            const table = event.target.closest('[data-open-table]');
            if (table) this.createOpenTableSeek(table.dataset.openTable);
        });

        // Game controls
        this.elements.resignBtn?.addEventListener('click', () => this.resign());
        this.elements.drawBtn?.addEventListener('click', () => this.offerDraw());
        this.elements.abortBtn?.addEventListener('click', () => this.abort());
        this.elements.downloadPgnBtn?.addEventListener('click', () => this.downloadPGN());
        this.elements.soundToggle?.addEventListener('click', () => this.toggleSounds());
        this.elements.promotionButtons?.forEach((button) => {
            button.addEventListener('click', () => this.completePromotionSelection(button.dataset.promotion));
        });
        this.elements.promotionCancelBtn?.addEventListener('click', () => this.cancelPromotionSelection());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.pendingPromotionMove) {
                event.preventDefault();
                this.cancelPromotionSelection();
            }
        });

        // Console
        this.elements.consoleToggle?.addEventListener('click', () => this.toggleConsole());
        this.elements.sendCommandBtn?.addEventListener('click', () => this.sendCommand());
        this.elements.commandInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendCommand();
            }
        });
    },

    initChessEngine() {
        // Initialize chess.js for move validation
        if (typeof Chess !== 'undefined') {
            this.chess = new Chess();
            console.log('[FICS Client] Chess.js initialized');
            this.updatePlayerBars();
        } else {
            console.error('[FICS Client] Chess.js not found!');
        }
    },

    // ===== CONNECTION MANAGEMENT =====
    setLoginMode(mode) {
        this.loginMode = mode === 'account' ? 'account' : 'guest';
        this.elements.loginModeInputs?.forEach((input) => {
            input.checked = input.value === this.loginMode;
        });
        if (this.elements.accountFields) this.elements.accountFields.hidden = this.loginMode !== 'account';
        if (this.elements.connectBtn) this.elements.connectBtn.hidden = this.loginMode !== 'guest';
        if (this.elements.accountConnectBtn) this.elements.accountConnectBtn.hidden = this.loginMode !== 'account';
        this.updateLoginControls();
        this.updateIdentityStatus();
    },

    updateLoginControls() {
        const active = this.connectionState === 'connecting'
            || this.connectionState === 'connected'
            || this.connectionState === 'reconnecting';
        const disabled = active || !this.isGatewayConfigured();
        this.elements.connectBtn?.toggleAttribute('disabled', disabled);
        this.elements.accountConnectBtn?.toggleAttribute('disabled', disabled);
        this.elements.loginModeInputs?.forEach((input) => {
            input.disabled = active;
        });
        if (this.elements.accountUsernameInput) this.elements.accountUsernameInput.disabled = active;
        if (this.elements.accountPasswordInput) this.elements.accountPasswordInput.disabled = active;
    },

    prepareAccountCredentials() {
        // TODO: Registered FICS login requires manual validation with real credentials before marking production stable.
        const username = (this.elements.accountUsernameInput?.value || '').trim();
        const password = this.elements.accountPasswordInput?.value || '';
        if (!username || !password) {
            this.updateGameStatus('Enter your FICS username and password to connect.', 'error');
            this.setConnectionState('error', 'Login details required');
            this.logToConsole('Enter your FICS username and password to connect.');
            return false;
        }
        this.accountUsername = username;
        this.pendingAccountPassword = password;
        if (this.elements.accountPasswordInput) this.elements.accountPasswordInput.value = '';
        return true;
    },

    connect(mode = this.loginMode) {
        if (this.ws && this.connected) {
            this.logToConsole('Already connected to FICS');
            return;
        }
        this.setLoginMode(mode);

        if (!this.isGatewayConfigured()) {
            const errorMsg = 'FICS gateway requires a secure WSS endpoint in production.';
            this.logToConsole(errorMsg);
            this.updateGameStatus(errorMsg, 'error');
            this.updateConnectionStatus(false, 'Gateway not configured');
            this.updateGatewayStatus();
            return;
        }

        if (this.loginMode === 'account' && !this.prepareAccountCredentials()) return;

        this.logToConsole('Connecting to FICS gateway...');
        this.manualDisconnect = false;
        clearTimeout(this.reconnectTimer);
        this.setConnectionState('connecting');
        this.updateGameStatus('Connecting to gateway...', '');
        this.initBoard(this.liveGame.currentFen || 'start');
        this.rawBuffer = '';
        this.lineBuffer = '';
        this.guestLoginSent = false;
        this.guestReturnSent = false;
        this.accountLoginSent = false;
        this.accountPasswordSent = false;
        this.authFailed = false;
        this.ficsUsername = this.loginMode === 'account' ? this.accountUsername : 'Guest';
        this.connectionStartedAt = performance.now();

        try {
            this.ws = new WebSocket(this.gatewayUrl);

            // Set timeout for connection attempt
            const connectionTimeout = setTimeout(() => {
                if (!this.connected) {
                    this.logToConsole('❌ Connection timeout');
                    this.handleConnectionFailure('timeout');
                    if (this.ws) {
                        this.ws.close();
                    }
                }
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('[FICS Client] WebSocket connected');
                this.connected = true;
                this.latencyMs = Math.round(performance.now() - this.connectionStartedAt);
                this.updateLatency();
                this.logToConsole('✅ Connected to gateway, authenticating...');
                this.updateGameStatus(this.loginMode === 'account' ? 'Logging in...' : 'Authenticating...', '');

            };

            this.ws.onmessage = (event) => {
                this.handleRawGatewayData(String(event.data));
            };

            this.ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.error('[FICS Client] WebSocket error:', error);
                this.logToConsole('❌ Connection error');
                this.handleConnectionFailure('error');
            };

            this.ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                console.log('[FICS Client] WebSocket closed', event.code, event.reason);
                const shouldReconnect = !this.manualDisconnect
                    && this.loginMode === 'guest'
                    && event.code !== 1000
                    && this.reconnectAttempts < 3;

                if (this.connected && !shouldReconnect) {
                    // Was connected, now disconnected
                    this.logToConsole('Disconnected from FICS');
                    this.updateGameStatus('Disconnected', '');
                } else if (!shouldReconnect && !this.manualDisconnect) {
                    // Failed to connect
                    this.logToConsole('❌ Failed to connect to gateway');
                    this.handleConnectionFailure('close');
                }

                this.connected = false;
                this.authenticated = false;
                if (!shouldReconnect || this.loginMode === 'account') this.clearAccountPassword();
                if (shouldReconnect) {
                    this.reconnectAttempts += 1;
                    this.setConnectionState('reconnecting');
                    this.updateGameStatus('Connection interrupted. Reconnecting...', '');
                    this.reconnectTimer = setTimeout(() => this.connect(), 1500);
                } else {
                    this.reconnectAttempts = 0;
                    if (!this.authFailed) {
                        this.setConnectionState(event.code === 1000 ? 'disconnected' : 'error');
                    }
                }
            };

        } catch (error) {
            console.error('[FICS Client] Connection failed:', error);
            this.logToConsole(`❌ Failed to connect: ${error.message}`);
            this.handleConnectionFailure('exception');
        }
    },

    handleConnectionFailure(reason) {
        this.clearAccountPassword();
        let errorMsg = '❌ Gateway unreachable\n\n';
        let tips = '';

        switch (reason) {
            case 'timeout':
                tips = '• Gateway may not be running\n' +
                       '• Check if port 8081 is accessible\n' +
                       '• Firewall may be blocking connection';
                break;
            case 'error':
            case 'close':
                tips = '• Is the gateway running?\n' +
                       '  Run: npm run fics:gateway\n\n' +
                       '• Check gateway URL: ' + this.gatewayUrl + '\n\n' +
                       '• Firewall or antivirus blocking port 8081?';
                break;
            case 'exception':
                tips = '• Invalid gateway URL\n' +
                       '• Check fics-client.js configuration';
                break;
        }

        const fullMsg = errorMsg + tips;
        this.updateGameStatus(fullMsg, 'error');
        this.setConnectionState('error', 'Failed');
    },

    async testGateway() {
        this.logToConsole('🔍 Testing gateway connection...');
        this.updateGameStatus('Testing gateway...', '');

        if (!this.isGatewayConfigured()) {
            const msg = 'FICS gateway requires a secure WSS endpoint in production.';
            this.logToConsole(msg);
            this.updateGameStatus(msg, 'error');
            this.updateGatewayStatus();
            return;
        }

        try {
            const testWs = new WebSocket(this.gatewayUrl);
            const startedAt = performance.now();
            let receivedBanner = false;

            const timeout = setTimeout(() => {
                testWs.close();
                this.logToConsole('❌ Test failed: Connection timeout');
                this.updateGameStatus('❌ Gateway unreachable (timeout)\n\nRun: npm run fics:gateway', 'error');
            }, 5000);

            testWs.onopen = () => {
                this.logToConsole('✅ Gateway test successful!');
                this.updateGameStatus('✅ Gateway is reachable!\n\nYou can now connect.', 'active');
            };

            testWs.onmessage = () => {
                if (receivedBanner) return;
                receivedBanner = true;
                clearTimeout(timeout);
                this.latencyMs = Math.round(performance.now() - startedAt);
                this.updateLatency();
                this.logToConsole('Gateway test successful; FICS banner received.');
                this.updateGameStatus('Gateway and FICS are reachable. You can now connect.', 'active');
                testWs.close(1000, 'Gateway test complete');
            };

            testWs.onerror = () => {
                clearTimeout(timeout);
                this.logToConsole('❌ Test failed: Cannot reach gateway');
                this.updateGameStatus(
                    '❌ Gateway unreachable\n\n' +
                    'Is it running?\n' +
                    'Run: npm run fics:gateway\n\n' +
                    'URL: ' + this.gatewayUrl,
                    'error'
                );
            };

            testWs.onclose = (event) => {
                if (event.code === 1000) {
                    // Normal close after successful test
                    return;
                }
                clearTimeout(timeout);
            };

        } catch (error) {
            console.error('[FICS Client] Test failed:', error);
            this.logToConsole(`❌ Test failed: ${error.message}`);
            this.updateGameStatus('❌ Test failed: ' + error.message, 'error');
        }
    },

    disconnect() {
        this.manualDisconnect = true;
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.send('quit');
            this.ws.close(1000, 'User disconnected');
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.clearAccountPassword();
        this.gameActive = false;
        this.stopLobbyRefresh();
        this.seekActions = [];
        this.activeTables = [];
        this.pendingSeek = null;
        this.liveGame.gameActive = false;
        this.liveGame.status = 'disconnected';
        this.pendingMove = null;
        this.cancelPromotionSelection(false);
        this.setConnectionState('disconnected');
        this.renderRoomTables();
        this.updateIdentityStatus();
        this.logToConsole('Disconnected');
    },

    clearAccountPassword() {
        this.pendingAccountPassword = null;
        if (this.elements.accountPasswordInput) this.elements.accountPasswordInput.value = '';
    },

    loginAsDifferentUser() {
        if (this.connected || this.authenticated) this.disconnect();
        this.accountUsername = '';
        this.ficsUsername = 'Guest';
        if (this.elements.accountUsernameInput) this.elements.accountUsernameInput.value = '';
        this.clearAccountPassword();
        this.setLoginMode('account');
        this.setConnectionState('disconnected');
        this.updateIdentityStatus();
        this.elements.accountUsernameInput?.focus();
    },

    updateIdentityStatus(message = null) {
        if (!this.elements.identityStatus) return;
        const registered = this.authenticated && this.loginMode === 'account';
        this.elements.identityStatus.className = `fics-identity-status${registered ? ' registered' : ''}`;
        if (message) {
            this.elements.identityStatus.textContent = message;
        } else if (registered) {
            this.elements.identityStatus.textContent = `Logged in as ${this.ficsUsername}`;
        } else if (this.authenticated) {
            this.elements.identityStatus.textContent = `Guest connected as ${this.ficsUsername}`;
        } else {
            this.elements.identityStatus.textContent = this.loginMode === 'account'
                ? 'Registered FICS login beta'
                : 'Guest Login ready';
        }
        this.elements.differentUserBtn?.toggleAttribute('hidden', !registered);
    },

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const command = typeof message === 'string' ? message : message?.text;
            if (command !== undefined) this.ws.send(command);
        } else {
            console.warn('[FICS Client] Cannot send, not connected');
        }
    },

    handleRawGatewayData(text) {
        this.rawBuffer = `${this.rawBuffer}${text}`.slice(-16384);
        this.logToConsole(this.sanitizeFicsConsoleText(text));

        if (this.loginMode === 'account' && !this.accountLoginSent && /login:/i.test(this.rawBuffer)) {
            this.accountLoginSent = true;
            this.rawBuffer = '';
            this.setConnectionState('connecting', 'Logging in');
            this.updateGameStatus('Logging in...', '');
            this.send(this.accountUsername);
            return;
        }
        if (this.loginMode === 'account' && !this.accountPasswordSent && /password:/i.test(this.rawBuffer)) {
            this.accountPasswordSent = true;
            const password = this.pendingAccountPassword;
            this.clearAccountPassword();
            this.rawBuffer = '';
            if (!password) {
                this.handleFicsLoginFailure('Password was cleared before FICS requested it.');
                return;
            }
            this.send(password);
            return;
        }
        if (this.loginMode === 'guest' && !this.guestLoginSent && /login:/i.test(this.rawBuffer)) {
            this.guestLoginSent = true;
            this.rawBuffer = '';
            this.send('guest');
            return;
        }
        if (this.loginMode === 'guest' && !this.guestReturnSent && /Press return to enter the server/i.test(this.rawBuffer)) {
            this.guestReturnSent = true;
            this.rawBuffer = '';
            this.send('');
            return;
        }
        if (this.loginMode === 'account' && this.accountPasswordSent && /Press return to enter the server/i.test(this.rawBuffer)) {
            this.rawBuffer = '';
            this.send('');
            return;
        }
        if (!this.authenticated && this.loginMode === 'account' && this.isFicsLoginFailure(this.rawBuffer)) {
            this.handleFicsLoginFailure(this.extractFicsLoginFailureMessage(this.rawBuffer));
            return;
        }
        if (!this.authenticated && /Starting FICS session|fics%/i.test(this.rawBuffer)) {
            const loginMatch = this.rawBuffer.match(/Starting FICS session as\s+([^\s(]+)/i);
            if (loginMatch) this.ficsUsername = loginMatch[1];
            this.authenticated = true;
            this.reconnectAttempts = 0;
            this.setConnectionState('connected');
            const identity = this.loginMode === 'account'
                ? `Logged in as ${this.ficsUsername}. Seek or accept a game to begin.`
                : 'Connected as FICS guest. Seek or accept a game to begin.';
            this.updateGameStatus(identity, 'active');
            this.logToConsole(this.loginMode === 'account'
                ? `Logged in as ${this.ficsUsername}. You can now seek games or enter commands.`
                : 'Connected as guest. You can now seek games or enter commands.');
            this.updateIdentityStatus();
            this.updatePlayerBars();
            this.startLobbyRefresh();
            this.send('set style 12');
            this.send('set interface CAISSA Chess');
        }

        const lines = `${this.lineBuffer}${text.replace(/\r/g, '')}`.split('\n');
        this.lineBuffer = lines.pop() || '';
        lines.forEach((line) => {
            if (line.trim()) this.parseGameLine(line.trim());
        });
    },

    sanitizeFicsConsoleText(text) {
        return String(text || '')
            .replace(/\r/g, '')
            .replace(/(password:\s*)[^\n]*/ig, '$1')
            .trimEnd();
    },

    isFicsLoginFailure(text) {
        return /invalid password|login incorrect|try again|not a registered player|bad password|authentication failed/i.test(text || '');
    },

    extractFicsLoginFailureMessage(text) {
        const clean = this.sanitizeFicsConsoleText(text)
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const exact = clean.find((line) => this.isFicsLoginFailure(line));
        return exact || 'Login failed. Check your FICS username and password.';
    },

    handleFicsLoginFailure(reason = 'Login failed. Check your FICS username and password.') {
        if (this.authFailed) return;
        this.authFailed = true;
        this.clearAccountPassword();
        this.updateGameStatus(reason, 'error');
        this.setConnectionState('error', 'Login failed');
        this.updateIdentityStatus(this.extractFicsLoginFailureMessage(reason));
        this.logToConsole(`Login failed: ${reason}`);
        this.manualDisconnect = true;
        if (this.ws) {
            this.ws.close(1000, 'FICS login failed');
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.stopLobbyRefresh();
        this.renderRoomTables();
    },

    // ===== MESSAGE HANDLING =====
    handleServerMessage(message) {
        const { type } = message;

        switch (type) {
            case 'status':
                this.handleStatus(message);
                break;

            case 'authenticated':
                this.handleAuthenticated(message);
                break;

            case 'raw':
                this.handleRawMessage(message);
                break;

            case 'error':
                this.handleError(message);
                break;

            default:
                console.log('[FICS Client] Unknown message type:', type);
        }
    },

    handleStatus(message) {
        this.connected = message.connected;
        this.updateConnectionStatus(message.connected, message.message);
        if (message.message) {
            this.logToConsole(`ℹ️ ${message.message}`);
        }
    },

    handleAuthenticated(message) {
        this.authenticated = true;
        this.updateConnectionStatus(true, 'Connected as Guest');
        this.logToConsole('✅ ' + message.message);
        this.logToConsole('You can now seek games or type FICS commands');
    },

    handleRawMessage(message) {
        const line = message.text;
        this.logToConsole(line);

        // Basic parsing for game events
        this.parseGameLine(line);
    },

    handleError(message) {
        console.error('[FICS Client] Error:', message.message);
        this.logToConsole(`❌ ${message.message}`);
    },

    // ===== GAME PARSING =====
    parseGameLine(line) {
        const style12 = window.FICSStyle12?.parseStyle12(line);
        if (style12) {
            this.handleStyle12(style12);
            return;
        }

        this.parseSeekLine(line);
        this.parseActiveGameLine(line);
        if (this.pendingMove && /illegal move|not your move|move is not legal/i.test(line)) {
            this.clearPendingMove(false);
            this.cancelPromotionSelection(false);
            if (this.board && this.liveGame.currentFen) this.board.position(this.liveGame.currentFen, false);
            this.updateGameStatus('Move rejected by FICS', 'error');
        }

        // Detect game start
        if (line.includes('Creating:') || line.includes('Game ') && line.includes('(') && line.includes(')')) {
            this.handleGameStart(line);
        }

        // Detect game end
        if (line.includes('Game ') && /resigns|checkmated|drawn|forfeits|flagged|aborted|adjourned|disconnect/i.test(line)) {
            this.handleGameEnd(line);
        }

        // Detect moves (very basic - FICS uses various formats)
        // Style 12 parsing would be more reliable but more complex
        const moveMatch = line.match(/^(\d+)\.\s+([a-h][1-8]-[a-h][1-8]|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8])/);
        if (moveMatch) {
            this.handleMove(line);
        }
    },

    handleGameStart(line) {
        this.gameActive = true;
        this.updateGameStatus('Game started!', 'active');

        // Try to detect color (very basic)
        if (line.toLowerCase().includes('white')) {
            this.myColor = 'white';
        } else if (line.toLowerCase().includes('black')) {
            this.myColor = 'black';
        }

        // Reset board
        if (this.chess) {
            this.chess.reset();
        }
        this.resetGameRecord();
        this.initBoard();
        this.playNotificationSound('seekAccepted');

        this.logToConsole('🎮 Game started!');
    },

    handleGameEnd(line) {
        this.gameActive = false;
        this.liveGame.gameActive = false;
        this.liveGame.result = line;
        this.liveGame.status = 'ended';
        this.pendingMove = null;
        this.cancelPromotionSelection(false);
        this.pgnResult = this.extractResult(line);
        this.updateGameStatus(`Game ended: ${line}`, 'ended');
        this.updatePlayerBars();
        this.logToConsole('🏁 ' + line);
    },

    handleMove(line) {
        // This is very basic - in production you'd parse style 12 output
        this.logToConsole('♟️ ' + line);
    },

    handleStyle12(state) {
        const wasActive = this.liveGame.gameActive;
        const isNewGame = this.liveGame.gameNumber !== null && this.liveGame.gameNumber !== state.gameNumber;
        const previousFen = this.liveGame.currentFen;
        const previousSideToMove = this.liveGame.sideToMove;
        const playing = state.relation === 1 || state.relation === -1;
        const userColor = state.userColor === 'w' ? 'white'
            : state.userColor === 'b' ? 'black'
                : null;

        if (!this.chess || !this.chess.load(state.fen)) {
            console.warn('[FICS Client] Ignored invalid Style12 FEN:', state.fen);
            return;
        }

        if (isNewGame) this.resetGameRecord();

        const previousPending = this.pendingMove;
        this.liveGame = {
            ...this.liveGame,
            gameNumber: state.gameNumber,
            whiteName: state.whiteName,
            blackName: state.blackName,
            userColor,
            relation: state.relation,
            sideToMove: state.sideToMove,
            lastMove: state.lastMove,
            whiteClock: state.whiteClock,
            blackClock: state.blackClock,
            initialTime: state.initialTime,
            increment: state.increment,
            currentFen: state.fen,
            gameActive: playing,
            observedGame: state.observedGame,
            result: null,
            status: playing ? 'playing' : state.observedGame ? 'observing' : 'examining'
        };
        this.gameActive = playing;
        this.gameNumber = state.gameNumber;
        this.myColor = userColor;
        this.pendingSeek = null;
        this.cancelPromotionSelection(false);
        if (previousPending) this.clearPendingMove(true);

        this.initBoard(state.fen);
        if (this.board) {
            this.board.orientation(userColor || 'white');
            this.board.position(state.fen, false);
        }

        this.recordStyle12Move(state);
        this.updateLiveGameUI();
        this.handleStyle12SoundEvents({
            wasActive,
            previousFen,
            previousSideToMove,
            state,
            playing,
            userColor
        });
        if (!wasActive && playing) this.logToConsole(`Game ${state.gameNumber} started from Style12.`);
    },

    parseSeekLine(line) {
        const match = line.match(/\bplay\s+(\d+)\b/i);
        if (!match || !/seek|seeking|respond/i.test(line)) return;

        const seekNumber = match[1];
        if (this.seekActions.some((seek) => seek.number === seekNumber)) return;
        this.seekActions = [{ number: seekNumber, label: line, details: this.parseSeekDetails(line, seekNumber) }, ...this.seekActions].slice(0, 8);
        this.renderSeekActions();
        this.renderRoomTables();
    },

    parseSeekDetails(line, seekNumber) {
        const compact = line.replace(/\s+/g, ' ').trim();
        const time = compact.match(/\[\s*([a-z]+)\s+(\d+)\s+(\d+)\s*\]/i);
        const fallbackTime = compact.match(/\b(\d{1,3})\s+(\d{1,3})\b/);
        const player = compact.match(/^\s*(?:\d+\s+)?(?:[A-Za-z+*.]+\s+)?([A-Za-z][\w-]*)/);
        const rating = compact.match(/\b(\d{3,4}|\+{4})\b/);
        return {
            number: seekNumber,
            player: player?.[1] || 'FICS player',
            rating: rating?.[1] || 'Guest',
            timeControl: time ? `${time[2]}+${time[3]}` : fallbackTime ? `${fallbackTime[1]}+${fallbackTime[2]}` : 'open',
            variant: time?.[1] || 'standard',
            rated: /\bunrated\b/i.test(compact) ? 'unrated' : /\brated\b/i.test(compact) ? 'rated' : '',
            color: /\bwhite\b/i.test(compact) ? 'white'
                : /\bblack\b/i.test(compact) ? 'black'
                    : ''
        };
    },

    renderSeekActions() {
        if (!this.elements.seekActions) return;
        this.elements.seekActions.replaceChildren();
        this.seekActions.forEach((seek) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fics-seek-action';
            const detail = seek.details;
            button.innerHTML = `
                <span class="fics-seek-action-main">Play #${seek.number}</span>
                <span>${this.escapeHtml(detail.player)} · ${this.escapeHtml(detail.rating)} · ${this.escapeHtml(detail.timeControl)}</span>
                <small>${this.escapeHtml([detail.rated, detail.variant].filter(Boolean).join(' · ') || 'seek')}</small>
            `;
            button.title = seek.label;
            button.addEventListener('click', () => {
                this.logToConsole(`> play ${seek.number}`);
                this.send(`play ${seek.number}`);
            });
            this.elements.seekActions.appendChild(button);
        });
    },

    parseActiveGameLine(line) {
        if (/\bplay\s+\d+\b/i.test(line) || !/^\s*\d+\s+/.test(line)) return;

        const compact = line.replace(/\s+/g, ' ').trim();
        const match = compact.match(/^(\d+)\s+(.+?)(?:\s+\[\s*([^\]]+)\s*\]|\s+\(([^)]+)\))/);
        if (!match) return;

        const gameNumber = match[1];
        if (this.activeTables.some((table) => table.number === gameNumber)) return;

        const playerPart = match[2].trim();
        const players = this.parseActiveGamePlayers(playerPart);
        const timeInfo = match[3] || match[4] || '';

        this.activeTables = [{
            number: gameNumber,
            white: players.white.name || 'White',
            black: players.black.name || 'Black',
            whiteRating: players.white.rating || '',
            blackRating: players.black.rating || '',
            timeControl: this.extractGameTimeControl(timeInfo),
            observers: this.extractObserverCount(compact),
            label: line
        }, ...this.activeTables].slice(0, 8);
        this.renderRoomTables();
    },

    parseActiveGamePlayers(playerPart) {
        const tokens = String(playerPart || '').split(/\s+/).filter(Boolean);
        const players = [];
        for (let i = 0; i < tokens.length; i += 1) {
            if (/^\d{3,4}$/.test(tokens[i]) && tokens[i + 1] && /[A-Za-z]/.test(tokens[i + 1])) {
                players.push({ rating: tokens[i], name: tokens[i + 1] });
                i += 1;
            } else if (/[A-Za-z]/.test(tokens[i]) && !/^\d{3,4}$/.test(tokens[i])) {
                players.push({ rating: '', name: tokens[i] });
            }
            if (players.length >= 2) break;
        }

        return {
            white: players[0] || { name: '', rating: '' },
            black: players[1] || { name: '', rating: '' }
        };
    },

    extractGameTimeControl(text) {
        const compact = String(text || '').replace(/\s+/g, ' ').trim();
        const tc = compact.match(/\b(\d+)\s+(\d+)\b/);
        return tc ? `${tc[1]}+${tc[2]}` : compact || 'live';
    },

    extractObserverCount(line) {
        const match = line.match(/\b(\d+)\s+observers?\b/i) || line.match(/\bobs?\s*[:=]?\s*(\d+)\b/i);
        return match ? match[1] : '';
    },

    startLobbyRefresh() {
        this.stopLobbyRefresh();
        this.refreshLobby(true);
        this.lobbyRefreshTimer = setInterval(() => this.refreshLobby(false), 60000);
    },

    stopLobbyRefresh() {
        if (this.lobbyRefreshTimer) {
            clearInterval(this.lobbyRefreshTimer);
            this.lobbyRefreshTimer = null;
        }
        this.lobbyRefreshInFlight = false;
    },

    refreshLobby(manual = false) {
        if (!this.authenticated) {
            this.renderRoomTables();
            return;
        }

        const now = Date.now();
        if (!manual && now - this.lobbyLastRefreshAt < 60000) return;
        if (this.lobbyRefreshInFlight) return;

        this.lobbyRefreshInFlight = true;
        this.lobbyLastRefreshAt = now;
        this.seekActions = [];
        this.activeTables = [];
        this.renderSeekActions();
        this.renderRoomTables();
        this.updateRoomStatus('Refreshing room tables...');
        this.send('sought');
        this.send('games');
        setTimeout(() => {
            this.lobbyRefreshInFlight = false;
            this.renderRoomTables();
        }, 2500);
    },

    createOpenTableSeek(tableNumber) {
        if (!this.authenticated) {
            this.logToConsole('Connect to FICS before creating a seek.');
            this.renderRoomTables();
            return;
        }

        const time = parseInt(this.elements.customTimeInput?.value, 10) || 5;
        const inc = parseInt(this.elements.customIncInput?.value, 10) || 0;
        const command = `seek ${time} ${inc} unrated`;
        this.logToConsole(`Open Table ${tableNumber}: > ${command}`);
        this.pendingSeek = {
            timeControl: `${time}+${inc}`,
            label: `Open Table ${tableNumber}`
        };
        this.renderRoomTables();
        this.send(command);
    },

    updateRoomStatus(message) {
        if (this.elements.roomStatus) this.elements.roomStatus.textContent = message;
    },

    renderRoomTables() {
        const connected = this.authenticated;
        this.elements.refreshLobbyBtn?.toggleAttribute('disabled', !connected);

        if (!connected) {
            this.updateRoomStatus('Connect to FICS to view room tables.');
            this.renderLobbyRows([]);
            return;
        }

        this.updateRoomStatus(this.lobbyLastRefreshAt
            ? `Lobby refreshed ${new Date(this.lobbyLastRefreshAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Use Refresh Lobby to load current room tables.');
        this.renderLobbyRows(this.buildLobbyRows());
    },

    buildLobbyRows() {
        const waitingRows = this.seekActions.map((seek) => {
            const detail = seek.details;
            const own = this.isCurrentFicsUser(detail.player);
            return {
                kind: 'waiting',
                status: 'Waiting',
                table: seek.number,
                timeControl: detail.timeControl || 'open',
                players: own ? `${this.formatPlayerLabel(detail.player, detail.rating)}\nWaiting...` : this.formatPlayerLabel(detail.player, detail.rating),
                playersHtml: own ? `${this.formatPlayerHtml(detail.player, detail.rating)} <span class="fics-room-waiting-note">Waiting...</span>` : this.formatPlayerHtml(detail.player, detail.rating),
                rated: detail.rated || 'unrated',
                action: own ? 'Cancel' : 'Sit',
                disabled: false,
                title: seek.label,
                command: own ? 'unseek' : `play ${seek.number}`,
                commandType: own ? 'unseek' : 'play',
                sortRating: this.ratingValue(detail.rating)
            };
        });

        if (this.pendingSeek && !waitingRows.some((row) => row.commandType === 'unseek')) {
            waitingRows.unshift({
                kind: 'waiting',
                status: 'Waiting',
                table: '...',
                timeControl: this.pendingSeek.timeControl || 'open',
                players: `${this.ficsUsername || 'You'}\nWaiting...`,
                playersHtml: `${this.formatPlayerHtml(this.ficsUsername || 'You', '')} <span class="fics-room-waiting-note">Waiting...</span>`,
                rated: 'unrated',
                action: 'Cancel',
                disabled: false,
                title: this.pendingSeek.label || 'Your active seek',
                command: 'unseek',
                commandType: 'unseek',
                sortRating: 0
            });
        }

        const playingRows = this.activeTables.map((table) => {
            const own = this.isCurrentFicsUser(table.white) || this.isCurrentFicsUser(table.black);
            const currentObserved = this.liveGame.observedGame && String(this.liveGame.gameNumber) === String(table.number);
            const averageRating = this.averageRatings(table.whiteRating, table.blackRating);
            return {
                kind: 'playing',
                status: 'Playing',
                table: table.number,
                timeControl: table.timeControl || 'live',
                players: `${this.formatPlayerLabel(table.white, table.whiteRating)} vs ${this.formatPlayerLabel(table.black, table.blackRating)}`,
                playersHtml: `${this.formatPlayerHtml(table.white, table.whiteRating)} <span class="fics-vs">vs</span> ${this.formatPlayerHtml(table.black, table.blackRating)}`,
                rated: table.observers ? `${table.observers} watching` : 'live',
                action: own ? 'Playing' : currentObserved ? 'Watching' : 'Watch',
                disabled: own,
                title: table.label,
                command: `observe ${table.number}`,
                commandType: 'observe',
                sortRating: averageRating
            };
        }).sort((a, b) => b.sortRating - a.sortRating);

        return [...waitingRows, ...playingRows];
    },

    renderLobbyRows(rows) {
        if (!this.elements.lobbyRows) return;
        if (!rows.length) {
            this.elements.lobbyRows.innerHTML = `<div class="fics-room-empty">${this.authenticated
                ? 'No room tables yet. Refresh the lobby or create a seek from the right panel.'
                : 'Connect to FICS to view room tables.'}</div>`;
            return;
        }

        this.elements.lobbyRows.replaceChildren(...rows.map((row) => {
            const item = document.createElement('div');
            item.className = `fics-lobby-row ${row.kind === 'waiting' ? 'is-waiting' : 'is-playing'}`;
            item.setAttribute('role', 'row');
            const statusLabel = row.kind === 'waiting' ? 'Waiting table' : 'Playing table';
            item.innerHTML = `
                <span class="fics-lobby-status" role="cell" aria-label="${statusLabel}" title="${statusLabel}">
                    <span class="fics-lobby-led" aria-hidden="true"></span>
                </span>
                <span class="fics-lobby-table-number" role="cell">#${this.escapeHtml(row.table)}</span>
                <span class="fics-lobby-time" role="cell">${this.escapeHtml(row.timeControl)}</span>
                <span class="fics-lobby-players" role="cell" title="${this.escapeHtml(row.players)}">${row.playersHtml || this.escapeHtml(row.players)}</span>
            `;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fics-table-action';
            button.textContent = row.action;
            button.disabled = !!row.disabled;
            button.title = row.title || row.rated || row.action;
            if (!row.disabled) {
                button.addEventListener('click', () => this.handleLobbyAction(row));
            }
            item.appendChild(button);
            return item;
        }));
    },

    handleLobbyAction(row) {
        if (!row?.command) return;
        if (row.commandType === 'observe') {
            this.switchObservedGame(row.table);
            return;
        }
        if (row.commandType === 'unseek') {
            this.cancelSeek();
            return;
        }
        this.logToConsole(`> ${row.command}`);
        this.send(row.command);
    },

    switchObservedGame(gameNumber) {
        this.cancelPromotionSelection(false);
        const target = String(gameNumber);
        const current = this.liveGame?.observedGame && this.liveGame.gameNumber !== null
            ? String(this.liveGame.gameNumber)
            : null;

        if (current && current !== target) {
            this.updateGameStatus(`Switching observation from game ${current} to game ${target}...`, 'active');
            this.logToConsole(`> unobserve ${current}`);
            this.send(`unobserve ${current}`);
            setTimeout(() => {
                this.logToConsole(`> observe ${target}`);
                this.send(`observe ${target}`);
            }, 250);
            return;
        }

        this.updateGameStatus(`Observing game ${target}...`, 'active');
        this.logToConsole(`> observe ${target}`);
        this.send(`observe ${target}`);
    },

    cancelSeek() {
        this.pendingSeek = null;
        this.updateRoomStatus('Canceling seek...');
        this.renderRoomTables();
        this.logToConsole('> unseek');
        this.send('unseek');
        setTimeout(() => this.refreshLobby(true), 1200);
    },

    isCurrentFicsUser(name) {
        return !!name && !!this.ficsUsername && String(name).toLowerCase() === String(this.ficsUsername).toLowerCase();
    },

    formatPlayerLabel(name, rating) {
        const safeName = name || 'FICS player';
        const displayName = this.formatComputerPlayerName(safeName);
        return rating ? `${displayName} (${rating})` : displayName;
    },

    formatPlayerHtml(name, rating) {
        const safeName = name || 'FICS player';
        const displayName = this.escapeHtml(safeName);
        const ratingText = rating ? ` (${this.escapeHtml(rating)})` : '';
        const badge = this.isLikelyComputerPlayer(safeName)
            ? ' <span class="fics-engine-badge" title="Computer/engine account">C</span>'
            : '';
        return `${displayName}${ratingText}${badge}`;
    },

    formatComputerPlayerName(name) {
        return this.isLikelyComputerPlayer(name) && !/\(C\)$/i.test(String(name || ''))
            ? `${name} (C)`
            : name;
    },

    isLikelyComputerPlayer(name) {
        const value = String(name || '');
        return /(engine|stockfish|stock|computer|bot)/i.test(value) || /comp$/i.test(value);
    },

    ratingValue(rating) {
        const parsed = parseInt(rating, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    },

    averageRatings(a, b) {
        const values = [this.ratingValue(a), this.ratingValue(b)].filter((value) => value > 0);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    },

    getActiveTableForGame(gameNumber) {
        if (gameNumber === null || gameNumber === undefined) return null;
        return this.activeTables.find((table) => String(table.number) === String(gameNumber)) || null;
    },

    renderActiveTables(tables) {
        if (!this.elements.activeTables) return;
        if (!tables.length) {
            this.elements.activeTables.innerHTML = '<div class="fics-room-empty">Active game table browsing coming soon.</div>';
            return;
        }

        this.elements.activeTables.replaceChildren(...tables.map((table) => {
            const card = document.createElement('div');
            card.className = 'fics-table-card';
            card.innerHTML = `
                <span class="fics-room-cell fics-room-table">#${this.escapeHtml(table.number)}</span>
                <span class="fics-room-cell fics-room-time">${this.escapeHtml(table.timeControl || 'live')}</span>
                <span class="fics-room-cell fics-room-players">${this.escapeHtml(`${table.white}${table.whiteRating ? ` (${table.whiteRating})` : ''} vs ${table.black}${table.blackRating ? ` (${table.blackRating})` : ''}`)}</span>
            `;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fics-table-action';
            button.textContent = 'Watch';
            button.title = table.observers ? `${table.observers} watching` : 'Watch live game';
            button.addEventListener('click', () => {
                this.logToConsole(`> observe ${table.number}`);
                this.send(`observe ${table.number}`);
            });
            card.appendChild(button);
            return card;
        }));
    },

    renderWaitingPlayers(seeks) {
        if (!this.elements.waitingPlayers) return;
        if (!seeks.length) {
            this.elements.waitingPlayers.innerHTML = '<div class="fics-room-empty">No waiting players yet. Refresh or run sought.</div>';
            return;
        }

        this.elements.waitingPlayers.replaceChildren(...seeks.map((seek) => {
            const detail = seek.details;
            const card = document.createElement('div');
            card.className = 'fics-table-card fics-waiting-table';
            card.innerHTML = `
                <div class="fics-table-main">
                    <span class="fics-table-title">Table #${this.escapeHtml(seek.number)}</span>
                    <span class="fics-table-badge waiting">Waiting</span>
                </div>
                <div class="fics-table-players">
                    <span>${this.escapeHtml(detail.player)}</span>
                    <span>${this.escapeHtml(detail.rating)}</span>
                </div>
                <div class="fics-table-meta">
                    <span>${this.escapeHtml(detail.variant || 'standard')} ${this.escapeHtml(detail.timeControl)}</span>
                    <span>${this.escapeHtml([detail.rated, detail.color].filter(Boolean).join(' · ') || 'open color')}</span>
                </div>
            `;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'fics-table-action';
            card.innerHTML = `
                <span class="fics-room-cell fics-room-table">#${this.escapeHtml(seek.number)}</span>
                <span class="fics-room-cell fics-room-time">${this.escapeHtml(detail.timeControl || 'open')}</span>
                <span class="fics-room-cell fics-room-players">${this.escapeHtml(`${detail.player} (${detail.rating || 'Guest'}) ${detail.rated || 'unrated'}`)}</span>
            `;
            button.textContent = 'Sit';
            button.title = [detail.variant, detail.color].filter(Boolean).join(' - ') || seek.label;
            button.addEventListener('click', () => {
                this.logToConsole(`> play ${seek.number}`);
                this.send(`play ${seek.number}`);
            });
            card.appendChild(button);
            return card;
        }));
    },

    updateOpenTables(enabled) {
        const time = parseInt(this.elements.customTimeInput?.value, 10) || 5;
        const inc = parseInt(this.elements.customIncInput?.value, 10) || 0;
        this.elements.openTables?.querySelectorAll('[data-open-table]').forEach((button) => {
            button.toggleAttribute('disabled', !enabled);
            const timeCell = button.querySelector('.fics-room-time');
            if (timeCell) timeCell.textContent = `${time}+${inc}`;
        });
    },

    updateLiveGameUI() {
        const state = this.liveGame;
        const sideLabel = state.sideToMove === 'w' ? 'White' : 'Black';
        const status = state.gameActive
            ? `Game ${state.gameNumber} · ${sideLabel} to move`
            : state.observedGame
                ? `Observing game ${state.gameNumber} · ${sideLabel} to move`
                : `Game ${state.gameNumber} position`;
        this.updateGameStatus(status, state.gameActive ? 'active' : '');

        if (this.elements.whiteClock) this.elements.whiteClock.textContent = this.formatClock(state.whiteClock);
        if (this.elements.blackClock) this.elements.blackClock.textContent = this.formatClock(state.blackClock);
        this.updatePlayerBars();
        this.renderMoveList();

        if (this.elements.opponentInfo) {
            const opponentName = state.userColor === 'white'
                ? state.blackName
                : state.userColor === 'black'
                    ? state.whiteName
                    : `${state.whiteName} vs ${state.blackName}`;
            const detail = state.observedGame ? 'Observed live game' : `You are ${state.userColor || 'spectating'}`;
            this.elements.opponentInfo.replaceChildren();
            const icon = document.createElement('i');
            icon.className = 'fas fa-user';
            const details = document.createElement('div');
            details.className = 'fics-opponent-details';
            const heading = document.createElement('h4');
            heading.textContent = opponentName;
            const paragraph = document.createElement('p');
            paragraph.textContent = detail;
            details.append(heading, paragraph);
            this.elements.opponentInfo.append(icon, details);
        }
    },

    formatClock(seconds) {
        if (!Number.isFinite(seconds)) return '--:--';
        const safeSeconds = Math.max(0, seconds);
        return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
    },

    clearPendingMove(confirmed) {
        if (this.pendingMove?.sentAt && confirmed) {
            const roundTrip = Math.max(0, Math.round(performance.now() - this.pendingMove.sentAt));
            this.latencyMs = roundTrip;
            this.updateLatency();
            this.setPendingState('confirmed', `Confirmed in ${roundTrip} ms`);
            setTimeout(() => {
                if (!this.pendingMove) this.setPendingState('', '');
            }, 1200);
        } else {
            this.setPendingState('', '');
        }
        this.pendingMove = null;
    },

    setPendingState(kind, text) {
        if (!this.elements.pendingState) return;
        this.elements.pendingState.textContent = text || '';
        this.elements.pendingState.className = `fics-pending-state ${kind || ''}`.trim();
    },

    resetGameRecord() {
        this.moveHistory = [];
        this.lastMoveKey = null;
        this.pgnResult = '*';
        this.renderMoveList();
    },

    recordStyle12Move(state) {
        if (!state.lastMove || state.lastMove === 'none' || state.lastMove === '---') return;
        const color = state.sideToMove === 'w' ? 'black' : 'white';
        const moveNumber = color === 'white' ? state.moveNumber : Math.max(1, state.moveNumber - 1);
        const key = `${state.gameNumber}:${moveNumber}:${color}:${state.lastMove}:${state.fen}`;
        if (key === this.lastMoveKey) return;
        this.lastMoveKey = key;
        this.moveHistory.push({
            moveNumber,
            color,
            san: state.lastMove,
            verbose: state.lastMoveVerbose,
            fen: state.fen
        });
        this.renderMoveList();
    },

    renderMoveList() {
        if (!this.elements.moveList) return;
        if (!this.moveHistory.length) {
            this.elements.moveList.textContent = 'Moves will appear here as Style12 updates arrive.';
            return;
        }
        const rows = [];
        this.moveHistory.forEach((move) => {
            let row = rows.find((item) => item.moveNumber === move.moveNumber);
            if (!row) {
                row = { moveNumber: move.moveNumber, white: '', black: '' };
                rows.push(row);
            }
            row[move.color] = move.san;
        });
        this.elements.moveList.replaceChildren(...rows.map((row) => {
            const item = document.createElement('div');
            item.className = 'fics-move-row';
            item.innerHTML = `
                <span class="fics-move-number">${row.moveNumber}.</span>
                <span>${this.escapeHtml(row.white || '...')}</span>
                <span>${this.escapeHtml(row.black || '')}</span>
            `;
            return item;
        }));
    },

    buildPGN() {
        const date = new Date();
        const state = this.liveGame;
        const timeControl = Number.isFinite(state.initialTime) && Number.isFinite(state.increment)
            ? `${state.initialTime * 60}+${state.increment}`
            : '-';
        const headers = [
            ['Event', 'FICS game'],
            ['Site', 'freechess.org'],
            ['Date', date.toISOString().slice(0, 10).replace(/-/g, '.')],
            ['Round', state.gameNumber || '-'],
            ['White', state.whiteName || 'White'],
            ['Black', state.blackName || 'Black'],
            ['Result', this.pgnResult],
            ['TimeControl', timeControl]
        ].map(([key, value]) => `[${key} "${String(value).replace(/"/g, '\\"')}"]`);

        const rows = [];
        this.moveHistory.forEach((move) => {
            let row = rows.find((item) => item.moveNumber === move.moveNumber);
            if (!row) {
                row = { moveNumber: move.moveNumber, white: '', black: '' };
                rows.push(row);
            }
            row[move.color] = move.san;
        });
        const moves = rows.map((row) => `${row.moveNumber}. ${row.white || '...'}${row.black ? ` ${row.black}` : ''}`).join(' ');
        return `${headers.join('\n')}\n\n${moves} ${this.pgnResult}`.trim() + '\n';
    },

    downloadPGN() {
        const pgn = this.buildPGN();
        const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fics-game-${this.liveGame.gameNumber || 'live'}.pgn`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    },

    extractResult(line) {
        if (/1-0/.test(line)) return '1-0';
        if (/0-1/.test(line)) return '0-1';
        if (/1\/2-1\/2|drawn|draw/i.test(line)) return '1/2-1/2';
        return '*';
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    },

    loadSoundPreference() {
        try {
            this.soundsEnabled = localStorage.getItem('caissaFicsSoundsEnabled') === 'true';
        } catch (error) {
            this.soundsEnabled = false;
        }
        this.updateSoundToggle();
    },

    toggleSounds() {
        this.soundsEnabled = !this.soundsEnabled;
        try {
            localStorage.setItem('caissaFicsSoundsEnabled', String(this.soundsEnabled));
        } catch (error) {
            // Sound preference is optional; ignore storage failures.
        }
        if (this.soundsEnabled) {
            this.ensureAudioContext();
            this.playNotificationSound('enabled', { force: true });
        }
        this.updateSoundToggle();
    },

    updateSoundToggle() {
        if (!this.elements.soundToggle) return;
        this.elements.soundToggle.setAttribute('aria-pressed', String(this.soundsEnabled));
        this.elements.soundToggle.innerHTML = this.soundsEnabled
            ? '<i class="fas fa-volume-up"></i> Disable Sounds'
            : '<i class="fas fa-volume-mute"></i> Enable Sounds';
    },

    ensureAudioContext() {
        if (this.audioContext) return this.audioContext;
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        this.audioContext = new AudioCtor();
        return this.audioContext;
    },

    playNotificationSound(type, options = {}) {
        if (!this.soundsEnabled && !options.force) return;
        const now = performance.now();
        if (!options.force && now - (this.lastSoundAt[type] || 0) < 650) return;
        this.lastSoundAt[type] = now;

        const context = this.ensureAudioContext();
        if (!context) return;
        if (context.state === 'suspended') context.resume().catch(() => {});

        const patterns = {
            gameStart: [523, 659],
            playerTurn: [784, 988],
            opponentMove: [440],
            seekAccepted: [659, 880],
            enabled: [660]
        };
        const tones = patterns[type] || patterns.opponentMove;
        tones.forEach((frequency, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const startAt = context.currentTime + index * 0.085;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, startAt);
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.11);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(startAt);
            oscillator.stop(startAt + 0.12);
        });
    },

    handleStyle12SoundEvents({ wasActive, previousFen, previousSideToMove, state, playing, userColor }) {
        if (!playing && !state.observedGame) return;
        const fenChanged = previousFen && previousFen !== state.fen;
        const turnChanged = previousSideToMove && previousSideToMove !== state.sideToMove;

        if (!wasActive && playing) {
            if (performance.now() - (this.lastSoundAt.seekAccepted || 0) > 2000) {
                this.playNotificationSound('gameStart');
            }
            return;
        }

        if (!fenChanged || !turnChanged) return;

        const sideToMoveColor = state.sideToMove === 'w' ? 'white' : 'black';
        if (playing && userColor && sideToMoveColor === userColor) {
            this.playNotificationSound('playerTurn');
        } else if (state.observedGame) {
            this.playNotificationSound('opponentMove');
        }
    },

    updatePlayerBars() {
        const state = this.liveGame;
        const hasGame = !!state.currentFen;
        const orientation = state.userColor || 'white';
        const idleUserName = this.authenticated ? this.ficsUsername : null;
        const idleUserRating = this.authenticated
            ? (this.loginMode === 'account' ? 'registered' : 'guest')
            : 'waiting';
        const tableMeta = this.getActiveTableForGame(state.gameNumber);
        const white = {
            color: 'white',
            name: state.whiteName || (this.myColor === 'white' || (!hasGame && idleUserName) ? this.ficsUsername : 'White'),
            rating: state.whiteName ? (tableMeta?.whiteRating || 'FICS') : idleUserRating,
            clock: this.formatClock(state.whiteClock)
        };
        const black = {
            color: 'black',
            name: state.blackName || (this.myColor === 'black' ? this.ficsUsername : 'Black'),
            rating: state.blackName ? (tableMeta?.blackRating || 'FICS') : 'waiting',
            clock: this.formatClock(state.blackClock)
        };
        const top = orientation === 'black' ? white : black;
        const bottom = orientation === 'black' ? black : white;
        this.renderPlayerBar(this.elements.topPlayerBar, top, hasGame, state.sideToMove);
        this.renderPlayerBar(this.elements.bottomPlayerBar, bottom, hasGame, state.sideToMove);
    },

    renderPlayerBar(element, player, hasGame, sideToMove) {
        if (!element) return;
        const isTurn = hasGame && sideToMove === (player.color === 'white' ? 'w' : 'b');
        element.className = `fics-player-bar ${player.color}${isTurn ? ' turn-active' : ''}`;
        const engineBadge = this.isLikelyComputerPlayer(player.name)
            ? ' <span class="fics-engine-badge" title="Computer/engine account">C</span>'
            : '';
        element.innerHTML = `
            <span class="fics-turn-led${isTurn ? ' active' : ''}" aria-label="${isTurn ? `${player.color} to move` : `${player.color} waiting`}"></span>
            <span class="fics-color-dot" aria-hidden="true"></span>
            <span class="fics-player-name" title="${this.escapeHtml(this.formatComputerPlayerName(player.name))}">${this.escapeHtml(player.name)}${engineBadge}</span>
            <span class="fics-player-rating">${this.escapeHtml(player.rating)}</span>
            <span class="fics-player-lag">lag --</span>
            <strong class="fics-player-clock">${hasGame ? this.escapeHtml(player.clock) : '--:--'}</strong>
        `;
    },

    // ===== BOARD MANAGEMENT =====
    initBoard(position = this.liveGame.currentFen || 'start') {
        if (!this.elements.boardContainer) return;
        if (!this.elements.boardContainer.offsetParent && !this.board) return;
        if (this.board) {
            if (position) this.board.position(position, false);
            return;
        }

        // Clear existing board
        this.elements.boardContainer.innerHTML = '';

        // Create new board
        const config = {
            draggable: true,
            position,
            onDragStart: (source, piece) => this.onDragStart(source, piece),
            onDrop: (source, target) => this.onDrop(source, target),
            onSnapEnd: () => this.onSnapEnd()
        };

        // Flip board if playing black
        if (this.myColor === 'black') {
            config.orientation = 'black';
        }

        if (typeof Chessboard !== 'undefined') {
            this.board = Chessboard(this.elements.boardContainer, config);
            console.log('[FICS Client] Chessboard initialized');
        } else {
            console.error('[FICS Client] Chessboard.js not found!');
            this.elements.boardContainer.innerHTML = '<p>Board library not loaded</p>';
        }
    },

    onDragStart(source, piece) {
        if (!this.gameActive || this.liveGame.observedGame || this.pendingMove || this.pendingPromotionMove) return false;
        if (this.liveGame.relation !== 1) return false;

        // Don't allow picking up pieces if game is over
        if (!this.chess || this.chess.game_over()) return false;

        // Only allow moving own pieces
        if ((this.myColor === 'white' && piece.search(/^b/) !== -1) ||
            (this.myColor === 'black' && piece.search(/^w/) !== -1)) {
            return false;
        }

        return true;
    },

    onDrop(source, target) {
        if (!this.canSubmitGraphicalMove()) return 'snapback';

        const validator = new Chess(this.liveGame.currentFen);
        if (this.isPromotionAttempt(validator, source, target)) {
            this.showPromotionSelector(source, target);
            return 'snapback';
        }

        const move = validator.move({
            from: source,
            to: target
        });

        // Illegal move
        if (move === null) return 'snapback';

        const moveStr = source + target + (move.promotion || '');
        this.pendingMove = {
            uci: moveStr,
            optimisticFen: validator.fen(),
            sentAt: performance.now()
        };
        this.setPendingState('pending', `Pending ${moveStr}...`);
        if (this.board) this.board.position(validator.fen(), true);
        this.sendMove(moveStr);
    },

    canSubmitGraphicalMove() {
        if (!this.liveGame.currentFen || this.liveGame.relation !== 1) return false;
        if (!this.gameActive || this.liveGame.observedGame || this.pendingMove) return false;
        if (!this.myColor || !this.liveGame.sideToMove) return false;
        return this.liveGame.sideToMove === (this.myColor === 'white' ? 'w' : 'b');
    },

    isPromotionAttempt(validator, source, target) {
        const piece = validator.get?.(source);
        if (!piece || piece.type !== 'p') return false;
        const targetRank = target?.[1];
        return (piece.color === 'w' && targetRank === '8') || (piece.color === 'b' && targetRank === '1');
    },

    showPromotionSelector(source, target) {
        this.pendingPromotionMove = { source, target, fen: this.liveGame.currentFen };
        this.setPendingState('pending', `Choose promotion for ${source}${target}`);
        if (this.board && this.liveGame.currentFen) this.board.position(this.liveGame.currentFen, false);
        if (this.elements.promotionSelector) {
            this.elements.promotionSelector.hidden = false;
            const firstButton = this.elements.promotionSelector.querySelector('[data-promotion]');
            setTimeout(() => firstButton?.focus(), 0);
        }
    },

    completePromotionSelection(piece) {
        if (!this.pendingPromotionMove || !/^[qnbr]$/.test(piece || '')) return;
        if (!this.canSubmitGraphicalMove()) {
            this.cancelPromotionSelection();
            return;
        }

        const { source, target } = this.pendingPromotionMove;
        const validator = new Chess(this.liveGame.currentFen);
        const move = validator.move({ from: source, to: target, promotion: piece });
        if (move === null) {
            this.cancelPromotionSelection();
            this.updateGameStatus('Promotion move is not legal', 'error');
            return;
        }

        const moveStr = source + target + piece;
        this.cancelPromotionSelection(false);
        this.pendingMove = {
            uci: moveStr,
            optimisticFen: validator.fen(),
            sentAt: performance.now()
        };
        this.setPendingState('pending', `Pending ${moveStr}...`);
        if (this.board) this.board.position(validator.fen(), true);
        this.sendMove(moveStr);
    },

    cancelPromotionSelection(restoreBoard = true) {
        this.pendingPromotionMove = null;
        if (this.elements.promotionSelector) this.elements.promotionSelector.hidden = true;
        this.setPendingState('', '');
        if (restoreBoard && this.board && this.liveGame.currentFen) {
            this.board.position(this.liveGame.currentFen, false);
        }
    },

    onSnapEnd() {
        if (!this.board) return;
        if (this.pendingMove?.optimisticFen) {
            this.board.position(this.pendingMove.optimisticFen, false);
        } else if (this.liveGame.currentFen) {
            this.board.position(this.liveGame.currentFen, false);
        }
    },

    // ===== GAME COMMANDS =====
    seek(time, inc) {
        if (!this.authenticated) {
            this.logToConsole('❌ Not connected to FICS');
            return;
        }

        const command = `seek ${time} ${inc}`;
        this.logToConsole(`> ${command}`);
        this.pendingSeek = {
            timeControl: `${time}+${inc}`,
            label: 'Your active seek'
        };
        this.renderRoomTables();
        this.send({
            type: 'command',
            text: command
        });
    },

    sendMove(move) {
        if (!this.authenticated) {
            this.logToConsole('❌ Not connected to FICS');
            return;
        }

        console.log('[FICS Client] Sending move:', move);
        this.send({
            type: 'move',
            text: move
        });
    },

    resign() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'resign' });
        this.logToConsole('> resign');
    },

    offerDraw() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'draw' });
        this.logToConsole('> draw');
    },

    abort() {
        if (!this.gameActive) return;
        this.send({ type: 'command', text: 'abort' });
        this.logToConsole('> abort');
    },

    sendCommand() {
        const command = this.elements.commandInput?.value.trim();
        if (!command) return;

        this.logToConsole(`> ${command}`);
        this.send({
            type: 'command',
            text: command
        });

        this.elements.commandInput.value = '';
    },

    // ===== UI UPDATES =====
    updateConnectionStatus(connected, message = null) {
        if (!this.elements.connectionStatus) return;

        if (connected) {
            this.elements.connectionStatus.textContent = message || 'Connected';
            this.elements.connectionStatus.className = 'fics-status fics-status-connected';
            this.elements.connectBtn?.setAttribute('disabled', 'true');
            this.elements.accountConnectBtn?.setAttribute('disabled', 'true');
            this.elements.disconnectBtn?.removeAttribute('disabled');
        } else {
            this.elements.connectionStatus.textContent = message || 'Not connected';
            this.elements.connectionStatus.className = 'fics-status fics-status-disconnected';
            if (this.isGatewayConfigured()) {
                this.elements.connectBtn?.removeAttribute('disabled');
                this.elements.accountConnectBtn?.removeAttribute('disabled');
            } else {
                this.elements.connectBtn?.setAttribute('disabled', 'true');
                this.elements.accountConnectBtn?.setAttribute('disabled', 'true');
            }
            this.elements.disconnectBtn?.setAttribute('disabled', 'true');
        }
        this.updateLoginControls();
    },

    setConnectionState(state, message = null) {
        this.connectionState = state;
        const labels = {
            disconnected: 'Disconnected',
            connecting: 'Connecting',
            connected: 'Connected',
            reconnecting: 'Reconnecting',
            error: 'Error'
        };
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.textContent = message || labels[state] || state;
            this.elements.connectionStatus.className = `fics-status fics-status-${state}`;
        }
        const active = state === 'connecting' || state === 'connected' || state === 'reconnecting';
        this.elements.connectBtn?.toggleAttribute('disabled', active || !this.isGatewayConfigured());
        this.elements.accountConnectBtn?.toggleAttribute('disabled', active || !this.isGatewayConfigured());
        this.elements.disconnectBtn?.toggleAttribute('disabled', !active);
        this.updateLoginControls();
    },

    updateLatency() {
        if (this.elements.gatewayLatency) {
            this.elements.gatewayLatency.textContent = this.latencyMs === null
                ? 'Not measured'
                : `${this.latencyMs} ms`;
        }
    },

    updateGameStatus(status, className = '') {
        if (this.elements.gameStatus) {
            // Handle multiline status messages
            if (status.includes('\n')) {
                // Convert newlines to <br> for proper display
                const lines = status.split('\n').map(line => line.trim()).filter(Boolean);
                this.elements.gameStatus.innerHTML = lines.join('<br>');
            } else {
                this.elements.gameStatus.textContent = status;
            }
            this.elements.gameStatus.className = `fics-game-status ${className}`;
        }

        // Show/hide game controls
        if (this.elements.gameControls) {
            this.elements.gameControls.style.display = this.gameActive ? 'flex' : 'none';
        }
    },

    logToConsole(message) {
        this.messageBuffer.push(message);

        // Trim buffer if too large
        if (this.messageBuffer.length > this.maxBufferSize) {
            this.messageBuffer.shift();
        }

        // Update console UI
        if (this.elements.console) {
            this.elements.console.textContent = this.messageBuffer.join('\n');
            this.elements.console.scrollTop = this.elements.console.scrollHeight;
        }
    },

    toggleConsole() {
        if (this.elements.consoleContainer) {
            const isHidden = this.elements.consoleContainer.style.display === 'none';
            this.elements.consoleContainer.style.display = isHidden ? 'block' : 'none';
            if (this.elements.consoleToggle) {
                this.elements.consoleToggle.textContent = isHidden ? '▼ Hide Console' : '▶ Show Console';
            }
        }
    },

    // ===== LIFECYCLE =====
    onEnter() {
        console.log('[FICS Client] Section entered');
        this.initBoard(this.liveGame.currentFen || 'start');
        if (!this.liveGame.currentFen && this.authenticated) {
            this.updateGameStatus(this.loginMode === 'account'
                ? `Logged in as ${this.ficsUsername}. Seek or accept a game to begin.`
                : 'Connected as FICS guest. Seek or accept a game to begin.', 'active');
        }
        this.updatePlayerBars();
    },

    onExit() {
        console.log('[FICS Client] Section exited');
        // Don't disconnect automatically - let user decide
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaFICSClient.init();
    });
} else {
    CaissaFICSClient.init();
}

// Make globally accessible
window.CaissaFICSClient = CaissaFICSClient;
