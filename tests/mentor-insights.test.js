import test from 'node:test';
import assert from 'node:assert/strict';
import { createMentorInsights, MENTOR_INSIGHT_LIMITS } from '../js/mentor/mentor-insights.js';

const completed = overrides => ({ ownerId: 'account-a', status: 'completed', verified: true,
    source: 'chesscom', username: 'PlayerA', analysisId: 'analysis-1', completedGames: 10,
    themes: [{ theme: 'development', sampleGames: 3 }, { theme: 'kingSafety', sampleGames: 2 }], ...overrides });

test('only verified completed evidence creates a grounded unread training idea', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' });
    assert.deepEqual(controller.read(), { unread: false, idea: null, disposed: false });
    const response = controller.receive(completed());
    assert.equal(response.accepted, true); assert.equal(response.state.unread, true);
    assert.match(response.state.idea.localMessage, /10 Chess\.com games for PlayerA/);
    assert.match(response.state.idea.localMessage, /piece development in 3 of 10 analyzed games/);
    assert.match(response.state.idea.planPrompt, /not error rates/);
    assert.ok(Object.isFrozen(response)); assert.ok(Object.isFrozen(response.state));
    assert.ok(Object.isFrozen(response.state.idea)); assert.ok(Object.isFrozen(response.state.idea.themes));
    assert.ok(Object.isFrozen(response.state.idea.themes[0]));
});

test('pending, errors, unsupported sources, empty or invalid evidence leave state empty', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' });
    for (const summary of [null, [], completed({ status: 'pending' }), completed({ status: 'error' }),
        completed({ verified: false }), completed({ source: 'unknown' }), completed({ themes: [] }),
        completed({ completedGames: 0 }), completed({ completedGames: 101 }), completed({ completedGames: 2.5 }),
        completed({ analysisId: '' }), completed({ analysisId: 'bad\nid' }), completed({ username: ' bad' }),
        completed({ themes: [{ theme: 'unknown', sampleGames: 1 }] }),
        completed({ themes: [{ theme: 'tactics', sampleGames: 11 }] }),
        completed({ themes: [{ theme: 'tactics', sampleGames: 0 }] }),
        completed({ themes: [{ theme: 'tactics', sampleGames: 1.5 }] }),
        completed({ themes: [{ theme: 'tactics', sampleGames: 1 }, { theme: 'tactics', sampleGames: 2 }] })]) {
        assert.equal(controller.receive(summary).accepted, false);
        assert.deepEqual(controller.read(), { unread: false, idea: null, disposed: false });
    }
});

test('acknowledgement preserves latest evidence and duplicate events do not relight it', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' });
    controller.receive(completed()); const before = controller.read();
    const after = controller.acknowledge(); assert.equal(after.unread, false); assert.equal(after.idea, before.idea);
    assert.equal(before.unread, true);
    assert.equal(controller.receive(completed()).reason, 'duplicate-analysis');
    assert.equal(controller.read().unread, false);
    controller.receive(completed({ analysisId: 'analysis-2' }));
    assert.equal(controller.read().unread, true); assert.equal(controller.read().idea.analysisId, 'analysis-2');
});

test('duplicate tracking is bounded and analysis IDs are scoped by source and username', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' });
    for (let id = 0; id < MENTOR_INSIGHT_LIMITS.rememberedAnalyses + 1; id++) assert.equal(controller.receive(completed({ analysisId: `id-${id}` })).accepted, true);
    assert.equal(controller.receive(completed({ analysisId: 'id-1' })).reason, 'duplicate-analysis');
    assert.equal(controller.receive(completed({ analysisId: 'id-0' })).accepted, true);
    assert.equal(controller.receive(completed({ analysisId: 'id-0', source: 'lichess' })).accepted, true);
    assert.equal(controller.receive(completed({ analysisId: 'id-0', username: 'OtherPlayer' })).accepted, true);
});

test('owner transitions and disposal cannot expose another account’s stale idea', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' });
    controller.receive(completed());
    assert.equal(controller.receive(completed({ ownerId: 'account-b' })).reason, 'owner-mismatch');
    assert.deepEqual(controller.reset('account-b'), { unread: false, idea: null, disposed: false });
    assert.equal(controller.receive(completed()).reason, 'owner-mismatch');
    assert.equal(controller.receive(completed({ ownerId: 'account-b' })).accepted, true);
    assert.deepEqual(controller.reset(), { unread: false, idea: null, disposed: false });
    assert.equal(controller.receive(completed()).accepted, false);
    assert.deepEqual(controller.dispose(), { unread: false, idea: null, disposed: true });
    controller.reset('account-a'); assert.equal(controller.receive(completed()).reason, 'disposed');
});

test('received summaries are detached from upstream mutation and single-game grammar is grounded', () => {
    const controller = createMentorInsights({ ownerId: 'account-a' }), summary = completed({
        source: 'caissa', completedGames: 1, themes: [{ theme: 'endgame', sampleGames: 1 }] });
    controller.receive(summary); summary.themes[0].sampleGames = 999; summary.username = 'Changed';
    assert.equal(controller.read().idea.themes[0].sampleGames, 1);
    assert.match(controller.read().idea.localMessage, /1 CAISSA game for PlayerA/);
});
