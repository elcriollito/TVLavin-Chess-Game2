import { test, expect } from '@playwright/test';

const SF18 = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const LEGACY = '/engine/stockfish-working.js';

const CORPUS = Object.freeze([
    { id: 'opening-start', category: 'opening', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    { id: 'opening-open-game', category: 'opening', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3' },
    { id: 'opening-black-reply', category: 'opening', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
    { id: 'italian-development', category: 'quiet', fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 5' },
    { id: 'qgd-structure', category: 'positional', fen: 'rnbq1rk1/pp2bppp/2p1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R1BQK2R w KQ - 4 7' },
    { id: 'closed-center', category: 'positional', fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 2 5' },
    { id: 'several-reasonable', category: 'quiet', fen: 'r1bq1rk1/ppp2ppp/2n2n2/2bp4/4P3/2P2N2/PP1N1PPP/R1BQ1RK1 w - - 2 9' },
    { id: 'minor-piece-middle', category: 'middlegame', fen: 'r1b1r1k1/ppp2ppp/2n2n2/8/2BP4/P1N2N2/1P3PPP/R1B1R1K1 w - - 0 12' },
    { id: 'hanging-black-queen', category: 'simple-tactic', fen: '4k3/8/8/3q4/3R4/8/8/4K3 w - - 0 1' },
    { id: 'hanging-white-queen', category: 'simple-tactic', fen: '4k3/8/8/3r4/3Q4/8/8/4K3 b - - 0 1' },
    { id: 'knight-wins-queen', category: 'simple-tactic', fen: '4k3/8/8/8/3q4/5N2/8/4K3 w - - 0 1' },
    { id: 'mate-in-one', category: 'forcing', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' },
    { id: 'castling-choice', category: 'forcing', fen: 'r3k2r/ppp2ppp/2n5/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1' },
    { id: 'rook-ending', category: 'endgame', fen: '8/5pk1/6p1/3R4/4P3/6P1/5PK1/8 w - - 0 1' },
    { id: 'opposition', category: 'endgame', fen: '8/8/4k2p/8/4K3/P7/8/8 b - - 0 1' },
    { id: 'unsupported-passer', category: 'endgame', fen: '7k/p7/8/3P4/8/8/8/K7 b - - 0 1' },
    { id: 'minor-versus-rook', category: 'material-imbalance', fen: '4k3/8/8/8/8/2n5/4PP2/4K2R w K - 0 1' },
    { id: 'queen-versus-rook', category: 'material-imbalance', fen: '6k1/8/8/8/3q4/8/3R4/6K1 w - - 0 1' },
    { id: 'promotion', category: 'forcing', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' },
    { id: 'king-and-pawn', category: 'quiet-endgame', fen: '8/8/8/3k4/8/4K3/2P5/8 w - - 0 1' }
]);

const TARGETS = Object.freeze([
    { target: 250, depth: 1 }, { target: 500, depth: 2 }, { target: 800, depth: 3 },
    { target: 1200, depth: 5 }, { target: 1600, depth: 8 }, { target: 2000, depth: 12 },
    { target: 2400, depth: 16 }, { target: 2800, depth: 20 },
    { target: 3200, movetime: 2000 }
]);

test('ENGINE18-003A mechanism experiment', async ({ page }) => {
    test.setTimeout(20 * 60 * 1000);
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.goto('/play');
    await page.waitForFunction(() => window.Chess && window.App?.engine);

    const report = await page.evaluate(async ({ corpus, targets, sf18Path, legacyPath }) => {
        window.App.engine?.terminate?.('engine18-003a-experiment');

        const parseInfo = (line, fen) => {
            const cp = line.match(/\bscore cp (-?\d+)/);
            const mate = line.match(/\bscore mate (-?\d+)/);
            const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
            const black = fen.split(' ')[1] === 'b';
            const rawCp = cp ? Number(cp[1]) : null;
            const rawMate = mate ? Number(mate[1]) : null;
            const whiteCp = rawCp === null ? null : (black ? -rawCp : rawCp);
            const whiteMate = rawMate === null ? null : (black ? -rawMate : rawMate);
            const equivalent = whiteCp ?? (whiteMate === null ? null
                : Math.sign(whiteMate) * (100000 - Math.min(999, Math.abs(whiteMate))));
            return { depth, whiteCp, whiteMate, equivalent };
        };

        class Harness {
            constructor(path) {
                this.path = path;
                this.worker = new Worker(path);
                this.lines = [];
                this.waiters = [];
                this.worker.onmessage = event => {
                    const line = String(event.data?.data ?? event.data);
                    this.lines.push(line);
                    for (const waiter of [...this.waiters]) {
                        if (waiter.predicate(line)) {
                            clearTimeout(waiter.timer);
                            this.waiters.splice(this.waiters.indexOf(waiter), 1);
                            waiter.resolve(line);
                        }
                    }
                };
            }
            waitFor(predicate, timeout = 30000) {
                return new Promise((resolve, reject) => {
                    const waiter = { predicate, resolve, timer: null };
                    waiter.timer = setTimeout(() => {
                        this.waiters.splice(this.waiters.indexOf(waiter), 1);
                        reject(new Error(`worker timeout: ${this.path}`));
                    }, timeout);
                    this.waiters.push(waiter);
                });
            }
            async init(options = {}) {
                this.worker.postMessage('uci');
                await this.waitFor(line => line === 'uciok');
                this.options = this.lines.filter(line => line.startsWith('option name '));
                await this.configure(options);
            }
            async configure(options = {}) {
                for (const [name, value] of Object.entries(options)) {
                    this.worker.postMessage(`setoption name ${name} value ${value}`);
                }
                const ready = this.waitFor(line => line === 'readyok');
                this.worker.postMessage('isready');
                await ready;
            }
            async search(fen, policy) {
                const chess = new window.Chess(fen);
                const startIndex = this.lines.length;
                const started = performance.now();
                this.worker.postMessage(`position fen ${fen}`);
                const deadlineMs = policy.movetime ? policy.movetime + 10000 : 15000;
                const terminal = this.waitFor(line => line.startsWith('bestmove'), deadlineMs);
                this.worker.postMessage(policy.movetime ? `go movetime ${policy.movetime}` : `go depth ${policy.depth}`);
                let bestLine;
                let timedOut = false;
                try {
                    bestLine = await terminal;
                } catch (_) {
                    timedOut = true;
                    this.worker.terminate();
                    this.dead = true;
                    bestLine = '';
                }
                const elapsedMs = performance.now() - started;
                const move = bestLine.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] || null;
                const infoLines = this.lines.slice(startIndex).filter(line => line.startsWith('info ')
                    && !/\bmultipv ([2-9]|[1-9]\d+)/.test(line) && /\bscore (?:cp|mate) /.test(line));
                const info = infoLines.length ? parseInfo(infoLines.at(-1), fen)
                    : { depth: 0, whiteCp: null, whiteMate: null, equivalent: null };
                const legal = !!move && !!chess.move({ from: move.slice(0, 2), to: move.slice(2, 4),
                    promotion: move.slice(4) || undefined });
                return { move, legal, timedOut, elapsedMs, ...info };
            }
            terminate() { this.worker.terminate(); }
        }

        const stats = values => {
            const sorted = [...values].sort((a, b) => a - b);
            const mean = sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1);
            const at = percentile => sorted[Math.min(sorted.length - 1,
                Math.max(0, Math.ceil(sorted.length * percentile) - 1))] ?? 0;
            return { mean, median: at(.5), p90: at(.9), max: at(1) };
        };

        const reference = new Harness(sf18Path);
        await reference.init({ MultiPV: 1, Hash: 16, Threads: 1, 'Skill Level': 20,
            UCI_LimitStrength: false });
        const references = [];
        for (const position of corpus) {
            references.push({ ...position, ...(await reference.search(position.fen, { depth: 18 })) });
        }
        reference.terminate();

        const policyRows = [];
        const runSeries = async (enginePath, series, commonOptions = {}) => {
            let engine = new Harness(enginePath);
            await engine.init(commonOptions);
            const optionInventory = engine.options;
            for (const item of series) {
                const configuredOptions = {
                    ...(enginePath === sf18Path ? { 'Skill Level': 20, UCI_LimitStrength: false } : {}),
                    ...(item.options || {})
                };
                await engine.configure(configuredOptions);
                for (const position of corpus) {
                    const result = await engine.search(position.fen, item.search);
                    policyRows.push({ mechanism: item.mechanism, value: item.value,
                        target: item.target ?? null, positionId: position.id, fen: position.fen,
                        turn: position.fen.split(' ')[1], ...result });
                    if (engine.dead) {
                        engine = new Harness(enginePath);
                        await engine.init({ ...commonOptions, ...configuredOptions });
                    }
                }
            }
            engine.terminate();
            return optionInventory;
        };

        const legacyRows = targets.map(item => ({ mechanism: 'legacy-current', value: item.target,
            target: item.target, search: item.movetime ? { movetime: item.movetime } : { depth: item.depth } }));
        await runSeries(legacyPath, legacyRows, { MultiPV: 1 });

        const currentRows = targets.map(item => ({ mechanism: 'sf18-current', value: item.target,
            target: item.target, search: item.movetime ? { movetime: item.movetime } : { depth: item.depth } }));
        const optionInventory = await runSeries(sf18Path, currentRows,
            { MultiPV: 1, Hash: 16, Threads: 1 });

        await runSeries(sf18Path, [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20].map(depth => ({
            mechanism: 'depth', value: depth, search: { depth }
        })), { MultiPV: 1, Hash: 16, Threads: 1 });

        await runSeries(sf18Path, [0, 3, 6, 10, 15, 20].map(skill => ({
            mechanism: 'skill', value: skill, options: { 'Skill Level': skill }, search: { depth: 12 }
        })), { MultiPV: 1, Hash: 16, Threads: 1 });

        await runSeries(sf18Path, [1320, 1600, 2000, 2400, 2800, 3190].map(elo => ({
            mechanism: 'uci-elo', value: elo,
            options: { UCI_LimitStrength: true, UCI_Elo: elo }, search: { movetime: 200 }
        })), { MultiPV: 1, Hash: 16, Threads: 1 });

        await runSeries(sf18Path, [10, 25, 50, 100, 250, 500].map(movetime => ({
            mechanism: 'movetime', value: movetime, search: { movetime }
        })), { MultiPV: 1, Hash: 16, Threads: 1 });

        const evaluation = new Harness(sf18Path);
        await evaluation.init({ MultiPV: 1, Hash: 16, Threads: 1, 'Skill Level': 20,
            UCI_LimitStrength: false });
        const evaluated = new Map();
        for (const row of policyRows) {
            const key = `${row.fen}|${row.move}`;
            if (evaluated.has(key)) continue;
            const chess = new window.Chess(row.fen);
            const played = row.move && chess.move({ from: row.move.slice(0, 2), to: row.move.slice(2, 4),
                promotion: row.move.slice(4) || undefined });
            if (!played) { evaluated.set(key, null); continue; }
            const checkmate = typeof chess.isCheckmate === 'function' ? chess.isCheckmate() : chess.in_checkmate();
            const gameOver = typeof chess.isGameOver === 'function' ? chess.isGameOver() : chess.game_over();
            if (checkmate) {
                evaluated.set(key, played.color === 'w' ? 99999 : -99999);
            } else if (gameOver) {
                evaluated.set(key, 0);
            } else {
                const result = await evaluation.search(chess.fen(), { depth: 14 });
                evaluated.set(key, result.equivalent);
            }
        }
        evaluation.terminate();

        const referenceById = new Map(references.map(item => [item.id, item]));
        for (const row of policyRows) {
            const ref = referenceById.get(row.positionId);
            const candidate = evaluated.get(`${row.fen}|${row.move}`);
            const rawLoss = candidate === null || ref.equivalent === null ? 100000
                : (row.turn === 'w' ? ref.equivalent - candidate : candidate - ref.equivalent);
            row.lossCp = Math.max(0, Math.min(100000, rawLoss));
            row.referenceMove = ref.move;
            row.bestMove = row.move === ref.move;
            row.mateMiss = ref.whiteMate !== null && Math.sign(ref.whiteMate) === (row.turn === 'w' ? 1 : -1)
                && row.move !== ref.move && Math.abs(candidate || 0) < 90000;
        }

        const groups = new Map();
        for (const row of policyRows) {
            const key = `${row.mechanism}:${row.value}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        const summaries = [...groups.entries()].map(([key, rows]) => {
            const losses = rows.map(row => row.lossCp);
            const latency = rows.map(row => row.elapsedMs);
            return {
                key, mechanism: rows[0].mechanism, value: rows[0].value, target: rows[0].target,
                positions: rows.length, legalRate: rows.filter(row => row.legal).length / rows.length,
                timeoutCount: rows.filter(row => row.timedOut).length,
                bestMoveFrequency: rows.filter(row => row.bestMove).length / rows.length,
                largeErrorFrequency: rows.filter(row => row.lossCp >= 100).length / rows.length,
                blunderFrequency: rows.filter(row => row.lossCp >= 300).length / rows.length,
                mateMisses: rows.filter(row => row.mateMiss).length,
                lossCp: stats(losses), latencyMs: stats(latency)
            };
        });
        return {
            corpus: corpus.map(({ id, category, fen }) => ({ id, category, fen })),
            references: references.map(({ id, move, equivalent, whiteMate, elapsedMs }) =>
                ({ id, move, equivalent, whiteMate, elapsedMs })),
            optionInventory: optionInventory.filter(line => /(?:UCI_LimitStrength|UCI_Elo|Skill Level)/.test(line)),
            summaries,
            samples: policyRows.filter(row => ['legacy-current', 'sf18-current'].includes(row.mechanism))
        };
    }, { corpus: CORPUS, targets: TARGETS, sf18Path: SF18, legacyPath: LEGACY });

    expect(report.corpus).toHaveLength(20);
    console.log('ENGINE18_003A_OPTIONS', JSON.stringify(report.optionInventory));
    console.log('ENGINE18_003A_REFERENCES', JSON.stringify(report.references));
    console.log('ENGINE18_003A_SUMMARIES', JSON.stringify(report.summaries));
    expect(report.summaries).not.toHaveLength(0);
});
