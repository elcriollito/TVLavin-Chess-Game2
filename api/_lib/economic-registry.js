import { PROVIDER_MODELS, SHARED_MODELS } from './mentor-request-policy.js';

export const ECONOMIC_SCHEMA_VERSION = 1;
export const ECONOMIC_CATALOG_REVISION = 'mentor-economic-v1';
export const CAPABILITIES = Object.freeze(['mentor.shared_response', 'mentor.byo_response']);
export const RESULT_CODES = Object.freeze([
  'SUCCESS', 'USER_CANCELED', 'VALIDATION_FAILED', 'AUTH_FAILED', 'INSUFFICIENT_CREDITS',
  'RATE_LIMITED', 'PROVIDER_FAILED', 'PROVIDER_TIMEOUT', 'INTERNAL_FAILED',
  'CLIENT_DISCONNECTED', 'DUPLICATE', 'RESERVATION_EXPIRED', 'COMPENSATED',
  'DELIVERY_CONFIRMED', 'DELIVERY_UNKNOWN', 'PAYLOAD_TOO_LARGE', 'UNKNOWN_PROVIDER',
  'UNKNOWN_MODEL', 'USAGE_UNAVAILABLE'
]);
export const VALUE_DELIVERY_STATES = Object.freeze([
  'NOT_STARTED', 'PROVIDER_WORK_INCURRED', 'VALUE_AVAILABLE',
  'VALUE_DELIVERED', 'VALUE_UNDELIVERED', 'UNKNOWN'
]);
export const ECONOMIC_UNITS = Object.freeze([
  'INPUT_TOKEN', 'OUTPUT_TOKEN', 'CACHED_INPUT_TOKEN', 'AI_COMPUTE_UNIT', 'CREDIT'
]);
export const PROVIDERS = Object.freeze(['TOGETHER', 'LLAMA', 'OPENAI', 'ANTHROPIC']);

const MODELS = Object.freeze({
  TOGETHER: Object.freeze([...new Set([...PROVIDER_MODELS.together, ...SHARED_MODELS])]),
  LLAMA: PROVIDER_MODELS.llama,
  OPENAI: PROVIDER_MODELS.openai,
  ANTHROPIC: PROVIDER_MODELS.anthropic
});

export const isRegistered = (values, value) => values.includes(value);
export const normalizeProvider = provider => String(provider || '').toUpperCase();
export const isAllowedEconomicModel = (provider, model) => MODELS[normalizeProvider(provider)]?.includes(model) === true;
