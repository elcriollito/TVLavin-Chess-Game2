import {
  CAPABILITIES, ECONOMIC_CATALOG_REVISION, ECONOMIC_SCHEMA_VERSION, ECONOMIC_UNITS,
  PROVIDERS, RESULT_CODES, VALUE_DELIVERY_STATES, isAllowedEconomicModel, isRegistered
} from './economic-registry.js';

const MAX_EVENT_BYTES = 2048;
const PROHIBITED = new Set([
  'pgn','fen','move','moves','prompt','prompts','response','responses','providerresponse','enginereport',
  'email','emailaddress','username','user name','password','apikey','secret','authtoken','authorization',
  'cookie','cookies','ip','ipaddress','rawip','url','uri','query','querystring','ficscommand','ficschat',
  'providerpayload','rawproviderpayload','rawerror','errorstring','metadata','payload','detail','details',
  'data','content','body','text','proto','prototype','constructor'
].map(value => value.replace(/[^a-z0-9]/g, '')));

const normalizeName = name => String(name).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
const CONTENT_PREFIXES = ['pgn','fen','move','prompt','response','enginereport','providerresponse','rawerror','ficscommand','ficschat'];
export const prohibitedEconomicFieldName = name => {
  const normalized = normalizeName(name);
  return PROHIBITED.has(normalized) || CONTENT_PREFIXES.some(prefix => normalized.startsWith(prefix));
};

const FIELDS = Object.freeze([
  'eventId','operationId','reservationId','userId','capabilityId','provider','model','unit','quantity',
  'usageAvailable','durationMs','resultCode','valueDeliveryState','catalogRevision','schemaVersion','occurredAt'
]);
const FIELD_SET = new Set(FIELDS);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const timestamp = value => typeof value === 'string' && value.length <= 35 && Number.isFinite(Date.parse(value));

function fail(code, log) { log?.(code); return { ok: false, code }; }

export function validateEconomicUsageEvent(event, { logViolation } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || Object.getPrototypeOf(event) !== Object.prototype) return fail('INVALID_EVENT_OBJECT', logViolation);
  const keys = Object.keys(event);
  if (keys.some(prohibitedEconomicFieldName)) return fail('PROHIBITED_FIELD_NAME', logViolation);
  if (keys.some(key => !FIELD_SET.has(key))) return fail('UNKNOWN_FIELD', logViolation);
  if (keys.length !== FIELDS.length || FIELDS.some(key => !Object.hasOwn(event, key))) return fail('MISSING_FIELD', logViolation);
  if (!uuid(event.eventId) || !uuid(event.operationId) || (event.reservationId !== null && !uuid(event.reservationId)) || !uuid(event.userId)) return fail('INVALID_IDENTIFIER', logViolation);
  if (!isRegistered(CAPABILITIES, event.capabilityId) || !isRegistered(PROVIDERS, event.provider)) return fail('INVALID_REGISTRY_VALUE', logViolation);
  if (typeof event.model !== 'string' || event.model.length > 128 || !isAllowedEconomicModel(event.provider, event.model)) return fail('INVALID_MODEL', logViolation);
  if (!isRegistered(ECONOMIC_UNITS, event.unit) || !Number.isSafeInteger(event.quantity) || event.quantity < 0 || event.quantity > 2147483647) return fail('INVALID_QUANTITY', logViolation);
  if (typeof event.usageAvailable !== 'boolean' || !Number.isSafeInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 300000) return fail('INVALID_MEASUREMENT', logViolation);
  if (!isRegistered(RESULT_CODES, event.resultCode) || !isRegistered(VALUE_DELIVERY_STATES, event.valueDeliveryState)) return fail('INVALID_REGISTRY_VALUE', logViolation);
  if (event.catalogRevision !== ECONOMIC_CATALOG_REVISION || event.schemaVersion !== ECONOMIC_SCHEMA_VERSION || !timestamp(event.occurredAt)) return fail('INVALID_SCHEMA_REVISION', logViolation);
  let bytes;
  try { bytes = Buffer.byteLength(JSON.stringify(event), 'utf8'); } catch { return fail('UNSERIALIZABLE_EVENT', logViolation); }
  return bytes <= MAX_EVENT_BYTES ? { ok: true, value: Object.freeze({ ...event }) } : fail('EVENT_TOO_LARGE', logViolation);
}
