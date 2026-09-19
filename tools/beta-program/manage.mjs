#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { BETA_STAGES } from '../../api/_lib/beta-program-policy.js';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const command = process.argv[2];
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
} else {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  async function userId(clerkId) {
    if (!clerkId || !/^user_[A-Za-z0-9]+$/.test(clerkId)) throw new Error('A valid --clerk-id is required.');
    const { data, error } = await db.from('users').select('id').eq('clerk_id', clerkId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('CAISSA user not found; the account must sign in and synchronize first.');
    return data.id;
  }

  async function experimentRecord(id) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id || '')) throw new Error('A valid --experiment is required.');
    const { data, error } = await db.from('beta_experiments').select('id,stage').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Beta experiment not found.');
    return data;
  }

  async function run() {
    if (command === 'list') {
      const { data, error } = await db.from('beta_experiments')
        .select('id,display_name,stage,enabled,route,access_policy,ends_at').order('sort_order');
      if (error) throw error;
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      return;
    }
    if (command === 'grant') {
      const target = await userId(option('clerk-id'));
      const entitlement = option('entitlement') || 'beta_tester';
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(entitlement)) throw new Error('Invalid entitlement.');
      const expiresAt = option('expires-at');
      if (expiresAt && Number.isNaN(Date.parse(expiresAt))) throw new Error('--expires-at must be an ISO-8601 timestamp.');
      const { data: active, error: lookupError } = await db.from('user_entitlements').select('id')
        .eq('user_id', target).eq('entitlement', entitlement).is('revoked_at', null).maybeSingle();
      if (lookupError) throw lookupError;
      const operation = active
        ? db.from('user_entitlements').update({ expires_at: expiresAt || null }).eq('id', active.id)
        : db.from('user_entitlements').insert({ user_id: target, entitlement, expires_at: expiresAt || null });
      const { error } = await operation;
      if (error) throw error;
      process.stdout.write(`Granted ${entitlement}.\n`);
      return;
    }
    if (command === 'revoke') {
      const target = await userId(option('clerk-id'));
      const entitlement = option('entitlement') || 'beta_tester';
      const { error } = await db.from('user_entitlements').update({ revoked_at: new Date().toISOString() })
        .eq('user_id', target).eq('entitlement', entitlement).is('revoked_at', null);
      if (error) throw error;
      process.stdout.write(`Revoked ${entitlement}.\n`);
      return;
    }
    if (command === 'enable' || command === 'disable') {
      const experiment = option('experiment');
      const current = await experimentRecord(experiment);
      if (command === 'enable' && ['released', 'retired'].includes(current.stage)) {
        throw new Error('Released or retired experiments must move to an active stage before enabling.');
      }
      const { error } = await db.from('beta_experiments').update({
        enabled: command === 'enable', updated_at: new Date().toISOString()
      }).eq('id', experiment);
      if (error) throw error;
      process.stdout.write(`${command === 'enable' ? 'Enabled' : 'Disabled'} ${experiment}.\n`);
      return;
    }
    if (command === 'stage') {
      const experiment = option('experiment');
      const stage = option('stage');
      await experimentRecord(experiment);
      if (!BETA_STAGES.includes(stage)) throw new Error(`--stage must be one of: ${BETA_STAGES.join(', ')}`);
      const { error } = await db.from('beta_experiments').update({
        stage, enabled: !['released', 'retired'].includes(stage),
        released_at: stage === 'released' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }).eq('id', experiment);
      if (error) throw error;
      process.stdout.write(`Set ${experiment} to ${stage}.\n`);
      return;
    }
    throw new Error('Usage: manage.mjs <list|grant|revoke|enable|disable|stage> [options]');
  }

  run().catch(error => fail(error.message || 'Beta management failed.'));
}
