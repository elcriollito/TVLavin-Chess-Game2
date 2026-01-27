/**
 * CAISSA Library - Core API Module
 *
 * Provides high-level operations for managing chess positions.
 * Features:
 * - Position CRUD with deduplication
 * - Tag management
 * - Search and filtering
 * - Export to JSON/FEN
 */

const CaissaLibrary = {

    // Soft limits (warn but don't hard fail)
    LIMITS: {
        MAX_POSITIONS: 10000,
        MAX_TAGS: 500,
        MAX_COLLECTIONS: 100,
        POSITION_SIZE_KB: 50
    },

    // Initialization state
    _initialized: false,

    /**
     * Initialize the library
     * @returns {Promise<void>}
     */
    async init() {
        if (this._initialized) return;

        try {
            await LibraryDB.init();
            await this._ensureDefaultCollection();
            this._initialized = true;
            console.log('CaissaLibrary: Initialized');
        } catch (error) {
            console.error('CaissaLibrary: Initialization failed', error);
            throw error;
        }
    },

    /**
     * Ensure default collection exists
     */
    async _ensureDefaultCollection() {
        const collections = await LibraryDB.getAll(LibraryDB.STORES.COLLECTIONS);
        const hasDefault = collections.some(c => c.isDefault);

        if (!hasDefault) {
            await LibraryDB.put(LibraryDB.STORES.COLLECTIONS, {
                id: this._generateId(),
                name: 'Unsorted',
                description: 'Default collection for new positions',
                positions: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDefault: true
            });
        }
    },

    // ========================================
    // POSITION OPERATIONS
    // ========================================

    /**
     * Save a position to the library
     * @param {Object} entry - Position entry data
     * @returns {Promise<Object>} - Saved position with ID
     */
    async savePosition(entry) {
        await this.init();

        // Validate FEN
        if (!entry.fen || !this.validateFEN(entry.fen)) {
            throw new Error('Invalid FEN string');
        }

        // Normalize FEN
        const normalizedFen = this.normalizeFEN(entry.fen);
        const fenHash = await this.hashFEN(normalizedFen);

        // Check for duplicate
        const existing = await LibraryDB.findByFenHash(fenHash);
        if (existing) {
            console.log('CaissaLibrary: Position already exists, updating', existing.id);
            // Update existing position
            const now = Date.now();
            const updated = {
                ...existing,
                ...entry,
                id: existing.id,
                fen: normalizedFen,
                fenHash: fenHash,
                dateModified: now,
                lastModified: now,
                syncStatus: 'pending'
            };
            await LibraryDB.put(LibraryDB.STORES.POSITIONS, updated);
            return updated;
        }

        // Check soft limit
        const count = await LibraryDB.count(LibraryDB.STORES.POSITIONS);
        if (count >= this.LIMITS.MAX_POSITIONS) {
            console.warn(`CaissaLibrary: Position limit (${this.LIMITS.MAX_POSITIONS}) reached`);
        }

        // Create new position
        const now = Date.now();
        const position = {
            id: this._generateId(),
            fen: normalizedFen,
            fenHash: fenHash,
            title: entry.title || this._generateTitle(normalizedFen),
            author: entry.author || null,
            source: entry.source || null,
            dateAdded: now,
            dateModified: now,
            lastModified: now,
            tags: entry.tags || [],
            themes: entry.themes || [],
            collectionId: entry.collectionId || await this._getDefaultCollectionId(),
            engineReport: entry.engineReport || null,
            analysisDepth: entry.engineReport?.depth || null,
            analysisDate: entry.engineReport ? now : null,
            annotations: entry.annotations || [],
            parentId: entry.parentId || null,
            children: [],
            isFavorite: entry.isFavorite || false,
            isArchived: false,
            syncStatus: 'pending'
        };

        await LibraryDB.put(LibraryDB.STORES.POSITIONS, position);
        console.log('CaissaLibrary: Position saved', position.id);

        return position;
    },

    /**
     * Get a position by ID
     * @param {string} id - Position ID
     * @returns {Promise<Object|undefined>}
     */
    async getPosition(id) {
        await this.init();
        return LibraryDB.get(LibraryDB.STORES.POSITIONS, id);
    },

    /**
     * List positions with pagination and filtering
     * @param {Object} options - { limit, offset, sort, filter }
     * @returns {Promise<{positions: Object[], total: number}>}
     */
    async listPositions(options = {}) {
        await this.init();

        const {
            limit = 50,
            offset = 0,
            sort = 'dateAdded',
            sortOrder = 'desc',
            filter = {}
        } = options;

        // Get all positions (we filter in memory for flexibility)
        let positions = await LibraryDB.getAll(LibraryDB.STORES.POSITIONS);

        // Apply filters
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            positions = positions.filter(p =>
                (p.title && p.title.toLowerCase().includes(searchLower)) ||
                (p.source && p.source.toLowerCase().includes(searchLower)) ||
                (p.author && p.author.toLowerCase().includes(searchLower))
            );
        }

        if (filter.tags && filter.tags.length > 0) {
            positions = positions.filter(p =>
                filter.tags.some(tag => p.tags.includes(tag))
            );
        }

        if (filter.collectionId) {
            positions = positions.filter(p => p.collectionId === filter.collectionId);
        }

        if (filter.isFavorite !== undefined) {
            positions = positions.filter(p => p.isFavorite === filter.isFavorite);
        }

        if (filter.hasEngineReport !== undefined) {
            positions = positions.filter(p =>
                filter.hasEngineReport ? !!p.engineReport : !p.engineReport
            );
        }

        // Sort
        const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
        positions.sort((a, b) => {
            const aVal = a[sort] || 0;
            const bVal = b[sort] || 0;
            if (aVal < bVal) return -1 * sortMultiplier;
            if (aVal > bVal) return 1 * sortMultiplier;
            return 0;
        });

        const total = positions.length;

        // Paginate
        positions = positions.slice(offset, offset + limit);

        return { positions, total };
    },

    /**
     * Delete a position
     * @param {string} id - Position ID
     * @returns {Promise<void>}
     */
    async deletePosition(id) {
        await this.init();

        // Track deletion for cloud sync
        const deletionRecord = {
            id: this._generateId(),
            itemId: id,
            itemType: 'position',
            syncStatus: 'pending',
            deletedAt: Date.now()
        };
        await LibraryDB.put(LibraryDB.STORES.DELETIONS, deletionRecord);

        // Delete the position
        await LibraryDB.delete(LibraryDB.STORES.POSITIONS, id);
        console.log('CaissaLibrary: Position deleted', id);
    },

    /**
     * Update a position
     * @param {string} id - Position ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>}
     */
    async updatePosition(id, updates) {
        await this.init();

        const existing = await this.getPosition(id);
        if (!existing) {
            throw new Error(`Position not found: ${id}`);
        }

        const now = Date.now();
        const updated = {
            ...existing,
            ...updates,
            id: existing.id, // Preserve ID
            dateModified: now,
            lastModified: now,
            syncStatus: 'pending'
        };

        // If FEN changed, update hash
        if (updates.fen && updates.fen !== existing.fen) {
            updated.fen = this.normalizeFEN(updates.fen);
            updated.fenHash = await this.hashFEN(updated.fen);
        }

        await LibraryDB.put(LibraryDB.STORES.POSITIONS, updated);
        return updated;
    },

    /**
     * Toggle favorite status
     * @param {string} id - Position ID
     * @returns {Promise<boolean>} - New favorite status
     */
    async toggleFavorite(id) {
        const position = await this.getPosition(id);
        if (!position) throw new Error(`Position not found: ${id}`);

        const newStatus = !position.isFavorite;
        await this.updatePosition(id, { isFavorite: newStatus });
        return newStatus;
    },

    // ========================================
    // TAG OPERATIONS
    // ========================================

    /**
     * Create or get a tag
     * @param {string} name - Tag name
     * @returns {Promise<Object>} - Tag object
     */
    async upsertTag(name) {
        await this.init();

        const slug = this._slugify(name);
        const existing = await LibraryDB.getByIndex(LibraryDB.STORES.TAGS, 'slug', slug);

        if (existing.length > 0) {
            return existing[0];
        }

        const tag = {
            id: this._generateId(),
            name: name.trim(),
            slug: slug,
            category: 'custom',
            color: null,
            count: 0,
            isSystem: false
        };

        await LibraryDB.put(LibraryDB.STORES.TAGS, tag);
        return tag;
    },

    /**
     * List all tags with counts
     * @returns {Promise<Object[]>}
     */
    async listTags() {
        await this.init();

        const tags = await LibraryDB.getAll(LibraryDB.STORES.TAGS);
        const positions = await LibraryDB.getAll(LibraryDB.STORES.POSITIONS);

        // Count tag usage
        const tagCounts = {};
        for (const pos of positions) {
            for (const tagName of (pos.tags || [])) {
                tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
            }
        }

        // Update counts
        for (const tag of tags) {
            tag.count = tagCounts[tag.name] || 0;
        }

        return tags.sort((a, b) => b.count - a.count);
    },

    /**
     * Delete a tag
     * @param {string} id - Tag ID
     * @returns {Promise<void>}
     */
    async deleteTag(id) {
        await this.init();
        await LibraryDB.delete(LibraryDB.STORES.TAGS, id);
    },

    // ========================================
    // COLLECTION OPERATIONS
    // ========================================

    /**
     * Get default collection ID
     * @returns {Promise<string>}
     */
    async _getDefaultCollectionId() {
        const collections = await LibraryDB.getAll(LibraryDB.STORES.COLLECTIONS);
        const defaultCol = collections.find(c => c.isDefault);
        return defaultCol ? defaultCol.id : null;
    },

    /**
     * List all collections
     * @param {Object} options - { type: 'all' | 'game' | 'manual' }
     * @returns {Promise<Object[]>}
     */
    async listCollections(options = {}) {
        await this.init();
        let collections = await LibraryDB.getAll(LibraryDB.STORES.COLLECTIONS);

        // Filter by type
        if (options.type === 'game') {
            collections = collections.filter(c => c.type === 'game');
        } else if (options.type === 'manual') {
            collections = collections.filter(c => c.type !== 'game');
        }

        // Sort by date descending (newest first)
        collections.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Count positions in each collection
        const positions = await LibraryDB.getAll(LibraryDB.STORES.POSITIONS);
        for (const col of collections) {
            col.positionCount = positions.filter(p => p.collectionId === col.id).length;
        }

        return collections;
    },

    /**
     * Get a collection by ID
     * @param {string} id - Collection ID
     * @returns {Promise<Object|undefined>}
     */
    async getCollection(id) {
        await this.init();
        return LibraryDB.get(LibraryDB.STORES.COLLECTIONS, id);
    },

    /**
     * Create a new collection
     * @param {Object} data - Collection data
     * @returns {Promise<Object>} - Created collection
     */
    async createCollection(data) {
        await this.init();

        // Check limit
        const count = await LibraryDB.count(LibraryDB.STORES.COLLECTIONS);
        if (count >= this.LIMITS.MAX_COLLECTIONS) {
            console.warn(`CaissaLibrary: Collection limit (${this.LIMITS.MAX_COLLECTIONS}) reached`);
        }

        const now = Date.now();
        const collection = {
            id: this._generateId(),
            name: data.name || 'Untitled Collection',
            description: data.description || null,
            type: data.type || 'manual', // 'manual' | 'game'
            createdAt: now,
            updatedAt: now,
            isDefault: false,
            // Game-specific metadata
            gameMetadata: data.gameMetadata || null
        };

        await LibraryDB.put(LibraryDB.STORES.COLLECTIONS, collection);
        console.log('CaissaLibrary: Collection created', collection.id);
        return collection;
    },

    /**
     * Create a Game collection from PGN headers
     * @param {Object} headers - PGN headers { white, black, date, result, event, etc. }
     * @returns {Promise<Object>} - Created game collection
     */
    async createGameCollection(headers = {}) {
        const white = headers.white || headers.White || 'Unknown';
        const black = headers.black || headers.Black || 'Unknown';
        const date = headers.date || headers.Date || new Date().toISOString().split('T')[0];
        const result = headers.result || headers.Result || '*';

        // Format: "Game: White vs Black (YYYY-MM-DD)"
        const name = `Game: ${white} vs ${black} (${date.split('.')[0] || date})`;

        const gameMetadata = {
            white: white,
            black: black,
            date: date,
            result: result,
            event: headers.event || headers.Event || null,
            site: headers.site || headers.Site || null,
            round: headers.round || headers.Round || null,
            eco: headers.eco || headers.ECO || null,
            opening: headers.opening || headers.Opening || null
        };

        return this.createCollection({
            name: name,
            description: `${white} vs ${black}`,
            type: 'game',
            gameMetadata: gameMetadata
        });
    },

    /**
     * Update a collection
     * @param {string} id - Collection ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>}
     */
    async updateCollection(id, updates) {
        await this.init();

        const existing = await this.getCollection(id);
        if (!existing) {
            throw new Error(`Collection not found: ${id}`);
        }

        const updated = {
            ...existing,
            ...updates,
            id: existing.id,
            updatedAt: Date.now()
        };

        await LibraryDB.put(LibraryDB.STORES.COLLECTIONS, updated);
        return updated;
    },

    /**
     * Delete a collection (positions become unassigned)
     * @param {string} id - Collection ID
     * @returns {Promise<void>}
     */
    async deleteCollection(id) {
        await this.init();

        const collection = await this.getCollection(id);
        if (!collection) return;

        if (collection.isDefault) {
            throw new Error('Cannot delete default collection');
        }

        // Move positions to default collection
        const defaultId = await this._getDefaultCollectionId();
        const positions = await LibraryDB.getAll(LibraryDB.STORES.POSITIONS);
        for (const pos of positions) {
            if (pos.collectionId === id) {
                await this.updatePosition(pos.id, { collectionId: defaultId });
            }
        }

        // Track deletion for cloud sync
        const deletionRecord = {
            id: this._generateId(),
            itemId: id,
            itemType: 'collection',
            syncStatus: 'pending',
            deletedAt: Date.now()
        };
        await LibraryDB.put(LibraryDB.STORES.DELETIONS, deletionRecord);

        await LibraryDB.delete(LibraryDB.STORES.COLLECTIONS, id);
        console.log('CaissaLibrary: Collection deleted', id);
    },

    /**
     * Get positions in a collection, sorted by move order
     * @param {string} collectionId - Collection ID
     * @returns {Promise<Object[]>}
     */
    async getCollectionPositions(collectionId) {
        await this.init();

        const { positions } = await this.listPositions({
            limit: 10000,
            filter: { collectionId: collectionId }
        });

        // Sort by plyIndex first (if available), then by dateAdded as fallback
        positions.sort((a, b) => {
            // Both have plyIndex - sort by it
            if (a.plyIndex !== undefined && b.plyIndex !== undefined) {
                return a.plyIndex - b.plyIndex;
            }
            // Only one has plyIndex - it goes first
            if (a.plyIndex !== undefined) return -1;
            if (b.plyIndex !== undefined) return 1;
            // Neither has plyIndex - fall back to dateAdded
            return (a.dateAdded || 0) - (b.dateAdded || 0);
        });

        return positions;
    },

    /**
     * Get the current active game collection (most recent game type)
     * @returns {Promise<Object|null>}
     */
    async getCurrentGameCollection() {
        const gameCollections = await this.listCollections({ type: 'game' });
        if (gameCollections.length === 0) return null;

        // Return most recent
        return gameCollections[0];
    },

    /**
     * Set the active game collection ID (stored in session)
     */
    _activeGameCollectionId: null,

    setActiveGameCollection(id) {
        this._activeGameCollectionId = id;
    },

    getActiveGameCollectionId() {
        return this._activeGameCollectionId;
    },

    // ========================================
    // EXPORT OPERATIONS
    // ========================================

    /**
     * Export positions as JSON
     * @param {string[]} ids - Position IDs to export (or empty for all)
     * @returns {Promise<string>} - JSON string
     */
    async exportAsJSON(ids = []) {
        await this.init();

        let positions;
        if (ids.length > 0) {
            positions = await Promise.all(ids.map(id => this.getPosition(id)));
            positions = positions.filter(p => p !== undefined);
        } else {
            const result = await this.listPositions({ limit: 10000 });
            positions = result.positions;
        }

        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            source: 'CAISSA Library',
            positionCount: positions.length,
            positions: positions
        };

        return JSON.stringify(exportData, null, 2);
    },

    /**
     * Export a single position as FEN
     * @param {string} id - Position ID
     * @returns {Promise<string>} - FEN string
     */
    async exportAsFEN(id) {
        const position = await this.getPosition(id);
        if (!position) throw new Error(`Position not found: ${id}`);
        return position.fen;
    },

    /**
     * Export multiple positions as FEN list
     * @param {string[]} ids - Position IDs
     * @returns {Promise<string>} - FEN strings, one per line
     */
    async exportAsFENList(ids) {
        const fens = await Promise.all(ids.map(async id => {
            const pos = await this.getPosition(id);
            return pos ? pos.fen : null;
        }));
        return fens.filter(f => f !== null).join('\n');
    },

    /**
     * Import positions from JSON backup
     * @param {string} jsonString - JSON export data
     * @returns {Promise<{imported: number, skipped: number}>}
     */
    async importFromJSON(jsonString) {
        await this.init();

        const data = JSON.parse(jsonString);
        if (!data.positions || !Array.isArray(data.positions)) {
            throw new Error('Invalid import format');
        }

        let imported = 0;
        let skipped = 0;

        for (const pos of data.positions) {
            try {
                // Remove ID to get fresh one (or let dedup handle it)
                const { id, ...posData } = pos;
                await this.savePosition(posData);
                imported++;
            } catch (e) {
                console.warn('CaissaLibrary: Failed to import position', e);
                skipped++;
            }
        }

        return { imported, skipped };
    },

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    /**
     * Generate a UUID v4
     * @returns {string}
     */
    _generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Generate a title from FEN
     * @param {string} fen - FEN string
     * @returns {string}
     */
    _generateTitle(fen) {
        const parts = fen.split(' ');
        const moveNum = parts[5] || '?';
        const turn = parts[1] === 'w' ? 'White' : 'Black';
        return `Position (Move ${moveNum}, ${turn} to play)`;
    },

    /**
     * Convert string to URL-safe slug
     * @param {string} str - Input string
     * @returns {string}
     */
    _slugify(str) {
        return str
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    /**
     * Validate FEN format (basic validation)
     * @param {string} fen - FEN string
     * @returns {boolean}
     */
    validateFEN(fen) {
        if (!fen || typeof fen !== 'string') return false;

        const parts = fen.trim().split(/\s+/);
        if (parts.length < 4) return false;

        // Check position part has 8 ranks
        const ranks = parts[0].split('/');
        if (ranks.length !== 8) return false;

        // Check each rank
        for (const rank of ranks) {
            let count = 0;
            for (const char of rank) {
                if (/[1-8]/.test(char)) {
                    count += parseInt(char, 10);
                } else if (/[pnbrqkPNBRQK]/.test(char)) {
                    count += 1;
                } else {
                    return false;
                }
            }
            if (count !== 8) return false;
        }

        // Check turn
        if (!/^[wb]$/.test(parts[1])) return false;

        // Check castling (can be - or some combination of KQkq)
        if (!/^(-|[KQkq]+)$/.test(parts[2])) return false;

        return true;
    },

    /**
     * Normalize FEN (ensure consistent format)
     * @param {string} fen - FEN string
     * @returns {string}
     */
    normalizeFEN(fen) {
        const parts = fen.trim().split(/\s+/);

        // Ensure we have all 6 parts
        while (parts.length < 6) {
            if (parts.length === 4) parts.push('0'); // halfmove clock
            if (parts.length === 5) parts.push('1'); // fullmove number
        }

        return parts.join(' ');
    },

    /**
     * Hash FEN for deduplication (position part only)
     * @param {string} fen - FEN string
     * @returns {Promise<string>}
     */
    async hashFEN(fen) {
        // Use only position + turn + castling + en passant for uniqueness
        const parts = fen.split(' ');
        const key = parts.slice(0, 4).join(' ');

        // Use SubtleCrypto if available, otherwise simple hash
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(key);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Fallback: simple hash
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    },

    /**
     * Get library statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        await this.init();

        const positionCount = await LibraryDB.count(LibraryDB.STORES.POSITIONS);
        const tagCount = await LibraryDB.count(LibraryDB.STORES.TAGS);
        const collectionCount = await LibraryDB.count(LibraryDB.STORES.COLLECTIONS);

        return {
            positions: positionCount,
            tags: tagCount,
            collections: collectionCount,
            limits: this.LIMITS
        };
    }
};

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaissaLibrary;
}
