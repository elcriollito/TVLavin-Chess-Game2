export const TOURNAMENT_FORMATS = Object.freeze([
    Object.freeze({ id: 'swiss', label: 'Swiss', pairing: 'score-group' }),
    Object.freeze({ id: 'arena', label: 'Arena', pairing: 'continuous' }),
    Object.freeze({ id: 'round-robin', label: 'Round Robin', pairing: 'all-play-all' })
]);

export function buildTournamentCard(tournament, now = Date.now()) {
    const startsAt = Date.parse(tournament.starts_at);
    const status = tournament.status || (startsAt > now ? 'scheduled' : 'active');
    return Object.freeze({
        id: tournament.id,
        title: String(tournament.title || 'CAISSA Tournament').slice(0, 80),
        format: TOURNAMENT_FORMATS.find(item => item.id === tournament.format)?.label || 'Tournament',
        status,
        startsAt,
        participantCount: Math.max(0, Number(tournament.participant_count || 0)),
        featured: tournament.featured === true
    });
}

export function selectMultiboardGames(games, limit = 9) {
    return [...(Array.isArray(games) ? games : [])]
        .filter(game => game && game.status === 'active' && typeof game.fen === 'string')
        .sort((a, b) => Number(b.featured === true) - Number(a.featured === true)
            || Number(a.board_number || Number.MAX_SAFE_INTEGER) - Number(b.board_number || Number.MAX_SAFE_INTEGER))
        .slice(0, Math.max(1, Math.min(24, Number(limit) || 9)));
}

export function tournamentPoints(result, color) {
    if (!['white', 'black'].includes(color)) throw new TypeError('Tournament color is required.');
    if (result === '1/2-1/2') return 0.5;
    if (result === '1-0') return color === 'white' ? 1 : 0;
    if (result === '0-1') return color === 'black' ? 1 : 0;
    return 0;
}

export function calculateStandings(participants, games) {
    const rows = new Map((participants || []).map(player => [player.id, {
        id: player.id, displayName: player.displayName, score: 0, wins: 0, played: 0
    }]));
    for (const game of games || []) {
        if (!['1-0', '0-1', '1/2-1/2'].includes(game.result)) continue;
        for (const [id, color] of [[game.whiteUserId, 'white'], [game.blackUserId, 'black']]) {
            const row = rows.get(id); if (!row) continue;
            const points = tournamentPoints(game.result, color);
            row.score += points; row.played += 1; if (points === 1) row.wins += 1;
        }
    }
    return [...rows.values()].sort((a, b) => b.score - a.score || b.wins - a.wins
        || String(a.displayName).localeCompare(String(b.displayName))).map((row, index) => Object.freeze({ ...row, rank: index + 1 }));
}

export function arenaTournamentPoints(result, color) {
    if (!['white', 'black'].includes(color)) throw new TypeError('Tournament color is required.');
    if (result === '1/2-1/2') return 1;
    if (result === '1-0') return color === 'white' ? 2 : 0;
    if (result === '0-1') return color === 'black' ? 2 : 0;
    return 0;
}

export function calculateArenaStandings(participants, games) {
    const rows = new Map((participants || []).map(player => [player.id, {
        id: player.id,
        displayName: player.displayName,
        joinedAt: player.joinedAt || '',
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gamesPlayed: 0
    }]));
    const scoredGames = new Set();
    for (const game of games || []) {
        if (!game?.id || scoredGames.has(game.id) || !['1-0', '0-1', '1/2-1/2'].includes(game.result)) continue;
        scoredGames.add(game.id);
        for (const [id, color] of [[game.whiteUserId, 'white'], [game.blackUserId, 'black']]) {
            const row = rows.get(id);
            if (!row) continue;
            const points = arenaTournamentPoints(game.result, color);
            row.points += points;
            row.gamesPlayed += 1;
            row.wins += points === 2 ? 1 : 0;
            row.draws += points === 1 ? 1 : 0;
            row.losses += points === 0 ? 1 : 0;
        }
    }
    return [...rows.values()]
        .sort((a, b) => b.points - a.points
            || b.wins - a.wins
            || b.draws - a.draws
            || String(a.joinedAt).localeCompare(String(b.joinedAt))
            || String(a.id).localeCompare(String(b.id)))
        .map((row, index) => Object.freeze({ ...row, rank: index + 1 }));
}
