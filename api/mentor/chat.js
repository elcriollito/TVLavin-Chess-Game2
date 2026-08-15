import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { logAction, logError } from '../_lib/logger.js';
import { MENTOR_LIMITS, validateMentorRequest, exceedsMentorHttpBodyLimit, isAllowedSharedModel } from '../_lib/mentor-request-policy.js';
import { claimMentorCapacity, releaseMentorCapacity } from '../_lib/mentor-capacity.js';
import { MentorEconomicService, validOperationId } from '../_lib/mentor-economic-service.js';
import { mentorResultEncryptionReady } from '../_lib/mentor-result-crypto.js';

const PROVIDER_ENDPOINTS = Object.freeze({
  together: 'https://api.together.xyz/v1/chat/completions', llama: 'https://api.llama.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions', anthropic: 'https://api.anthropic.com/v1/messages'
});
const MENTOR_CREDIT_COST = 1;
const defaultDb = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

const reject = (res, status, code, message) => res.status(status).json({ code, error: message });

function providerRequest(command) {
  const headers = { 'Content-Type': 'application/json' };
  if (command.provider === 'anthropic') {
    headers['x-api-key'] = command.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    const system = command.messages[0]?.role === 'system' ? command.messages[0].content : undefined;
    const messages = command.messages.filter(message => message.role !== 'system');
    return { headers, body: { model: command.model, max_tokens: command.maxTokens, ...(system ? { system } : {}), messages } };
  }
  headers.Authorization = `Bearer ${command.apiKey}`;
  const tokenField = command.provider === 'llama' ? 'max_completion_tokens' : 'max_tokens';
  return { headers, body: { model: command.model, messages: command.messages, [tokenField]: command.maxTokens, temperature: command.temperature } };
}

async function callProvider(command, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MENTOR_LIMITS.timeoutMs);
  try {
    const request = providerRequest(command);
    const response = await fetchImpl(PROVIDER_ENDPOINTS[command.provider], {
      method: 'POST', headers: request.headers, body: JSON.stringify(request.body), redirect: 'error', signal: controller.signal
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('PROVIDER_ERROR'); }
    if (!response.ok) throw new Error('PROVIDER_ERROR');
    const content = command.provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > MENTOR_LIMITS.responseChars) throw new Error('PROVIDER_ERROR');
    return { content, usage: data.usage || null };
  } finally { clearTimeout(timer); }
}

