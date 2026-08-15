import { externalTournamentStatus } from './featured-external-tournament-status.js';

export const LICHESS_BROADCAST_SCHEMA = 'CaissaFeaturedExternalTournament.LichessBroadcast@1.0.0';

const record = {
  schema: LICHESS_BROADCAST_SCHEMA,
  enabled: true,
  id: 'gct-sinquefield-cup-2026',
  displayName: 'GCT: Sinquefield Cup 2026',
  provider: 'Lichess',
  frameUrl: 'https://lichess.org/embed/broadcast/gct-sinquefield-cup-2026/2sMqschv',
  providerEventUrl: 'https://lichess.org/broadcast/gct-sinquefield-cup-2026/2sMqschv',
  organizerName: 'Grand Chess Tour',
  organizerUrl: 'https://grandchesstour.org/tours/2026/tournaments/2026-sinquefield-cup/',
  scheduleUrl: 'https://grandchesstour.org/tours/2026/tournaments/2026-sinquefield-cup/visit/',
  startsAt: '2026-08-10T17:00:00Z',
  endsAt: '2026-08-21T05:00:00Z',
  eventTimezone: 'America/Chicago',
  location: 'Saint Louis, Missouri, USA',
  verifiedAt: '2026-08-15T16:00:00Z',
  scheduleNote: 'Coverage window begins with Round 1 at noon local time and ends conservatively at the start of the published departure date.',
  fallbackMode: 'replay-if-available'
};

export const FEATURED_LICHESS_BROADCAST = Object.freeze({ ...record });
const REQUIRED_KEYS = Object.freeze(Object.keys(record).sort());
const TEXT_KEYS = Object.freeze(['id', 'displayName', 'provider', 'organizerName', 'location', 'scheduleNote', 'fallbackMode']);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_TEXT = /^[^<>\u0000-\u001f\u007f]+$/u;

function safeHttps(value) {
  if (typeof value !== 'string' || value.startsWith('//') || /%3a/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch { return null; }
}
const validInstant = value => typeof value === 'string' && UTC_INSTANT.test(value) && Number.isFinite(Date.parse(value));
function validTimezone(value) {
  try { return typeof value === 'string' && new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone.length > 0; }
  catch { return false; }
}

export function validateLichessBroadcast(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return Object.freeze({ ok: false, errors: Object.freeze(['configuration-required']) });
  const keys = Object.keys(candidate).sort();
  if (keys.length !== REQUIRED_KEYS.length || keys.some((key, i) => key !== REQUIRED_KEYS[i])) errors.push('fields-invalid');
  if (candidate.schema !== LICHESS_BROADCAST_SCHEMA) errors.push('schema-invalid');
  if (candidate.enabled !== true) errors.push('enabled-invalid');
  for (const key of TEXT_KEYS) if (typeof candidate[key] !== 'string' || candidate[key].length < 1 || candidate[key].length > 240 || !SAFE_TEXT.test(candidate[key])) errors.push(`${key}-invalid`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id || '')) errors.push('id-invalid');
  if (candidate.provider !== 'Lichess' || candidate.fallbackMode !== 'replay-if-available') errors.push('provider-invalid');
  const frame = safeHttps(candidate.frameUrl);
  const event = safeHttps(candidate.providerEventUrl);
  const expectedFrame = `/embed/broadcast/${candidate.id}/2sMqschv`;
  const expectedEvent = `/broadcast/${candidate.id}/2sMqschv`;
  if (!frame || frame.origin !== 'https://lichess.org' || frame.pathname !== expectedFrame || frame.search) errors.push('frame-url-invalid');
  if (!event || event.origin !== 'https://lichess.org' || event.pathname !== expectedEvent || event.search) errors.push('event-url-invalid');
  for (const key of ['organizerUrl', 'scheduleUrl']) if (!safeHttps(candidate[key])) errors.push(`${key}-invalid`);
  for (const key of ['startsAt', 'endsAt', 'verifiedAt']) if (!validInstant(candidate[key])) errors.push(`${key}-invalid`);
  if (validInstant(candidate.startsAt) && validInstant(candidate.endsAt) && Date.parse(candidate.startsAt) >= Date.parse(candidate.endsAt)) errors.push('schedule-invalid');
  if (!validTimezone(candidate.eventTimezone)) errors.push('timezone-invalid');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
}

export function lichessBroadcastStatus(candidate, now, availability = 'available') {
  if (!validateLichessBroadcast(candidate).ok) return 'configuration-error';
  return externalTournamentStatus(candidate, now, availability);
}
