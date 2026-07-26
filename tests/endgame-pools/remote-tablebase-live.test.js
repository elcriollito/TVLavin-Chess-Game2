import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRemoteTablebase, normalizeTablebaseResponse } from '../../scripts/endgame-remote-tablebase.mjs';

test('opt-in Lichess tablebase contract', { skip: process.env.CAISSA_LIVE_TABLEBASE !== '1' }, async () => {
    const fen = '8/8/5k2/8/3K4/8/P7/8 w - - 0 1';
    const response = await fetchRemoteTablebase(fen, { retries: 0 });
    const evidence = normalizeTablebaseResponse({
        positionId: 'live-fixture', fen,
        positionContentDigest: `sha256-${'0'.repeat(64)}`,
        body: response.body, httpStatus: response.httpStatus,
        retrievedAt: new Date().toISOString()
    });
    assert.equal(response.httpStatus, 200);
    assert.equal(evidence.providerId, 'lichess-syzygy-remote');
    assert.ok(evidence.moves.length > 0);
});
