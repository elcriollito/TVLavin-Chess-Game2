(function installInsightsCore(global) {
    'use strict';
    const VERSION = '1.0.0';
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const LIMITS = Object.freeze({ games: 100, pgnBytes: 1048576, pliesPerGame: 1000, totalPlies: 10000, reportBytes: 2097152 });
    const normalizeName = name => String(name || '').normalize('NFKC').trim().toLowerCase();
    const bytes = text => new TextEncoder().encode(text).length;
    const normalizePGN = text => String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ').replace(/\0/g, '').trim();
    function splitPGN(text) {
        const sections = []; let lines = [], braces = 0, variations = 0, movetext = false;
        for (const line of normalizePGN(text).split('\n')) {
            const header = braces === 0 && variations === 0 && /^\s*\[\w+\s+"/.test(line);
            if (header && movetext) { sections.push(lines.join('\n')); lines = []; movetext = false; }
            lines.push(line);
            if (header) continue;
            let visible = '';
            for (const character of line) {
                if (character === ';' && !braces) break;
                if (character === '{') { braces++; continue; }
                if (character === '}') { braces = Math.max(0, braces - 1); continue; }
                if (braces) continue;
                if (character === '(') { variations++; continue; }
                if (character === ')') { variations = Math.max(0, variations - 1); continue; }
                if (!variations) visible += character;
            }
            if (visible.trim()) movetext = true;
        }
        if (lines.join('\n').trim()) sections.push(lines.join('\n'));
        return sections;
    }
    function load(chess, pgn) {
        if (chess.loadPgn) { chess.loadPgn(pgn, { strict: true }); return true; }
        return chess.load_pgn(pgn) === true;
    }
    function headersOf(pgn) {
        const headers = {};
        const names = { Event: 'event', Site: 'site', Date: 'date', White: 'white', Black: 'black', Result: 'result',
            ECO: 'eco', ECOUrl: 'ecoUrl', Opening: 'opening', Variation: 'variation', WhiteElo: 'whiteElo', BlackElo: 'blackElo',
            Termination: 'termination', TimeControl: 'timeControl', Variant: 'variant', FEN: 'fen', SetUp: 'setUp',
            UTCDate: 'utcDate', UTCTime: 'utcTime', StartTime: 'startTime', EndDate: 'endDate', EndTime: 'endTime' };
        for (const match of pgn.matchAll(/^\s*\[(\w+)\s+"((?:\\.|[^"\\])*)"\]/gm)) {
            if (names[match[1]]) headers[names[match[1]]] = match[2].replace(/\\(["\\])/g, '$1');
        }
        return headers;
    }
    function resultFor(game) {
        if (!['w', 'b'].includes(game.userColor)) return 'unidentified';
        if (game.outcome === 'draw') return 'draw';
        if (game.outcome === 'unknown') return 'unfinished';
        return ((game.outcome === 'white-win') === (game.userColor === 'w')) ? 'win' : 'loss';
    }
    function statistics(games) {
        const stats = { total: games.length, wins: 0, losses: 0, draws: 0, unfinished: 0, unidentified: 0,
            avgPlyCount: games.length ? Math.round(games.reduce((n, g) => n + g.plyCount, 0) / games.length) : 0, openings: {} };
        const key = { win: 'wins', loss: 'losses', draw: 'draws', unfinished: 'unfinished', unidentified: 'unidentified' };
        for (const game of games) {
            stats[key[resultFor(game)]]++;
            if (/^[A-E]\d{2}$/.test(game.headers.eco || '')) stats.openings[game.headers.eco] = (stats.openings[game.headers.eco] || 0) + 1;
        }
        stats.identified = stats.total - stats.unidentified;
        stats.completed = stats.wins + stats.losses + stats.draws;
        return stats;
    }
    function parse(pgnText, options = {}, Chess = global.Chess) {
        if (bytes(String(pgnText || '')) > LIMITS.pgnBytes) throw new Error('PGN exceeds the 1 MiB limit.');
        const rawText = normalizePGN(pgnText);
        if (bytes(rawText) > LIMITS.pgnBytes) throw new Error('PGN exceeds the 1 MiB limit.');
        const sections = splitPGN(rawText);
        if (sections.length > LIMITS.games) throw new Error('Import at most 100 games per dataset.');
        if (typeof Chess !== 'function') throw new Error('Chess rules are unavailable.');
        const subject = { provider: options.provider || 'local', username: String(options.username || '').trim(), linkStatus: 'unverified' };
        const target = normalizeName(subject.username);
        const games = [], rejected = [], seen = new Set();
        sections.forEach((section, sourceIndex) => {
            const pgn = section.trim(), headers = headersOf(pgn);
            try {
                if (headers.variant && !['standard', 'chess'].includes(normalizeName(headers.variant))) throw new Error('Unsupported variant');
                if (headers.setUp === '1' && !headers.fen) throw new Error('Missing starting FEN');
                const chess = new Chess();
                if (!load(chess, pgn)) throw new Error('Illegal PGN moves');
                const moves = chess.history();
                if (!moves.length) throw new Error('No replayable moves');
                if (moves.length > LIMITS.pliesPerGame) throw new Error('More than 1000 plies');
                const finalResult = pgn.replace(/\{[^}]*\}/gs, '').trim().match(/(1-0|0-1|1\/2-1\/2|\*)\s*$/)?.[1];
                if (finalResult && headers.result && finalResult !== headers.result) throw new Error('Conflicting results');
                headers.result = headers.result || finalResult || '*';
                if (!['1-0', '0-1', '1/2-1/2', '*'].includes(headers.result)) throw new Error('Invalid result');
                const white = target && normalizeName(headers.white) === target;
                const black = target && normalizeName(headers.black) === target;
                const userColor = white !== black ? (white ? 'w' : 'b') : 'unknown';
                const imported = options.importedGames?.[sourceIndex] || {};
                const sourceId = typeof imported.id === 'string' ? imported.id : null;
                if (sourceId && subject.provider !== 'local') {
                    if (seen.has(sourceId)) { rejected.push({ sourceIndex, reason: 'Duplicate provider ID' }); return; }
                    seen.add(sourceId);
                }
                while (chess.undo()) { /* Preserve the actual PGN starting position. */ }
                const game = { id: sourceId ? `${subject.provider}:${sourceId}` : `local:${sourceIndex}`,
                    sourceIndex, sourceId, source: subject.provider, playedAt: imported.playedAt || null,
                    timeControl: imported.timeControl || headers.timeControl || null,
                    headers: { ...headers, pgn }, moves, plyCount: moves.length, startingFen: chess.fen(), userColor,
                    identityStatus: !target ? 'missing' : white && black ? 'ambiguous' : userColor === 'unknown' ? 'not_present' : 'resolved',
                    outcome: headers.result === '1-0' ? 'white-win' : headers.result === '0-1' ? 'black-win' : headers.result === '1/2-1/2' ? 'draw' : 'unknown' };
                game.resultForTarget = resultFor(game);
                games.push(game);
            } catch (error) { rejected.push({ sourceIndex, reason: error.message || 'Invalid PGN' }); }
        });
        if (games.reduce((total, game) => total + game.plyCount, 0) > LIMITS.totalPlies) throw new Error('Dataset exceeds the 10000 ply limit. Split it into smaller imports.');
        return { schemaVersion: VERSION, subject, games, stats: statistics(games), rawText, rejected,
            importMetadata: (options.importedGames || []).map(g => ({ id: g.id || null, playedAt: g.playedAt || null, timeControl: g.timeControl || null })) };
    }
    function selectGames(dataset, count, color) {
        if (!Number.isInteger(count) || count < 1 || count > 50 || !['both', 'white', 'black'].includes(color)) throw new Error('Invalid report configuration');
        return dataset.games.filter(g => ['w', 'b'].includes(g.userColor) && (color === 'both' || g.userColor === (color === 'white' ? 'w' : 'b'))).slice(0, count);
    }
    function replay(game, Chess = global.Chess) {
        const chess = new Chess(game.startingFen || START_FEN), positions = [chess.fen()], moves = [];
        for (const san of game.moves) {
            const before = chess.fen(), move = chess.move(san);
            if (!move) throw new Error('Replay failed');
            moves.push({ ...move, before, after: chess.fen(), ply: moves.length }); positions.push(chess.fen());
        }
        return { moves, positions };
    }
    function phase(fen) {
        const pieces = fen.split(' ')[0].replace(/[\d/]/g, ''), values = { n: 3, b: 3, r: 5, q: 9 };
        const material = Array.from(pieces).reduce((n, p) => n + (values[p.toLowerCase()] || 0), 0);
        if (pieces.length <= 10 || material <= 13) return 'endgame';
        return Number(fen.split(' ')[5]) <= 15 ? 'opening' : 'middlegame';
    }
    function loss(before, after, color) {
        if (before?.status !== 'complete' || after?.status !== 'complete') return null;
        const ownWinner = score => score.winner || (Number.isFinite(score.mate) && score.mate !== 0 ? (score.mate > 0 ? 'w' : 'b') : null);
        const beforeWinner = ownWinner(before), afterWinner = ownWinner(after);
        if (beforeWinner || afterWinner) {
            const transition = beforeWinner === color && afterWinner !== color ? 'lost_forced_mate'
                : afterWinner && afterWinner !== color && beforeWinner !== afterWinner ? 'allowed_forced_mate' : null;
            return { cp: null, mateTransition: transition };
        }
        if (!Number.isFinite(before.cp) || !Number.isFinite(after.cp)) return null;
        return { cp: Math.max(0, (before.cp - after.cp) * (color === 'w' ? 1 : -1)), mateTransition: null };
    }
    function terminal(fen, Chess = global.Chess) {
        const chess = new Chess(fen);
        if ((chess.isCheckmate || chess.in_checkmate).call(chess)) return { status: 'complete', cp: null, mate: 0,
            winner: chess.turn() === 'w' ? 'b' : 'w', terminal: true, depth: null, nodes: 0, pv: [], bestMove: null };
        // Repetition cannot be inferred from an isolated FEN.
        if ((chess.isStalemate || chess.in_stalemate).call(chess) || (chess.isInsufficientMaterial || chess.insufficient_material).call(chess)) {
            return { status: 'complete', cp: 0, mate: null, winner: null, terminal: true, depth: null, nodes: 0, pv: [], bestMove: null };
        }
        return null;
    }
    function aggregate(games, analyses) {
        const stats = statistics(games), phaseCoverage = {};
        for (const p of ['opening', 'middlegame', 'endgame']) phaseCoverage[p] = { eligible: 0, evaluated: 0, critical: 0 };
        const moments = [], total = { eligible: 0, evaluated: 0 };
        for (const analysis of analyses) {
            total.eligible += analysis.eligible; total.evaluated += analysis.evaluated;
            moments.push(...analysis.moments);
            for (const p of Object.keys(phaseCoverage)) for (const k of ['eligible', 'evaluated', 'critical']) phaseCoverage[p][k] += analysis.phases[p][k];
        }
        return { wld: { wins: stats.wins, losses: stats.losses, draws: stats.draws }, completedGames: stats.completed,
            unfinishedGames: stats.unfinished, gamesCount: games.length, totalMoments: moments.length, coverage: total, phaseCoverage,
            winRate: stats.completed ? stats.wins / stats.completed : null,
            avgMomentsPerGame: total.evaluated ? moments.length / games.length : null,
            topPatterns: [], phaseStats: Object.fromEntries(Object.entries(phaseCoverage).map(([p, v]) => [p, v.critical])) };
    }
    global.CaissaInsightsCore = Object.freeze({ VERSION, LIMITS, START_FEN, normalizeName, normalizePGN, splitPGN, headersOf, parse, statistics, resultFor, selectGames, replay, phase, loss, terminal, aggregate, bytes });
})(typeof window !== 'undefined' ? window : globalThis);
