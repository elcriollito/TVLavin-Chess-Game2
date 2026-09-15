import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, ROOT), 'utf8');
const manifest = JSON.parse(read('tests/fixtures/engine18/engine18-003a-calibration.json'));

function loadStrength() {
    const window = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.runInNewContext(read('js/play/opponent-strength.js'), { window, globalThis: window, Object, Number });
    return window;
}

test('calibration corpus is broad, deterministic, unique, and valid chess input', async () => {
    assert.equal(manifest.corpus.length, 20);
    assert.equal(new Set(manifest.corpus.map(item => item.id)).size, 20);
    assert.equal(new Set(manifest.corpus.map(item => item.fen)).size, 20);
    const required = ['opening', 'quiet', 'positional', 'middlegame', 'simple-tactic', 'forcing',
        'endgame', 'material-imbalance', 'quiet-endgame'];
    const categories = new Set(manifest.corpus.map(item => item.category));
    for (const category of required) assert.equal(categories.has(category), true, category);
    const { Chess } = await import('chess.js');
    for (const position of manifest.corpus) {
        const chess = new Chess(position.fen);
        assert.equal(chess.isGameOver(), false, position.id);
        assert.ok(chess.moves().length > 0, position.id);
    }
});

test('ENGINE18-003A high-tier policy remains exact while 003B supersedes only low tiers', () => {
    const { CaissaOpponentStrength: strength, CaissaOpponentStrengthSession: session } = loadStrength();
    for (const expected of manifest.selectedPolicy.targets) {
        const description = strength.describe(expected.target).value;
        assert.equal(description.searchDepth, expected.target === 2800 ? 20 : expected.depth,
            `legacy description target ${expected.target}`);
        session.beginGame(expected.target);
        const search = session.getSearchOptions({ role: 'game', providerKey: 'stockfish-18-gameplay' });
        if (expected.target <= 1600) {
            assert.equal(search.movetime, 50, `target ${expected.target}`);
            assert.equal(search.calibrationStatus, 'engine18-003b-skill-movetime-v1');
        } else {
            assert.equal(search?.depth ?? null, expected.depth, `target ${expected.target}`);
            assert.equal(search === null ? 2000 : null, expected.movetimeMs, `target ${expected.target}`);
            if (search) assert.equal(search.calibrationStatus, 'engine18-003a-depth-v1');
        }
    }
    assert.equal(manifest.selectedPolicy.mechanism, 'bounded-depth');
    assert.equal(manifest.selectedPolicy.externalRandomness, false);
    assert.deepEqual(manifest.selectedPolicy.options,
        { MultiPV: 1, Hash: 16, Threads: 1, 'Skill Level': 20, UCI_LimitStrength: false });
});

test('003A calibration remains scoped to SF18 Preview Game outside the documented Coach GM correction', () => {
    const { CaissaOpponentStrengthSession: session } = loadStrength();
    session.beginGame(2800);
    const contexts = [
        null,
        { role: 'game', providerKey: 'legacy-stockfish-2019' },
        { role: 'bots', providerKey: 'legacy-stockfish-2019' },
        { role: 'coach-active', providerKey: 'stockfish-18-gameplay' },
        { role: 'game', providerKey: 'stockfish-18-lite' }
    ];
    for (const context of contexts) {
        assert.equal(session.getSearchOptions(context).depth, 20, JSON.stringify(context));
        assert.equal(session.getSearchOptions(context).calibrationStatus, 'target-strength-pending-calibration');
    }
    assert.equal(session.getSearchOptions({ role: 'coach-active', providerKey: 'legacy-stockfish-2019' }).movetime, 2000);
    assert.equal(session.getSearchOptions({ role: 'game', providerKey: 'stockfish-18-gameplay' }).depth, 18);
});

test('all measured SF18 target searches are legal, mate-safe, and complete', () => {
    assert.equal(manifest.metrics.sf18Uncalibrated.length, 9);
    for (const row of manifest.metrics.sf18Uncalibrated) {
        assert.equal(row.legalRate, 1, `target ${row.target}`);
        assert.equal(row.mateMisses, 0, `target ${row.target}`);
    }
    assert.equal(manifest.metrics.sf18Calibrated2800.legalRate, 1);
    assert.equal(manifest.metrics.sf18Calibrated2800.mateMisses, 0);
});

test('low and middle depth tiers preserve the legacy experience without custom errors', () => {
    const legacy = new Map(manifest.metrics.legacy.map(row => [row.target, row]));
    for (const row of manifest.metrics.sf18Uncalibrated.filter(item => item.target <= 2000)) {
        assert.ok(Math.abs(row.meanCp - legacy.get(row.target).meanCp) <= 21, `target ${row.target}`);
        assert.ok(row.bestRate >= 0.45 && row.bestRate <= 0.70, `target ${row.target}`);
    }
    assert.equal(manifest.mechanismFindings.externalRandomBlunders.includes('not evaluated'), true);
});

test('depth 18 materially reduces the 2800 latency tail without weakening quality', () => {
    const before = manifest.metrics.sf18Uncalibrated.find(row => row.target === 2800);
    const after = manifest.metrics.sf18Calibrated2800;
    assert.ok(after.meanMs < before.meanMs * 0.5);
    assert.ok(after.p90Ms < before.p90Ms * 0.6);
    assert.ok(after.maxMs < before.maxMs * 0.6);
    assert.ok(after.meanCp <= before.meanCp + 1);
    assert.equal(after.bestRate, before.bestRate);
});

test('003A native Elo, Skill Level, and movetime findings remain frozen historical evidence', () => {
    assert.equal(manifest.candidatePolicies.uciEloMinimum, 1320);
    assert.ok(manifest.candidatePolicies.uciEloMinimum > 1200);
    assert.match(manifest.mechanismFindings.uciLimitStrength, /rejected/i);
    assert.match(manifest.mechanismFindings.skillLevel, /rejected/i);
    assert.match(manifest.mechanismFindings.movetime, /rejected/i);
    assert.doesNotMatch(read('js/play/opponent-strength.js'), /Math\.random/);
});

test('aggregate ladder has no systematic inversion and keeps 3200 full power', () => {
    assert.equal(manifest.monotonicity.acceptable, true);
    assert.equal(manifest.monotonicity.systematicInversions, false);
    const targets = manifest.selectedPolicy.targets;
    assert.deepEqual(targets.map(item => item.target), [250, 500, 800, 1200, 1600, 2000, 2400, 2800, 3200]);
    assert.deepEqual(targets.slice(0, -1).map(item => item.depth), [1, 2, 3, 5, 8, 12, 16, 18]);
    assert.equal(targets.at(-1).openingBookEligible, true);
    assert.equal(targets.at(-1).movetimeMs, 2000);
});

test('calibration scope cannot acquire worker, board, network, Coach, or Bots authority', () => {
    const source = read('js/play/opponent-strength.js');
    for (const forbidden of [/new\s+Worker/, /fetch\s*\(/, /XMLHttpRequest|WebSocket|sendBeacon/,
        /Chessboard|CaissaBoard|ClockService/, /CaissaBot|BotPersonalityPolicy/i]) {
        assert.doesNotMatch(source, forbidden);
    }
});
