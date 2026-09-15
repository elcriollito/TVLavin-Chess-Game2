import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const SF18 = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';
const prior = JSON.parse(fs.readFileSync(new URL('../fixtures/engine18/engine18-003a-calibration.json', import.meta.url), 'utf8'));
const EXPANDED = Object.freeze([
    { id: 'beginner-loose-rook', category: 'hanging-piece', fen: '4k3/8/8/3r4/3Q4/8/8/4K3 b - - 0 1' },
    { id: 'beginner-loose-queen', category: 'obvious-tactic', fen: '4k3/8/8/3q4/3R4/8/8/4K3 w - - 0 1' },
    { id: 'beginner-knight-takes-queen', category: 'obvious-tactic', fen: '4k3/8/8/8/3q4/5N2/8/4K3 w - - 0 1' },
    { id: 'beginner-free-pawn', category: 'obvious-capture', fen: '4k3/8/8/8/3p4/2P5/8/4K3 w - - 0 1' },
    { id: 'beginner-en-passant', category: 'obvious-capture', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2' },
    { id: 'beginner-promote-now', category: 'obvious-tactic', fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' },
    { id: 'beginner-stop-promotion', category: 'obvious-threat', fen: '4k3/8/8/8/8/8/p7/4K3 w - - 0 1' },
    { id: 'beginner-develop-or-pawn', category: 'development', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' },
    { id: 'beginner-king-safety', category: 'king-safety', fen: 'rnbq1rk1/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQ - 3 5' },
    { id: 'beginner-recapture', category: 'obvious-capture', fen: 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3' }
]);

const CORPUS = Object.freeze([
    ...prior.corpus.filter(item => !['hanging-black-queen', 'hanging-white-queen', 'knight-wins-queen', 'promotion'].includes(item.id)),
    ...EXPANDED
]);
const OBVIOUS = new Set(['obvious-tactic', 'obvious-capture', 'obvious-threat']);

test('ENGINE18-003B actual SF18 low-tier mechanism experiment', async ({ page }) => {
    test.setTimeout(15 * 60 * 1000);
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.goto('/play');
    await page.waitForFunction(() => window.Chess && window.App?.engine);

    const report = await page.evaluate(async ({ corpus, obvious, sf18Path }) => {
        window.App.engine?.terminate?.('engine18-003b-experiment');
        const parseInfo = (line, fen) => {
            const cp = line.match(/\bscore cp (-?\d+)/); const mate = line.match(/\bscore mate (-?\d+)/);
            const black = fen.split(' ')[1] === 'b';
            const rawCp = cp ? Number(cp[1]) : null; const rawMate = mate ? Number(mate[1]) : null;
            const whiteCp = rawCp === null ? null : (black ? -rawCp : rawCp);
            const whiteMate = rawMate === null ? null : (black ? -rawMate : rawMate);
            return { whiteCp, whiteMate, equivalent: whiteCp ?? (whiteMate === null ? null
                : Math.sign(whiteMate) * (100000 - Math.min(999, Math.abs(whiteMate)))) };
        };
        class Harness {
            constructor(path) {
                this.path = path; this.worker = new Worker(path); this.lines = []; this.waiters = [];
                this.worker.onmessage = event => {
                    const line = String(event.data?.data ?? event.data); this.lines.push(line);
                    for (const waiter of [...this.waiters]) if (waiter.predicate(line)) {
                        clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1); waiter.resolve(line);
                    }
                };
            }
            waitFor(predicate, timeout = 20000) {
                return new Promise((resolve, reject) => {
                    const waiter = { predicate, resolve, timer: null };
                    waiter.timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(waiter), 1);
                        reject(new Error(`worker timeout: ${this.path}`)); }, timeout);
                    this.waiters.push(waiter);
                });
            }
            async init() {
                this.worker.postMessage('uci'); await this.waitFor(line => line === 'uciok');
                this.options = this.lines.filter(line => line.startsWith('option name '));
                await this.configure({ MultiPV: 1, Hash: 16, Threads: 1, 'Skill Level': 20,
                    UCI_LimitStrength: false, UCI_Elo: 1320 });
            }
            async configure(options) {
                for (const [name, value] of Object.entries(options))
                    this.worker.postMessage(`setoption name ${name} value ${value}`);
                const ready = this.waitFor(line => line === 'readyok'); this.worker.postMessage('isready'); await ready;
            }
            async search(fen, policy) {
                const chess = new window.Chess(fen); const from = this.lines.length; const started = performance.now();
                this.worker.postMessage(`position fen ${fen}`);
                const best = this.waitFor(line => line.startsWith('bestmove'), (policy.movetime || 0) + 20000);
                this.worker.postMessage(policy.movetime ? `go movetime ${policy.movetime}` : `go depth ${policy.depth}`);
                const bestLine = await best; const elapsedMs = performance.now() - started;
                const move = bestLine.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] || null;
                const infoLines = this.lines.slice(from).filter(line => line.startsWith('info ')
                    && !/\bmultipv ([2-9]|[1-9]\d+)/.test(line) && /\bscore (?:cp|mate) /.test(line));
                const info = infoLines.length ? parseInfo(infoLines.at(-1), fen)
                    : { whiteCp: null, whiteMate: null, equivalent: null };
                const legal = !!move && !!chess.move({ from: move.slice(0, 2), to: move.slice(2, 4),
                    promotion: move.slice(4) || undefined });
                return { move, elapsedMs, legal, ...info };
            }
            terminate() { this.worker.terminate(); }
        }
        const baseOptions = { 'Skill Level': 20, UCI_LimitStrength: false, UCI_Elo: 1320 };
        const reference = new Harness(sf18Path); await reference.init();
        const references = [];
        for (const position of corpus) references.push({ ...position,
            ...(await reference.search(position.fen, { depth: 18 })) });
        reference.terminate();

        const tiers = [
            { target: 250, skill: 0, currentDepth: 1, hybridDepth: 4 },
            { target: 500, skill: 2, currentDepth: 2, hybridDepth: 5 },
            { target: 800, skill: 5, currentDepth: 3, hybridDepth: 6 },
            { target: 1200, skill: 8, currentDepth: 5, hybridDepth: 8 },
            { target: 1600, skill: 12, currentDepth: 8, hybridDepth: 10 }
        ];
        const policies = [
            ...tiers.map(t => ({ id: `current-${t.target}`, group: 'current-depth', target: t.target,
                options: baseOptions, search: { depth: t.currentDepth } })),
            ...tiers.map(t => ({ id: `skill-depth-${t.target}`, group: 'skill-depth8', target: t.target,
                options: { ...baseOptions, 'Skill Level': t.skill }, search: { depth: 8 } })),
            ...tiers.map(t => ({ id: `skill-time-${t.target}`, group: 'skill-movetime50', target: t.target,
                options: { ...baseOptions, 'Skill Level': t.skill }, search: { movetime: 50 } })),
            ...tiers.map(t => ({ id: `hybrid-${t.target}`, group: 'hybrid-skill-depth', target: t.target,
                options: { ...baseOptions, 'Skill Level': t.skill }, search: { depth: t.hybridDepth } })),
            ...tiers.map(t => ({ id: `movetime-${t.target}`, group: 'movetime-only', target: t.target,
                options: baseOptions, search: { movetime: [5, 10, 25, 50, 100][tiers.indexOf(t)] } })),
            { id: 'elo-1320', group: 'uci-elo', target: 1320,
                options: { ...baseOptions, UCI_LimitStrength: true, UCI_Elo: 1320 }, search: { movetime: 100 } },
            { id: 'elo-1600', group: 'uci-elo', target: 1600,
                options: { ...baseOptions, UCI_LimitStrength: true, UCI_Elo: 1600 }, search: { movetime: 100 } }
        ];
        const spacedSkills = [0, 4, 8, 12, 16];
        for (let repeat = 1; repeat <= 3; repeat += 1) {
            tiers.forEach((tier, index) => policies.push({
                id: `spaced-r${repeat}-${tier.target}`, group: 'skill-movetime50-spaced', target: tier.target,
                options: { ...baseOptions, 'Skill Level': spacedSkills[index] }, search: { movetime: 50 }
            }));
        }
        const engine = new Harness(sf18Path); await engine.init(); const rows = [];
        for (const policy of policies) {
            await engine.configure(policy.options);
            for (const position of corpus) rows.push({ policyId: policy.id, group: policy.group,
                target: policy.target, positionId: position.id, category: position.category, fen: position.fen,
                turn: position.fen.split(' ')[1], ...(await engine.search(position.fen, policy.search)) });
        }
        engine.terminate();

        const evaluator = new Harness(sf18Path); await evaluator.init(); const evaluations = new Map();
        for (const row of rows) {
            const key = `${row.fen}|${row.move}`; if (evaluations.has(key)) continue;
            const chess = new window.Chess(row.fen);
            const played = row.move && chess.move({ from: row.move.slice(0, 2), to: row.move.slice(2, 4),
                promotion: row.move.slice(4) || undefined });
            if (!played) { evaluations.set(key, null); continue; }
            const checkmate = chess.isCheckmate?.() ?? chess.in_checkmate();
            const gameOver = chess.isGameOver?.() ?? chess.game_over();
            if (checkmate) evaluations.set(key, played.color === 'w' ? 99999 : -99999);
            else if (gameOver) evaluations.set(key, 0);
            else evaluations.set(key, (await evaluator.search(chess.fen(), { depth: 14 })).equivalent);
        }
        evaluator.terminate();
        const referenceById = new Map(references.map(item => [item.id, item]));
        for (const row of rows) {
            const ref = referenceById.get(row.positionId); const candidate = evaluations.get(`${row.fen}|${row.move}`);
            const raw = candidate === null || ref.equivalent === null ? 100000
                : (row.turn === 'w' ? ref.equivalent - candidate : candidate - ref.equivalent);
            row.lossCp = Math.max(0, Math.min(100000, raw)); row.referenceMove = ref.move;
            row.bestMove = row.move === ref.move; row.obvious = obvious.includes(row.category);
        }
        const stats = values => { const sorted = [...values].sort((a, b) => a - b);
            const pick = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
            return { mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, median: pick(.5),
                p90: pick(.9), max: pick(1) }; };
        const groups = new Map();
        for (const row of rows) { const key = row.policyId; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
        const summaries = [...groups.entries()].map(([id, values]) => {
            const obviousRows = values.filter(row => row.obvious);
            return { id, group: values[0].group, target: values[0].target, positions: values.length,
                legalRate: values.filter(row => row.legal).length / values.length,
                bestRate: values.filter(row => row.bestMove).length / values.length,
                obviousSolveRate: obviousRows.filter(row => row.lossCp < 100).length / obviousRows.length,
                hangingPieceAvoidanceRate: values.filter(row => row.category === 'hanging-piece'
                    && row.lossCp < 100).length / Math.max(1, values.filter(row => row.category === 'hanging-piece').length),
                largeErrorRate: values.filter(row => row.lossCp >= 100).length / values.length,
                blunderRate: values.filter(row => row.lossCp >= 300).length / values.length,
                lossCp: stats(values.map(row => row.lossCp)), latencyMs: stats(values.map(row => row.elapsedMs)) };
        });
        const spacedSummary = tiers.map(tier => {
            const values = rows.filter(row => row.group === 'skill-movetime50-spaced' && row.target === tier.target);
            const obviousRows = values.filter(row => row.obvious);
            return { target: tier.target, skill: spacedSkills[tiers.indexOf(tier)], positions: values.length,
                legalRate: values.filter(row => row.legal).length / values.length,
                bestRate: values.filter(row => row.bestMove).length / values.length,
                obviousSolveRate: obviousRows.filter(row => row.lossCp < 100).length / obviousRows.length,
                largeErrorRate: values.filter(row => row.lossCp >= 100).length / values.length,
                blunderRate: values.filter(row => row.lossCp >= 300).length / values.length,
                lossCp: stats(values.map(row => row.lossCp)), latencyMs: stats(values.map(row => row.elapsedMs)) };
        });
        return { corpus, optionInventory: engine.options?.filter(line => /Skill Level|UCI_LimitStrength|UCI_Elo/.test(line)) || [],
            references: references.map(({ id, category, move, equivalent, whiteMate }) => ({ id, category, move, equivalent, whiteMate })),
            summaries, spacedSummary, selectedExamples: rows.filter(row => row.policyId.startsWith('spaced-r1-')
                && ['beginner-loose-queen', 'beginner-free-pawn', 'beginner-stop-promotion',
                    'beginner-develop-or-pawn', 'beginner-king-safety'].includes(row.positionId)) };
    }, { corpus: CORPUS, obvious: [...OBVIOUS], sf18Path: SF18 });
    console.log('ENGINE18_003B_OPTIONS', JSON.stringify(report.optionInventory));
    console.log('ENGINE18_003B_REFERENCES', JSON.stringify(report.references));
    console.log('ENGINE18_003B_SUMMARIES', JSON.stringify(report.summaries));
    console.log('ENGINE18_003B_SPACED', JSON.stringify(report.spacedSummary));
    console.log('ENGINE18_003B_EXAMPLES', JSON.stringify(report.selectedExamples));
    expect(report.corpus).toHaveLength(26);
    expect(report.summaries).toHaveLength(42);
    for (const summary of report.summaries) expect(summary.legalRate).toBe(1);
});
