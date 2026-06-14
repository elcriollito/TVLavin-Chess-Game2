const MAX_GAMES = 50;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const platform = req.query?.platform === 'chesscom' ? 'chesscom' : 'lichess';
    const username = String(req.query?.username || '').trim();
    const max = Math.min(Math.max(parseInt(req.query?.max || '10', 10), 1), MAX_GAMES);

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const result = platform === 'chesscom'
            ? await fetchChessComGames(username, max)
            : await fetchLichessGames(username, max);

        return res.status(200).json(result);
    } catch (error) {
        return res.status(502).json({
            error: 'Fetch failed',
            message: error.message,
            platform
        });
    }
}

async function fetchLichessGames(username, max) {
    const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
    url.search = new URLSearchParams({
        max: String(max),
        moves: 'true',
        tags: 'true',
        clocks: 'false',
        evals: 'false',
        opening: 'false'
    }).toString();

    const response = await fetch(url, {
        headers: { Accept: 'application/x-chess-pgn' }
    });
    if (!response.ok) {
        throw new Error(response.status === 404
            ? `Lichess user "${username}" was not found`
            : `Lichess request failed (${response.status})`);
    }

    const pgn = (await response.text()).trim();
    const count = (pgn.match(/\[Event\s/g) || []).length;
    if (!pgn || count === 0) {
        throw new Error(`No games found for Lichess user "${username}"`);
    }

    return { pgn, count, source: 'Lichess' };
}

async function fetchChessComGames(username, max) {
    const headers = {
        Accept: 'application/json',
        'User-Agent': 'CAISSA-Chess/1.0 contact@caissa-chess.org'
    };
    const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
    const archivesResponse = await fetch(archivesUrl, { headers });
    if (!archivesResponse.ok) {
        throw new Error(archivesResponse.status === 404
            ? `Chess.com user "${username}" was not found`
            : `Chess.com archives request failed (${archivesResponse.status})`);
    }

    const { archives = [] } = await archivesResponse.json();
    const games = [];
    for (const archiveUrl of archives.slice().reverse()) {
        if (games.length >= max) break;
        const response = await fetch(archiveUrl, { headers });
        if (!response.ok) continue;
        const data = await response.json();
        games.push(...(data.games || []).slice().reverse().filter((game) => game.pgn));
    }

    const selected = games.slice(0, max);
    if (selected.length === 0) {
        throw new Error(`No games found for Chess.com user "${username}"`);
    }

    return {
        pgn: selected.map((game) => game.pgn.trim()).join('\n\n'),
        count: selected.length,
        source: 'Chess.com'
    };
}
