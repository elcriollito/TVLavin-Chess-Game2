import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';
import { selectCuratedPositions } from '../../js/endgame-trainer/v2/curated-pool-consumer.js';
import { QuickChallengeOrchestrator } from '../../js/endgame-trainer/v2/quick-challenge-orchestrator.js';

const pool = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json',
    import.meta.url
), 'utf8'));

function items(seed = 'orchestrator-test') {
    return selectCuratedPositions(pool, { count: 5, seed });
}

function intent(lan) {
    return { from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan.slice(4) || null };
}

function wrongLegalIntent(item) {
    const accepted = new Set([item.expectedLan, ...item.acceptedAlternatives.map(({ lan }) => lan)]);
    const rules = ChessRulesFacade.fromFen(item.fen);
    const move = rules.legalMoves({ verbose: true }).find((candidate) =>
        !accepted.has(`${candidate.from}${candidate.to}${candidate.promotion || ''}`));
    return intent(`${move.from}${move.to}${move.promotion || ''}`);
}

test('orchestrator runs the deterministic five-item happy path once', async () => {
    let now = 1000;
    const selected = items();
    const session = new QuickChallengeOrchestrator({ pool, items: selected, now: () => now });
    assert.equal(await session.start(), true);
    assert.equal(await session.start(), false);
    for (let index = 0; index < selected.length; index += 1) {
        now += 2500;
        assert.equal(session.submitMove(intent(selected[index].expectedLan)), true);
        assert.equal(session.submitMove(intent(selected[index].expectedLan)), false);
        assert.equal(session.getState().results[index].elapsedMs, 2500);
        assert.equal(session.getState().results[index].points, 100);
        assert.equal(await session.continue(), true);
    }
    assert.equal(session.getState().phase, 'completed');
    assert.equal(session.getState().score, 500);
    assert.equal(session.getState().bestStreak, 5);
    assert.equal(await session.continue(), false);
});

test('explicit accepted alternative succeeds deterministically', async () => {
    const alternativeItem = pool.positions.find(({ acceptedAlternatives }) => acceptedAlternatives.length);
    const selected = Object.freeze([alternativeItem, ...pool.positions.filter((item) =>
        item.positionId !== alternativeItem.positionId).slice(0, 4)]);
    const session = new QuickChallengeOrchestrator({ pool, items: selected, now: () => 0 });
    await session.start();
    assert.equal(session.submitMove(intent(alternativeItem.acceptedAlternatives[0].lan)), true);
    assert.equal(session.getState().results[0].kind, 'correct');
    assert.equal(session.getState().score, 100);
    assert.equal(session.getState().feedback, alternativeItem.feedback.correct);
});

test('hint assistance, wrong moves, and skip have explicit score and streak effects', async () => {
    let now = 0;
    const selected = items('mixed-effects');
    const session = new QuickChallengeOrchestrator({ pool, items: selected, now: () => now });
    await session.start();
    assert.equal(session.revealHint(), true);
    now = 1200;
    session.submitMove(intent(selected[0].expectedLan));
    assert.equal(session.getState().score, 50);
    assert.equal(session.getState().currentStreak, 0);
    await session.continue();
    assert.equal(session.submitMove(wrongLegalIntent(selected[1])), true);
    assert.equal(session.getState().results[1].kind, 'incorrect');
    assert.equal(session.getState().score, 50);
    assert.equal(session.getState().feedback, selected[1].feedback.incorrect);
    await session.continue();
    assert.equal(session.skip(), true);
    assert.equal(session.skip(), false);
    assert.equal(session.getState().results[2].kind, 'skipped');
});

test('final-answer reveal completes practice without independent points', async () => {
    const session = new QuickChallengeOrchestrator({ pool, items: items(), now: () => 0 });
    await session.start();
    assert.equal(session.revealHint(), true);
    assert.equal(session.getState().phase, 'active');
    assert.equal(session.revealHint(), true);
    assert.equal(session.getState().phase, 'feedback');
    assert.equal(session.getState().results[0].kind, 'revealed');
    assert.equal(session.getState().score, 0);
    assert.equal(session.getState().completedItems, 0);
});

test('invalid or out-of-state moves do not advance the session', async () => {
    const session = new QuickChallengeOrchestrator({ pool, items: items(), now: () => 0 });
    assert.equal(session.submitMove(intent('a1a2')), false);
    await session.start();
    assert.equal(session.submitMove(intent('a1a2')), false);
    assert.equal(session.getState().phase, 'active');
    assert.equal(session.getState().results.length, 0);
});

test('unavailable items are neutral and Continue safely advances', async () => {
    const selected = items();
    const session = new QuickChallengeOrchestrator({
        pool, items: selected, now: () => 0,
        loadItem: async (item) => item.positionId !== selected[0].positionId
    });
    assert.equal(await session.start(), false);
    assert.equal(session.getState().phase, 'unavailable');
    assert.equal(session.getState().unavailableItems, 1);
    assert.equal(session.getState().score, 0);
    assert.equal(session.getState().currentStreak, 0);
    assert.equal(await session.continue(), true);
    assert.equal(session.getState().index, 1);
});

test('load recovery, abandonment, and stale ownership are guarded', async () => {
    let settle;
    const pending = new Promise((resolve) => { settle = resolve; });
    const session = new QuickChallengeOrchestrator({
        pool, items: items(), now: () => 0, loadItem: () => pending
    });
    const starting = session.start();
    assert.equal(session.abandon(), true);
    settle(true);
    assert.equal(await starting, false);
    assert.equal(session.getState().phase, 'abandoned');
    assert.equal(session.abandon(), false);

    const recovering = new QuickChallengeOrchestrator({
        pool, items: items(), now: () => 0,
        loadItem: async () => { throw new Error('fixture-load'); }
    });
    assert.equal(await recovering.start(), false);
    assert.equal(recovering.getState().phase, 'recovering');
    assert.equal(recovering.getState().score, 0);
});
