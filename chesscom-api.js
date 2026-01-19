/**
 * Chess.com Public API Service
 *
 * Handles all interactions with Chess.com public API endpoints.
 * Includes rate limiting, caching, and error handling.
 */

const ChessComAPI = (() => {
    // Session cache for API responses
    const cache = {
        playerProfiles: new Map(),
        monthlyArchives: new Map()
    };

    // Rate limiting configuration
    const rateLimiter = {
        maxConcurrent: 3,
        delayBetweenBatches: 200, // ms
        activeRequests: 0
    };

    /**
     * Normalize username (lowercase, trim)
     * @param {string} username
     * @returns {string}
     */
    function normalizeUsername(username) {
        return username.trim().toLowerCase();
    }

    /**
     * Make a rate-limited API request
     * @param {string} url
     * @returns {Promise<any>}
     */
    async function makeRequest(url) {
        // Wait if too many concurrent requests
        while (rateLimiter.activeRequests >= rateLimiter.maxConcurrent) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        rateLimiter.activeRequests++;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('NOT_FOUND');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;

        } finally {
            rateLimiter.activeRequests--;
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, rateLimiter.delayBetweenBatches));
        }
    }

    /**
     * Get player's archive list
     * @param {string} username
     * @returns {Promise<string[]>} Array of archive URLs
     */
    async function getArchives(username) {
        const normalizedUsername = normalizeUsername(username);
        const url = `https://api.chess.com/pub/player/${normalizedUsername}/games/archives`;

        console.log('📁 Fetching archives for:', normalizedUsername);

        try {
            const data = await makeRequest(url);
            return data.archives || [];
        } catch (error) {
            if (error.message === 'NOT_FOUND') {
                throw new Error(`Player "${username}" not found on Chess.com`);
            }
            throw new Error(`Failed to fetch archives: ${error.message}`);
        }
    }

    /**
     * Get games for a specific month
     * @param {string} archiveUrl - Full URL to monthly archive
     * @returns {Promise<any[]>} Array of game objects
     */
    async function getMonthlyGames(archiveUrl) {
        // Check cache first
        if (cache.monthlyArchives.has(archiveUrl)) {
            console.log('📦 Using cached monthly games for:', archiveUrl);
            return cache.monthlyArchives.get(archiveUrl);
        }

        console.log('📥 Fetching monthly games from:', archiveUrl);

        try {
            const data = await makeRequest(archiveUrl);
            const games = data.games || [];

            // Cache the result
            cache.monthlyArchives.set(archiveUrl, games);

            return games;
        } catch (error) {
            throw new Error(`Failed to fetch monthly games: ${error.message}`);
        }
    }

    /**
     * Get player's public profile and status
     * @param {string} username
     * @returns {Promise<{status: string, username: string}>}
     */
    async function getPlayerStatus(username) {
        const normalizedUsername = normalizeUsername(username);

        // Check cache first
        if (cache.playerProfiles.has(normalizedUsername)) {
            console.log('📦 Using cached profile for:', normalizedUsername);
            return cache.playerProfiles.get(normalizedUsername);
        }

        const url = `https://api.chess.com/pub/player/${normalizedUsername}`;

        try {
            const data = await makeRequest(url);
            const result = {
                username: data.username || normalizedUsername,
                status: data.status || 'unknown',
                url: data.url || `https://www.chess.com/member/${normalizedUsername}`
            };

            // Cache the result
            cache.playerProfiles.set(normalizedUsername, result);

            return result;

        } catch (error) {
            // If profile fetch fails, return unknown status but don't crash
            console.warn(`⚠️ Failed to fetch profile for ${username}:`, error.message);
            return {
                username: normalizedUsername,
                status: 'unknown',
                url: `https://www.chess.com/member/${normalizedUsername}`,
                error: error.message
            };
        }
    }

    /**
     * Find archive URL for a specific year/month
     * @param {string[]} archives - Array of archive URLs
     * @param {number} year
     * @param {number} month
     * @returns {string|null}
     */
    function findArchiveForMonth(archives, year, month) {
        const monthStr = month.toString().padStart(2, '0');
        const targetPattern = `/${year}/${monthStr}`;

        return archives.find(url => url.includes(targetPattern)) || null;
    }

    /**
     * Clear session cache
     */
    function clearCache() {
        cache.playerProfiles.clear();
        cache.monthlyArchives.clear();
        console.log('🗑️ Cache cleared');
    }

    // Public API
    return {
        getArchives,
        getMonthlyGames,
        getPlayerStatus,
        findArchiveForMonth,
        normalizeUsername,
        clearCache
    };
})();
