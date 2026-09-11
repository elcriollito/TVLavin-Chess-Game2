(function installFicsPlayersProtocol(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const BORDER = /^\+-{76}\+$/;
    const HEADER = /^\|\s+User\s+Standard\s+Blitz\s+Lightning\s+On for\s+Idle\s+\|$/;
    const BLANK_ROW = /^\|\s{76}\|$/;
    const FOOTER = /^\|\s+(\d+)\s+Players Displayed\s+\|$/;
    const TERSE_FOOTER = /\bplayers displayed \(of \d+\)/i;
    const DOCUMENTED_CODES = new Set(['*', 'B', 'C', 'T', 'U', 'CA', 'SR', 'TD', 'TM', 'FM', 'IM', 'GM', 'WIM', 'WGM']);
    const MAX_RESPONSE_BYTES = 256 * 1024;
    const MAX_PLAYERS = 5000;

    function createResponseParser() {
        return {
            phase: 'AWAIT_BORDER',
            buffer: '',
            receivedBytes: 0,
            entries: [],
            footerCount: null,
            complete: false,
            error: null
        };
    }

    function normalizeLine(line) {
        return String(line ?? '').replace(/\r/g, '').trim();
    }

    function fail(parser, code) {
        parser.error = code;
        return Object.freeze({ status: 'error', code });
    }

    function parseRating(token) {
        if (token === '----') {
            return { value: null, state: 'registered-unrated', marker: null };
        }
        if (token === '++++') {
            return { value: null, state: 'unregistered', marker: null };
        }
        const match = String(token).match(/^(\d{3,4})([PE])?$/);
        if (!match) return null;
        return {
            value: Number(match[1]),
            state: match[2] === 'P' ? 'provisional' : match[2] === 'E' ? 'estimated' : 'established',
            marker: match[2] || null
        };
    }

    function parseIdentity(token) {
        if (String(token).length > 19) return null;
        const match = String(token).match(/^([A-Za-z][A-Za-z0-9]{0,16})(.*)$/);
        if (!match) return null;
        const handle = match[1];
        let suffix = match[2];
        const codes = [];
        let unknown = false;
        while (suffix) {
            const codeMatch = suffix.match(/^\(([^()]*)\)/);
            if (!codeMatch) {
                unknown = true;
                break;
            }
            if (DOCUMENTED_CODES.has(codeMatch[1])) codes.push(codeMatch[1]);
            else unknown = true;
            suffix = suffix.slice(codeMatch[0].length);
        }
        return {
            handle,
            codes,
            annotationsComplete: suffix.length === 0,
            annotationsUnknown: unknown
        };
    }

    function parseFlags(field) {
        if (field.length !== 7 || field[3] !== ' ') return null;
        const gameText = field.slice(0, 3).trim();
        if (gameText && !/^\d{1,3}$/.test(gameText)) return null;
        if (![' ', 'X'].includes(field[4])) return null;
        if (![' ', 'u', 'U'].includes(field[5])) return null;
        if (![' ', 'o'].includes(field[6])) return null;
        const gameNumber = gameText ? Number(gameText) : null;
        const open = field[4] !== 'X';
        return {
            gameNumber,
            playing: gameNumber !== null,
            open,
            available: open && gameNumber === null,
            unratedOnly: field[5] === 'u',
            registered: field[5] !== 'U',
            observing: field[6] === 'o'
        };
    }

    function parsePlayerRow(line, serverOrder) {
        const normalized = normalizeLine(line);
        if (!normalized.startsWith('|') || !normalized.endsWith('|')) return null;
        const body = normalized.slice(1, -1);
        if (body.length < 76 || body[7] !== ' ') return null;
        const flags = parseFlags(body.slice(0, 7));
        if (!flags) return null;
        const tokens = body.slice(8).trim().split(/\s+/);
        if (tokens.length !== 5 && tokens.length !== 6) return null;
        const [identityToken, standardToken, blitzToken, lightningToken, onFor, idle = null] = tokens;
        const identity = parseIdentity(identityToken);
        const standard = parseRating(standardToken);
        const blitz = parseRating(blitzToken);
        const lightning = parseRating(lightningToken);
        if (!identity || !standard || !blitz || !lightning || !/^\d{1,6}(?::\d{2})?$/.test(onFor)
            || (idle !== null && !/^\d{1,6}(?::\d{2})?$/.test(idle))) return null;
        const ratings = [standard, blitz, lightning];
        const unregisteredRatings = ratings.filter((rating) => rating.state === 'unregistered').length;
        if ((flags.registered && unregisteredRatings) || (!flags.registered && unregisteredRatings !== 3)) return null;
        return {
            handle: identity.handle,
            ratings: { standard, blitz, lightning },
            onFor,
            idle,
            gameNumber: flags.gameNumber,
            playing: flags.playing,
            open: flags.open,
            available: flags.available,
            unratedOnly: flags.unratedOnly,
            registered: flags.registered,
            observing: flags.observing,
            codes: identity.codes,
            annotationsComplete: identity.annotationsComplete,
            annotationsUnknown: identity.annotationsUnknown,
            serverOrder
        };
    }

    function processLine(parser, rawLine) {
        const line = normalizeLine(rawLine);
        if (parser.error) return Object.freeze({ status: 'error', code: parser.error });
        if (parser.complete) return Object.freeze({ status: 'complete', entries: parser.entries, count: parser.footerCount });

        if (parser.phase === 'AWAIT_BORDER') {
            if (!line || line === 'fics%') return Object.freeze({ status: 'pending' });
            if (TERSE_FOOTER.test(line) || /^\d{1,4}[ PE.+:^~#&]/.test(line)) {
                return fail(parser, 'UNEXPECTED_RESPONSE_FAMILY');
            }
            if (BORDER.test(line)) parser.phase = 'AWAIT_HEADER';
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_HEADER') {
            if (!HEADER.test(line)) return fail(parser, 'MALFORMED_VERBOSE_HEADER');
            parser.phase = 'AWAIT_DIVIDER';
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_DIVIDER') {
            if (!BORDER.test(line)) return fail(parser, 'MALFORMED_VERBOSE_DIVIDER');
            parser.phase = 'AWAIT_ROWS';
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_ROWS') {
            if (BLANK_ROW.test(line)) {
                parser.phase = 'AWAIT_FOOTER';
                return Object.freeze({ status: 'pending' });
            }
            const player = parsePlayerRow(line, parser.entries.length);
            if (!player) return fail(parser, 'MALFORMED_PLAYER_ROW');
            parser.entries.push(player);
            if (parser.entries.length > MAX_PLAYERS) return fail(parser, 'PLAYER_LIMIT_EXCEEDED');
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_FOOTER') {
            const footer = line.match(FOOTER);
            if (!footer) return fail(parser, 'MALFORMED_PLAYER_FOOTER');
            parser.footerCount = Number(footer[1]);
            if (parser.footerCount !== parser.entries.length) return fail(parser, 'PLAYER_COUNT_MISMATCH');
            parser.phase = 'AWAIT_CLOSING_BORDER';
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_CLOSING_BORDER') {
            if (!BORDER.test(line)) return fail(parser, 'MALFORMED_VERBOSE_CLOSING_BORDER');
            parser.phase = 'AWAIT_PROMPT';
            return Object.freeze({ status: 'pending' });
        }
        if (parser.phase === 'AWAIT_PROMPT') {
            if (!line) return Object.freeze({ status: 'pending' });
            if (line !== 'fics%') return fail(parser, 'MISSING_FOLLOWING_PROMPT');
            parser.complete = true;
            return Object.freeze({ status: 'complete', entries: parser.entries, count: parser.footerCount });
        }
        return fail(parser, 'INVALID_PARSER_STATE');
    }

    function push(parser, text, { lineFramed = false } = {}) {
        if (!parser || typeof parser !== 'object') return Object.freeze({ status: 'error', code: 'PARSER_REQUIRED' });
        if (parser.error || parser.complete) return processLine(parser, '');
        const chunk = String(text ?? '').replace(/\r/g, '');
        parser.receivedBytes = Number(parser.receivedBytes || 0) + chunk.length + (lineFramed ? 1 : 0);
        if (parser.receivedBytes > MAX_RESPONSE_BYTES) return fail(parser, 'PLAYER_RESPONSE_TOO_LARGE');
        parser.buffer += chunk;
        if (lineFramed) parser.buffer += '\n';
        const lines = parser.buffer.split('\n');
        parser.buffer = lines.pop() || '';
        let result = Object.freeze({ status: 'pending' });
        for (const line of lines) {
            result = processLine(parser, line);
            if (result.status !== 'pending') return result;
        }
        if (parser.phase === 'AWAIT_PROMPT' && normalizeLine(parser.buffer) === 'fics%') {
            parser.buffer = '';
            return processLine(parser, 'fics%');
        }
        return result;
    }

    root.CaissaFICSPlayersProtocol = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        createResponseParser,
        parsePlayerRow,
        parseRating,
        push
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
