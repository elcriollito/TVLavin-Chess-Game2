import { createClient } from '@supabase/supabase-js';
import { RelayError } from './durable-broker.mjs';

const previewRef = 'aqizagaskicotorfpwfn';

export class MemoryStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now; this.rows = new Map(); this.audit = [];
  }
  async create(input) {
    const recent = [...this.rows.values()].filter(row => row.ownerId === input.ownerId &&
      this.now() - row.createdAt < 60_000);
    if (recent.length >= 20) return 'RATE_LIMIT';
    if (recent.filter(row => row.expiresAt > this.now()).length >= 10) return 'CONCURRENT_LIMIT';
    this.rows.set(input.sessionId, { ...structuredClone(input), version: 0 });
    return true;
  }
  async get(id) { return structuredClone(this.rows.get(id) || null); }
  async compareSwap(id, version, state) {
    const row = this.rows.get(id);
    if (!row || row.version !== version) return false;
    this.rows.set(id, { ...row, version: version + 1, expiresAt: state.expiresAt,
      state: structuredClone(state) });
    return true;
  }
  async deleteIfVersion(id, version, { reason = 'UNKNOWN', actor = 'UNKNOWN', source = '' } = {}) {
    const row = this.rows.get(id);
    if (row?.version !== version) return false;
    this.audit.push({ sessionId: id, reason, actor, source, stateBefore: row.state.phase,
      at: this.now(), mainLease: row.state.mainStreamUntil,
      engineLease: row.state.engineStreamUntil, mainCursor: row.state.mainAckCursor,
      engineCursor: row.state.engineAckCursor, lastCommandSeq: row.state.lastCommandSeq,
      lastEngineSeq: row.state.lastEngineSeq, cleanupObserved: row.state.cleanup });
    this.rows.delete(id);
    return true;
  }
  async countLive() { return [...this.rows.values()].filter(row => row.expiresAt > this.now()).length; }
  async cleanup() {
    let removed = 0;
    for (const [id, row] of this.rows) {
      const state = row.state, now = this.now();
      if (now >= row.expiresAt || now >= state.idleUntil ||
          (state.phase === 'UNCLAIMED' && now >= state.claimUntil) ||
          (state.engineStreamUntil != null && now > state.engineStreamUntil + 5_000) ||
          (state.mainStreamUntil != null && now > state.mainStreamUntil + 5_000)) {
        await this.deleteIfVersion(id, row.version, { reason: now >= row.expiresAt ?
          'SESSION_HARD_EXPIRY' : now >= state.idleUntil ? 'IDLE_EXPIRED' :
          state.phase === 'UNCLAIMED' && now >= state.claimUntil ? 'CLAIM_EXPIRED' :
          state.engineStreamUntil != null && now > state.engineStreamUntil + 5_000 ?
            'ENGINE_HEARTBEAT_EXPIRED' : 'MAIN_HEARTBEAT_EXPIRED',
        actor: 'BROKER_GC', source: 'MemoryStore.cleanup' }); removed++;
      }
    }
    return removed;
  }
}

function dbError(error) {
  if (error) {
    // Code/status only: never emit SQL values, headers, keys or relay credentials.
    const safeMessage = String(error.message || '').slice(0, 160)
      .replace(/[A-Za-z0-9._-]{40,}/g, '[redacted]');
    console.error('EAE011_STORE_ERROR', String(error.name || 'NO_NAME'),
      String(error.code || 'NO_CODE'), Number(error.status || 0), safeMessage);
    throw new RelayError('STORE_UNAVAILABLE', 503);
  }
}

export class SupabaseStore {
  constructor(client) { this.client = client; }

  async create(input) {
    const { data, error } = await this.client.rpc('eae011_create_session', {
      p_session_id: input.sessionId, p_owner_id: input.ownerId,
      p_competition_id: input.competitionId, p_participant_role: input.participantRole,
      p_created_at: input.createdAt, p_expires_at: input.expiresAt, p_state: input.state
    });
    dbError(error);
    return data === 'OK' ? true : data;
  }

  async get(id) {
    const { data, error } = await this.client.from('eae011_sessions')
      .select('session_id,owner_id,competition_id,participant_role,created_at,expires_at,version,state')
      .eq('session_id', id).maybeSingle();
    dbError(error);
    if (!data) return null;
    return { sessionId: data.session_id, ownerId: data.owner_id,
      competitionId: data.competition_id, participantRole: data.participant_role,
      createdAt: Number(data.created_at), expiresAt: Number(data.expires_at),
      version: Number(data.version), state: data.state };
  }

  async compareSwap(id, version, state) {
    const { data, error } = await this.client.from('eae011_sessions')
      .update({ version: version + 1, state, expires_at: state.expiresAt })
      .eq('session_id', id).eq('version', version).select('version').maybeSingle();
    dbError(error);
    return Boolean(data);
  }

  async deleteIfVersion(id, version, { reason = 'UNKNOWN', actor = 'UNKNOWN', source = '',
    requestId = null } = {}) {
    const { data, error } = await this.client.rpc('eae013a_delete_session', {
      p_session_id: id, p_version: version, p_reason: reason, p_actor: actor,
      p_source: source, p_deployment_id: process.env.VERCEL_DEPLOYMENT_ID ||
        process.env.VERCEL_URL || null,
      p_request_id: requestId
    });
    dbError(error);
    return data === true;
  }

  async countLive() {
    const { count, error } = await this.client.from('eae011_sessions')
      .select('session_id', { count: 'exact', head: true }).gt('expires_at', Date.now());
    dbError(error);
    return count;
  }

  async cleanup() {
    const { data, error } = await this.client.rpc('eae011_cleanup', { p_now: Date.now() });
    dbError(error);
    return Number(data);
  }
}

let singleton;
export function configuredStore(env = process.env) {
  if (env.VERCEL_ENV === 'production') throw new RelayError('PREVIEW_ONLY', 503);
  const url = String(env.EAE011_SUPABASE_URL || '');
  const key = String(env.EAE011_SUPABASE_SERVICE_ROLE_KEY || '');
  let host;
  try { host = new URL(url).hostname; } catch { host = ''; }
  if (!key || host !== `${previewRef}.supabase.co`)
    throw new RelayError('PREVIEW_STORE_REQUIRED', 503);
  if (!singleton) singleton = new SupabaseStore(createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  }));
  return singleton;
}
