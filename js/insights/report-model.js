(function installInsightReportModel(global) {
    'use strict';
    const VERSION = '1.0.0';
    const PHASES = ['opening', 'middlegame', 'endgame'];
    const core = () => global.CaissaInsightsCore;
    const mean = list => list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null;
    const rating = value => /^\d{2,4}$/.test(String(value || '')) && +value > 0 && +value <= 4000 ? +value : null;
    function timeType(game) {
        const value = String(game.timeControl || game.headers.timeControl || '').toLowerCase();
        if (['bullet', 'blitz', 'rapid', 'classical', 'daily', 'correspondence'].includes(value)) return value === 'correspondence' ? 'daily' : value;
        const header = String(game.headers.timeControl || value);
        if (/^\d+\/\d+(?::|$)/.test(header)) return 'classical';
        const match = header.match(/^(\d+)(?:\+(\d+))?$/);
        if (!match) return 'unknown';
        const base = +match[1], duration = base + 40 * +(match[2] || 0);
        return base >= 86400 ? 'daily' : duration < 180 ? 'bullet' : duration < 600 ? 'blitz' : duration < 1800 ? 'rapid' : 'classical';
    }
    function dateStamp(date, time = '00:00:00') {
        if (!/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(date || '') || !/^\d{2}:\d{2}:\d{2}$/.test(time || '')) return null;
        const iso = `${date.replaceAll('.', '-')}T${time}Z`, number = Date.parse(iso);
        return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === iso.slice(0, 10) ? number : null;
    }
    function playedAt(game) {
        return dateStamp(game.headers.utcDate || game.headers.date, game.headers.utcTime || game.headers.startTime || '00:00:00')
            ?? (game.playedAt && Number.isFinite(Date.parse(game.playedAt)) ? Date.parse(game.playedAt) : null);
    }
    function flags(move) { return String(move.flags || ''); }
    function checked(chess) { return (chess.isCheck || chess.in_check).call(chess); }
    function queenCount(fen, color) { return Array.from(fen.split(' ')[0]).filter(p => p === (color === 'w' ? 'Q' : 'q')).length; }
    function features(game, Chess) {
        const replay = core().replay(game, Chess), chess = new Chess(game.startingFen), captured = { w: 0, b: 0 };
        const castling = { w: game.startingFen === core().START_FEN ? 'none' : 'unknown', b: game.startingFen === core().START_FEN ? 'none' : 'unknown' };
        let queenTrade = queenCount(game.startingFen, 'w') === 1 && queenCount(game.startingFen, 'b') === 1 ? 'without' : 'unknown';
        let forcing = 0, ownMoves = 0;
        for (const move of replay.moves) {
            chess.move(move.san);
            if (move.captured === 'q') captured[move.color]++;
            if (flags(move).includes('k')) castling[move.color] = 'kingside';
            if (flags(move).includes('q')) castling[move.color] = 'queenside';
            if (queenTrade !== 'unknown' && captured.w && captured.b && !queenCount(move.after, 'w') && !queenCount(move.after, 'b')) queenTrade = 'with';
            if (move.color === game.userColor) { ownMoves++; if (move.captured || move.promotion || /[+#]/.test(move.san)) forcing++; }
        }
        const outcome = core().resultFor(game), text = String(game.headers.termination || '').toLowerCase();
        let termination = 'Not recorded';
        const call = (...names) => { const method = names.find(name => typeof chess[name] === 'function'); return method ? chess[method]() : false; };
        if (['win', 'loss'].includes(outcome)) {
            const winner = chess.turn() === 'w' ? 'b' : 'w';
            if (call('isCheckmate', 'in_checkmate') && (game.outcome === 'white-win') === (winner === 'w')) termination = 'Checkmate';
            else if (/resign/.test(text)) termination = 'Resignation';
            else if (/time|flag/.test(text)) termination = 'Time';
            else if (/abandon|disconnect/.test(text)) termination = 'Abandoned';
        } else if (outcome === 'draw') {
            if (call('isStalemate', 'in_stalemate')) termination = 'Stalemate';
            else if (call('isInsufficientMaterial', 'insufficient_material')) termination = 'Insufficient material';
            else if (/agreement|agreed/.test(text)) termination = 'Agreement';
            else if (/repetition/.test(text) || call('isThreefoldRepetition', 'in_threefold_repetition')) termination = 'Repetition';
            else if (/50.move|fifty/.test(text)) termination = '50-move rule';
            else if (/time/.test(text)) termination = 'Time';
        }
        return { replay, queenTrade, yourCastling: castling[game.userColor], opponentCastling: castling[game.userColor === 'w' ? 'b' : 'w'], termination, forcing, ownMoves };
    }
    function openingName(game, catalog = [], Chess = global.Chess) {
        if (game.headers.opening) return game.headers.opening;
        try {
            const url = new URL(game.headers.ecoUrl || '');
            if (url.protocol === 'https:' && ['www.chess.com', 'chess.com'].includes(url.hostname) && url.pathname.startsWith('/openings/')) {
                const name = decodeURIComponent(url.pathname.slice(10)).replace(/-\d.*$/, '').replaceAll('-', ' ').trim();
                if (name && name.length <= 200 && !name.includes('/')) return name;
            }
        } catch (_) { /* Missing opening metadata remains unavailable. */ }
        if (game.startingFen === core().START_FEN && catalog.length && global.CaissaEcoOpeningResolver) {
            const resolved = global.CaissaEcoOpeningResolver.resolve(game.moves, catalog, { ChessConstructor: Chess });
            if (resolved.status === 'recognized') return resolved.name;
        }
        return /^[A-E]\d{2}$/.test(game.headers.eco || '') ? `ECO ${game.headers.eco}` : 'Opening not recorded';
    }
    function rows(dataset, report, Chess = global.Chess, catalog = []) {
        const selected = report ? new Set(report.selectedGames.map(g => g.id)) : null;
        return dataset.games.filter(game => ['w', 'b'].includes(game.userColor) && (!selected || selected.has(game.id))).map(game => {
            const f = features(game, Chess), opponent = game.userColor === 'w' ? 'black' : 'white';
            return { game, ...f, outcome: core().resultFor(game), color: game.userColor === 'w' ? 'white' : 'black', timeType: timeType(game),
                source: game.source || dataset.subject.provider, date: playedAt(game),
                rating: rating(game.headers[game.userColor === 'w' ? 'whiteElo' : 'blackElo']), opponentRating: rating(game.headers[`${opponent}Elo`]),
                opponent: game.headers[opponent] || 'Opponent',
                opening: openingName(game, catalog, Chess), eco: game.headers.eco || null };
        });
    }
    function filter(rows, options = {}) {
        return rows.filter(row => ['timeType', 'color', 'queenTrade', 'yourCastling', 'opponentCastling'].every(key => !options[key] || options[key] === 'all' || options[key] === row[key]));
    }
    function results(rows) {
        const value = { wins: 0, draws: 0, losses: 0, unfinished: 0, total: rows.length };
        for (const row of rows) value[{ win: 'wins', draw: 'draws', loss: 'losses' }[row.outcome] || 'unfinished']++;
        value.completed = value.wins + value.draws + value.losses;
        value.points = value.wins + value.draws / 2;
        value.pointsPerGame = value.completed ? value.points / value.completed : null;
        value.winRate = value.completed ? value.wins / value.completed : null;
        return value;
    }
    function group(rows, key) {
        const groups = new Map();
        for (const row of rows) { const name = typeof key === 'function' ? key(row) : row[key]; if (name == null) continue; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(row); }
        return Array.from(groups, ([name, members]) => ({ name, rows: members, ...results(members) }));
    }
    function numberedMove(fen, san) { const parts = fen.split(' '); return `${parts[5]}${parts[1] === 'w' ? '.' : '...'} ${san}`; }
    function principalLine(fen, uciMoves, Chess = global.Chess, limit = 4) {
        const chess = new Chess(fen), line = [];
        for (const uci of (uciMoves || []).slice(0, limit)) {
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
            try {
                const before = chess.fen(), move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
                if (!move) break; line.push({ ...move, text: numberedMove(before, move.san) });
            } catch (_) { break; }
        }
        return line;
    }
    const positionLabel = cp => cp == null ? 'an unclear position' : cp >= 150 ? 'an advantage' : cp <= -150 ? 'a difficult position' : 'a roughly balanced position';
    function review(rows, report, Chess = global.Chess) {
        const samples = [], moments = [], phases = Object.fromEntries(PHASES.map(p => [p, { eligible: 0, reviewed: 0, steady: 0, losses: [] }]));
        const byId = new Map((report?.analyses || []).map(a => [a.gameId, a]));
        for (const row of rows) {
            const analysis = byId.get(row.game.id);
            for (const move of row.replay.moves) {
                if (move.color !== row.game.userColor) continue;
                const phase = core().phase(move.before); phases[phase].eligible++;
                const before = analysis?.evaluations?.[move.ply], after = analysis?.evaluations?.[move.ply + 1], loss = core().loss(before, after, move.color);
                if (!loss) continue;
                const steady = !loss.mateTransition && (loss.cp === null || loss.cp < 120), chess = new Chess(move.before);
                const ownCp = Number.isFinite(before.cp) ? before.cp * (move.color === 'w' ? 1 : -1) : null;
                const sample = { row, move, phase, before, after, loss, steady, forcing: !!(move.captured || move.promotion || /[+#]/.test(move.san)),
                    defense: checked(chess) || (ownCp != null && ownCp <= -100), checking: /[+#]/.test(move.san) };
                samples.push(sample); phases[phase].reviewed++; if (steady) phases[phase].steady++; if (loss.cp != null) phases[phase].losses.push(loss.cp);
                if (!steady) {
                    const suggested = principalLine(move.before, before.pv?.length ? before.pv : [before.bestMove], Chess);
                    const reply = principalLine(move.after, after.pv?.length ? after.pv : [after.bestMove], Chess);
                    const alternative = suggested[0] && (suggested[0].from !== move.from || suggested[0].to !== move.to || suggested[0].promotion !== move.promotion);
                    const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
                    const first = reply[0];
                    const direct = first?.captured ? `The opponent can reply with ${first.text}, capturing your ${names[first.captured]}${/[+#]/.test(first.san) ? ' with check' : ''}.`
                        : first && /#/.test(first.san) ? `The opponent can deliver checkmate with ${first.text}.`
                        : first && /\+/.test(first.san) ? `The opponent can force a check with ${first.text}.`
                        : first ? `The opponent's stronger continuation begins ${reply.map(m => m.text).join(' ')}.` : 'Compare the position before your move with the position afterward.';
                    const change = !alternative && suggested.length ? 'The saved line starts with your played move despite the changed evaluation. Recheck this position before treating the move as an error.'
                        : loss.mateTransition === 'allowed_forced_mate' ? 'This move allowed a forced mating line.'
                        : loss.mateTransition === 'lost_forced_mate' ? 'A forced mating opportunity was lost.'
                        : `Your position moved from ${positionLabel(ownCp)} to ${positionLabel(Number.isFinite(after.cp) ? after.cp * (move.color === 'w' ? 1 : -1) : null)}.`;
                    const focus = !alternative && suggested.length ? 'Position to verify' : /mate/.test(loss.mateTransition || '') || /[+#]/.test(first?.san || '') ? 'King safety' : first?.captured ? 'Protecting pieces' : `${phase[0].toUpperCase()}${phase.slice(1)} decisions`;
                    moments.push({ ...sample, suggested, reply, alternative: !!alternative, played: numberedMove(move.before, move.san), direct, change, focus,
                        suggestion: alternative ? `Consider ${suggested[0].text} instead. Test the line ${suggested.map(m => m.text).join(' ')} on the board.` : suggested.length ? `Review the recorded line ${suggested.map(m => m.text).join(' ')} at greater depth.` : 'No legal alternative was recorded for this position.' });
                }
            }
        }
        moments.sort((a, b) => Number(b.alternative) - Number(a.alternative) || Number(!!b.loss.mateTransition) - Number(!!a.loss.mateTransition) || (b.loss.cp || 0) - (a.loss.cp || 0));
        const quality = list => list.length >= 5 ? Math.round(list.filter(s => s.steady).length / list.length * 100) : null;
        const axes = [
            { name: 'Tactics', list: samples.filter(s => s.forcing), definition: 'Reviewed checks, captures and promotions that avoided a large evaluation drop.' },
            { name: 'Strategy', list: samples.filter(s => s.phase === 'middlegame' && !s.forcing), definition: 'Reviewed quiet middlegame moves that avoided a large evaluation drop.' },
            { name: 'Opening', list: samples.filter(s => s.phase === 'opening'), definition: 'Reviewed opening moves that avoided a large evaluation drop.' },
            { name: 'Endgame', list: samples.filter(s => s.phase === 'endgame'), definition: 'Reviewed endgame moves that avoided a large evaluation drop.' },
            { name: 'Defense', list: samples.filter(s => s.defense), definition: 'Reviewed moves while in check or at least one pawn behind in the engine estimate, without a further large drop.' },
            { name: 'Aggression', definition: 'Share of all recorded own moves that were checks, captures or promotions. Higher means more forcing moves, not necessarily better play.' },
            { name: 'Precision', list: samples, definition: 'All reviewed own moves that avoided a large evaluation drop.' },
            { name: 'Consistency', definition: 'Share of games with at least four out of five reviewed moves avoiding a large drop. Requires five reviewed moves per game and three games.' }
        ];
        const totalOwn = rows.reduce((sum, row) => sum + row.ownMoves, 0), forcing = rows.reduce((sum, row) => sum + row.forcing, 0);
        const gameSamples = group(samples.map(s => ({ ...s, outcome: s.row.outcome })), s => s.row.game.id).map(g => g.rows).filter(list => list.length >= 5);
        for (const axis of axes) {
            if (axis.list) { axis.count = axis.list.length; axis.value = quality(axis.list); }
            else if (axis.name === 'Aggression') { axis.count = totalOwn; axis.value = totalOwn >= 5 ? Math.round(forcing / totalOwn * 100) : null; }
            else { axis.count = gameSamples.length; axis.value = gameSamples.length >= 3 ? Math.round(gameSamples.filter(list => list.filter(s => s.steady).length / list.length >= .8).length / gameSamples.length * 100) : null; }
        }
        const phaseRows = PHASES.map(name => ({ name, ...phases[name], quality: phases[name].reviewed >= 5 ? Math.round(phases[name].steady / phases[name].reviewed * 100) : null, averageLoss: mean(phases[name].losses) }));
        const strongest = phaseRows.filter(p => p.quality !== null).sort((a, b) => b.quality - a.quality)[0];
        const problems = group(moments.map(m => ({ ...m, outcome: m.row.outcome })), m => m.focus).map(g => ({ ...g, distinctGames: new Set(g.rows.map(m => m.row.game.id)).size }));
        return { samples, moments, axes, phases: phaseRows, strongest, problems, reviewed: samples.length, eligible: totalOwn, forcing };
    }
    function build(dataset, report = null, options = {}) {
        const data = rows(dataset, report, options.Chess || global.Chess, options.catalog || []), filtered = filter(data, options.filters), r = results(filtered);
        const analysis = review(filtered, report, options.Chess || global.Chess);
        const openings = group(filtered, 'opening').sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
        const rated = filtered.filter(row => row.rating !== null && row.date !== null).sort((a, b) => a.date - b.date || a.game.sourceIndex - b.game.sourceIndex);
        const ratingSeries = group(rated, row => `${row.source} · ${row.timeType}`);
        const opponentRatings = group(filtered, row => row.opponentRating === null ? null : row.opponentRating < 800 ? '< 800' : row.opponentRating >= 2400 ? '2400+' : `${Math.floor(row.opponentRating / 200) * 200}–${Math.floor(row.opponentRating / 200) * 200 + 199}`).sort((a, b) => (a.name === '< 800' ? 0 : parseInt(a.name)) - (b.name === '< 800' ? 0 : parseInt(b.name)));
        const endings = Object.fromEntries(['win', 'loss', 'draw'].map(outcome => [outcome, group(filtered.filter(row => row.outcome === outcome), 'termination')]));
        const colors = ['white', 'black'].map(name => ({ name, ...results(filtered.filter(row => row.color === name)) }));
        const focus = analysis.moments[0];
        const summary = `${dataset.subject.username} scored ${r.wins} ${r.wins === 1 ? 'win' : 'wins'}, ${r.draws} ${r.draws === 1 ? 'draw' : 'draws'} and ${r.losses} ${r.losses === 1 ? 'loss' : 'losses'} in ${r.completed} completed games${r.unfinished ? `, with ${r.unfinished} unfinished` : ''}.`;
        return { version: VERSION, dataset, report, rows: data, filtered, results: r, review: analysis, openings, ratingSeries, opponentRatings, endings, colors, focus, summary };
    }
    global.CaissaInsightReportModel = Object.freeze({ VERSION, timeType, dateStamp, playedAt, openingName, features, rows, filter, results, group, principalLine, numberedMove, review, build });
})(typeof window !== 'undefined' ? window : globalThis);
