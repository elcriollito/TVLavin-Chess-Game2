import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ESSENTIAL_CANON_PILOT, PILOT_PROGRESS_EVENTS, createPilotSession, validateEssentialCanonPilot } from '../../js/endgame-trainer/essential-canon-pilot.js';
import { createEndgameProgressStore } from '../../js/endgame-trainer/endgame-progress-store.js';

const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('pilot freezes exactly two lessons, six locked positions, eight checkpoints and four cards', () => {
    assert.equal(ESSENTIAL_CANON_PILOT.lessons.length, 2); assert.equal(ESSENTIAL_CANON_PILOT.positions.length, 6);
    assert.equal(ESSENTIAL_CANON_PILOT.lessons.flatMap(item => item.learnConfig.checkpoints).length, 8);
    assert.equal(ESSENTIAL_CANON_PILOT.lessons.flatMap(item => item.recallConfig.cards).length, 4);
    assert.equal(PILOT_PROGRESS_EVENTS.length, 11); assert.equal(validateEssentialCanonPilot(ESSENTIAL_CANON_PILOT).valid, true);
    assert.equal(Object.isFrozen(ESSENTIAL_CANON_PILOT.positions[0]), true);
});

test('all frozen FEN hashes match their exact strings', () => {
    for (const item of ESSENTIAL_CANON_PILOT.positions) assert.equal(createHash('sha256').update(item.fen).digest('hex'), item.hash, item.positionId);
});

test('validator rejects changed locks, counts, modes, procedural mutation and prohibited wording', () => {
    const changed = structuredClone(ESSENTIAL_CANON_PILOT); changed.positions[0].fen = changed.positions[0].fen.replace(' b ', ' w ');
    assert.deepEqual(validateEssentialCanonPilot(changed).errors, ['position-lock']);
    const wording = structuredClone(ESSENTIAL_CANON_PILOT); wording.lessons[0].coreRule = 'Is this position drawn?';
    assert.ok(validateEssentialCanonPilot(wording).errors.includes('prohibited-wording'));
    const mutation = structuredClone(ESSENTIAL_CANON_PILOT); mutation.lessons[0].runtimeRequirements.proceduralGeneration = true;
    assert.ok(validateEssentialCanonPilot(mutation).errors.includes('procedural-mutation'));
});

test('binding cards limit occupancy and barrier validity without final-result inference', () => {
    const cards = ESSENTIAL_CANON_PILOT.lessons.flatMap(item => item.recallConfig.cards);
    const ks = cards.find(item => item.cardId === 'recall-ks-invalid-01'), ph = cards.find(item => item.cardId === 'recall-ph-invalid-01');
    assert.match(ks.prompt, /currently occupy/); assert.doesNotMatch(ks.prompt, /draw/i); assert.match(ks.feedbackCorrect, /does not classify/);
    assert.match(ph.prompt, /currently placed/); assert.doesNotMatch(ph.prompt, /losing|lost/i); assert.match(ph.feedbackCorrect, /does not mean.*lost/i);
});

test('Learn enforces four ordered checkpoints, recognition, idempotent completion and stale tokens', () => {
    const events = [], session = createPilotSession({ lessonId: 'c10-key-square-gateway', mode: 'learn', sessionId: 'learn-1', emit: event => events.push(event) });
    session.start(); session.next(); session.next();
    const token = session.getSnapshot().generation; assert.equal(session.answer('No', token).correct, false); assert.equal(session.next().index, 2);
    assert.equal(session.answer('Yes', token).correct, true); session.next(); assert.equal(session.answer('No', token).correct, true); session.next();
    assert.equal(session.getSnapshot().completed, true); session.next(); session.replay(); assert.equal(session.answer('Yes', token).status, 'checkpoint-active');
    assert.equal(events.filter(item => item.event === 'learn-completed').length, 1);
    assert.equal(events.filter(item => item.event === 'learn-checkpoint-viewed').length, 4);
});

test('Learn previous retains progress and does not duplicate viewed events', () => {
    const events = [], session = createPilotSession({ lessonId: 'c10-philidor-wall', mode: 'learn', sessionId: 'learn-2', emit: event => events.push(event) });
    session.start(); session.next(); session.previous(); session.next();
    assert.equal(events.filter(item => item.event === 'learn-checkpoint-viewed').length, 2);
});

test('Recall grades authored answers, retries, needs-review, completes once and uses no engine', () => {
    const events = [], session = createPilotSession({ lessonId: 'c10-philidor-wall', mode: 'recall', sessionId: 'recall-1', emit: event => events.push(event) });
    session.start(); assert.equal(session.answer('Setup invalid').correct, false); assert.equal(session.answer('Setup valid').correct, true); session.next();
    assert.equal(session.answer('Setup invalid').correct, true); session.next(); session.next();
    assert.equal(session.getSnapshot().completed, true); assert.equal(events.filter(item => item.event === 'recall-completed').length, 1);
    assert.equal(events.filter(item => item.event === 'needs-review').length, 1);
    assert.ok(ESSENTIAL_CANON_PILOT.lessons.every(item => item.runtimeRequirements.engine === false));
    assert.ok(ESSENTIAL_CANON_PILOT.lessons.flatMap(item => item.recallConfig.cards).every(item => item.runtimeEngineRequired === false));
});

test('progress v1 records additive events idempotently, survives reload and reset', () => {
    const storage = memoryStorage(), store = createEndgameProgressStore({ storage, now: () => 123 }); store.load();
    const event = { event: 'learn-started', key: 'unique-1', lessonId: 'c10-key-square-gateway' };
    assert.equal(store.recordPilotEvent(event), true); assert.equal(store.recordPilotEvent(event), false);
    const reloaded = createEndgameProgressStore({ storage }); reloaded.load(); assert.equal(reloaded.getSnapshot().curriculum.pilotEvents.length, 1);
    reloaded.recordPilotEvent({ event: 'lesson-completed', key: 'lesson-v1', lessonId: 'c10-key-square-gateway' });
    assert.equal(reloaded.getSnapshot().curriculum.lessons['c10-key-square-gateway'].completed, true);
    reloaded.reset(); assert.deepEqual(reloaded.getSnapshot().curriculum.pilotEvents, []);
});

test('two progress stores merge additive events without lost updates', () => {
    const storage = memoryStorage(), a = createEndgameProgressStore({ storage }), b = createEndgameProgressStore({ storage }); a.load(); b.load();
    a.recordPilotEvent({ event: 'learn-started', key: 'a', lessonId: 'c10-key-square-gateway' });
    b.recordPilotEvent({ event: 'recall-started', key: 'b', lessonId: 'c10-key-square-gateway' });
    assert.deepEqual(b.getSnapshot().curriculum.pilotEvents.map(item => item.key), ['a', 'b']);
});
