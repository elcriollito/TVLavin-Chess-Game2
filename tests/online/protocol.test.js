import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ONLINE_PROTOCOL_VERSION, TIME_CONTROLS, createServerEnvelope,
    validateChallengeCreate, validateEnvelope, validateMove, validateQueueJoin
} from '../../js/online/online-protocol.js';
import { createOnlineApi } from '../../js/online/online-api.js';

test('protocol accepts a bounded, versioned move intent', () => {
    const envelope = validateEnvelope({
        protocolVersion: ONLINE_PROTOCOL_VERSION, eventType: 'game.move',
        eventId: 'move:123456789012', gameId: '11111111-1111-4111-8111-111111111111',
        clientSentAt: Date.now(), payload: { from: 'e2', to: 'e4', expectedVersion: 1 }
    });
    assert.equal(envelope.ok, true);
    assert.deepEqual(validateMove(envelope.value.payload).value, { from: 'e2', to: 'e4', promotion: null, expectedVersion: 1 });
});

test('protocol rejects unversioned, malformed, and unknown client events', () => {
    assert.equal(validateEnvelope({}).code, 'UNSUPPORTED_PROTOCOL');
    assert.equal(validateMove({ from: 'z9', to: 'e4', expectedVersion: 1 }).code, 'INVALID_MOVE');
    assert.equal(validateMove({ from: 'e7', to: 'e8', promotion: 'k', expectedVersion: 1 }).code, 'INVALID_PROMOTION');
});

test('time controls and challenge inputs use the same canonical catalog', () => {
    assert.equal(TIME_CONTROLS.length, 5);
    assert.equal(validateQueueJoin({ timeControlId: 'blitz-3-2', rated: true }).value.control.baseMs, 180_000);
    assert.deepEqual(validateQueueJoin({ timeControlId: 'custom', baseMinutes: 7, incrementSeconds: 3 }).value.control,
        { id: 'custom', label: '7+3', pool: 'blitz', baseMs: 420_000, incrementMs: 3_000 });
    assert.equal(validateQueueJoin({ timeControlId: 'custom', baseMinutes: 0, incrementSeconds: 99 }).code, 'INVALID_TIME_CONTROL');
    assert.equal(validateChallengeCreate({ targetClerkId: 'user_opponent', timeControlId: 'rapid-10-0' }).ok, true);
});

test('server envelopes carry correlation and canonical versions', () => {
    const envelope = createServerEnvelope('game.moveAccepted', { state: {} }, {
        correlationId: 'move:123456789012', gameId: 'game', version: 8,
        serverTimestamp: '2026-10-05T12:00:00.000Z'
    });
    assert.equal(envelope.version, 8);
    assert.equal(envelope.protocolVersion, ONLINE_PROTOCOL_VERSION);
});

test('the browser command contract never sends a client-controlled displayName', async () => {
    let sent;
    const api = createOnlineApi({
        tokenProvider: async () => 'synthetic-token',
        fetchImpl: async (_url, init) => {
            sent = JSON.parse(init.body);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
    });
    await api.command('queue.join', {
        timeControlId: 'blitz-3-2',
        rated: false,
        displayName: 'private@example.test'
    });
    assert.equal(Object.hasOwn(sent, 'displayName'), false);
    assert.equal(Object.hasOwn(sent.payload, 'displayName'), false);
    assert.equal(sent.payload.timeControlId, 'blitz-3-2');
});
