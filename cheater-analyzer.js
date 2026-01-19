/**
 * Cheater Insight Analyzer
 *
 * Analyzes Chess.com games to find opponents who were later
 * marked as "Closed: Fair Play" by Chess.com.
 */

const CheaterAnalyzer = (() => {
    // Fair play violation status constant
    const FAIR_PLAY_CLOSED_STATUS = 'closed:fair_play_violations';

    /**
     * Extract opponent username from a game
     * @param {object} game - Chess.com game object
     * @param {string} username - Your username (normalized)
     * @returns {string|null}
     */
    function getOpponentUsername(game, username) {
        const white = game.white?.username?.toLowerCase();
        const black = game.black?.username?.toLowerCase();
        const normalizedUser = username.toLowerCase();

        if (white === normalizedUser) {
            return black;
        } else if (black === normalizedUser) {
            return white;
        }

        return null;
    }

    /**
     * Determine your result in the game
     * @param {object} game - Chess.com game object
     * @param {string} username - Your username (normalized)
     * @returns {string} 'Win' | 'Loss' | 'Draw'
     */
    function getYourResult(game, username) {
        const white = game.white?.username?.toLowerCase();
        const normalizedUser = username.toLowerCase();
        const isWhite = (white === normalizedUser);

        // Parse result (e.g., "1-0", "0-1", "1/2-1/2")
        const result = game.pgn?.match(/\[Result "([^"]+)"\]/)?.[1];

        if (!result) return 'Unknown';

        if (result === '1/2-1/2') return 'Draw';
        if (result === '1-0') return isWhite ? 'Win' : 'Loss';
        if (result === '0-1') return isWhite ? 'Loss' : 'Win';

        return 'Unknown';
    }

    /**
     * Filter games by time control
     * @param {object[]} games
     * @param {string} timeControl - 'all' | 'bullet' | 'blitz' | 'rapid' | 'daily'
     * @returns {object[]}
     */
    function filterByTimeControl(games, timeControl) {
        if (timeControl === 'all') {
            return games;
        }

        return games.filter(game => {
            const timeClass = game.time_class;
            return timeClass === timeControl;
        });
    }

    /**
     * Get unique opponents from games list
     * @param {object[]} games
     * @param {string} username - Your username
     * @returns {string[]} Array of unique opponent usernames
     */
    function getUniqueOpponents(games, username) {
        const opponents = new Set();

        games.forEach(game => {
            const opponent = getOpponentUsername(game, username);
            if (opponent) {
                opponents.add(opponent);
            }
        });

        return Array.from(opponents);
    }

    /**
     * Check if opponent is flagged for fair play violations
     * @param {object} opponentProfile
     * @returns {boolean}
     */
    function isFairPlayClosed(opponentProfile) {
        return opponentProfile.status === FAIR_PLAY_CLOSED_STATUS;
    }

    /**
     * Main analysis function
     * @param {object} config
     * @param {string} config.username - Your Chess.com username
     * @param {number} config.year - Year to analyze
     * @param {number} config.month - Month to analyze (1-12)
     * @param {string} config.timeControl - Time control filter
     * @param {function} config.onProgress - Progress callback
     * @returns {Promise<object>} Analysis results
     */
    async function analyze(config) {
        const { username, year, month, timeControl = 'all', onProgress } = config;

        const results = {
            username: username,
            year: year,
            month: month,
            timeControl: timeControl,
            totalGames: 0,
            totalOpponents: 0,
            flaggedOpponents: 0,
            flaggedGames: [],
            error: null
        };

        try {
            // Step 1: Get archives
            onProgress?.({ stage: 'archives', message: 'Fetching game archives...' });
            const archives = await ChessComAPI.getArchives(username);

            // Step 2: Find archive for specific month
            const archiveUrl = ChessComAPI.findArchiveForMonth(archives, year, month);

            if (!archiveUrl) {
                throw new Error(`No games found for ${year}-${month.toString().padStart(2, '0')}`);
            }

            // Step 3: Fetch monthly games
            onProgress?.({ stage: 'games', message: 'Fetching games for selected month...' });
            let games = await ChessComAPI.getMonthlyGames(archiveUrl);
            results.totalGames = games.length;

            // Step 4: Filter by time control
            if (timeControl !== 'all') {
                games = filterByTimeControl(games, timeControl);
                onProgress?.({ stage: 'filter', message: `Filtered to ${games.length} ${timeControl} games` });
            }

            // Step 5: Extract unique opponents
            const opponents = getUniqueOpponents(games, username);
            results.totalOpponents = opponents.length;

            onProgress?.({
                stage: 'opponents',
                message: `Found ${opponents.length} unique opponents. Checking profiles...`,
                total: opponents.length,
                current: 0
            });

            // Step 6: Check each opponent's status
            const opponentProfiles = [];

            for (let i = 0; i < opponents.length; i++) {
                const opponent = opponents[i];

                onProgress?.({
                    stage: 'checking',
                    message: `Checking ${opponent} (${i + 1}/${opponents.length})...`,
                    total: opponents.length,
                    current: i + 1,
                    progress: ((i + 1) / opponents.length) * 100
                });

                const profile = await ChessComAPI.getPlayerStatus(opponent);
                opponentProfiles.push({
                    username: opponent,
                    ...profile
                });
            }

            // Step 7: Find flagged opponents
            const flaggedOpponents = opponentProfiles.filter(isFairPlayClosed);
            results.flaggedOpponents = flaggedOpponents.length;

            // Step 8: Build flagged games list
            if (flaggedOpponents.length > 0) {
                const flaggedUsernames = new Set(
                    flaggedOpponents.map(o => o.username.toLowerCase())
                );

                results.flaggedGames = games
                    .filter(game => {
                        const opponent = getOpponentUsername(game, username);
                        return opponent && flaggedUsernames.has(opponent);
                    })
                    .map(game => {
                        const opponent = getOpponentUsername(game, username);
                        const opponentProfile = flaggedOpponents.find(
                            o => o.username.toLowerCase() === opponent
                        );

                        return {
                            opponent: opponentProfile.username,
                            opponentStatus: opponentProfile.status,
                            opponentUrl: opponentProfile.url,
                            yourResult: getYourResult(game, username),
                            gameUrl: game.url,
                            endTime: game.end_time,
                            timeControl: game.time_class,
                            timeControlString: game.time_control,
                            rated: game.rated,
                            date: new Date(game.end_time * 1000).toLocaleString()
                        };
                    });
            }

            onProgress?.({ stage: 'complete', message: 'Analysis complete!' });
            return results;

        } catch (error) {
            results.error = error.message;
            throw error;
        }
    }

    /**
     * Export results as JSON
     * @param {object} results
     * @returns {string}
     */
    function exportAsJSON(results) {
        return JSON.stringify(results, null, 2);
    }

    /**
     * Export results as text list
     * @param {object} results
     * @returns {string}
     */
    function exportAsText(results) {
        const lines = [];

        lines.push('CAISSA Cheater Insight Results');
        lines.push('=' .repeat(50));
        lines.push('');
        lines.push(`Username: ${results.username}`);
        lines.push(`Period: ${results.year}-${results.month.toString().padStart(2, '0')}`);
        lines.push(`Time Control: ${results.timeControl}`);
        lines.push('');
        lines.push(`Total Games: ${results.totalGames}`);
        lines.push(`Unique Opponents: ${results.totalOpponents}`);
        lines.push(`Fair Play Closed: ${results.flaggedOpponents}`);
        lines.push('');

        if (results.flaggedGames.length > 0) {
            lines.push('Flagged Opponents:');
            lines.push('-'.repeat(50));
            results.flaggedGames.forEach((game, index) => {
                lines.push('');
                lines.push(`${index + 1}. ${game.opponent} (${game.opponentStatus})`);
                lines.push(`   Your Result: ${game.yourResult}`);
                lines.push(`   Date: ${game.date}`);
                lines.push(`   Time Control: ${game.timeControl}`);
                lines.push(`   Game: ${game.gameUrl}`);
                lines.push(`   Profile: ${game.opponentUrl}`);
            });
        } else {
            lines.push('No flagged opponents found.');
        }

        return lines.join('\n');
    }

    // Public API
    return {
        analyze,
        exportAsJSON,
        exportAsText,
        FAIR_PLAY_CLOSED_STATUS
    };
})();
