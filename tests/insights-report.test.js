import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load } from 'cheerio';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import '../js/insights/core.js';
import '../js/eco-opening-resolver.js';
import '../js/insights/report-model.js';
import '../js/insights/report-view.js';
const core = globalThis.CaissaInsightsCore, model = globalThis.CaissaInsightReportModel, view = globalThis.CaissaInsightReportView;
const pgn = (white = 'Alex', black = 'Fixture', result = '1-0', headers = '', moves = '1. e4 e5 2. Nf3 Nc6') => `[Event "Synthetic only"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n${headers}\n\n${moves} ${result}`;
const parse = (text, options = {}) => core.parse(text, { username: 'Alex', ...options }, Chess);
function snapshot(dataset) {
    return { subject: dataset.subject, selectedGames: dataset.games.map(g => ({ id: g.id })), analyses: dataset.games.map(g => ({ gameId: g.id,
        evaluations: core.replay(g, Chess).positions.map(() => ({ status: 'complete', cp: 0, mate: null, depth: 12, pv: [], bestMove: null })) })), analysisStatus: 'complete' };
}
function rootHarness() {
    const root = { innerHTML: '', hidden: true, nodes: [] };
    const wrap = element => ({ dataset: Object.fromEntries(Object.entries(element.attribs || {}).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value])),
        listeners: {}, focus() {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
    root.querySelectorAll = selector => { const $ = load(root.innerHTML); const nodes = $(selector).toArray().map(wrap); root.nodes.push(...nodes); return nodes; };
    root.querySelector = selector => root.querySelectorAll(selector)[0] || null;
    return root;
}
test('ratings, opening names and termination survive legal parsing and recovery', () => {
    const data = parse(pgn('Alex', 'B', '1-0', '[WhiteElo "1400"]\n[BlackElo "1350"]\n[Opening "King’s Pawn"]\n[Termination "B resigned"]\n[UTCDate "2026.10.03"]\n[UTCTime "20:12:00"]\n[TimeControl "180+2"]'));
    const row = model.rows(data, null, Chess)[0];
    assert.equal(row.rating, 1400); assert.equal(row.opponentRating, 1350); assert.equal(row.opening, 'King’s Pawn'); assert.equal(row.termination, 'Resignation');
    assert.equal(row.timeType, 'blitz'); assert.equal(new Date(row.date).toISOString(), '2026-10-03T20:12:00.000Z');
});
test('opening labels use trusted PGN metadata or a legal matching catalog line', () => {
    const withUrl = parse(pgn('Alex', 'B', '1-0', '[ECOUrl "https://www.chess.com/openings/Ruy-Lopez-Opening-3...a6"]'));
    assert.equal(model.rows(withUrl, null, Chess)[0].opening, 'Ruy Lopez Opening');
    const untrusted = parse(pgn('Alex', 'B', '*', '[ECOUrl "https://example.com/openings/Invented"]', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
    const catalog = JSON.parse(fs.readFileSync('data/eco/eco_codes.json', 'utf8'));
    assert.equal(model.build(untrusted, null, { Chess, catalog }).rows[0].opening, 'Ruy Lopez');
    assert.equal(model.build(untrusted, null, { Chess }).rows[0].opening, 'Opening not recorded');
});
test('game type uses base plus increment and distinguishes multi-stage classical from daily', () => {
    for (const [value, expected] of [['60+0', 'bullet'], ['180+2', 'blitz'], ['600+5', 'rapid'], ['1800+0', 'classical'], ['40/7200:3600', 'classical'], ['86400', 'daily'], ['?', 'unknown']]) {
        assert.equal(model.timeType({ timeControl: value, headers: {} }), expected);
    }
});
test('missing and malformed dates and ratings stay unavailable rather than zero or today', () => {
    const data = parse(pgn('Alex', 'B', '0-1', '[Date "2026.02.31"]\n[WhiteElo "?"]\n[BlackElo "0"]'));
    const m = model.build(data, null, { Chess }); assert.equal(m.rows[0].date, null); assert.equal(m.rows[0].rating, null);
    assert.equal(m.ratingSeries.length, 0); assert.equal(m.opponentRatings.length, 0); assert.equal(m.rows[0].termination, 'Not recorded');
});
test('result filters keep player color, points and completed-game denominator correct', () => {
    const data = parse([pgn('Alex', 'B', '1-0', '[TimeControl "60"]'), pgn('B', 'Alex', '1/2-1/2', '[TimeControl "600"]'), pgn('Alex', 'B', '*', '[TimeControl "600"]'), pgn('Foreign', 'B', '1-0')].join('\n\n'));
    const m = model.build(data, null, { Chess }); assert.equal(m.rows.length, 3); assert.equal(m.results.pointsPerGame, .75); assert.equal(m.results.unfinished, 1);
    const black = model.results(model.filter(m.rows, { color: 'black' })); assert.equal(black.pointsPerGame, .5); assert.equal(black.draws, 1);
    const rapid = model.results(model.filter(m.rows, { timeType: 'rapid' })); assert.equal(rapid.completed, 1); assert.equal(rapid.total, 2);
});
test('a report shows only its selected games rather than the whole imported account history', () => {
    const data = parse([pgn(), pgn('B', 'Alex', '1-0')].join('\n\n')), report = snapshot(data);
    report.selectedGames = report.selectedGames.slice(1);
    const m = model.build(data, report, { Chess }); assert.equal(m.results.total, 1); assert.equal(m.results.losses, 1); assert.equal(m.review.eligible, 2);
});
test('queen-trade classification requires both recorded queen captures, including the king recapture', () => {
    const data = parse(pgn('Alex', 'B', '1/2-1/2', '[SetUp "1"]\n[FEN "3qk3/8/8/8/8/8/8/3QK3 w - - 0 1"]', '1. Qxd8+ Kxd8'));
    assert.equal(data.games.length, 1); const row = model.rows(data, null, Chess)[0]; assert.equal(row.queenTrade, 'with');
    assert.equal(row.yourCastling, 'unknown'); assert.equal(row.opponentCastling, 'unknown');
    const noQueens = parse(pgn('Alex', 'B', '*', '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 20"]', '20. e4 Kd7'));
    assert.equal(model.rows(noQueens, null, Chess)[0].queenTrade, 'unknown');
});
test('both castling sides are taken from legal moves, and a standard full game can establish no castling', () => {
    const data = parse(pgn('Alex', 'B', '*', '[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]', '1. O-O O-O-O'));
    const row = model.rows(data, null, Chess)[0]; assert.equal(row.yourCastling, 'kingside'); assert.equal(row.opponentCastling, 'queenside');
    assert.equal(model.rows(parse(pgn()), null, Chess)[0].yourCastling, 'none');
});
test('checkmate can be established from replay, normal termination never implies resignation', () => {
    const data = parse(pgn('Alex', 'B', '0-1', '[Termination "Normal"]', '1. f3 e5 2. g4 Qh4#'));
    assert.equal(model.rows(data, null, Chess)[0].termination, 'Checkmate');
    assert.equal(model.rows(parse(pgn('Alex', 'B', '0-1', '[Termination "Normal"]')), null, Chess)[0].termination, 'Not recorded');
});
test('ratings are separated by source and time control and never stitched into one false curve', () => {
    const data = parse([pgn('Alex', 'B', '1-0', '[WhiteElo "1300"]\n[Date "2026.10.01"]\n[TimeControl "60"]'), pgn('B', 'Alex', '0-1', '[BlackElo "1500"]\n[Date "2026.10.02"]\n[TimeControl "600"]')].join('\n\n'));
    const m = model.build(data, null, { Chess }); assert.equal(m.ratingSeries.length, 2); assert.equal(m.ratingSeries[0].name, 'local · bullet'); assert.equal(m.ratingSeries[1].name, 'local · rapid');
});
test('missing spider evidence is null and never a fake zero or strength', () => {
    const data = parse(pgn()), m = model.build(data, snapshot(data), { Chess });
    for (const axis of m.review.axes) assert.equal(axis.value, null);
    assert.match(view.radar(m.review.axes), /not enough data/); assert.doesNotMatch(view.radar(m.review.axes), /class="ir-radar-area"/);
});
test('phase quality requires five reviewed own moves and keeps unreviewed moves in coverage', () => {
    const moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5';
    const data = parse(pgn('Alex', 'B', '*', '', moves)), report = snapshot(data);
    const full = model.build(data, report, { Chess }); assert.equal(full.review.phases[0].quality, 100); assert.equal(full.review.phases[0].reviewed, 6);
    report.analyses[0].evaluations[5] = null;
    const partial = model.build(data, report, { Chess }); assert.equal(partial.review.reviewed, 5); assert.equal(partial.review.eligible, 6);
    assert.equal(partial.review.axes.find(a => a.name === 'Endgame').value, null);
});
test('coaching replays legal alternatives in SAN and explains a concrete mating reply', () => {
    const data = parse(pgn('Alex', 'B', '0-1', '', '1. f3 e5 2. g4 Qh4#')), report = snapshot(data), evaluations = report.analyses[0].evaluations;
    evaluations[2] = { ...evaluations[2], bestMove: 'e2e4', pv: ['e2e4', 'b8c6'] };
    evaluations[3] = { ...evaluations[3], cp: null, mate: -1, bestMove: 'd8h4', pv: ['d8h4'] };
    evaluations[4] = { ...evaluations[4], cp: null, mate: 0, winner: 'b', terminal: true };
    const m = model.build(data, report, { Chess }); assert.equal(m.focus.played, '2. g4'); assert.equal(m.focus.focus, 'King safety');
    assert.match(m.focus.direct, /checkmate with 2\.\.\. Qh4#/); assert.match(m.focus.suggestion, /Consider 2\. e4/);
    assert.deepEqual(model.principalLine(data.games[0].startingFen, ['a1a8'], Chess), []);
});
test('contradictory estimates never recommend the played move as its own alternative', () => {
    const data = parse(pgn()), report = snapshot(data);
    report.analyses[0].evaluations[0] = { ...report.analyses[0].evaluations[0], bestMove: 'e2e4', pv: ['e2e4', 'e7e5'] };
    report.analyses[0].evaluations[1].cp = -200;
    const focus = model.build(data, report, { Chess }).focus;
    assert.equal(focus.played, '1. e4'); assert.equal(focus.alternative, false);
    assert.equal(focus.focus, 'Position to verify'); assert.doesNotMatch(focus.suggestion, /instead/);
    assert.match(focus.change, /Recheck this position/);
});
test('dashboard filters really recalculate results and safely render hostile PGN labels', () => {
    const data = parse([pgn('Alex', '<img src=x onerror=alert(1)>', '1-0', '[TimeControl "60"]'), pgn('B', 'Alex', '1-0', '[TimeControl "600"]')].join('\n\n'));
    data.subject.username = '<svg onload=alert(1)>';
    const root = rootHarness(); view.mount(root, data, null, { Chess });
    assert.match(root.innerHTML, /2 games in this view/); assert.doesNotMatch(root.innerHTML, /<svg onload=/); assert.match(root.innerHTML, /&lt;svg onload=/);
    const rapid = root.nodes.find(n => n.dataset.irTime === 'rapid'); rapid.listeners.click();
    assert.match(root.innerHTML, /1 games in this view/); const $ = load(root.innerHTML); assert.equal($('[data-ir-time="rapid"]').attr('aria-pressed'), 'true');
});
test('zero-draw charts show an empty state, and missing ratings never become invented plots', () => {
    const root = rootHarness(); view.mount(root, parse(pgn()), null, { Chess });
    const $ = load(root.innerHTML), drawCard = $('.ir-card').filter((_, el) => $(el).find('h2').text() === 'Ways of drawing');
    assert.equal(drawCard.find('svg').length, 0); assert.match(drawCard.text(), /No drawn games/);
    assert.equal($('.ir-rating-chart').length, 0);
});
test('main page has one report entry, latest status before dashboard and no lower launch block', () => {
    const $ = load(fs.readFileSync('index.html', 'utf8'));
    assert.equal($('#insightsSection #openInsightModal').length, 1); assert.equal($('#openInsightModal2').length, 0);
    assert.equal($('#insightsSection .insights-cta').length, 0); assert.equal($('#insightLatestStatus[role="status"]').length, 1);
    const children = $('#insightLatestReport').parent().children().toArray(); assert.ok(children.indexOf($('#insightLatestReport')[0]) < children.indexOf($('#insightDashboard')[0]));
});
