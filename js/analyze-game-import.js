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

    const VERSION = '1.0.0';
    const MAX_URL_LENGTH = 2048;
    const MAX_PGN_BYTES = 1024 * 1024;
    const LICHESS_HOSTS = new Set(['lichess.org', 'www.lichess.org']);
    const CHESS_COM_HOSTS = new Set(['chess.com', 'www.chess.com']);

    const MESSAGES = Object.freeze({
        EMPTY_URL: 'Paste a public Lichess or Chess.com game URL.',
        INVALID_URL: 'Enter a valid public game URL.',
        UNSUPPORTED_DOMAIN: 'Only public Lichess and Chess.com game links are supported.',
        MALFORMED_GAME_ID: 'That game link does not contain a valid game ID.',
        CHESSCOM_DIRECT_UNAVAILABLE: 'Chess.com does not provide a public game-ID lookup. Use the Chess.com player tab instead.',
        GAME_UNAVAILABLE: 'That game is private, deleted, or unavailable.',
        RATE_LIMITED: 'The game service is busy. Please wait one minute and try again.',
        PROVIDER_UNAVAILABLE: 'The game service is temporarily unavailable.',
        INVALID_PGN_RESPONSE: 'The game service returned an invalid game record.',
        NETWORK_ERROR: 'Could not reach the game service. Check your connection and try again.'
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
            return Object.freeze({
                provider: 'chess.com',
                id,
                gameType,
                normalizedUrl: `https://www.chess.com/game/${gameType}/${id}`,
                supported: false
            });
        }

        fail('UNSUPPORTED_DOMAIN');
    }

    function getMessage(error) {
        return MESSAGES[error?.code] || MESSAGES.PROVIDER_UNAVAILABLE;
    }

    async function resolve(rawValue, { fetchImpl = global.fetch } = {}) {
        const parsed = parse(rawValue);
        if (parsed.provider === 'chess.com') fail('CHESSCOM_DIRECT_UNAVAILABLE');
        if (typeof fetchImpl !== 'function') fail('NETWORK_ERROR');

        const endpoint = `https://lichess.org/game/export/${encodeURIComponent(parsed.id)}?clocks=false&evals=false&literate=false`;
        let response;
        try {
            response = await fetchImpl(endpoint, {
                method: 'GET',
                headers: { Accept: 'application/x-chess-pgn' },
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            });
        } catch (error) {
            fail('NETWORK_ERROR', error);
        }

        if (response.status === 404 || response.status === 410) fail('GAME_UNAVAILABLE');
        if (response.status === 429) fail('RATE_LIMITED');
        if (!response.ok) fail('PROVIDER_UNAVAILABLE');

        const contentLength = Number(response.headers?.get?.('content-length') || 0);
        if (contentLength > MAX_PGN_BYTES) fail('INVALID_PGN_RESPONSE');
        let pgn;
        try {
            pgn = String(await response.text()).trim();
        } catch (error) {
            fail('NETWORK_ERROR', error);
        }
        if (!pgn || pgn.length > MAX_PGN_BYTES) fail('INVALID_PGN_RESPONSE');

        return Object.freeze({
            ...parsed,
            source: 'Lichess Game URL',
            pgn
        });
    }

    global.CaissaAnalyzeGameImport = Object.freeze({
        schemaVersion: VERSION,
        parse,
        resolve,
        getMessage,
        errors: Object.freeze({ ...MESSAGES })
    });
})(window);
