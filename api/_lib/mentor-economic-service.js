import crypto from 'node:crypto';
import { ECONOMIC_CATALOG_REVISION, ECONOMIC_SCHEMA_VERSION, normalizeProvider } from './economic-registry.js';
import { validateEconomicUsageEvent } from './economic-event-validator.js';
import { decryptMentorResult, encryptMentorResult, mentorResultExpiry, MENTOR_RESULT_SCHEMA } from './mentor-result-crypto.js';

const unwrap = data => data?.[0] || data;
const bytea = value => `\\x${Buffer.from(value).toString('hex')}`;
export const validOperationId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function usageQuantities(provider, usage) {
  if (!usage || typeof usage !== 'object') return [];
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens;
  return [
    ['INPUT_TOKEN', input], ['OUTPUT_TOKEN', output], ['CACHED_INPUT_TOKEN', cached]
  ].filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity >= 0);
}

export class MentorEconomicService {
  constructor({ db, env = process.env, now = () => new Date(), logViolation = code => console.warn(JSON.stringify({ action: 'economic_event_rejected', violationCode: code })) }) {
    this.db = db; this.env = env; this.now = now; this.logViolation = logViolation;
  }
  enabled() { return this.env.CAISSA_MENTOR_RESERVATIONS_ENABLED === 'true'; }
  async reserve({ clerkId, operationId, amount = 1 }) {
    const { data, error } = await this.db.rpc('reserve_credits', {
      p_clerk_id: clerkId, p_operation_id: operationId, p_capability_id: 'mentor.shared_response',
      p_amount: amount, p_expires_at: new Date(this.now().getTime() + 5 * 60000).toISOString(), p_catalog_revision: ECONOMIC_CATALOG_REVISION
    });
    if (error) return { ok: false, code: 'ECONOMIC_UNAVAILABLE' };
    const value = unwrap(data);
    return { ok: value?.success === true, ...value };
  }
  async markProviderAttempt(reservationId) {
    const { data, error } = await this.db.rpc('mark_reservation_provider_attempt', { p_reservation_id: reservationId });
    const value = unwrap(data);
    return error ? { ok: false, code: 'ECONOMIC_UNAVAILABLE' } : { ok: value?.success === true, ...value };
  }
  async release(reservationId, resultCode) {
    const { data, error } = await this.db.rpc('release_reservation', { p_reservation_id: reservationId, p_result_code: resultCode });
    return error ? { ok: false } : { ok: unwrap(data)?.success === true, ...unwrap(data) };
  }
  async consume(reservationId) {
    const { data, error } = await this.db.rpc('consume_reservation', { p_reservation_id: reservationId });
    return error ? { ok: false } : { ok: unwrap(data)?.success === true, ...unwrap(data) };
  }
  async compensate(reservationId, resultCode = 'DELIVERY_UNKNOWN') {
    const { data, error } = await this.db.rpc('compensate_consumption', { p_reservation_id: reservationId, p_result_code: resultCode });
    return error ? { ok: false } : { ok: unwrap(data)?.success === true, ...unwrap(data) };
  }
  async persistResult({ reservationId, operationId, userId, result }) {
    const encrypted = encryptMentorResult(result, { operationId, userId }, this.env);
    const { error } = await this.db.from('mentor_operation_results').insert({
      operation_id: operationId, reservation_id: reservationId, user_id: userId,
      schema_version: encrypted.schemaVersion, content_type: MENTOR_RESULT_SCHEMA,
      ciphertext: bytea(encrypted.ciphertext), iv: bytea(encrypted.iv), auth_tag: bytea(encrypted.authTag),
      plaintext_bytes: encrypted.plaintextBytes, expires_at: mentorResultExpiry(this.env, this.now().getTime())
    });
    return { ok: !error };
  }
  async markResultAvailable(reservationId) {
    const { data, error } = await this.db.rpc('mark_mentor_result_available', { p_reservation_id: reservationId });
    return { ok: !error && data === true };
  }
  async discardResult(operationId, userId) {
    const { error } = await this.db.from('mentor_operation_results').delete().eq('operation_id', operationId).eq('user_id', userId);
    return { ok: !error };
  }
  async recordUsage({ reservationId, operationId, userId, provider, model, usage, durationMs, resultCode, valueDeliveryState }) {
    const quantities = usageQuantities(provider, usage);
    const rows = quantities.length ? quantities : [['CREDIT', 0]];
    for (const [unit, quantity] of rows) {
      const event = {
        eventId: crypto.randomUUID(), operationId, reservationId, userId,
        capabilityId: 'mentor.shared_response', provider: normalizeProvider(provider), model, unit, quantity,
        usageAvailable: quantities.length > 0, durationMs: Math.min(300000, Math.max(0, Math.round(durationMs))),
        resultCode: quantities.length ? resultCode : 'USAGE_UNAVAILABLE', valueDeliveryState,
        catalogRevision: ECONOMIC_CATALOG_REVISION, schemaVersion: ECONOMIC_SCHEMA_VERSION, occurredAt: this.now().toISOString()
      };
      const checked = validateEconomicUsageEvent(event, { logViolation: this.logViolation });
      if (!checked.ok) return { ok: false, code: checked.code };
      const { error } = await this.db.from('economic_usage_events').insert({
        event_id: event.eventId, operation_id: event.operationId, reservation_id: event.reservationId,
        user_id: event.userId, capability_id: event.capabilityId, provider: event.provider, model: event.model,
        unit: event.unit, quantity: event.quantity, usage_available: event.usageAvailable,
        duration_ms: event.durationMs, result_code: event.resultCode, value_delivery_state: event.valueDeliveryState,
        catalog_revision: event.catalogRevision, schema_version: event.schemaVersion, occurred_at: event.occurredAt
      });
      if (error) return { ok: false, code: 'ECONOMIC_UNAVAILABLE' };
    }
    return { ok: true };
  }
  async replay({ operationId, clerkId }) {
    const { data, error } = await this.db.rpc('get_mentor_result_for_replay', { p_operation_id: operationId, p_clerk_id: clerkId });
    const record = unwrap(data);
    if (error || !record?.found) return { ok: false, code: record?.code || 'NOT_FOUND' };
    try { return { ok: true, result: decryptMentorResult(record, { operationId, userId: record.user_id }, this.env), delivered: record.delivered_at !== null }; }
    catch { return { ok: false, code: 'RESULT_UNAVAILABLE' }; }
  }
  async confirm({ operationId, clerkId }) {
    const { data, error } = await this.db.rpc('confirm_mentor_result_delivery', { p_operation_id: operationId, p_clerk_id: clerkId });
    const value = unwrap(data);
    return error ? { ok: false } : { ok: value?.success === true, code: value?.code };
  }
}
