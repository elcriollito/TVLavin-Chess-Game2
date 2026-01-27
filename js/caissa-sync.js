/**
 * CAISSA Cloud Sync Engine
 *
 * Handles bidirectional sync between local IndexedDB and Supabase cloud storage.
 * Requires: LibraryDB, CaissaAuth, CaissaLog
 */

const CaissaSync = {
    // Sync state
    _status: 'idle', // 'idle' | 'syncing' | 'error'
    _lastSyncTime: 0,
    _enabled: false,
    _deviceId: null,
    _syncInProgress: false,

    // API endpoints
    API_BASE: '/api/library',

    /**
     * Initialize sync engine
     * Loads sync metadata from IndexedDB
     * @returns {Promise<void>}
     */
    async init() {
        try {
            await LibraryDB.ensureDB();

            // Load sync metadata
            const enabled = await LibraryDB.get(LibraryDB.STORES.SYNC_METADATA, 'syncEnabled');
            const lastSync = await LibraryDB.get(LibraryDB.STORES.SYNC_METADATA, 'lastSyncTime');
            const deviceId = await LibraryDB.get(LibraryDB.STORES.SYNC_METADATA, 'deviceId');

            this._enabled = enabled?.value ?? true; // Default enabled
            this._lastSyncTime = lastSync?.value ?? 0;
            this._deviceId = deviceId?.value ?? this._generateDeviceId();

            // Store deviceId if newly generated
            if (!deviceId) {
                await LibraryDB.put(LibraryDB.STORES.SYNC_METADATA, {
                    key: 'deviceId',
                    value: this._deviceId
                });
            }

            if (window.CaissaLog) {
                CaissaLog.info('Sync', 'Initialized', {
                    enabled: this._enabled,
                    lastSync: this._lastSyncTime ? new Date(this._lastSyncTime).toISOString() : 'never'
                });
            }

            // Auto-sync if enabled and authenticated
            if (this._enabled && window.CaissaAuth?.isAuthenticated()) {
                setTimeout(() => this.syncNow(), 2000); // Delay 2s after page load
            }
        } catch (error) {
            console.error('CaissaSync: Initialization failed', error);
            if (window.CaissaLog) {
                CaissaLog.error('Sync', 'Init failed', error);
            }
        }
    },

    /**
     * Trigger immediate sync
     * Push local changes, then pull remote changes
     * @returns {Promise<{success: boolean, pushed: number, pulled: number, error?: string}>}
     */
    async syncNow() {
        // Prevent concurrent syncs
        if (this._syncInProgress) {
            if (window.CaissaLog) {
                CaissaLog.warn('Sync', 'Sync already in progress, skipping');
            }
            return { success: false, error: 'Sync already in progress' };
        }

        // Check auth
        if (!window.CaissaAuth?.isAuthenticated()) {
            if (window.CaissaLog) {
                CaissaLog.warn('Sync', 'Not authenticated, skipping sync');
            }
            return { success: false, error: 'Not authenticated' };
        }

        // Check if enabled
        if (!this._enabled) {
            if (window.CaissaLog) {
                CaissaLog.info('Sync', 'Sync disabled, skipping');
            }
            return { success: false, error: 'Sync is disabled' };
        }

        this._syncInProgress = true;
        this._status = 'syncing';

        try {
            const result = await this._performSync();
            this._status = 'idle';
            this._lastSyncTime = Date.now();

            // Store last sync time
            await LibraryDB.put(LibraryDB.STORES.SYNC_METADATA, {
                key: 'lastSyncTime',
                value: this._lastSyncTime
            });

            if (window.CaissaLog) {
                CaissaLog.info('Sync', 'Sync completed', result);
            }

            return { success: true, ...result };
        } catch (error) {
            this._status = 'error';
            console.error('CaissaSync: Sync failed', error);
            if (window.CaissaLog) {
                CaissaLog.error('Sync', 'Sync failed', error);
            }
            return { success: false, error: error.message };
        } finally {
            this._syncInProgress = false;
        }
    },

    /**
     * Internal sync implementation
     * @private
     * @returns {Promise<{pushed: number, pulled: number}>}
     */
    async _performSync() {
        const token = window.CaissaAuth.getToken();
        if (!token) {
            throw new Error('No auth token available');
        }

        // Step 1: Push local changes
        const pushResult = await this._pushLocalChanges(token);

        // Step 2: Pull remote changes
        const pullResult = await this._pullRemoteChanges(token);

        return {
            pushed: pushResult.count,
            pulled: pullResult.count
        };
    },

    /**
     * Push local pending changes to cloud
     * @private
     * @param {string} token - Auth token
     * @returns {Promise<{count: number}>}
     */
    async _pushLocalChanges(token) {
        // Get all positions with syncStatus = 'pending'
        const pendingPositions = await LibraryDB.getByIndex(
            LibraryDB.STORES.POSITIONS,
            'syncStatus',
            'pending'
        );

        // Get all pending deletions
        const pendingDeletions = await LibraryDB.getByIndex(
            LibraryDB.STORES.DELETIONS,
            'syncStatus',
            'pending'
        );

        // Nothing to push
        if (pendingPositions.length === 0 && pendingDeletions.length === 0) {
            return { count: 0 };
        }

        // Prepare payload
        const payload = {
            positions: pendingPositions.map(p => ({
                local_id: p.id,
                fen: p.fen,
                fen_hash: p.fenHash,
                title: p.title || null,
                notes: p.notes || null,
                tags: p.tags || [],
                is_favorite: p.isFavorite || false,
                collection_id: p.collectionId || null,
                engine_report: p.engineReport || null,
                annotations: p.annotations || null,
                date_added: p.dateAdded,
                last_modified: p.lastModified || p.dateAdded
            })),
            deletions: pendingDeletions.map(d => ({
                local_id: d.itemId,
                type: d.itemType
            }))
        };

        // Push to API
        const response = await fetch(`${this.API_BASE}/push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Push failed' }));
            throw new Error(error.error || 'Push failed');
        }

        const result = await response.json();

        // Mark pushed items as synced
        for (const position of pendingPositions) {
            await LibraryDB.put(LibraryDB.STORES.POSITIONS, {
                ...position,
                syncStatus: 'synced'
            });
        }

        // Delete synced deletions
        for (const deletion of pendingDeletions) {
            await LibraryDB.delete(LibraryDB.STORES.DELETIONS, deletion.id);
        }

        return {
            count: pendingPositions.length + pendingDeletions.length
        };
    },

    /**
     * Pull remote changes from cloud
     * @private
     * @param {string} token - Auth token
     * @returns {Promise<{count: number}>}
     */
    async _pullRemoteChanges(token) {
        // Build query with since parameter for incremental sync
        const sinceParam = this._lastSyncTime > 0
            ? `?since=${new Date(this._lastSyncTime).toISOString()}`
            : '';

        const response = await fetch(`${this.API_BASE}/pull${sinceParam}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Pull failed' }));
            throw new Error(error.error || 'Pull failed');
        }

        const { positions, collections, serverTime } = await response.json();

        let updateCount = 0;

        // Merge positions
        for (const remotePos of positions) {
            const localPos = await LibraryDB.get(LibraryDB.STORES.POSITIONS, remotePos.local_id);

            // Conflict resolution: server wins if newer
            const shouldUpdate = !localPos ||
                new Date(remotePos.last_modified) > new Date(localPos.lastModified || 0);

            if (shouldUpdate) {
                await LibraryDB.put(LibraryDB.STORES.POSITIONS, {
                    id: remotePos.local_id,
                    fen: remotePos.fen,
                    fenHash: remotePos.fen_hash,
                    title: remotePos.title,
                    notes: remotePos.notes,
                    tags: remotePos.tags || [],
                    isFavorite: remotePos.is_favorite || false,
                    collectionId: remotePos.collection_id,
                    engineReport: remotePos.engine_report,
                    annotations: remotePos.annotations,
                    dateAdded: remotePos.date_added,
                    lastModified: remotePos.last_modified,
                    syncStatus: 'synced'
                });
                updateCount++;
            }
        }

        // Note: Collections sync will be added in future iteration
        // For now, focusing on positions only

        return { count: updateCount };
    },

    /**
     * Generate a unique device ID
     * @private
     * @returns {string}
     */
    _generateDeviceId() {
        return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Check if sync is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this._enabled;
    },

    /**
     * Enable or disable sync
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setEnabled(enabled) {
        this._enabled = !!enabled;
        await LibraryDB.put(LibraryDB.STORES.SYNC_METADATA, {
            key: 'syncEnabled',
            value: this._enabled
        });

        if (window.CaissaLog) {
            CaissaLog.info('Sync', `Sync ${enabled ? 'enabled' : 'disabled'}`);
        }

        // Trigger sync if enabling and authenticated
        if (enabled && window.CaissaAuth?.isAuthenticated()) {
            setTimeout(() => this.syncNow(), 500);
        }
    },

    /**
     * Get current sync status
     * @returns {string} - 'idle' | 'syncing' | 'error'
     */
    getStatus() {
        return this._status;
    },

    /**
     * Get last sync timestamp
     * @returns {number} - Unix timestamp (ms)
     */
    getLastSyncTime() {
        return this._lastSyncTime;
    },

    /**
     * Get human-readable last sync time
     * @returns {string}
     */
    getLastSyncText() {
        if (this._lastSyncTime === 0) {
            return 'Never';
        }

        const now = Date.now();
        const diff = now - this._lastSyncTime;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof LibraryDB !== 'undefined') {
            CaissaSync.init();
        }
    });
} else {
    if (typeof LibraryDB !== 'undefined') {
        CaissaSync.init();
    }
}
