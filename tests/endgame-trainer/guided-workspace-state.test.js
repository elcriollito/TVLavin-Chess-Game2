import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGuidedWorkspaceState } from '../../js/endgame-trainer/endgame-trainer-page.js';

test('workspace resolver covers every authoritative state', () => {
    assert.equal(resolveGuidedWorkspaceState(), 'setup');
    assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'guided' }), 'guided-catalog');
    assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'guided', activeLesson: { id: 'lesson' } }), 'guided-lesson');
    assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'guided', pilotSession: { id: 'pilot' } }), 'guided-pilot');
});

test('free practice owns setup even if stale guided references exist', () => {
    assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'free', activeLesson: { id: 'stale' }, pilotSession: { id: 'stale' } }), 'setup');
});

test('pilot ownership wins deterministically over a stale standard lesson', () => {
    assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'guided', activeLesson: { id: 'stale' }, pilotSession: { id: 'pilot' } }), 'guided-pilot');
});

test('50 standard and 50 pilot transitions return to the catalog without stale state', () => {
    for (let index = 0; index < 50; index += 1) {
        const catalog = { trainingMode: 'guided', activeLesson: null, pilotSession: null };
        assert.equal(resolveGuidedWorkspaceState(catalog), 'guided-catalog');
        const standard = { ...catalog, activeLesson: { id: `lesson-${index}` } };
        assert.equal(resolveGuidedWorkspaceState(standard), 'guided-lesson');
        assert.equal(resolveGuidedWorkspaceState({ ...standard, activeLesson: null }), 'guided-catalog');
        const learn = { ...catalog, pilotSession: { id: `learn-${index}` } };
        const recall = { ...catalog, pilotSession: { id: `recall-${index}` } };
        assert.equal(resolveGuidedWorkspaceState(learn), 'guided-pilot');
        assert.equal(resolveGuidedWorkspaceState(recall), 'guided-pilot');
        assert.equal(resolveGuidedWorkspaceState({ ...recall, pilotSession: null }), 'guided-catalog');
    }
});

test('50 catalog and setup transitions remain deterministic', () => {
    for (let index = 0; index < 50; index += 1) {
        assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'free' }), 'setup');
        assert.equal(resolveGuidedWorkspaceState({ trainingMode: 'guided' }), 'guided-catalog');
    }
});
