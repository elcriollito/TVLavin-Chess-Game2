export const MENTOR_LIMITS = Object.freeze({
  httpBodyBytes: 65536,
  messages: 24,
  messageChars: 12000,
  aggregateChars: 40000,
  engineReportBytes: 16000,
  apiKeyChars: 512,
  sharedMaxTokens: 768,
  byoMaxTokens: 1024,
  responseChars: 65536,
  timeoutMs: 20000,
  temperatureMin: 0,
  temperatureMax: 1.5
});

export const PROVIDER_MODELS = Object.freeze({
  together: Object.freeze(['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-4-Scout-17B-16E-Instruct']),
  llama: Object.freeze(['llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-instruct']),
  openai: Object.freeze(['gpt-4o-mini']),
  anthropic: Object.freeze(['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'])
});

export const DEFAULT_MODELS = Object.freeze({
  together: PROVIDER_MODELS.together[0], llama: PROVIDER_MODELS.llama[0],
  openai: PROVIDER_MODELS.openai[0], anthropic: PROVIDER_MODELS.anthropic[0]
});
export const SHARED_MODELS = Object.freeze(['moonshotai/Kimi-K2.6', 'meta-llama/Llama-3.3-70B-Instruct-Turbo']);
export const isAllowedSharedModel = model => SHARED_MODELS.includes(model);

const FIELDS = new Set(['provider', 'apiKey', 'messages', 'model', 'maxTokens', 'temperature', 'engineReport', 'stream']);

const invalid = (code, status = 400) => ({ ok: false, status, code });

export function validateMentorRequest(body, sharedModel) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('INVALID_REQUEST');
  if (Object.keys(body).some(key => !FIELDS.has(key))) return invalid('UNKNOWN_FIELD');
  if (!Object.hasOwn(PROVIDER_MODELS, body.provider)) return invalid('INVALID_PROVIDER');
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MENTOR_LIMITS.messages) return invalid('INVALID_MESSAGES');
  let aggregate = 0;
  let systemMessages = 0;
  for (let index = 0; index < body.messages.length; index += 1) {
    const message = body.messages[index];
    if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).some(key => !['role', 'content'].includes(key))) return invalid('INVALID_MESSAGE');
    if (!['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length < 1 || message.content.length > MENTOR_LIMITS.messageChars) return invalid('INVALID_MESSAGE');
    if (message.role === 'system' && (index !== 0 || ++systemMessages > 1)) return invalid('INVALID_MESSAGE');
    aggregate += message.content.length;
  }
  if (aggregate > MENTOR_LIMITS.aggregateChars) return invalid('INPUT_TOO_LARGE', 413);
  if (body.stream !== undefined && body.stream !== false) return invalid('STREAMING_PROXY_DISABLED');
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || !Number.isFinite(body.temperature) || body.temperature < MENTOR_LIMITS.temperatureMin || body.temperature > MENTOR_LIMITS.temperatureMax)) return invalid('INVALID_TEMPERATURE');
  if (body.maxTokens !== undefined && (!Number.isInteger(body.maxTokens) || body.maxTokens < 1)) return invalid('INVALID_MAX_TOKENS');
  if (body.engineReport !== undefined && body.engineReport !== null) {
    let serialized;
    try { serialized = typeof body.engineReport === 'string' ? body.engineReport : JSON.stringify(body.engineReport); } catch { return invalid('INVALID_ENGINE_REPORT'); }
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > MENTOR_LIMITS.engineReportBytes) return invalid('INVALID_ENGINE_REPORT', 413);
  }

  const byo = typeof body.apiKey === 'string' && body.apiKey.length > 0;
  if (body.apiKey !== undefined && body.apiKey !== null && (!byo || body.apiKey.length > MENTOR_LIMITS.apiKeyChars || /[\r\n]/.test(body.apiKey))) return invalid('INVALID_API_KEY');
  if (!byo && body.provider !== 'together') return invalid('API_KEY_REQUIRED');
  if (byo) {
    if (typeof body.model !== 'string' || !PROVIDER_MODELS[body.provider].includes(body.model)) return invalid('INVALID_MODEL');
  } else if (body.model !== undefined && body.model !== null && body.model !== sharedModel) {
    return invalid('INVALID_MODEL');
  }

  const cap = byo ? MENTOR_LIMITS.byoMaxTokens : MENTOR_LIMITS.sharedMaxTokens;
  return {
    ok: true,
    value: {
      provider: body.provider, byo, apiKey: byo ? body.apiKey : null,
      messages: body.messages.map(({ role, content }) => ({ role, content })),
      model: byo ? body.model : sharedModel,
      maxTokens: Math.min(body.maxTokens ?? cap, cap),
      temperature: body.temperature ?? 0.7,
      engineReport: body.engineReport ?? null,
      costClass: aggregate > 30000 || Math.min(body.maxTokens ?? cap, cap) > 768 ? 'HIGH' : 'NORMAL'
    }
  };
}

export function exceedsMentorHttpBodyLimit(req) {
  const headerLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(headerLength) && headerLength > MENTOR_LIMITS.httpBodyBytes) return true;
  try { return Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > MENTOR_LIMITS.httpBodyBytes; }
  catch { return true; }
}