export function createMentorChatHandler(deps = {}) {
  const authenticate = deps.authenticate || authenticateRequest;
  const db = deps.db === undefined ? defaultDb : deps.db;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const env = deps.env || process.env;

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return reject(res, 405, 'INVALID_REQUEST', 'Request rejected.');
    if (exceedsMentorHttpBodyLimit(req)) return reject(res, 413, 'PAYLOAD_TOO_LARGE', 'Request is too large.');

    const auth = await authenticate(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    if (env.MENTOR_AI_ENABLED === 'false') return reject(res, 503, 'SERVICE_UNAVAILABLE', 'AI service temporarily unavailable.');

    const sharedModel = env.TOGETHER_MODEL || 'moonshotai/Kimi-K2.5';
    if (!isAllowedSharedModel(sharedModel)) return reject(res, 503, 'SERVICE_UNAVAILABLE', 'AI service temporarily unavailable.');
    const validation = validateMentorRequest(req.body, sharedModel);
    if (!validation.ok) return reject(res, validation.status, validation.code, validation.status === 413 ? 'Request is too large.' : 'Invalid AI request.');
    const command = validation.value;
    if (!command.byo && (env.MENTOR_SHARED_AI_ENABLED === 'false' || !env.TOGETHER_API_KEY)) return reject(res, 503, 'SERVICE_UNAVAILABLE', 'AI service temporarily unavailable.');
    const reservationsEnabled = !command.byo && env.CAISSA_MENTOR_RESERVATIONS_ENABLED === 'true';
    const operationId = req.headers?.['idempotency-key'];
    if (reservationsEnabled && (!validOperationId(operationId) || !mentorResultEncryptionReady(env))) {
      return reject(res, 503, 'ECONOMIC_UNAVAILABLE', 'AI service temporarily unavailable.');
    }

    const capacity = await claimMentorCapacity(db, auth.userId, env.MENTOR_RATE_LIMIT_SECRET);
    if (!capacity.ok) {
      if (capacity.unavailable) return reject(res, 503, 'SERVICE_UNAVAILABLE', 'AI service temporarily unavailable.');
      res.setHeader('Retry-After', String(capacity.retryAfter));
      return reject(res, 429, 'RATE_LIMITED', 'Too many Mentor requests. Please try again later.');
    }
    res.setHeader('X-RateLimit-Remaining', String(capacity.remaining));

    try {
      if (reservationsEnabled) {
        const economic = new MentorEconomicService({ db, env });
        const reservation = await economic.reserve({ clerkId: auth.userId, operationId });
        if (!reservation.ok) return reject(res, reservation.code === 'INSUFFICIENT_CREDITS' ? 402 : 503, reservation.code || 'ECONOMIC_UNAVAILABLE', reservation.code === 'INSUFFICIENT_CREDITS' ? 'Insufficient credits.' : 'AI service temporarily unavailable.');
        res.setHeader('Idempotency-Key', operationId);
        if (reservation.state === 'CONSUMED') {
          const replay = await economic.replay({ operationId, clerkId: auth.userId });
          return replay.ok ? res.status(200).json({ ...replay.result, replayed: true }) : reject(res, 503, 'RESULT_UNAVAILABLE', 'AI result temporarily unavailable.');
        }
        const attempt = await economic.markProviderAttempt(reservation.reservation_id);
        if (!attempt.ok || !attempt.should_call_provider) return res.status(202).json({ code: 'OPERATION_IN_PROGRESS', operationId });
        command.apiKey = env.TOGETHER_API_KEY;
        const started = Date.now();
        try {
          const result = await callProvider(command, fetchImpl);
          const responseBody = { ...result, provider: command.provider, model: command.model, isSharedApi: true };
          const persisted = await economic.persistResult({ reservationId: reservation.reservation_id, operationId, userId: reservation.user_id, result: responseBody });
          if (!persisted.ok) {
            await economic.release(reservation.reservation_id, 'INTERNAL_FAILED');
            return reject(res, 503, 'ECONOMIC_UNAVAILABLE', 'AI service temporarily unavailable.');
          }
          const metered = await economic.recordUsage({ reservationId: reservation.reservation_id, operationId, userId: reservation.user_id, provider: command.provider, model: command.model, usage: result.usage, durationMs: Date.now() - started, resultCode: 'SUCCESS', valueDeliveryState: 'VALUE_AVAILABLE' });
          if (!metered.ok || !(await economic.markResultAvailable(reservation.reservation_id)).ok) {
            await economic.discardResult(operationId, reservation.user_id);
            await economic.release(reservation.reservation_id, 'INTERNAL_FAILED');
            return reject(res, 503, 'ECONOMIC_UNAVAILABLE', 'AI service temporarily unavailable.');
          }
          const consumed = await economic.consume(reservation.reservation_id);
          if (!consumed.ok) return reject(res, 503, 'ECONOMIC_UNAVAILABLE', 'AI service temporarily unavailable.');
          return res.status(200).json(responseBody);
        } catch (error) {
          await economic.recordUsage({ reservationId: reservation.reservation_id, operationId, userId: reservation.user_id, provider: command.provider, model: command.model, usage: null, durationMs: Date.now() - started, resultCode: error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILED', valueDeliveryState: 'VALUE_UNDELIVERED' });
          await economic.release(reservation.reservation_id, error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_FAILED');
          throw error;
        }
      }
      if (!command.byo) {
        const credit = await consumeMentorCredit(db, auth.userId);
        if (credit.reason === 'service_error' || credit.reason === 'user_not_found') return reject(res, 503, 'SERVICE_UNAVAILABLE', 'AI service temporarily unavailable.');
        if (!credit.authorized) return reject(res, 402, 'INSUFFICIENT_CREDITS', 'Insufficient credits.');
        command.apiKey = env.TOGETHER_API_KEY;
      }
      logAction('mentor_request', { userId: auth.userId, detail: { provider: command.provider, mode: command.byo ? 'BYO' : 'SHARED', costClass: command.costClass } });
      const result = await callProvider(command, fetchImpl);
      return res.status(200).json({ ...result, provider: command.provider, model: command.model, isSharedApi: !command.byo });
    } catch (error) {
      logError('mentor_provider', error?.name === 'AbortError' ? 'Provider timeout' : 'Provider failure', { userId: auth.userId, detail: { provider: command.provider } });
      return reject(res, error?.name === 'AbortError' ? 503 : 502, error?.name === 'AbortError' ? 'SERVICE_UNAVAILABLE' : 'PROVIDER_ERROR', 'AI provider temporarily unavailable.');
    } finally {
      await releaseMentorCapacity(db, capacity.leaseId, auth.userId, env.MENTOR_RATE_LIMIT_SECRET);
    }
  };
}

export async function consumeMentorCredit(db, authenticatedUserId) {
  try {
    const { data, error } = await db.rpc('consume_credits', { p_clerk_id: authenticatedUserId, p_cost: MENTOR_CREDIT_COST, p_action: 'mentor_chat' });
    if (error) return { authorized: false, premium: false, credits: 0, reason: 'service_error' };
    const result = data?.[0] || data;
    if (!result) return { authorized: false, premium: false, credits: 0, reason: 'service_error' };
    const message = String(result.message || '');
    if (!result.success && message === 'User not found') return { authorized: false, premium: false, credits: 0, reason: 'user_not_found' };
    if (!result.success) return { authorized: false, premium: false, credits: Number(result.new_balance) || 0, reason: 'insufficient_credits' };
    return { authorized: true, premium: message === 'Premium user - no deduction', credits: Number(result.new_balance) || 0, reason: 'authorized' };
  } catch { return { authorized: false, premium: false, credits: 0, reason: 'service_error' }; }
}

export default createMentorChatHandler();
