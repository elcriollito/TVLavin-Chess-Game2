import { getSupabase } from './supabase.js';

export function createRegistrationAgeGateStore(client = null) {
  const database = () => client || getSupabase();
  return Object.freeze({
    async claim({ scopeHash, bucket, windowSeconds, maxAttempts }) {
      const { data, error } = await database().rpc('claim_registration_age_gate_capacity', {
        p_scope_hash: scopeHash,
        p_bucket: bucket,
        p_window_seconds: windowSeconds,
        p_max_attempts: maxAttempts
      });
      if (error) throw new Error('REGISTRATION_GATE_LIMITER_UNAVAILABLE');
      return data === true;
    },
    async consume({ nonceHash, policyVersion, expiresAt }) {
      const { data, error } = await database().rpc('consume_registration_age_gate', {
        p_nonce_hash: nonceHash,
        p_policy_version: policyVersion,
        p_expires_at: new Date(expiresAt).toISOString()
      });
      if (error) throw new Error('REGISTRATION_GATE_STORE_UNAVAILABLE');
      return data === true;
    }
  });
}
