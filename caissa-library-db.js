/**
 * CAISSA Library - IndexedDB Abstraction Layer
 *
 * Provides promisified access to IndexedDB for position storage.
 * Database: caissa_library (v2)
 * Stores: positions, tags, collections, sync_metadata, deletions
 */

const LibraryDB = {
    DB_NAME: 'caissa_library',
    DB_VERSION: 2,

    // Database connection
    db: null,

    // Store names
    STORES: {
        POSITIONS: 'positions',
        TAGS: 'tags',
        COLLECTIONS: 'collections',
        SYNC_METADATA: 'sync_metadata',
        DELETIONS: 'deletions'
    },

    /**
     * Initialize and open the database
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('LibraryDB: Failed to open database', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('LibraryDB: Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                const transaction = event.target.transaction;
                console.log(`LibraryDB: Upgrading database from v${oldVersion} to v${db.version}...`);

                // v0 → v1: Create initial stores
                if (oldVersion < 1) {
                    // Create positions store
                    if (!db.objectStoreNames.contains(this.STORES.POSITIONS)) {
                        const positionsStore = db.createObjectStore(this.STORES.POSITIONS, { keyPath: 'id' });
                        positionsStore.createIndex('dateAdded', 'dateAdded', { unique: false });
                        positionsStore.createIndex('fenHash', 'fenHash', { unique: false });
                        positionsStore.createIndex('collectionId', 'collectionId', { unique: false });
                        positionsStore.createIndex('isFavorite', 'isFavorite', { unique: false });
                        console.log('LibraryDB: Created positions store');
                    }

                    // Create tags store
                    if (!db.objectStoreNames.contains(this.STORES.TAGS)) {
                        const tagsStore = db.createObjectStore(this.STORES.TAGS, { keyPath: 'id' });
                        tagsStore.createIndex('name', 'name', { unique: true });
                        tagsStore.createIndex('slug', 'slug', { unique: true });
                        console.log('LibraryDB: Created tags store');
                    }

                    // Create collections store
                    if (!db.objectStoreNames.contains(this.STORES.COLLECTIONS)) {
                        const collectionsStore = db.createObjectStore(this.STORES.COLLECTIONS, { keyPath: 'id' });
                        collectionsStore.createIndex('name', 'name', { unique: false });
                        collectionsStore.createIndex('isDefault', 'isDefault', { unique: false });
                        console.log('LibraryDB: Created collections store');
                    }
                }

                // v1 → v2: Add cloud sync support
                if (oldVersion < 2) {
                    // Create sync_metadata store for sync state
                    if (!db.objectStoreNames.contains(this.STORES.SYNC_METADATA)) {
                        const syncMetadataStore = db.createObjectStore(this.STORES.SYNC_METADATA, { keyPath: 'key' });
                        console.log('LibraryDB: Created sync_metadata store');
                    }

                    // Create deletions store for tracking pending deletions
                    if (!db.objectStoreNames.contains(this.STORES.DELETIONS)) {
                        const deletionsStore = db.createObjectStore(this.STORES.DELETIONS, { keyPath: 'id' });
                        deletionsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                        console.log('LibraryDB: Created deletions store');
                    }

                    // Add syncStatus index to positions store
                    const positionsStore = transaction.objectStore(this.STORES.POSITIONS);
                    if (!positionsStore.indexNames.contains('syncStatus')) {
                        positionsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                        console.log('LibraryDB: Added syncStatus index to positions store');
                    }
                }
            };
        });
    },

    /**
     * Ensure database is initialized
     */
    async ensureDB() {
        if (!this.db) {
            await this.init();
        }
        return this.db;
    },

    /**
     * Get a transaction for the specified stores
     * @param {string|string[]} storeNames - Store name(s)
     * @param {string} mode - 'readonly' or 'readwrite'
     * @returns {IDBTransaction}
     */
    getTransaction(storeNames, mode = 'readonly') {
        const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
        return this.db.transaction(stores, mode);
    },

    /**
     * Generic put operation (add or update)
     * @param {string} storeName - Store name
     * @param {Object} data - Data to store
     * @returns {Promise<string>} - Key of stored item
     */
    async put(storeName, data) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic get operation
     * @param {string} storeName - Store name
     * @param {string} key - Key to retrieve
     * @returns {Promise<Object|undefined>}
     */
    async get(storeName, key) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic delete operation
     * @param {string} storeName - Store name
     * @param {string} key - Key to delete
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get all items from a store
     * @param {string} storeName - Store name
     * @returns {Promise<Object[]>}
     */
    async getAll(storeName) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get items by index value
     * @param {string} storeName - Store name
     * @param {string} indexName - Index name
     * @param {*} value - Value to match
     * @returns {Promise<Object[]>}
     */
    async getByIndex(storeName, indexName, value) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Count items in a store
     * @param {string} storeName - Store name
     * @returns {Promise<number>}
     */
    async count(storeName) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all items from a store
     * @param {string} storeName - Store name
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        await this.ensureDB();

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get items with cursor for pagination and sorting
     * @param {string} storeName - Store name
     * @param {Object} options - { indexName, direction, limit, offset }
     * @returns {Promise<Object[]>}
     */
    async getCursor(storeName, options = {}) {
        await this.ensureDB();

        const {
            indexName = null,
            direction = 'prev', // 'next' for ascending, 'prev' for descending
            limit = 50,
            offset = 0
        } = options;

        return new Promise((resolve, reject) => {
            const tx = this.getTransaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const source = indexName ? store.index(indexName) : store;
            const request = source.openCursor(null, direction);

            const results = [];
            let skipped = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (!cursor || results.length >= limit) {
                    resolve(results);
                    return;
                }

                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                    return;
                }

                results.push(cursor.value);
                cursor.continue();
            };

            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Check if a fenHash already exists
     * @param {string} fenHash - Hash to check
     * @returns {Promise<Object|null>} - Existing position or null
     */
    async findByFenHash(fenHash) {
        const results = await this.getByIndex(this.STORES.POSITIONS, 'fenHash', fenHash);
        return results.length > 0 ? results[0] : null;
    },

    /**
     * Close the database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('LibraryDB: Database connection closed');
        }
    }
};

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LibraryDB;
}
