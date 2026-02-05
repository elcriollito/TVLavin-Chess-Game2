/**
 * CAISSA DOS Chess Module
 *
 * Play classic MS-DOS chess games in-browser via DOSBox
 * Features: Search, sort, filter, lazy-loaded DOSBox emulation
 */

console.log('[DOS Chess] Module loaded');

const CaissaDOSChess = {
    // State
    games: [],
    filteredGames: [],
    currentFilter: 'all',
    currentSort: 'popularity',
    searchQuery: '',
    dosBoxLoaded: false,
    currentGame: null,
    dosInstance: null,

    // DOM Elements
    elements: {},

    // ===== INITIALIZATION =====
    init() {
        console.log('[DOS Chess] Initializing...');
        this.cacheElements();
        this.bindEvents();
        this.loadGames();
    },

    cacheElements() {
        this.elements = {
            gamesGrid: document.getElementById('dosGamesGrid'),
            searchInput: document.getElementById('dosSearchInput'),
            sortSelect: document.getElementById('dosSortSelect'),
            filterChips: document.querySelectorAll('.dos-filter-chip'),
            playerModal: document.getElementById('dosPlayerModal'),
            playerContainer: document.getElementById('dosPlayerContainer'),
            playerGameName: document.getElementById('dosPlayerGameName'),
            playerClose: document.getElementById('dosPlayerClose'),
            playerFullscreen: document.getElementById('dosPlayerFullscreen'),
            playerError: document.getElementById('dosPlayerError')
        };
    },

    bindEvents() {
        // Search
        this.elements.searchInput?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndRenderGames();
        });

        // Sort
        this.elements.sortSelect?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.filterAndRenderGames();
        });

        // Filter chips
        this.elements.filterChips?.forEach(chip => {
            chip.addEventListener('click', (e) => {
                this.elements.filterChips.forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.filterAndRenderGames();
            });
        });

        // Player modal close
        this.elements.playerClose?.addEventListener('click', () => {
            this.closePlayer();
        });

        // Fullscreen toggle
        this.elements.playerFullscreen?.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.playerModal?.style.display !== 'none') {
                this.closePlayer();
            }
        });
    },

    // ===== LOAD GAMES DATA =====
    async loadGames() {
        // Debug mode (add ?debug=1 to URL)
        const debugMode = new URLSearchParams(window.location.search).has('debug');

        // Try multiple paths for Vercel (public as root) and Live Server compatibility
        const candidates = [
            new URL('/dos/dos_chess_games.json', window.location.origin).toString(),
            new URL('/public/dos/dos_chess_games.json', window.location.origin).toString()
        ];

        const attempts = [];

        for (const url of candidates) {
            try {
                if (debugMode) {
                    console.log('[DOS Chess DEBUG] Attempting:', url);
                }

                const response = await fetch(url, { cache: 'no-store' });
                const contentType = response.headers.get('content-type') || '';

                if (debugMode) {
                    console.log('[DOS Chess DEBUG] Status:', response.status);
                    console.log('[DOS Chess DEBUG] Content-Type:', contentType);
                }

                attempts.push({
                    url,
                    status: response.status,
                    contentType
                });

                // Success: Found JSON
                if (response.ok && (contentType.includes('application/json') || contentType.includes('text/plain'))) {
                    this.games = await response.json();
                    this.filteredGames = [...this.games];

                    console.log(`[DOS Chess] Loaded ${this.games.length} games from: ${url}`);
                    this.filterAndRenderGames();
                    return; // Success - exit
                }

                // Log issues but try next candidate
                if (debugMode) {
                    if (!response.ok) {
                        console.warn('[DOS Chess DEBUG] Failed:', response.status, response.statusText);
                    } else if (!contentType.includes('application/json')) {
                        console.warn('[DOS Chess DEBUG] Wrong content-type, trying next...');
                        if (contentType.includes('text/html')) {
                            const body = await response.text();
                            console.log('[DOS Chess DEBUG] HTML response preview:', body.substring(0, 120));
                        }
                    }
                }

            } catch (error) {
                if (debugMode) {
                    console.warn('[DOS Chess DEBUG] Fetch error:', url, error.message);
                }
                attempts.push({
                    url,
                    status: 'error',
                    contentType: error.message
                });
            }
        }

        // All attempts failed - use fallback
        console.error('[DOS Chess] All JSON load attempts failed:', attempts);
        console.warn('[DOS Chess] Using fallback dataset');

        this.games = this.getFallbackGames();
        this.filteredGames = [...this.games];

        this.filterAndRenderGames();

        // Show banner with details
        const failureDetails = attempts.map(a =>
            `${a.url} → ${a.status} (${a.contentType})`
        ).join('\n');

        this.showFallbackBanner(
            `JSON load failed. Attempted:\n${failureDetails}\n\nUsing 2-game fallback list.`
        );
    },

    // ===== FALLBACK DATASET =====
    getFallbackGames() {
        return [
            {
                id: 'battle-chess',
                name: 'Battle Chess',
                year: 1988,
                view: '3D',
                popularity: 98,
                publisher: 'Interplay',
                description: 'Iconic animated chess game where pieces battle when capturing.',
                features: ['Animated battles', 'Medieval theme', 'Multiplayer'],
                playUrl: 'https://www.dosgamesarchive.com/play/battle-chess',
                downloadUrl: 'https://www.dosgamesarchive.com/download/battle-chess',
                sourceUrl: 'https://www.dosgamesarchive.com/games?t=chess',
                selfHosted: false,
                zipPath: null,
                license: { type: 'shareware', url: '', notes: 'External link only' }
            },
            {
                id: 'fritz-25',
                name: 'Fritz 2.5 (DOS)',
                year: 1991,
                view: '2D',
                popularity: 95,
                publisher: 'ChessBase',
                description: 'Classic DOS chess program by ChessBase.',
                features: ['Opening book', 'Endgame tablebases', 'Analysis mode'],
                playUrl: 'https://www.dosgamesarchive.com/play/fritz',
                downloadUrl: 'https://www.dosgamesarchive.com/download/fritz',
                sourceUrl: 'https://www.dosgamesarchive.com/games?t=chess',
                selfHosted: false,
                zipPath: null,
                license: { type: 'shareware', url: '', notes: 'External link only' }
            }
        ];
    },

    // ===== FILTER & SORT =====
    filterAndRenderGames() {
        // Filter by view type
        let filtered = this.currentFilter === 'all'
            ? [...this.games]
            : this.games.filter(game => game.view === this.currentFilter);

        // Filter by search query
        if (this.searchQuery) {
            filtered = filtered.filter(game =>
                game.name.toLowerCase().includes(this.searchQuery) ||
                game.description.toLowerCase().includes(this.searchQuery) ||
                game.publisher.toLowerCase().includes(this.searchQuery)
            );
        }

        // Sort
        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'popularity':
                    return b.popularity - a.popularity;
                case 'year':
                    return b.year - a.year;
                case 'name':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });

        this.filteredGames = filtered;
        this.renderGames();
    },

    // ===== RENDER GAMES =====
    renderGames() {
        if (!this.elements.gamesGrid) return;

        if (this.filteredGames.length === 0) {
            this.elements.gamesGrid.innerHTML = `
                <div class="dos-no-results">
                    <i class="fas fa-search"></i>
                    <p>No games found matching your criteria.</p>
                    <button class="btn btn-secondary" onclick="CaissaDOSChess.clearFilters()">Clear Filters</button>
                </div>
            `;
            return;
        }

        const gamesHTML = this.filteredGames.map(game => {
            // Phase 1: External links only
            const playButton = game.playUrl ? `
                <a href="${game.playUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary dos-play-btn">
                    <i class="fas fa-play"></i> Play <i class="fas fa-external-link-alt"></i>
                </a>
            ` : '';

            const downloadButton = game.downloadUrl ? `
                <a href="${game.downloadUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary dos-download-btn">
                    <i class="fas fa-download"></i> Download <i class="fas fa-external-link-alt"></i>
                </a>
            ` : '';

            // Phase 3: Retro vs Modern (disabled for now)
            const retroModernButton = `
                <button class="btn btn-outline-secondary dos-retro-btn" disabled title="Coming soon - Premium feature">
                    <i class="fas fa-balance-scale"></i> Retro vs Modern
                </button>
            `;

            return `
                <div class="dos-game-card" data-game-id="${game.id}">
                    <div class="dos-game-badge ${game.view.toLowerCase()}">${game.view}</div>
                    <div class="dos-game-icon">
                        <i class="fas ${game.view === '3D' ? 'fa-cube' : 'fa-chess-board'}"></i>
                    </div>
                    <div class="dos-game-info">
                        <h3 class="dos-game-name">${game.name}</h3>
                        <div class="dos-game-meta">
                            <span><i class="fas fa-calendar"></i> ${game.year}</span>
                            <span><i class="fas fa-building"></i> ${game.publisher}</span>
                        </div>
                        <p class="dos-game-description">${game.description}</p>
                        <div class="dos-game-features">
                            ${game.features.slice(0, 3).map(f => `<span class="dos-feature-tag">${f}</span>`).join('')}
                        </div>
                    </div>
                    <div class="dos-game-footer">
                        <div class="dos-game-actions">
                            ${playButton}
                            ${downloadButton}
                            ${retroModernButton}
                        </div>
                        <small class="dos-external-note">
                            <i class="fas fa-info-circle"></i> Opens external site
                        </small>
                    </div>
                </div>
            `;
        }).join('');

        this.elements.gamesGrid.innerHTML = gamesHTML;
    },

    // ===== LAUNCH GAME =====
    async launchGame(gameId) {
        const game = this.games.find(g => g.id === gameId);
        if (!game) {
            console.error('[DOS Chess] Game not found:', gameId);
            return;
        }

        console.log('[DOS Chess] Launching game:', game.name);
        this.currentGame = game;

        // Show modal
        this.elements.playerModal.style.display = 'flex';
        this.elements.playerGameName.textContent = game.name;
        this.elements.playerError.style.display = 'none';

        // Check if game bundle exists
        const bundleExists = await this.checkGameBundle(game.assetZip);
        if (!bundleExists) {
            this.showPlayerError('Game bundle not installed yet.');
            return;
        }

        // Load DOSBox if not already loaded
        if (!this.dosBoxLoaded) {
            await this.loadDOSBox();
        }

        // Start the game
        this.startDOSBoxGame(game);
    },

    // ===== CHECK GAME BUNDLE =====
    async checkGameBundle(zipPath) {
        try {
            const response = await fetch(zipPath, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            console.warn('[DOS Chess] Game bundle not found:', zipPath);
            return false;
        }
    },

    // ===== LOAD DOSBOX =====
    async loadDOSBox() {
        console.log('[DOS Chess] Loading DOSBox runtime...');

        // For now, show a placeholder message
        // In production, this would load js-dos or similar
        this.elements.playerContainer.innerHTML = `
            <div class="dos-placeholder">
                <div class="dos-placeholder-content">
                    <i class="fas fa-desktop dos-placeholder-icon"></i>
                    <h3>DOSBox Emulator</h3>
                    <p>This feature requires DOSBox.js integration.</p>
                    <p>To enable:</p>
                    <ol style="text-align: left; margin: 20px auto; max-width: 400px;">
                        <li>Install js-dos: <code>npm install js-dos</code></li>
                        <li>Add DOSBox initialization code</li>
                        <li>Load game bundle: <code>${this.currentGame?.assetZip || ''}</code></li>
                    </ol>
                    <p><small>For development: Game data loaded successfully. Player UI ready.</small></p>
                </div>
            </div>
        `;

        this.dosBoxLoaded = true;
    },

    // ===== START DOSBOX GAME =====
    startDOSBoxGame(game) {
        console.log('[DOS Chess] Starting game:', game.name);

        // Placeholder for actual DOSBox integration
        // In production, this would:
        // 1. Create js-dos instance
        // 2. Mount the ZIP bundle
        // 3. Run the DOS executable
        // 4. Render canvas in playerContainer
    },

    // ===== PLAYER CONTROLS =====
    closePlayer() {
        console.log('[DOS Chess] Closing player');
        this.elements.playerModal.style.display = 'none';

        // Stop DOSBox instance if running
        if (this.dosInstance) {
            // this.dosInstance.stop();
            this.dosInstance = null;
        }

        this.currentGame = null;
    },

    toggleFullscreen() {
        const modal = this.elements.playerModal;
        if (!document.fullscreenElement) {
            modal.requestFullscreen?.() || modal.webkitRequestFullscreen?.();
            this.elements.playerFullscreen.querySelector('i').classList.replace('fa-expand', 'fa-compress');
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            this.elements.playerFullscreen.querySelector('i').classList.replace('fa-compress', 'fa-expand');
        }
    },

    // ===== ERROR HANDLING =====
    showError(message) {
        if (this.elements.gamesGrid) {
            this.elements.gamesGrid.innerHTML = `
                <div class="dos-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    },

    showPlayerError(message) {
        this.elements.playerContainer.innerHTML = '';
        this.elements.playerError.querySelector('p').textContent = message;
        this.elements.playerError.style.display = 'flex';
    },

    showFallbackBanner(errorMsg) {
        if (!this.elements.gamesGrid) return;

        const banner = document.createElement('div');
        banner.className = 'dos-fallback-banner';
        banner.innerHTML = `
            <div class="dos-fallback-content">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Using fallback list (JSON failed)</strong>
                    <p>${errorMsg}</p>
                </div>
                <button class="btn btn-secondary" onclick="location.reload()">
                    <i class="fas fa-sync"></i> Retry
                </button>
            </div>
        `;

        this.elements.gamesGrid.parentElement.insertBefore(banner, this.elements.gamesGrid);
    },

    clearFilters() {
        this.searchQuery = '';
        this.currentFilter = 'all';
        this.currentSort = 'popularity';

        this.elements.searchInput.value = '';
        this.elements.sortSelect.value = 'popularity';
        this.elements.filterChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === 'all');
        });

        this.filterAndRenderGames();
    },

    // ===== PHASE 3: RETRO VS MODERN (STUB) =====
    openRetroModernCompare(gameId) {
        // Phase 3 placeholder - Premium feature
        console.log('[DOS Chess] Retro vs Modern requested for:', gameId);

        // Show "Coming Soon" modal
        alert('🚀 Retro vs Modern Analysis\n\n' +
              'This premium feature will let you:\n' +
              '• Load a DOS game position\n' +
              '• Compare with modern Stockfish analysis\n' +
              '• See how chess engines evolved\n\n' +
              'Coming soon!');
    },

    // ===== SECTION LIFECYCLE =====
    onEnter() {
        console.log('[DOS Chess] Section entered');
        if (this.games.length === 0) {
            this.loadGames();
        }
    },

    onExit() {
        console.log('[DOS Chess] Section exited');
        this.closePlayer();
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        CaissaDOSChess.init();
        // Register with navigation system
        if (window.CaissaNavigation) {
            CaissaNavigation.registerSection('dosChess', CaissaDOSChess);
        }
    });
} else {
    CaissaDOSChess.init();
    // Register with navigation system
    if (window.CaissaNavigation) {
        CaissaNavigation.registerSection('dosChess', CaissaDOSChess);
    }
}

// Make globally accessible for onclick handlers
window.CaissaDOSChess = CaissaDOSChess;
