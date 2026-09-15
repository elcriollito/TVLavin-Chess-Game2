import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, ROOT), 'utf8');

function loadStrength() {
    const window = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.runInNewContext(read('js/play/opponent-strength.js'), { window, globalThis: window, Object, Number });
    return window.CaissaOpponentStrengthSession;
}

const SF18_GAME = { role: 'game', providerKey: 'stockfish-18-gameplay' };
const LEGACY_GAME = { role: 'game', providerKey: 'legacy-stockfish-2019' };
const LEGACY_COACH = { role: 'coach-active', providerKey: 'legacy-stockfish-2019' };

test('SF18 Game low tiers use the selected Skill plus 50 ms bounded policy', () => {
    const session = loadStrength();
    for (const [target, skill] of [[250, 0], [500, 4], [800, 8], [1200, 12], [1600, 16]]) {
        session.beginGame(target);
        assert.deepEqual(JSON.parse(JSON.stringify(session.getSearchOptions(SF18_GAME))), {
            movetime: 50, targetElo: target, calibrationStatus: 'engine18-003b-skill-movetime-v1'
        });
        assert.deepEqual(JSON.parse(JSON.stringify(session.getEngineOptions(SF18_GAME))), {
            'Skill Level': skill, UCI_LimitStrength: false, UCI_Elo: 1320
        });
    }
});

test('intermediate selector steps interpolate Skill monotonically without changing displayed targets', () => {
    const session = loadStrength(); const skills = [];
    for (let target = 250; target <= 1600; target += 50) {
        session.beginGame(target); skills.push(session.getEngineOptions(SF18_GAME)['Skill Level']);
    }
    assert.equal(skills[0], 0); assert.equal(skills.at(-1), 16);
    for (let index = 1; index < skills.length; index += 1) assert.ok(skills[index] >= skills[index - 1]);
});

test('Play 2000 through 3200 retains the exact ENGINE18-003A policy and restores full Skill', () => {
    const session = loadStrength();
    for (const [target, depth] of [[2000, 12], [2400, 16], [2800, 18]]) {
        session.beginGame(target);
        assert.equal(session.getSearchOptions(SF18_GAME).depth, depth);
        assert.deepEqual(JSON.parse(JSON.stringify(session.getEngineOptions(SF18_GAME))), {
            'Skill Level': 20, UCI_LimitStrength: false, UCI_Elo: 1320
        });
    }
    session.beginGame(3200);
    assert.equal(session.getSearchOptions(SF18_GAME), null);
    assert.equal(session.getEngineOptions(SF18_GAME)['Skill Level'], 20);
});

test('legacy Game and Bots remain unchanged while only legacy Coach GM gets a bounded timeout fix', () => {
    const session = loadStrength();
    session.beginGame(2800);
    assert.equal(session.getSearchOptions(LEGACY_GAME).depth, 20);
    assert.equal(session.getSearchOptions({ role: 'bots', providerKey: 'legacy-stockfish-2019' }).depth, 20);
    assert.deepEqual(JSON.parse(JSON.stringify(session.getSearchOptions(LEGACY_COACH))), {
        movetime: 2000, targetElo: 2800, calibrationStatus: 'engine18-003b-coach-gm-timeout-v1'
    });
    session.beginGame(2400);
    assert.equal(session.getSearchOptions(LEGACY_COACH).depth, 16);
    assert.equal(session.getEngineOptions(LEGACY_COACH), null);
});

test('app passes explicit SF18 options through attributed search and records real movetime isolation', () => {
    const app = read('app.js');
    assert.match(app, /getEngineOptions\?\.\(strengthContext\)/);
    assert.match(app, /engineSearch = \{ \.\.\.\(botSearch \|\| \{ movetime: 2000 \}\)/);
    assert.match(app, /moveTimeMs: engineSearch\.movetime \|\| null/);
    assert.match(app, /uciOptions: targetEngineOptions/);
});

test('correction adds no Bot personality, board, network, random, or Worker authority', () => {
    const strength = read('js/play/opponent-strength.js');
    for (const forbidden of [/CaissaBot|BotPersonalityPolicy|safe-loss/i, /Math\.random/, /new\s+Worker/,
        /fetch\s*\(/, /Chessboard|CaissaBoard|PersistentRenderer/]) assert.doesNotMatch(strength, forbidden);
});

test('correction evidence freezes actual UCI bounds, three-repeat metrics, and physical priority', () => {
    const evidence = JSON.parse(read('tests/fixtures/engine18/engine18-003b-correction.json'));
    assert.equal(evidence.contractId, 'ENGINE18-003B');
    assert.match(evidence.runtimeInventory.join('\n'), /Skill Level type spin default 20 min 0 max 20/);
    assert.match(evidence.runtimeInventory.join('\n'), /UCI_Elo type spin default 1320 min 1320 max 3190/);
    assert.equal(evidence.physicalFinding.decisionPriority, 'physical-human-play-over-synthetic-corpus');
    assert.equal(evidence.physicalFinding.recertificationStatus, 'pending-on-new-preview');
    assert.deepEqual(evidence.selectedMetrics.map(item => item.observations), [78, 78, 78, 78, 78]);
    assert.ok(evidence.selectedMetrics.every(item => item.legalRate === 1
        && item.hangingPieceAvoidanceRate === 1 && item.maxMs <= 51));
    assert.equal(evidence.coachDiagnosis.provider, 'legacy-stockfish-2019');
    assert.equal(evidence.coachCorrection.lowerCoachPoliciesChanged, false);
    assert.equal(evidence.coachCorrection.coachSf18Migration, false);
});
