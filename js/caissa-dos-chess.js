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
        try {
            const response = await fetch('/dos/dos_chess_games.json');
            if (!response.ok) throw new Error('Failed to load games data');

            this.games = await response.json();
            this.filteredGames = [...this.games];

            console.log(`[DOS Chess] Loaded ${this.games.length} games`);
            this.filterAndRenderGames();
        } catch (error) {
            console.error('[DOS Chess] Error loading games:', error);
            this.showError('Failed to load DOS chess games. Please refresh the page.');
        }
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

        const gamesHTML = this.filteredGames.map(game => `
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
                    <span class="dos-game-size">${(game.sizeKB / 1024).toFixed(1)} MB</span>
                    <button class="btn btn-primary dos-play-btn" onclick="CaissaDOSChess.launchGame('${game.id}')" aria-label="Play ${game.name}">
                        <i class="fas fa-play"></i> Play
                    </button>
                </div>
            </div>
        `).join('');

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
