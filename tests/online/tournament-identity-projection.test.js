import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineService, decorateTournamentIdentities } from '../../api/_lib/online-service.js';

test('authoritative identity projection decorates directory and current tournament', () => {
    const officialId = '11111111-1111-4111-8111-111111111111';
    const communityId = '22222222-2222-4222-8222-222222222222';
    const state = decorateTournamentIdentities({
        tournaments: [{ id: communityId, name: 'OFFICIAL CAISSA LOOKALIKE' }, { id: officialId, name: 'Morning Arena' }],
        current: { id: officialId, name: 'Morning Arena' }
    }, [
        { id: officialId, source: 'official', seriesKind: 'official', seriesSlug: 'saturdays-of-chess-s001' },
        { id: communityId, source: 'community', seriesKind: 'user', seriesSlug: 'user-series' }
    ]);
    assert.equal(state.tournaments[0].source, 'community');
    assert.equal(state.tournaments[0].seriesKind, 'user');
    assert.equal(state.tournaments[1].source, 'official');
    assert.equal(state.current.seriesSlug, 'saturdays-of-chess-s001');
});

test('missing authoritative classification remains unclassified', () => {
    const state = decorateTournamentIdentities({ tournaments: [{ id: 'missing' }], current: null }, []);
    assert.equal(state.tournaments[0].source, undefined);
});

test('service requests identity only for tournament ids already in the safe snapshot', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const calls = [];
    const db = { async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'caissa_online_arena_sync') {
            return { data: { tournaments: [{ id, name: 'Official Event' }], current: { id, name: 'Official Event' } }, error: null };
        }
        if (name === 'caissa_online_tournament_identity_projection') {
            return { data: [{ id, source: 'official', seriesKind: 'official' }], error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
    } };
    const state = await createOnlineService({ db }).getArenaState('user_a');
    assert.equal(state.current.source, 'official');
    assert.deepEqual(calls[1], {
        name: 'caissa_online_tournament_identity_projection', args: { p_ids: [id] }
    });
});
