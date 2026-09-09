/**
 * CAISSA Analyze game URL import boundary.
 *
 * This module only recognizes allowlisted public game URLs and resolves them
 * through provider-owned endpoints constructed from validated identifiers. It
 * never owns chess state and never parses PGN; AnalyzeSection remains the sole
 * consumer through loadGameFromPgn().
 */
(function installAnalyzeGameImport(global) {
    'use strict';

    const VERSION = '1.1.0';
    const MAX_URL_LENGTH = 2048;
    const MAX_PGN_BYTES = 1024 * 1024;
    const LICHESS_HOSTS = new Set(['lichess.org', 'www.lichess.org']);
    const CHESS_COM_HOSTS = new Set(['chess.com', 'www.chess.com']);
    const CHESS_COM_API_HOST = 'api.chess.com';
    const chessComArchiveCache = new Map();

    const MESSAGES = Object.freeze({
        EMPTY_URL: 'Paste a public Lichess or Chess.com game URL.',
        INVALID_URL: 'Enter a valid public game URL.',
        UNSUPPORTED_DOMAIN: 'Only public Lichess and Chess.com game links are supported.',
        MALFORMED_GAME_ID: 'That game link does not contain a valid game ID.',
        INVALID_USERNAME: 'Enter a valid Chess.com username.',
        MISSING_USERNAME: "Enter either player's Chess.com username.",
        USERNAME_NOT_FOUND: 'That Chess.com username does not exist.',
        GAME_NOT_FOUND: "That game was not found in this player's public archives.",
        GAME_UNAVAILABLE: 'That game is private, deleted, or unavailable.',
        RATE_LIMITED: 'The game service is busy. Please wait one minute and try again.',
        CHESSCOM_RATE_LIMITED: 'Chess.com is rate limiting requests. Please wait one minute and try again.',
        PROVIDER_UNAVAILABLE: 'The game service is temporarily unavailable.',
        MISSING_PGN: 'Chess.com returned the game without a PGN record.',
        INVALID_PGN_RESPONSE: 'The game service returned an invalid game record.',
        NETWORK_ERROR: 'Could not reach the game service. Check your connection and try again.',
        ABORTED: 'Game search canceled.'
    });

    class GameImportError extends Error {
        constructor(code, cause = null) {
            super(MESSAGES[code] || MESSAGES.PROVIDER_UNAVAILABLE);
            this.name = 'GameImportError';
            this.code = code;
            this.cause = cause;
        }
    }

    function fail(code, cause) {
        throw new GameImportError(code, cause);
    }

    function normalizeInput(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) fail('EMPTY_URL');
        if (value.length > MAX_URL_LENGTH || /\s/.test(value)) fail('INVALID_URL');
        return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    }

    function normalizeChessComUsername(rawValue, { required = false } = {}) {
        const value = String(rawValue || '').trim();
        if (!value) {
            if (required) fail('MISSING_USERNAME');
            return null;
        }
        if (!/^[A-Za-z0-9_-]{3,25}$/.test(value)) fail('INVALID_USERNAME');
        return value.toLowerCase();
    }

    function parseLichessPath(pathname) {
        const segments = pathname.split('/').filter(Boolean);
        let rawId = null;

        if (segments.length >= 1 && segments.length <= 2) {
            rawId = segments[0];
            if (segments[1] && !/^(?:white|black)$/i.test(segments[1])) fail('MALFORMED_GAME_ID');
        } else if (segments.length === 3 && segments[0] === 'game' && segments[1] === 'export') {
            rawId = segments[2];
        } else {
            fail('MALFORMED_GAME_ID');
        }

        if (!/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{4})?$/.test(rawId || '')) fail('MALFORMED_GAME_ID');
        return rawId.slice(0, 8);
    }

    function parseChessComPath(pathname) {
        const segments = pathname.split('/').filter(Boolean);
        if (segments[0] === 'analysis') segments.shift();
        if (segments[0] !== 'game' || !/^(?:live|daily)$/.test(segments[1] || '')) {
            fail('MALFORMED_GAME_ID');
        }
        const id = segments[2] || '';
        const suffix = segments.slice(3);
        if (!/^\d{5,20}$/.test(id) || suffix.some(segment => segment !== 'analysis')) {
            fail('MALFORMED_GAME_ID');
        }
        return { id, gameType: segments[1] };
    }

    function parse(rawValue) {
        let url;
        try {
            url = new URL(normalizeInput(rawValue));
        } catch (error) {
            if (error instanceof GameImportError) throw error;
            fail('INVALID_URL', error);
        }

        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) fail('INVALID_URL');
        const hostname = url.hostname.toLowerCase();

        if (LICHESS_HOSTS.has(hostname)) {
            const id = parseLichessPath(url.pathname);
            return Object.freeze({
                provider: 'lichess',
                id,
                normalizedUrl: `https://lichess.org/${id}`,
                supported: true
            });
        }

        if (CHESS_COM_HOSTS.has(hostname)) {
            const { id, gameType } = parseChessComPath(url.pathname);
            const suppliedUsernames = url.searchParams.getAll('username');
            if (suppliedUsernames.length > 1) fail('INVALID_USERNAME');
            const username = normalizeChessComUsername(suppliedUsernames[0]);
            const query = username ? `?username=${encodeURIComponent(username)}` : '';
            return Object.freeze({
                provider: 'chess.com',
                id,
                gameType,
                username,
                normalizedUrl: `https://www.chess.com/game/${gameType}/${id}${query}`,
                supported: true
            });
        }

        fail('UNSUPPORTED_DOMAIN');
    }

    function getMessage(error) {
        return MESSAGES[error?.code] || MESSAGES.PROVIDER_UNAVAILABLE;
    }

    function isAbort(error, signal) {
        return Boolean(signal?.aborted || error?.name === 'AbortError');
    }

    async function fetchResponse(endpoint, options, fetchImpl, signal) {
        try {
            return await fetchImpl(endpoint, { ...options, signal });
        } catch (error) {
            if (isAbort(error, signal)) fail('ABORTED', error);
            fail('NETWORK_ERROR', error);
        }
    }

    async function readJson(response, signal) {
        try {
            return await response.json();
        } catch (error) {
            if (isAbort(error, signal)) fail('ABORTED', error);
            fail('PROVIDER_UNAVAILABLE', error);
        }
    }

    function getTrustedChessComArchiveUrl(value, username) {
        try {
            const url = new URL(String(value || ''));
            const segments = url.pathname.split('/').filter(Boolean);
            const archiveUser = decodeURIComponent(segments[2] || '').toLowerCase();
            const month = Number(segments[5]);
            if (url.protocol !== 'https:' || url.hostname !== CHESS_COM_API_HOST || url.port
                || url.username || url.password || url.search || url.hash
                || segments.length !== 6 || segments[0] !== 'pub' || segments[1] !== 'player'
                || archiveUser !== username || segments[3] !== 'games'
                || !/^\d{4}$/.test(segments[4] || '') || !/^\d{2}$/.test(segments[5] || '')
                || month < 1 || month > 12) return null;
            return `https://${CHESS_COM_API_HOST}/pub/player/${encodeURIComponent(username)}/games/${segments[4]}/${segments[5]}`;
        } catch (_error) {
            return null;
        }
    }

    function getChessComRecordId(value, expectedType) {
        try {
            const url = new URL(String(value || ''));
            if (url.protocol !== 'https:' || !CHESS_COM_HOSTS.has(url.hostname.toLowerCase())
                || url.username || url.password || url.port) return null;
            const { id, gameType } = parseChessComPath(url.pathname);
            return gameType === expectedType ? id : null;
        } catch (_error) {
            return null;
        }
    }

    async function getChessComArchives(username, fetchImpl, signal, counter) {
        const cached = chessComArchiveCache.get(username);
        if (cached) return cached;

        const endpoint = `https://${CHESS_COM_API_HOST}/pub/player/${encodeURIComponent(username)}/games/archives`;
        counter.count += 1;
        const response = await fetchResponse(endpoint, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        }, fetchImpl, signal);

        if (response.status === 404 || response.status === 410) fail('USERNAME_NOT_FOUND');
        if (response.status === 429) fail('CHESSCOM_RATE_LIMITED');
        if (!response.ok) fail('PROVIDER_UNAVAILABLE');

        const payload = await readJson(response, signal);
        if (!Array.isArray(payload?.archives)) fail('PROVIDER_UNAVAILABLE');
        const archives = payload.archives
            .map(value => getTrustedChessComArchiveUrl(value, username))
            .filter(Boolean)
            .sort((left, right) => right.localeCompare(left));
        const cachedArchives = Object.freeze(archives);
        chessComArchiveCache.set(username, cachedArchives);
        return cachedArchives;
    }

    async function resolveChessCom(parsed, { fetchImpl, username: usernameOverride, signal, onProgress }) {
        const username = normalizeChessComUsername(parsed.username || usernameOverride, { required: true });
        const counter = { count: 0 };
        const archives = await getChessComArchives(username, fetchImpl, signal, counter);

        for (let index = 0; index < archives.length; index += 1) {
            if (signal?.aborted) fail('ABORTED');
            const endpoint = archives[index];
            counter.count += 1;
            try {
                onProgress?.(Object.freeze({ checked: index, total: archives.length, requestCount: counter.count }));
            } catch (_error) {
                // Presentation callbacks cannot own or interrupt provider resolution.
            }
            const response = await fetchResponse(endpoint, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            }, fetchImpl, signal);

            if (response.status === 404 || response.status === 410) fail('GAME_UNAVAILABLE');
            if (response.status === 429) fail('CHESSCOM_RATE_LIMITED');
            if (!response.ok) fail('PROVIDER_UNAVAILABLE');

            const payload = await readJson(response, signal);
            if (!Array.isArray(payload?.games)) fail('PROVIDER_UNAVAILABLE');
            const record = payload.games.find((candidate) => {
                const candidateId = getChessComRecordId(candidate?.url, parsed.gameType);
                if (candidateId !== parsed.id) return false;
                const white = String(candidate?.white?.username || '').toLowerCase();
                const black = String(candidate?.black?.username || '').toLowerCase();
                return white === username || black === username;
            });
            if (!record) continue;

            const pgn = String(record.pgn || '').trim();
            if (!pgn) fail('MISSING_PGN');
            if (pgn.length > MAX_PGN_BYTES) fail('INVALID_PGN_RESPONSE');
            const recordUrl = `https://www.chess.com/game/${parsed.gameType}/${parsed.id}`;
            return Object.freeze({
                ...parsed,
                username,
                normalizedUrl: `${recordUrl}?username=${encodeURIComponent(username)}`,
                source: 'Chess.com Game URL',
                pgn,
                white: record.white?.username || '',
                black: record.black?.username || '',
                result: /\[Result\s+"([^"]+)"\]/.exec(pgn)?.[1] || '',
                termination: /\[Termination\s+"([^"]+)"\]/.exec(pgn)?.[1] || '',
                recordId: parsed.id,
                matchedArchive: endpoint,
                matchedRecordUrl: record.url,
                requestCount: counter.count
            });
        }

        fail('GAME_NOT_FOUND');
    }

    async function resolveLichess(parsed, { fetchImpl, signal }) {
        const endpoint = `https://lichess.org/game/export/${encodeURIComponent(parsed.id)}?clocks=false&evals=false&literate=false`;
        const response = await fetchResponse(endpoint, {
            method: 'GET',
            headers: { Accept: 'application/x-chess-pgn' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        }, fetchImpl, signal);

        if (response.status === 404 || response.status === 410) fail('GAME_UNAVAILABLE');
        if (response.status === 429) fail('RATE_LIMITED');
        if (!response.ok) fail('PROVIDER_UNAVAILABLE');

        const contentLength = Number(response.headers?.get?.('content-length') || 0);
        if (contentLength > MAX_PGN_BYTES) fail('INVALID_PGN_RESPONSE');
        let pgn;
        try {
            pgn = String(await response.text()).trim();
        } catch (error) {
            if (isAbort(error, signal)) fail('ABORTED', error);
            fail('NETWORK_ERROR', error);
        }
        if (!pgn || pgn.length > MAX_PGN_BYTES) fail('INVALID_PGN_RESPONSE');

        return Object.freeze({
            ...parsed,
            source: 'Lichess Game URL',
            pgn
        });
    }

    async function resolve(rawValue, { fetchImpl = global.fetch, username = '', signal, onProgress } = {}) {
        const parsed = parse(rawValue);
        if (typeof fetchImpl !== 'function') fail('NETWORK_ERROR');
        if (parsed.provider === 'chess.com') {
            return resolveChessCom(parsed, { fetchImpl, username, signal, onProgress });
        }
        return resolveLichess(parsed, { fetchImpl, signal });
    }

    global.CaissaAnalyzeGameImport = Object.freeze({
        schemaVersion: VERSION,
        parse,
        resolve,
        getMessage,
        errors: Object.freeze({ ...MESSAGES })
    });
})(window);
