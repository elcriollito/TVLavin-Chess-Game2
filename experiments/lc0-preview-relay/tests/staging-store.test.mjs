import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { DurableBroker } from '../durable-broker.mjs';
import { configuredStore } from '../store.mjs';

test('staging Supabase CAS survives broker reconstruction without raw secrets',
  { skip: process.env.EAE011_LIVE_STORE !== '1' }, async () => {
    const store = configuredStore({ ...process.env, VERCEL_ENV: 'preview' });
    const userId = `user_${randomBytes(10).toString('hex')}`;
    const first = new DurableBroker(store), second = new DurableBroker(store);
    let id;
    try {
      const created = await first.create({ userId, competitionId: 'staging-probe', participantRole: 'white' });
      id = created.sessionId;
      const row = await store.get(id);
      assert.equal(JSON.stringify(row).includes(created.claimToken), false);
      const raced = await Promise.allSettled([
        first.claim(id, created.claimToken), second.claim(id, created.claimToken)
      ]);
      assert.equal(raced.filter(item => item.status === 'fulfilled').length, 1);
      const engineCredential = raced.find(item => item.status === 'fulfilled').value.engineCredential;
      assert.equal(JSON.stringify(await store.get(id)).includes(engineCredential), false);
      await second.command(id, userId, { type: 'HELLO', seq: 1 });
      await first.engineMessage(id, engineCredential,
        { type: 'ACK', seq: 1, command: 'HELLO', commandSeq: 1 });
      assert.equal((await second.inspect(id, userId)).state.lastCommandSeq, 1);
      await assert.rejects(first.command(id, userId, { type: 'HELLO', seq: 1 }),
        { code: 'SEQUENCE_INVALID' });
    } finally {
      if (id) {
        const row = await store.get(id);
        if (row) {
          await store.deleteIfVersion(id, row.version,
            { reason: 'ADMIN_TEST_CLEANUP', actor: 'STAGING_TEST', source: 'staging-store.test' });
          const { data, error } = await store.client.from('eae013a_session_audit')
            .select('delete_reason,delete_actor,state_before,cleanup_observed')
            .eq('session_id', id).eq('event_kind', 'DELETE').single();
          assert.equal(error, null);
          assert.equal(data.delete_reason, 'ADMIN_TEST_CLEANUP');
          assert.equal(data.delete_actor, 'STAGING_TEST');
          assert.equal(data.state_before, 'HELLO_ACKED');
          assert.equal(data.cleanup_observed, false);
        }
      }
    }
  });
