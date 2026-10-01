const ALLOWED_COUNTS = new Set([10, 20, 30, 50]);
const ALLOWED_TIME_CONTROLS = new Set(['all', 'bullet', 'blitz', 'rapid', 'classical']);
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{2,30}$/;
const DEFAULT_TIMEOUT_MS = 8_000;

function firstQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

export function validateLichessGamesQuery(query = {}) {
    const get = key => query instanceof URLSearchParams
        ? query.get(key)
        : firstQueryValue(query[key]);
    const username = String(get('username') || '').trim();
    const rawMax = String(get('max') || '20');
    const timeControl = String(get('timeControl') || 'all').toLowerCase();
    const max = Number(rawMax);

    if (!username) {
        return { ok: false, error: 'Missing username parameter' };
    }
    if (!USERNAME_PATTERN.test(username)) {
        return { ok: false, error: 'Invalid Lichess username' };
    }
    if (!Number.isInteger(max) || !ALLOWED_COUNTS.has(max)) {
        return { ok: false, error: 'max must be one of 10, 20, 30, or 50' };
    }
    if (!ALLOWED_TIME_CONTROLS.has(timeControl)) {
        return { ok: false, error: 'Invalid timeControl filter' };
    }

    return { ok: true, username, max, timeControl };
}

export function buildLichessGamesUrl({ username, max, timeControl }) {
    const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
    url.searchParams.set('max', String(max));
    url.searchParams.set('pgnInJson', 'true');
    url.searchParams.set('moves', 'true');
    url.searchParams.set('tags', 'true');
    url.searchParams.set('clocks', 'false');
    url.searchParams.set('evals', 'false');
    url.searchParams.set('opening', 'false');
    url.searchParams.set('finished', 'true');
    url.searchParams.set('ongoing', 'false');
    url.searchParams.set('sort', 'dateDesc');
    if (timeControl !== 'all') url.searchParams.set('perfType', timeControl);
    return url;
}

function upstreamError(status, username) {
    if (status === 404) return { status: 404, error: `User "${username}" not found on Lichess` };
    if (status === 429) return { status: 429, error: 'Lichess rate limit reached. Please try again later.' };
    return { status: 502, error: `Lichess API error: ${status}` };
}

export async function fetchLichessGames(query, options = {}) {
    const validated = validateLichessGamesQuery(query);
    if (!validated.ok) return { status: 400, body: { success: false, error: validated.error } };

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetchImpl(buildLichessGamesUrl(validated), {
            headers: {
                Accept: 'application/x-ndjson',
                'User-Agent': 'CAISSA-Chess/1.0 (+https://www.caissa-chess.org)'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            const failure = upstreamError(response.status, validated.username);
            return { status: failure.status, body: { success: false, error: failure.error } };
        }

        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (!contentType.includes('json') && !contentType.includes('ndjson')) {
            return { status: 502, body: { success: false, error: 'Lichess returned an invalid response' } };
        }

        const payload = await response.text();
        const games = [];
        for (const line of payload.split('\n')) {
            if (!line.trim()) continue;
            let game;
            try {
                game = JSON.parse(line);
            } catch {
                return { status: 502, body: { success: false, error: 'Lichess returned malformed game data' } };
            }
            if (!game.pgn) continue;
            const timestamp = Number(game.lastMoveAt || game.createdAt || 0);
            games.push({
                id: game.id || `lichess-${timestamp}`,
                pgn: game.pgn,
                timeControl: game.speed || game.perf || 'unknown',
                playedAt: timestamp ? new Date(timestamp).toISOString() : null,
                _timestamp: timestamp
            });
        }

        games.sort((a, b) => b._timestamp - a._timestamp);
        for (const game of games) delete game._timestamp;
        return { status: 200, body: { success: true, games: games.slice(0, validated.max) } };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { status: 504, body: { success: false, error: 'Lichess request timed out' } };
        }
        return { status: 502, body: { success: false, error: 'Could not reach Lichess' } };
    } finally {
        clearTimeout(timeout);
    }
}
