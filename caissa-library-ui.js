/**
 * CAISSA Library - UI Module
 *
 * Handles the Library panel interface, events, and rendering.
 * Follows the same pattern as MentorAI panel.
 */

const LibraryUI = {

    // State
    isOpen: false,
    currentPage: 0,
    pageSize: 20,
    selectedPositions: new Set(),
    currentFilter: {
        search: '',
        tags: []
    },
    currentTab: 'positions', // 'positions' | 'games'
    viewingCollectionId: null, // When viewing positions within a collection

    // DOM elements (cached after init)
    elements: {},

    /**
     * Initialize the Library UI
     */
    async init() {
        this.cacheElements();
        this.bindEvents();

        try {
            await CaissaLibrary.init();
            // Set initial state for Save Game button
            this.updateSaveGameButton();

            // Initialize Phase 3 modules
            if (window.QueryEngineUI) window.QueryEngineUI.init();
            if (window.PositionForgeUI) window.PositionForgeUI.init();

            // Listen for query engine results
            window.addEventListener('caissa-query-results', (e) => {
                const { results } = e.detail || {};
                if (results && this.elements.positionList) {
                    this.elements.positionList.style.display = 'block';
                    this._setVisible(this.elements.emptyState, results.length === 0);
                    this.elements.positionList.innerHTML = results.map(pos => this._renderPositionItem(pos)).join('');
                    this._bindPositionItemEvents();
                }
            });

            window.addEventListener('caissa-query-clear', () => {
                this.renderPositionList();
            });

            console.log('LibraryUI: Initialized');
        } catch (error) {
            console.error('LibraryUI: Failed to initialize', error);
        }
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            panel: document.getElementById('libraryPanel'),
            toggleBtn: document.getElementById('libraryToggleBtn'),
            closeBtn: document.getElementById('libraryCloseBtn'),
            positionList: document.getElementById('libraryPositionList'),
            collectionList: document.getElementById('libraryCollectionList'),
            searchSection: document.getElementById('librarySearchSection'),
            searchInput: document.getElementById('librarySearch'),
            tagFilter: document.getElementById('libraryTagFilter'),
            exportJsonBtn: document.getElementById('libraryExportJson'),
            importBtn: document.getElementById('libraryImportBtn'),
            importInput: document.getElementById('libraryImportInput'),
            statsDisplay: document.getElementById('libraryStats'),
            emptyState: document.getElementById('libraryEmptyState'),
            emptyGames: document.getElementById('libraryEmptyGames'),
            pagination: document.getElementById('libraryPagination'),
            prevPageBtn: document.getElementById('libraryPrevPage'),
            nextPageBtn: document.getElementById('libraryNextPage'),
            pageInfo: document.getElementById('libraryPageInfo'),
            saveToLibraryBtn: document.getElementById('saveToLibraryBtn'),
            saveGameBtn: document.getElementById('saveGameBtn'),
            // Tabs
            tabPositions: document.getElementById('libraryTabPositions'),
            tabGames: document.getElementById('libraryTabGames'),
            positionsPanel: document.getElementById('libraryPositionsPanel'),
            gamesPanel: document.getElementById('libraryGamesPanel'),
            // Collection detail
            collectionDetail: document.getElementById('libraryCollectionDetail'),
            backBtn: document.getElementById('libraryBackBtn'),
            collectionDetailTitle: document.getElementById('libraryCollectionDetailTitle'),
            collectionDetailCount: document.getElementById('libraryCollectionDetailCount'),
            // Cloud sync
            syncIndicator: document.getElementById('librarySyncIndicator'),
            syncNowBtn: document.getElementById('librarySyncNow')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Panel toggle
        this.elements.toggleBtn?.addEventListener('click', () => this.toggle());
        this.elements.closeBtn?.addEventListener('click', () => this.close());

        // Tab switching
        this.elements.tabPositions?.addEventListener('click', () => this.switchTab('positions'));
        this.elements.tabGames?.addEventListener('click', () => this.switchTab('games'));

        // Back button (from collection detail)
        this.elements.backBtn?.addEventListener('click', () => this.exitCollectionView());

        // Search
        this.elements.searchInput?.addEventListener('input', this._debounce(() => {
            this.currentFilter.search = this.elements.searchInput.value;
            this.currentPage = 0;
            this.renderPositionList();
        }, 300));

        // Export button (JSON backup)
        this.elements.exportJsonBtn?.addEventListener('click', () => this.handleExportJSON());

        // Import
        this.elements.importBtn?.addEventListener('click', () => {
            this.elements.importInput?.click();
        });
        this.elements.importInput?.addEventListener('change', (e) => this.handleImport(e));

        // Pagination
        this.elements.prevPageBtn?.addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.renderPositionList();
            }
        });
        this.elements.nextPageBtn?.addEventListener('click', () => {
            this.currentPage++;
            this.renderPositionList();
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Menu button (if added to menu modal)
        document.getElementById('menuLibrary')?.addEventListener('click', () => {
            this.closeMenuModal();
            this.open();
        });

        // Save to Library button (in analysis panel)
        this.elements.saveToLibraryBtn?.addEventListener('click', () => {
            this.saveCurrentPosition();
        });

        // Save Game button (in analysis panel)
        this.elements.saveGameBtn?.addEventListener('click', () => {
            this.saveCurrentGame();
        });

        // Cloud sync button
        this.elements.syncNowBtn?.addEventListener('click', async () => {
            await this.handleSyncNow();
        });
    },

    /**
     * Toggle panel open/closed
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    /**
     * Open the library panel
     */
    async open() {
        this.isOpen = true;
        this.elements.panel?.classList.add('open');
        this.elements.toggleBtn?.classList.add('active');

        // Reset to collection view if viewing one
        if (this.viewingCollectionId) {
            await this.exitCollectionView();
        } else {
            // Load data for current tab
            await this.switchTab(this.currentTab);
        }
        await this.updateStats();
        this.renderSyncIndicator();

        // Update sync indicator every 10 seconds while panel is open
        if (!this._syncIndicatorInterval) {
            this._syncIndicatorInterval = setInterval(() => {
                if (this.isOpen) {
                    this.renderSyncIndicator();
                }
            }, 10000);
        }
    },

    /**
     * Close the library panel
     */
    close() {
        this.isOpen = false;
        this.elements.panel?.classList.remove('open');
        this.elements.toggleBtn?.classList.remove('active');

        // Clear sync indicator interval
        if (this._syncIndicatorInterval) {
            clearInterval(this._syncIndicatorInterval);
            this._syncIndicatorInterval = null;
        }
    },

    /**
     * Close menu modal if open
     */
    closeMenuModal() {
        const menuModal = document.getElementById('menuModal');
        if (menuModal) {
            menuModal.classList.remove('active');
            menuModal.style.display = 'none';
        }
    },

    /**
     * Switch between tabs
     * @param {string} tab - 'positions' or 'games'
     */
    async switchTab(tab) {
        this.currentTab = tab;
        this.currentPage = 0;
        this.viewingCollectionId = null;

        // Update tab UI
        this.elements.tabPositions?.classList.toggle('active', tab === 'positions');
        this.elements.tabGames?.classList.toggle('active', tab === 'games');
        this.elements.tabPositions?.setAttribute('aria-selected', String(tab === 'positions'));
        this.elements.tabGames?.setAttribute('aria-selected', String(tab === 'games'));
        if (this.elements.tabPositions) this.elements.tabPositions.tabIndex = tab === 'positions' ? 0 : -1;
        if (this.elements.tabGames) this.elements.tabGames.tabIndex = tab === 'games' ? 0 : -1;
        this._setVisible(this.elements.positionsPanel, tab === 'positions');
        this._setVisible(this.elements.gamesPanel, tab === 'games');

        // Show/hide appropriate sections
        if (tab === 'positions') {
            this.elements.searchSection.style.display = 'block';
            this.elements.positionList.style.display = 'block';
            this.elements.collectionList.style.display = 'none';
            this.elements.collectionDetail.style.display = 'none';
            this._setVisible(this.elements.emptyGames, false);
            await this.renderPositionList();
            await this.renderTagFilter();
        } else {
            this.elements.searchSection.style.display = 'none';
            this.elements.positionList.style.display = 'none';
            this.elements.collectionList.style.display = 'block';
            this.elements.collectionDetail.style.display = 'none';
            this._setVisible(this.elements.emptyState, false);
            this.elements.pagination.style.display = 'none';
            await this.renderCollectionList();
        }
    },

    /**
     * Enter collection detail view (show positions in a collection)
     * @param {string} collectionId - Collection ID
     */
    async enterCollectionView(collectionId) {
        this.viewingCollectionId = collectionId;
        this.currentPage = 0;

        const collection = await CaissaLibrary.getCollection(collectionId);
        if (!collection) return;

        // Show detail header
        this.elements.collectionDetail.style.display = 'flex';
        this.elements.collectionDetailTitle.textContent = collection.name;

        // Hide tabs and collection list, show position list
        this.elements.collectionList.style.display = 'none';
        this.elements.searchSection.style.display = 'none';
        this.elements.positionList.style.display = 'block';
        this._setVisible(this.elements.emptyGames, false);

        // Render positions in this collection
        await this.renderCollectionPositions(collectionId);
    },

    /**
     * Exit collection detail view
     */
    async exitCollectionView() {
        this.viewingCollectionId = null;
        this.elements.collectionDetail.style.display = 'none';

        // Return to games tab
        await this.switchTab('games');
    },

    /**
     * Render collection list (games tab)
     */
    async renderCollectionList() {
        const listEl = this.elements.collectionList;
        const emptyEl = this.elements.emptyGames;
        if (!listEl) return;

        try {
            const collections = await CaissaLibrary.listCollections({ type: 'game' });

            if (collections.length === 0) {
                listEl.style.display = 'none';
                this._setVisible(emptyEl, true);
                return;
            }

            listEl.style.display = 'block';
            this._setVisible(emptyEl, false);

            listEl.innerHTML = collections.map(col => this._renderCollectionItem(col)).join('');
            this._bindCollectionItemEvents();

        } catch (error) {
            console.error('LibraryUI: Failed to render collections', error);
            listEl.innerHTML = '<div class="library-error">Failed to load games</div>';
        }
    },

    /**
     * Render a single collection item
     */
    _renderCollectionItem(col) {
        const dateDisplay = this._formatDate(col.createdAt);
        const meta = col.gameMetadata || {};
        const resultDisplay = meta.result && meta.result !== '*' ? ` (${meta.result})` : '';
        const isActive = CaissaLibrary.getActiveGameCollectionId() === col.id;
        const activeClass = isActive ? ' active-game' : '';

        return `
            <div class="library-collection-item${activeClass}" data-id="${col.id}">
                <div class="library-collection-header">
                    <span class="library-collection-name">${this._escapeHtml(col.name)}</span>
                    ${isActive ? '<span class="library-active-badge" title="Active game - new positions link here"><i class="fas fa-link"></i> Active</span>' : ''}
                    <span class="library-collection-type game">
                        <i class="fas fa-chess"></i>
                    </span>
                </div>
                <div class="library-collection-meta">
                    <span>${dateDisplay}${resultDisplay}</span>
                    <span>${col.positionCount || 0} positions</span>
                </div>
                <div class="library-collection-actions">
                    <button class="btn btn-small" data-action="view" title="View positions">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isActive
                        ? `<button class="btn btn-small btn-warning" data-action="clear-active" title="Clear active game">
                               <i class="fas fa-unlink"></i>
                           </button>`
                        : `<button class="btn btn-small" data-action="set-active" title="Set as active game">
                               <i class="fas fa-play"></i>
                           </button>`
                    }
                    <button class="btn btn-small btn-danger" data-action="delete" title="Delete game">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Bind events to collection items
     */
    _bindCollectionItemEvents() {
        const items = this.elements.collectionList?.querySelectorAll('.library-collection-item');
        if (!items) return;

        items.forEach(item => {
            const id = item.dataset.id;

            // View positions
            item.querySelector('[data-action="view"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.enterCollectionView(id);
            });

            // Set as active
            item.querySelector('[data-action="set-active"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setActiveGame(id);
            });

            // Clear active
            item.querySelector('[data-action="clear-active"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearActiveGame();
            });

            // Delete
            item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCollection(id);
            });

            // Click on item to view
            item.addEventListener('click', () => {
                this.enterCollectionView(id);
            });
        });
    },

    /**
     * Render positions within a collection
     */
    async renderCollectionPositions(collectionId) {
        const listEl = this.elements.positionList;
        if (!listEl) return;

        try {
            const positions = await CaissaLibrary.getCollectionPositions(collectionId);

            // Update count display
            this.elements.collectionDetailCount.textContent = `${positions.length} positions`;

            if (positions.length === 0) {
                listEl.innerHTML = '<div class="library-empty-state"><p>No positions saved in this game yet.</p></div>';
                this.elements.pagination.style.display = 'none';
                return;
            }

            // Use collection-specific rendering with move labels
            listEl.innerHTML = positions.map(pos => this._renderCollectionPositionItem(pos)).join('');
            this._bindPositionItemEvents();
            this.elements.pagination.style.display = 'none'; // No pagination for collection view

        } catch (error) {
            console.error('LibraryUI: Failed to render collection positions', error);
            listEl.innerHTML = '<div class="library-error">Failed to load positions</div>';
        }
    },

    /**
     * Render a position item within a collection (with move label)
     */
    _renderCollectionPositionItem(pos) {
        const evalDisplay = this._formatEval(pos.engineReport);
        const moveLabel = this._formatMoveLabel(pos);

        return `
            <div class="library-position-item library-collection-position" data-id="${pos.id}">
                <div class="library-position-header">
                    ${moveLabel ? `<span class="library-move-label">${moveLabel}</span>` : ''}
                    <span class="library-position-title">${this._escapeHtml(pos.title || 'Untitled')}</span>
                    <button class="library-position-favorite ${pos.isFavorite ? 'active' : ''}"
                            data-action="favorite" title="Toggle favorite">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="library-position-meta">
                    ${pos.lastMoveSAN ? `<span class="library-last-move">${this._escapeHtml(pos.lastMoveSAN)}</span>` : ''}
                    ${evalDisplay ? `<span class="library-position-eval">${evalDisplay}</span>` : ''}
                    ${pos.engineReport ? '<span class="library-position-badge"><i class="fas fa-microchip"></i></span>' : ''}
                </div>
                <div class="library-position-actions">
                    <button class="btn btn-small" data-action="load" title="Load position">
                        <i class="fas fa-chess-board"></i>
                    </button>
                    <button class="btn btn-small" data-action="copy-fen" title="Copy FEN to clipboard">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-small" data-action="share-link" title="Copy shareable CAISSA link">
                        <i class="fas fa-link"></i>
                    </button>
                    <button class="btn btn-small" data-action="forge" title="Open in Forge">
                        <i class="fas fa-hammer"></i>
                    </button>
                    <button class="btn btn-small" data-action="find-similar" title="Find Similar (coming soon)" disabled>
                        <i class="fas fa-search"></i>
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Format a move label from position data (e.g. "12... (Black)" or "5. (White)")
     */
    _formatMoveLabel(pos) {
        if (pos.moveNumber === undefined || pos.moveNumber === null) return null;

        const moveNum = pos.moveNumber;
        const isBlack = pos.turn === 'b';
        const colorLabel = isBlack ? 'Black' : 'White';
        const dots = isBlack ? '...' : '.';

        return `${moveNum}${dots} (${colorLabel})`;
    },

    /**
     * Set a game collection as active
     */
    async setActiveGame(collectionId) {
        CaissaLibrary.setActiveGameCollection(collectionId);

        // Update Save Game button indicator
        this.updateSaveGameButton();

        const collection = await CaissaLibrary.getCollection(collectionId);
        this.showNotification(`Active game: ${collection?.name || 'Unknown'}`);

        // Refresh collection list to show active indicator
        if (this.isOpen && this.currentTab === 'games' && !this.viewingCollectionId) {
            await this.renderCollectionList();
        }
    },

    /**
     * Clear the active game collection
     */
    clearActiveGame() {
        CaissaLibrary.setActiveGameCollection(null);
        this.updateSaveGameButton();
        this.showNotification('Active game cleared');

        // Refresh collection list to remove active indicator
        if (this.isOpen && this.currentTab === 'games' && !this.viewingCollectionId) {
            this.renderCollectionList();
        }
    },

    /**
     * Update Save Game button state
     * - Shows active game indicator when a game collection is active
     * - Enables/disables based on whether a game is loaded
     */
    updateSaveGameButton() {
        const btn = this.elements.saveGameBtn;
        if (!btn) return;

        const activeId = CaissaLibrary.getActiveGameCollectionId();
        btn.classList.toggle('has-active-game', !!activeId);

        // Check if a game is loaded (has PGN context)
        const hasGameContext = typeof App !== 'undefined' && App.loadedGameInfo !== null;

        // Enable only if a game is loaded
        btn.disabled = !hasGameContext;
        btn.title = hasGameContext
            ? 'Save current game as collection'
            : 'Load a PGN game first to save it';
    },

    /**
     * Called when a game is loaded or cleared
     * @param {Object|null} gameInfo - Game metadata or null if cleared
     */
    onGameLoaded(gameInfo) {
        this.updateSaveGameButton();
    },

    /**
     * Delete a collection
     */
    async deleteCollection(id) {
        if (!confirm('Delete this game? Positions will be moved to Unsorted.')) {
            return;
        }

        try {
            await CaissaLibrary.deleteCollection(id);
            await this.renderCollectionList();
            this.showNotification('Game deleted');

            // Clear active if it was this one
            if (CaissaLibrary.getActiveGameCollectionId() === id) {
                CaissaLibrary.setActiveGameCollection(null);
                this.updateSaveGameButton();
            }
        } catch (error) {
            console.error('LibraryUI: Failed to delete collection', error);
            this.showNotification('Failed to delete game', 'error');
        }
    },

    /**
     * Render the position list
     */
    async renderPositionList() {
        const listEl = this.elements.positionList;
        const emptyEl = this.elements.emptyState;
        if (!listEl) return;

        try {
            const { positions, total } = await CaissaLibrary.listPositions({
                limit: this.pageSize,
                offset: this.currentPage * this.pageSize,
                sort: 'dateAdded',
                sortOrder: 'desc',
                filter: this.currentFilter
            });

            // Show/hide empty state
            if (total === 0) {
                listEl.style.display = 'none';
                this._setVisible(emptyEl, true);
                this.elements.pagination.style.display = 'none';
                return;
            }

            listEl.style.display = 'block';
            this._setVisible(emptyEl, false);

            // Render positions
            listEl.innerHTML = positions.map(pos => this._renderPositionItem(pos)).join('');

            // Bind item events
            this._bindPositionItemEvents();

            // Update pagination
            this._updatePagination(total);

        } catch (error) {
            console.error('LibraryUI: Failed to render positions', error);
            listEl.innerHTML = '<div class="library-error">Failed to load positions</div>';
        }
    },

    /**
     * Render a single position item
     */
    _renderPositionItem(pos) {
        const evalDisplay = this._formatEval(pos.engineReport);
        const dateDisplay = this._formatDate(pos.dateAdded);
        const tagsHtml = (pos.tags || []).slice(0, 3).map(t =>
            `<span class="library-tag-chip">${this._escapeHtml(t)}</span>`
        ).join('');

        return `
            <div class="library-position-item" data-id="${pos.id}">
                <div class="library-position-header">
                    <span class="library-position-title">${this._escapeHtml(pos.title || 'Untitled')}</span>
                    <button class="library-position-favorite ${pos.isFavorite ? 'active' : ''}"
                            data-action="favorite" title="Toggle favorite">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="library-position-meta">
                    <span class="library-position-date">${dateDisplay}</span>
                    ${evalDisplay ? `<span class="library-position-eval">${evalDisplay}</span>` : ''}
                    ${pos.engineReport ? '<span class="library-position-badge"><i class="fas fa-microchip"></i></span>' : ''}
                </div>
                ${tagsHtml ? `<div class="library-position-tags">${tagsHtml}</div>` : ''}
                <div class="library-position-actions">
                    <button class="btn btn-small" data-action="load" title="Load position">
                        <i class="fas fa-chess-board"></i>
                    </button>
                    <button class="btn btn-small" data-action="copy-fen" title="Copy FEN to clipboard">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-small" data-action="share-link" title="Copy shareable CAISSA link">
                        <i class="fas fa-link"></i>
                    </button>
                    <button class="btn btn-small" data-action="forge" title="Open in Forge">
                        <i class="fas fa-hammer"></i>
                    </button>
                    <button class="btn btn-small" data-action="find-similar" title="Find Similar (coming soon)" disabled>
                        <i class="fas fa-search"></i>
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Bind events to position items
     */
    _bindPositionItemEvents() {
        const items = this.elements.positionList?.querySelectorAll('.library-position-item');
        if (!items) return;

        items.forEach(item => {
            const id = item.dataset.id;

            // Load position
            item.querySelector('[data-action="load"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadPosition(id);
            });

            // Copy FEN
            item.querySelector('[data-action="copy-fen"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyFEN(id);
            });

            // Share link (Open in CAISSA)
            item.querySelector('[data-action="share-link"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyShareLink(id);
            });

            // Open in Forge
            item.querySelector('[data-action="forge"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pos = await CaissaLibrary.getPosition(id);
                if (pos && pos.fen && window.PositionForgeUI) {
                    window.PositionForgeUI.open(pos.fen);
                }
            });

            // Delete
            item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePosition(id);
            });

            // Toggle favorite
            item.querySelector('[data-action="favorite"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(id);
            });

            // Click on item to load
            item.addEventListener('click', () => {
                this.loadPosition(id);
            });
        });
    },

    /**
     * Update pagination controls
     */
    _updatePagination(total) {
        const totalPages = Math.ceil(total / this.pageSize);

        if (this.elements.pagination) {
            this.elements.pagination.style.display = totalPages > 1 ? 'flex' : 'none';
        }

        if (this.elements.prevPageBtn) {
            this.elements.prevPageBtn.disabled = this.currentPage === 0;
        }

        if (this.elements.nextPageBtn) {
            this.elements.nextPageBtn.disabled = this.currentPage >= totalPages - 1;
        }

        if (this.elements.pageInfo) {
            this.elements.pageInfo.textContent = `Page ${this.currentPage + 1} of ${totalPages}`;
        }
    },

    /**
     * Render tag filter chips
     */
    async renderTagFilter() {
        const containerEl = this.elements.tagFilter;
        if (!containerEl) return;

        try {
            const tags = await CaissaLibrary.listTags();

            if (tags.length === 0) {
                containerEl.innerHTML = '<span class="library-no-tags">No tags yet</span>';
                return;
            }

            containerEl.innerHTML = tags.slice(0, 10).map(tag => {
                const isActive = this.currentFilter.tags.includes(tag.name);
                return `
                    <button class="library-filter-tag ${isActive ? 'active' : ''}"
                            data-tag="${this._escapeHtml(tag.name)}">
                        ${this._escapeHtml(tag.name)} (${tag.count})
                    </button>
                `;
            }).join('');

            // Bind tag filter events
            containerEl.querySelectorAll('.library-filter-tag').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tagName = btn.dataset.tag;
                    this._toggleTagFilter(tagName);
                    btn.classList.toggle('active');
                });
            });

        } catch (error) {
            console.error('LibraryUI: Failed to render tags', error);
        }
    },

    /**
     * Toggle a tag in the filter
     */
    _toggleTagFilter(tagName) {
        const idx = this.currentFilter.tags.indexOf(tagName);
        if (idx >= 0) {
            this.currentFilter.tags.splice(idx, 1);
        } else {
            this.currentFilter.tags.push(tagName);
        }
        this.currentPage = 0;
        this.renderPositionList();
    },

    /**
     * Update stats display
     */
    async updateStats() {
        const statsEl = this.elements.statsDisplay;
        if (!statsEl) return;

        try {
            const stats = await CaissaLibrary.getStats();
            statsEl.textContent = `${stats.positions} positions`;
        } catch (error) {
            statsEl.textContent = '';
        }
    },

    // ========================================
    // ACTIONS
    // ========================================

    /**
     * Load a position into the board
     */
    async loadPosition(id) {
        try {
            const position = await CaissaLibrary.getPosition(id);
            if (!position) {
                this.showNotification('Position not found', 'error');
                return;
            }

            // Load into App (assuming App.loadFEN exists)
            if (typeof App !== 'undefined' && App.loadFEN) {
                App.loadFEN(position.fen);
                this.showNotification('Position loaded');
                this.close();
            } else if (typeof App !== 'undefined' && App.game) {
                // Fallback: load directly into chess.js
                App.game.load(position.fen);
                if (App.board) {
                    App.board.position(position.fen);
                }
                this.showNotification('Position loaded');
                this.close();
            }
        } catch (error) {
            console.error('LibraryUI: Failed to load position', error);
            this.showNotification('Failed to load position', 'error');
        }
    },

    /**
     * Copy FEN to clipboard
     */
    async copyFEN(id) {
        try {
            const fen = await CaissaLibrary.exportAsFEN(id);
            await navigator.clipboard.writeText(fen);
            this.showNotification('FEN copied to clipboard');
        } catch (error) {
            console.error('LibraryUI: Failed to copy FEN', error);
            this.showNotification('Failed to copy FEN', 'error');
        }
    },

    /**
     * Copy shareable CAISSA link to clipboard
     * Generates a URL with ?fen= parameter that opens the position in CAISSA
     */
    async copyShareLink(id) {
        try {
            const fen = await CaissaLibrary.exportAsFEN(id);
            const encodedFen = encodeURIComponent(fen);
            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}?fen=${encodedFen}`;

            await navigator.clipboard.writeText(shareUrl);
            this.showNotification('CAISSA link copied to clipboard');
        } catch (error) {
            console.error('LibraryUI: Failed to copy share link', error);
            this.showNotification('Failed to copy link', 'error');
        }
    },

    /**
     * Delete a position
     */
    async deletePosition(id) {
        if (!confirm('Delete this position from your library?')) {
            return;
        }

        try {
            await CaissaLibrary.deletePosition(id);
            await this.renderPositionList();
            await this.updateStats();
            this.showNotification('Position deleted');
        } catch (error) {
            console.error('LibraryUI: Failed to delete position', error);
            this.showNotification('Failed to delete position', 'error');
        }
    },

    /**
     * Toggle favorite
     */
    async toggleFavorite(id) {
        try {
            const newStatus = await CaissaLibrary.toggleFavorite(id);
            await this.renderPositionList();
            this.showNotification(newStatus ? 'Added to favorites' : 'Removed from favorites');
        } catch (error) {
            console.error('LibraryUI: Failed to toggle favorite', error);
        }
    },

    /**
     * Save current position to library
     * Called from analysis view
     */
    async saveCurrentPosition() {
        if (typeof App === 'undefined' || !App.game) {
            this.showNotification('No position to save', 'error');
            return;
        }

        const fen = App.game.fen();

        // Build engine report if available
        let engineReport = null;
        if (typeof MentorAI !== 'undefined') {
            engineReport = MentorAI.buildEngineReport();
        } else if (App.currentEvaluation) {
            engineReport = {
                evalCp: Math.round((App.currentEvaluation.score || 0) * 100),
                depth: App.currentEvaluation.depth || 0,
                mateIn: App.currentEvaluation.mate || null
            };
        }

        // Check for active game collection
        const activeGameId = CaissaLibrary.getActiveGameCollectionId();

        try {
            const positionData = {
                fen: fen,
                engineReport: engineReport,
                source: 'Analysis'
            };

            // Link to active game collection if one is set
            if (activeGameId) {
                positionData.collectionId = activeGameId;
            }

            // Capture move context if a game is loaded
            if (typeof App !== 'undefined' && App.loadedGameInfo) {
                const moveContext = this._getMoveContext();
                if (moveContext) {
                    positionData.plyIndex = moveContext.plyIndex;
                    positionData.moveNumber = moveContext.moveNumber;
                    positionData.turn = moveContext.turn;
                    positionData.lastMoveSAN = moveContext.lastMoveSAN;
                }
            }

            const position = await CaissaLibrary.savePosition(positionData);

            const gameName = activeGameId ? ' (linked to game)' : '';
            this.showNotification(`Position saved: ${position.title}${gameName}`);

            // Refresh if panel is open
            if (this.isOpen) {
                if (this.viewingCollectionId) {
                    await this.renderCollectionPositions(this.viewingCollectionId);
                } else if (this.currentTab === 'positions') {
                    await this.renderPositionList();
                }
                await this.updateStats();
            }
        } catch (error) {
            console.error('LibraryUI: Failed to save position', error);
            this.showNotification(error.message || 'Failed to save position', 'error');
        }
    },

    /**
     * Save current game as a collection
     * Extracts PGN headers to create game metadata
     */
    async saveCurrentGame() {
        if (typeof App === 'undefined' || !App.game) {
            this.showNotification('No game to save', 'error');
            return;
        }

        try {
            // Try to get PGN headers from App
            const headers = this._extractGameHeaders();

            // Create game collection
            const collection = await CaissaLibrary.createGameCollection(headers);

            // Set as active game
            CaissaLibrary.setActiveGameCollection(collection.id);
            this.updateSaveGameButton();

            this.showNotification(`Game saved: ${collection.name}`);

            // Refresh if panel is open on games tab
            if (this.isOpen && this.currentTab === 'games') {
                await this.renderCollectionList();
            }
        } catch (error) {
            console.error('LibraryUI: Failed to save game', error);
            this.showNotification('Failed to save game', 'error');
        }
    },

    /**
     * Get move context from the current game state
     * @returns {Object|null} - { plyIndex, moveNumber, turn, lastMoveSAN } or null
     */
    _getMoveContext() {
        if (typeof App === 'undefined') return null;

        // currentMoveIndex is 0-based ply index (-1 means at start position)
        const plyIndex = App.currentMoveIndex;
        if (plyIndex < 0) return null;

        const moveNumber = Math.floor(plyIndex / 2) + 1;
        const turn = plyIndex % 2 === 0 ? 'w' : 'b'; // 0=white's 1st, 1=black's 1st, etc.

        // Get the SAN of the move that led to this position
        let lastMoveSAN = null;
        if (App.moveHistory && App.moveHistory[plyIndex]) {
            lastMoveSAN = App.moveHistory[plyIndex].san || App.moveHistory[plyIndex];
        }

        return { plyIndex, moveNumber, turn, lastMoveSAN };
    },

    /**
     * Extract game headers from current game context
     */
    _extractGameHeaders() {
        const headers = {};
        const today = new Date().toISOString().split('T')[0];

        // Try to get from App.pgnHeaders if available
        if (typeof App !== 'undefined' && App.pgnHeaders) {
            Object.assign(headers, App.pgnHeaders);
        }

        // Try to get from loaded PGN game info
        if (typeof App !== 'undefined' && App.loadedGame) {
            headers.white = App.loadedGame.white || headers.white;
            headers.black = App.loadedGame.black || headers.black;
            headers.date = App.loadedGame.date || headers.date;
            headers.result = App.loadedGame.result || headers.result;
            headers.event = App.loadedGame.event || headers.event;
        }

        // Defaults
        headers.white = headers.white || headers.White || 'White';
        headers.black = headers.black || headers.Black || 'Black';
        headers.date = headers.date || headers.Date || today;

        return headers;
    },

    /**
     * Export selected/all positions as JSON
     */
    async handleExportJSON() {
        try {
            const ids = this.selectedPositions.size > 0
                ? Array.from(this.selectedPositions)
                : [];

            const json = await CaissaLibrary.exportAsJSON(ids);
            this._downloadFile(json, 'caissa-library-backup.json', 'application/json');
            this.showNotification('Library exported');
        } catch (error) {
            console.error('LibraryUI: Export failed', error);
            this.showNotification('Export failed', 'error');
        }
    },

    /**
     * Export selected positions as FEN list
     */
    async handleExportFEN() {
        try {
            const ids = this.selectedPositions.size > 0
                ? Array.from(this.selectedPositions)
                : [];

            if (ids.length === 0) {
                // Export all
                const { positions } = await CaissaLibrary.listPositions({ limit: 10000 });
                const fens = positions.map(p => p.fen).join('\n');
                this._downloadFile(fens, 'caissa-positions.fen', 'text/plain');
            } else {
                const fens = await CaissaLibrary.exportAsFENList(ids);
                this._downloadFile(fens, 'caissa-positions.fen', 'text/plain');
            }

            this.showNotification('FEN list exported');
        } catch (error) {
            console.error('LibraryUI: FEN export failed', error);
            this.showNotification('Export failed', 'error');
        }
    },

    /**
     * Handle file import
     */
    async handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();
            const result = await CaissaLibrary.importFromJSON(content);

            this.showNotification(`Imported ${result.imported} positions (${result.skipped} skipped)`);

            await this.renderPositionList();
            await this.renderTagFilter();
            await this.updateStats();
        } catch (error) {
            console.error('LibraryUI: Import failed', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }

        // Clear input
        event.target.value = '';
    },

    /**
     * Render sync indicator status
     */
    renderSyncIndicator() {
        const indicatorEl = this.elements.syncIndicator;
        const btnEl = this.elements.syncNowBtn;

        if (!indicatorEl || !window.CaissaSync) return;

        // Check if user is authenticated
        const isAuth = window.CaissaAuth?.isAuthenticated();
        const isEnabled = window.CaissaSync.isEnabled();
        const status = window.CaissaSync.getStatus();
        const lastSyncText = window.CaissaSync.getLastSyncText();

        // Hide if not authenticated
        if (!isAuth) {
            indicatorEl.style.display = 'none';
            if (btnEl) btnEl.style.display = 'none';
            return;
        }

        indicatorEl.style.display = 'flex';
        if (btnEl) btnEl.style.display = 'block';

        // Update status icon and text
        let icon, text, statusClass;

        if (!isEnabled) {
            icon = 'cloud-slash';
            text = 'Sync disabled';
            statusClass = 'disabled';
        } else if (status === 'syncing') {
            icon = 'sync fa-spin';
            text = 'Syncing...';
            statusClass = 'syncing';
        } else if (status === 'error') {
            icon = 'exclamation-triangle';
            text = 'Sync error';
            statusClass = 'error';
        } else {
            icon = 'cloud-check';
            text = `Last sync: ${lastSyncText}`;
            statusClass = 'idle';
        }

        indicatorEl.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${text}</span>
        `;

        // Update status class
        indicatorEl.className = 'library-sync-indicator';
        indicatorEl.classList.add(`sync-${statusClass}`);

        // Disable sync button if syncing
        if (btnEl) {
            btnEl.disabled = status === 'syncing';
        }
    },

    /**
     * Handle sync now button click
     */
    async handleSyncNow() {
        if (!window.CaissaSync) {
            this.showNotification('Sync not available', 'error');
            return;
        }

        if (!window.CaissaAuth?.isAuthenticated()) {
            this.showNotification('Sign in to sync your library', 'error');
            return;
        }

        // Update indicator to syncing state
        this.renderSyncIndicator();

        try {
            const result = await window.CaissaSync.syncNow();

            if (result.success) {
                const { pushed, pulled } = result;
                const msg = pushed > 0 || pulled > 0
                    ? `Synced: ${pushed} sent, ${pulled} received`
                    : 'Library is up to date';
                this.showNotification(msg);

                // Refresh lists if changes were pulled
                if (pulled > 0 && this.isOpen) {
                    if (this.currentTab === 'positions') {
                        await this.renderPositionList();
                    } else if (this.currentTab === 'games') {
                        await this.renderCollectionList();
                    }
                    await this.updateStats();
                }
            } else {
                this.showNotification(result.error || 'Sync failed', 'error');
            }
        } catch (error) {
            console.error('LibraryUI: Sync failed', error);
            this.showNotification('Sync failed', 'error');
        }

        // Update indicator
        this.renderSyncIndicator();
    },

    // ========================================
    // UTILITIES
    // ========================================

    /**
     * Format evaluation for display
     */
    _formatEval(engineReport) {
        if (!engineReport) return null;

        if (engineReport.mateIn !== null && engineReport.mateIn !== undefined) {
            const sign = engineReport.mateIn > 0 ? '+' : '';
            return `M${sign}${engineReport.mateIn}`;
        }

        if (engineReport.evalCp !== null && engineReport.evalCp !== undefined) {
            const pawns = engineReport.evalCp / 100;
            const sign = pawns >= 0 ? '+' : '';
            return `${sign}${pawns.toFixed(2)}`;
        }

        if (engineReport.evalPawns) {
            const val = parseFloat(engineReport.evalPawns);
            const sign = val >= 0 ? '+' : '';
            return `${sign}${val.toFixed(2)}`;
        }

        return null;
    },

    /**
     * Format date for display
     */
    _formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Escape HTML to prevent XSS
     */
    _escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Debounce function
     */
    _debounce(fn, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /** Keep `hidden` and legacy inline display state aligned across both hosts. */
    _setVisible(element, visible, display = 'block') {
        if (!element) return;
        element.hidden = !visible;
        element.style.display = visible ? display : 'none';
    },

    /**
     * Download a file
     */
    _downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Show notification (uses app's notification if available)
     */
    showNotification(message, type = 'success') {
        if (typeof showNotification === 'function') {
            showNotification(message);
        } else {
            console.log(`LibraryUI [${type}]:`, message);
        }
    }
};

// Initialize when DOM is ready
window.LibraryUI = LibraryUI;
document.addEventListener('DOMContentLoaded', () => {
    window.CaissaLibraryUIReady = LibraryUI.init().then(() => {
        window.dispatchEvent(new CustomEvent('caissa:library-ui-ready'));
        return LibraryUI;
    });
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LibraryUI;
}
