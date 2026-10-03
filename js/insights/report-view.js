(function installInsightReportView(global) {
    'use strict';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = (n, total) => total ? Math.round(n / total * 100) : 0;
    const point = n => n === null ? '—' : n.toFixed(2);
    const empty = text => `<p class="ir-empty">${escape(text)}</p>`;
    const section = (title, content, options = '') => `<section class="ir-card ${options}"><h2>${escape(title)}</h2><div class="ir-card-body">${content}</div></section>`;
    const outcomeBar = result => result.completed ? `<div class="ir-outcomes" role="img" aria-label="${result.wins} wins, ${result.draws} draws, ${result.losses} losses"><span class="ir-win" style="width:${result.wins / result.completed * 100}%"></span><span class="ir-draw" style="width:${result.draws / result.completed * 100}%"></span><span class="ir-loss" style="width:${result.losses / result.completed * 100}%"></span></div>` : '<div class="ir-outcomes ir-outcomes-empty"></div>';
    const legend = '<p class="ir-legend"><span><i class="ir-win"></i>Wins</span><span><i class="ir-draw"></i>Draws</span><span><i class="ir-loss"></i>Losses</span></p>';
    function createHandoff(moment, transport = global.CaissaAnalyzeHandoff?.createTransport?.()) {
        if (!moment || !transport) return { ok: false, reasonCode: 'HANDOFF_UNAVAILABLE' };
        const game = moment.row.game;
        const created = transport.create({ source: 'insights', intent: 'imported-game', payload: {
            pgn: game.headers.pgn, initialFen: game.startingFen, selectedPly: moment.move.ply,
            playerColor: game.userColor, boardOrientation: game.userColor === 'b' ? 'black' : 'white',
            whiteLabel: game.headers.white, blackLabel: game.headers.black, result: game.headers.result,
            recordStatus: game.headers.result === '*' ? 'partial' : 'complete'
        }, provenance: { sourceSection: 'insights' } });
        if (!created.ok) return created;
        const stored = transport.store(created.value);
        return stored.ok ? { ok: true, token: created.value.token } : stored;
    }
    function resultCard(model) {
        const r = model.results;
        return section(`${model.dataset.subject.username} · Game results`, `${outcomeBar(r)}<div class="ir-result-counts"><p><strong>${r.wins}</strong>Wins <span>${pct(r.wins, r.completed)}%</span></p><p><strong>${r.draws}</strong>Draws <span>${pct(r.draws, r.completed)}%</span></p><p><strong>${r.losses}</strong>Losses <span>${pct(r.losses, r.completed)}%</span></p></div>
            <p class="ir-caption">${r.total} games in this view · ${r.completed} completed${r.unfinished ? ` · ${r.unfinished} unfinished (excluded from percentages)` : ''}</p>
            <div class="ir-color-results">${model.colors.map(color => `<p>As ${color.name}: <strong>${color.wins}W · ${color.draws}D · ${color.losses}L</strong> · ${point(color.pointsPerGame)} points/game</p>`).join('')}</div>`);
    }
    function radar(axes) {
        const x = 190, y = 160, radius = 104;
        const at = (i, scale) => [x + Math.cos(-Math.PI / 2 + i * Math.PI / 4) * radius * scale, y + Math.sin(-Math.PI / 2 + i * Math.PI / 4) * radius * scale];
        const pair = p => p.map(n => n.toFixed(1)).join(',');
        const grid = [.25, .5, .75, 1].map(scale => `<polygon points="${axes.map((_, i) => pair(at(i, scale))).join(' ')}" class="ir-radar-grid"/>`).join('');
        const spokes = axes.map((axis, i) => { const end = at(i, 1), label = at(i, 1.31); return `<line x1="${x}" y1="${y}" x2="${end[0]}" y2="${end[1]}" class="ir-radar-grid"/><text x="${label[0]}" y="${label[1]}" text-anchor="${label[0] < x - 20 ? 'end' : label[0] > x + 20 ? 'start' : 'middle'}" dominant-baseline="middle">${escape(axis.name)}${axis.value === null ? ' —' : ''}</text>`; }).join('');
        const complete = axes.every(a => a.value !== null);
        const shape = complete ? `<polygon points="${axes.map((a, i) => pair(at(i, a.value / 100))).join(' ')}" class="ir-radar-area"/>`
            : axes.map((a, i) => { const next = (i + 1) % axes.length; if (a.value === null || axes[next].value === null) return ''; const p = at(i, a.value / 100), q = at(next, axes[next].value / 100); return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" class="ir-radar-line"/>`; }).join('');
        const dots = axes.map((a, i) => { if (a.value === null) return ''; const p = at(i, a.value / 100); return `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="ir-radar-dot"><title>${escape(a.name)}: ${a.value}% (${a.count} observations)</title></circle>`; }).join('');
        return `<svg viewBox="0 0 380 320" class="ir-radar" role="img" aria-label="${escape(axes.map(a => `${a.name}: ${a.value === null ? 'not enough data' : `${a.value}%`}`).join('; '))}"><title>Your playing profile in the report sample</title>${grid}${spokes}${shape}${dots}</svg>`;
    }
    function profileCard(model) {
        const a = model.review, strongest = a.strongest;
        const message = strongest ? `<strong>${strongest.quality}% of your reviewed ${strongest.name} moves avoided a large additional drop.</strong><p>${strongest.steady} of ${strongest.reviewed} reviewed moves kept the estimate close to its previous value. ${model.focus ? `Start your next review with ${escape(model.focus.focus.toLowerCase())}; the examples below show where to practice it.` : 'Keep comparing your plan with the opponent’s best reply.'}</p>`
            : '<strong>Your profile grows as moves are reviewed.</strong><p>At least five comparable moves are needed for each move-quality axis. A missing value means there is not enough evidence yet.</p>';
        return section('Your playing profile', `<div class="ir-profile-grid">${radar(a.axes)}<div class="ir-takeaway">${message}</div></div><p class="ir-caption">Sample profile, not a rating. Gaps are missing evidence, not zero scores. Aggression describes forcing-move frequency.</p>
            <details class="ir-method"><summary>How to read the spider</summary><p>Move-quality axes show the share of reviewed moves without a drop of roughly 1.2 pawns or a lost/allowed forced mate. They describe this sample, not general skill. Each needs five reviewed moves.</p><table><thead><tr><th>Axis</th><th>Value / sample</th><th>Meaning</th></tr></thead><tbody>${a.axes.map(axis => `<tr><th>${axis.name}</th><td>${axis.value === null ? 'Pending' : `${axis.value}%`} / ${axis.count}</td><td>${axis.definition}</td></tr>`).join('')}</tbody></table></details>`);
    }
    function phaseCard(model) {
        return section('Move quality by phase', model.review.phases.map(p => `<div class="ir-phase"><div><strong>${p.name[0].toUpperCase()}${p.name.slice(1)}</strong><span>${p.reviewed} / ${p.eligible} own moves reviewed</span></div>${p.quality === null ? empty(p.reviewed ? 'Not enough reviewed moves to compare this phase.' : 'No reviewed moves in this phase yet.') : `<div class="ir-meter"><span style="width:${p.quality}%"></span></div><p>${p.quality}% avoided a large drop · ${p.reviewed - p.steady} moves to revisit</p>`}</div>`).join('') + '<p class="ir-caption">Percentages describe the reviewed moves. They are not a calibrated accuracy score.</p>');
    }
    function select(name, title, values, current) {
        return `<label class="ir-field">${escape(title)}<select data-ir-feature="${name}">${values.map(([value, label]) => `<option value="${value}"${current === value ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`;
    }
    function featureCard(model, filters) {
        const r = global.CaissaInsightReportModel.results(global.CaissaInsightReportModel.filter(model.filtered, filters));
        const castleOptions = [['all', 'All'], ['kingside', 'Kingside'], ['queenside', 'Queenside'], ['none', 'None'], ['unknown', 'Not recorded']];
        return section('Results by position features', `<div class="ir-feature-controls">${select('queenTrade', 'Queen trade', [['all', 'All'], ['with', 'With'], ['without', 'Without'], ['unknown', 'Not recorded']], filters.queenTrade)}${select('yourCastling', 'Your castling', castleOptions, filters.yourCastling)}${select('opponentCastling', 'Opponent castling', castleOptions, filters.opponentCastling)}${select('color', 'View as', [['all', 'Overall'], ['white', 'White'], ['black', 'Black']], filters.color)}</div>
            <p class="ir-feature-score"><strong>${point(r.pointsPerGame)}</strong> points per completed game</p><div class="ir-meter"><span style="width:${(r.pointsPerGame || 0) * 100}%"></span></div><p class="ir-caption">${r.completed} matching completed games${r.unfinished ? ` · ${r.unfinished} unfinished` : ''} · Win = 1 point · Draw = ½ · Loss = 0</p>
            <p class="ir-caption">Queen trade means both original queens were captured in the recorded game. Comparisons describe this sample; they do not prove that trading or castling causes a result.</p>`);
    }
    function ratingCard(model) {
        const colors = ['#1970ca', '#15845b', '#9857c5', '#bd5828', '#0a8990', '#cf3977', '#687815'];
        const all = model.ratingSeries.flatMap(s => s.rows), missing = model.filtered.length - all.length;
        if (!all.length) return section('Rating over time', empty('This PGN does not contain both player ratings and reliable game dates. Import rated games to see this chart.'));
        const minRating = Math.floor((Math.min(...all.map(r => r.rating)) - 50) / 100) * 100;
        const maxRating = Math.ceil((Math.max(...all.map(r => r.rating)) + 50) / 100) * 100;
        const start = Math.min(...all.map(r => r.date)), end = Math.max(...all.map(r => r.date));
        const x = date => 48 + (end === start ? .5 : (date - start) / (end - start)) * 404;
        const y = n => 164 - (n - minRating) / (maxRating - minRating) * 134;
        const grid = [0, .5, 1].map(f => { const n = minRating + (maxRating - minRating) * f; return `<line x1="48" x2="452" y1="${y(n)}" y2="${y(n)}" class="ir-chart-grid"/><text x="40" y="${y(n) + 4}" text-anchor="end">${Math.round(n)}</text>`; }).join('');
        const curves = model.ratingSeries.map((series, i) => { const color = colors[i % colors.length]; return `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${series.rows.map(r => `${x(r.date)},${y(r.rating)}`).join(' ')}"/>${series.rows.map(r => `<circle cx="${x(r.date)}" cy="${y(r.rating)}" r="3" fill="${color}"><title>${escape(`${series.name}: ${r.rating}, ${new Date(r.date).toISOString().slice(0, 10)}`)}</title></circle>`).join('')}`; }).join('');
        const chart = `<svg class="ir-rating-chart" viewBox="0 0 480 208" role="img" aria-label="Rating history for ${all.length} games, separated by platform and time control"><title>Ratings recorded before each game</title>${grid}${curves}<text x="48" y="193">${new Date(start).toISOString().slice(0, 10)}</text><text x="452" y="193" text-anchor="end">${new Date(end).toISOString().slice(0, 10)}</text></svg>`;
        return section('Rating over time', chart + `<p class="ir-series-legend">${model.ratingSeries.map((s, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${escape(s.name)}</span>`).join('')}</p><p class="ir-caption">Ratings before each game, separated by platform and game type. ${missing ? `${missing} games lack a rating or date.` : ''}</p><details><summary>See rating data</summary><table><thead><tr><th>Date</th><th>Game type</th><th>Your rating</th></tr></thead><tbody>${all.map(r => `<tr><td>${new Date(r.date).toISOString().slice(0, 10)}</td><td>${escape(r.source)} · ${r.timeType}</td><td>${r.rating}</td></tr>`).join('')}</tbody></table></details>`);
    }
    function openingCard(model) {
        if (!model.openings.length) return section('Opening performance', empty('No games match these filters.'));
        const row = o => `<tr><th>${escape(o.name)}</th><td>${o.total}</td><td>${outcomeBar(o)}<span class="ir-small-result">${o.wins}W · ${o.draws}D · ${o.losses}L</span></td><td>${o.winRate === null ? '—' : `${Math.round(o.winRate * 100)}%`}</td></tr>`;
        const table = openings => `<table><thead><tr><th>Opening</th><th>Games</th><th>Results</th><th>Win rate</th></tr></thead><tbody>${openings.map(row).join('')}</tbody></table>`;
        return section('Opening performance', table(model.openings.slice(0, 8)) + legend + (model.openings.length > 8 ? `<details><summary>See all ${model.openings.length} openings</summary>${table(model.openings)}</details>` : '') + '<p class="ir-caption">Opening labels use PGN names, opening URLs, or a matching line in the CAISSA catalog. Use the color filter to compare your repertoire as White or Black.</p>');
    }
    function opponentCard(model) {
        if (!model.opponentRatings.length) return section('Results by opponent rating', empty('Opponent ratings are not recorded in these games.'));
        const known = model.opponentRatings.reduce((n, g) => n + g.total, 0);
        return section('Results by opponent rating', `<table><thead><tr><th>Opponent rating</th><th>Results</th><th>Games</th></tr></thead><tbody>${model.opponentRatings.map(g => `<tr><th>${g.name}</th><td>${outcomeBar(g)}<span class="ir-small-result">${g.wins}W · ${g.draws}D · ${g.losses}L</span></td><td>${g.total}</td></tr>`).join('')}</tbody></table>${legend}<p class="ir-caption">${known} games with recorded opponent ratings${known < model.filtered.length ? ` · ${model.filtered.length - known} without ratings` : ''}. Apply a game-type filter for comparable ratings.</p>`);
    }
    function endingCard(model, outcome, title) {
        const groups = model.endings[outcome], total = groups.reduce((n, g) => n + g.total, 0);
        if (!total) return section(title, empty(`No ${outcome === 'draw' ? 'drawn' : outcome === 'win' ? 'won' : 'lost'} games in this view.`));
        const colors = ['#198653', '#47ab82', '#91caaf', '#a5afbf', '#748292', '#697078'];
        let offset = 0;
        const ring = groups.map((g, i) => { const size = g.total / total * 100, result = `<circle cx="65" cy="65" r="45" fill="none" stroke="${colors[i % colors.length]}" stroke-width="16" pathLength="100" stroke-dasharray="${size} ${100 - size}" stroke-dashoffset="${-offset}" transform="rotate(-90 65 65)"/>`; offset += size; return result; }).join('');
        return section(title, `<div class="ir-endings"><svg viewBox="0 0 130 130" role="img" aria-label="${escape(groups.map(g => `${g.name}: ${g.total}`).join('; '))}"><title>${escape(title)}</title>${ring}<text x="65" y="68" text-anchor="middle" class="ir-ring-value">${total}</text><text x="65" y="86" text-anchor="middle">games</text></svg><ul>${groups.map((g, i) => `<li><i style="background:${colors[i % colors.length]}"></i><span>${escape(g.name)}</span><strong>${g.total} (${pct(g.total, total)}%)</strong></li>`).join('')}</ul></div>` + (groups.some(g => g.name === 'Not recorded') ? '<p class="ir-caption">Missing ending reasons are kept as “Not recorded”. A decisive result alone does not establish resignation or timeout.</p>' : ''));
    }
    function coachCard(model) {
        const review = model.review, strongest = review.strongest, focus = model.focus;
        const frequent = model.openings.filter(o => o.completed >= 3 && o.name !== 'Opening not recorded')[0];
        const working = strongest ? `<p><strong>Your ${strongest.name} moves are your most stable reviewed phase.</strong></p><p>${strongest.steady} out of ${strongest.reviewed} reviewed moves kept the position from a large drop. Revisit the good decisions as well as the errors: what did you check before moving?</p>`
            : frequent ? `<p><strong>${escape(frequent.name)} is a regular part of your repertoire.</strong></p><p>You scored ${frequent.wins} wins and ${frequent.draws} draws in ${frequent.completed} completed games with it. Review the first position where your games leave your prepared plan.</p>`
                : '<p>Your game results are ready. Move-by-move coaching will appear as soon as the engine has comparable evaluations.</p>';
        const improvement = focus ? `<p><strong>${escape(focus.focus)}: start with ${escape(focus.played)} against ${escape(focus.row.opponent)}.</strong></p><p>${escape(focus.direct)} ${escape(focus.change)}</p><p>${escape(focus.suggestion)}</p>`
            : review.reviewed ? `<p><strong>Keep the opponent's best reply in your thinking routine.</strong></p><p>No large drops were found in the ${review.reviewed} reviewed moves${review.reviewed < review.eligible ? '; the remaining moves still need review' : ''}. Replay one game without the engine, write down your plans, then compare them with the saved estimates.</p>`
                : '<p><strong>Complete a move review before drawing conclusions about strengths.</strong></p><p>Use the report button at the top to review your moves. Game results and opening frequencies remain available while the engine works.</p>';
        const patterns = review.problems.filter(g => g.distinctGames >= 2).map(g => `<p>${escape(g.name)} appeared in ${g.total} reviewed moments across ${g.distinctGames} games. Make it your focus for the next slow game.</p>`).join('');
        const moments = review.moments.slice(0, 5).map((m, index) => `<article class="ir-moment"><p class="ir-eyebrow">${escape(m.row.color)} vs ${escape(m.row.opponent)} · ${m.row.outcome} · ${m.phase}</p><h3>${escape(m.played)} · ${escape(m.focus)}</h3><p>${escape(m.direct)}</p><p>${escape(m.change)}</p><p class="ir-alternative">${escape(m.suggestion)}</p><button type="button" class="ir-link-button" data-ir-moment="${index}">View game at this move <span aria-hidden="true">→</span></button></article>`).join('');
        const habit = focus?.focus === 'King safety' ? 'Before choosing your move, look for every check the opponent can give. Compare king escapes and forcing replies before attacking.'
            : focus?.focus === 'Protecting pieces' ? 'Before moving, check which of your pieces will be undefended. Look at every capture the opponent can make on the next move.'
                : 'Before moving, name your goal and the opponent’s strongest reply. If the reply changes your plan, compare another candidate move.';
        return section('What to work on next', `<p class="ir-coach-intro">${escape(model.summary)} ${review.reviewed ? `${review.reviewed} of ${review.eligible} own moves support the coaching below.` : ''}</p><div class="ir-coach-columns"><div><h3>What is working</h3>${working}</div><div><h3>Your main improvement</h3>${improvement}</div><div><h3>Your thinking habit</h3><p>${habit}</p>${patterns}</div></div><h3 class="ir-moments-title">Games to revisit</h3><div class="ir-moments">${moments || empty(review.reviewed ? 'No major turning points in the reviewed sample. Keep reviewing the rest of your games.' : 'Concrete game examples will appear after move review.')}</div>`, 'ir-coaching');
    }
    function planCard(model) {
        const focus = model.focus, opening = model.openings.find(o => o.name !== 'Opening not recorded');
        const first = focus ? `Replay ${focus.played} against ${focus.row.opponent}. Before viewing the line, write down two candidate moves and the opponent's strongest reply.`
            : 'Choose one completed game. At three important decisions, write down your plan and the opponent’s reply before turning on the engine.';
        return section('Your 7-day practice plan', `<div class="ir-plan-grid"><article><span class="ir-day">Days 1–2 · 10–15 min/day</span><h3>Train your next decision</h3><p>${escape(first)}</p><p class="ir-track">Measure: explain why your preferred move survives the reply.</p></article><article><span class="ir-day">Days 3–4 · 10–15 min/day</span><h3>Connect your opening to a plan</h3><p>${opening ? `Use your ${escape(opening.name)} games.` : 'Use an opening from your imported games.'} Compare the first 15 moves of two games. Identify where the pawn structure changes and which piece should improve next.</p><p class="ir-track">Measure: write one plan for each color you actually play.</p></article><article><span class="ir-day">Days 5–7 · One slow game/day</span><h3>Test the habit in a game</h3><p>Before every important move, check opponent threats, loose pieces and king safety. Review the game afterward and compare your decisions with the examples in this report.</p><p class="ir-track">Measure: note the moves where the checklist changed your choice.</p></article></div>`, 'ir-practice');
    }
    function mount(root, dataset, report, options = {}) {
        let filters = { timeType: 'all', color: 'all' }, featureFilters = { queenTrade: 'all', yourCastling: 'all', opponentCastling: 'all', color: 'all' };
        const modelApi = global.CaissaInsightReportModel;
        function draw() {
            const model = modelApi.build(dataset, report, { Chess: options.Chess || global.Chess, filters, catalog: options.catalog || [] });
            const types = [['all', 'All'], ['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid'], ['daily', 'Daily']];
            for (const value of ['classical', 'unknown']) if (model.rows.some(r => r.timeType === value)) types.push([value, value === 'unknown' ? 'Unspecified' : 'Classical']);
            const filtersHtml = `<div class="ir-toolbar"><div class="ir-filter-group" role="group" aria-label="Game type">${types.map(([value, label]) => `<button type="button" data-ir-time="${value}" aria-pressed="${filters.timeType === value}">${label}</button>`).join('')}</div><label class="ir-field">Your color<select data-ir-color><option value="all"${filters.color === 'all' ? ' selected' : ''}>Both colors</option><option value="white"${filters.color === 'white' ? ' selected' : ''}>White</option><option value="black"${filters.color === 'black' ? ' selected' : ''}>Black</option></select></label></div>`;
            const partial = report && model.review.reviewed < model.review.eligible;
            const notice = partial ? `<p class="ir-coverage-notice"><strong>Move review is incomplete:</strong> ${model.review.reviewed} of ${model.review.eligible} own moves reviewed. Use “Continue report” above to finish missing positions. The game statistics cover every game in this view.</p>` : !report ? '<p class="ir-coverage-notice">Your imported game statistics are ready. Use “Generate report” above for move review, your spider and coaching examples.</p>' : '';
            root.innerHTML = filtersHtml + notice + (dataset.stats.unidentified ? `<p class="ir-caption">${dataset.stats.unidentified} games do not identify ${escape(dataset.subject.username)} and are excluded.</p>` : '')
                + resultCard(model) + `<div class="ir-grid ir-profile-row">${profileCard(model)}${phaseCard(model)}</div><div class="ir-grid">${featureCard(model, featureFilters)}${ratingCard(model)}${openingCard(model)}${opponentCard(model)}</div><div class="ir-ending-grid">${endingCard(model, 'win', 'Ways of winning')}${endingCard(model, 'loss', 'Ways of losing')}${endingCard(model, 'draw', 'Ways of drawing')}</div>${coachCard(model)}${planCard(model)}<details class="ir-method ir-report-method"><summary>About this report</summary><p>Results, ratings, opening labels and dates come from the imported PGN and its source metadata. Missing fields stay unavailable. Move review uses Stockfish 18 Lite estimates from this browser; a saved report is checked for legal replay and structure. It is not a certified skill rating. Filters apply to the same report sample.</p><p>${dataset.rejected.length} rejected games · ${model.rows.length} identified games in this ${report ? 'report' : 'import'}. Opening, middlegame and endgame are determined from the board’s move number and remaining material.</p></details><div class="ir-report-actions"><button type="button" data-ir-action="import">Import different games</button><button type="button" data-ir-action="export">Export ${report ? 'report' : 'game summary'}</button><button type="button" data-ir-action="clear">Start Fresh</button></div>`;
            root.hidden = false;
            root.querySelectorAll('[data-ir-time]').forEach(button => button.addEventListener('click', () => { filters.timeType = button.dataset.irTime; draw(); root.querySelector(`[data-ir-time="${filters.timeType}"]`)?.focus({ preventScroll: true }); }));
            root.querySelector('[data-ir-color]')?.addEventListener('change', event => { filters.color = event.target.value; draw(); root.querySelector('[data-ir-color]')?.focus({ preventScroll: true }); });
            root.querySelectorAll('[data-ir-feature]').forEach(select => select.addEventListener('change', event => { const key = select.dataset.irFeature; featureFilters[key] = event.target.value; const scroll = global.scrollY; draw(); root.querySelector(`[data-ir-feature="${key}"]`)?.focus({ preventScroll: true }); global.scrollTo?.(0, scroll); }));
            root.querySelectorAll('[data-ir-moment]').forEach(button => button.addEventListener('click', () => options.onReview?.(model.review.moments[+button.dataset.irMoment])));
            root.querySelectorAll('[data-ir-action]').forEach(button => button.addEventListener('click', () => options.onAction?.(button.dataset.irAction)));
            return model;
        }
        return draw();
    }
    global.CaissaInsightReportView = Object.freeze({ mount, escape, radar, createHandoff });
})(typeof window !== 'undefined' ? window : globalThis);
