import { externalTournamentStatus } from './featured-external-tournament-status.js';

export const FEATURED_TOURNAMENT_SCHEMA = 'CaissaFeaturedExternalTournament@1.0.0';

const record = {
  schema: FEATURED_TOURNAMENT_SCHEMA,
  id: 'esports-world-cup-chess-playoff-2026',
  displayName: 'Esports World Cup Chess Finals 2026',
  provider: 'ChessBase',
  frameUrl: 'https://live.chessbase.com/frame/Esports-World-Cup-Chess-Playoff-2026',
  providerEventUrl: 'https://live.chessbase.com/en/Watch?id=Esports-World-Cup-Chess-Playoff-2026',
  organizerName: 'Esports World Cup Foundation',
  organizerUrl: 'https://www.esportsworldcup.com/en',
  startsAt: '2026-08-10T22:00:00Z',
  endsAt: '2026-08-15T22:00:00Z',
  eventTimezone: 'Europe/Paris',
  location: 'Paris Expo Porte de Versailles, Paris, France',
  verifiedAt: '2026-08-15T02:35:08Z',
  fallbackMode: 'replay-if-available'
};

export const FEATURED_TOURNAMENT = Object.freeze({ ...record });

const REQUIRED_KEYS = Object.freeze(Object.keys(record).sort());
const TEXT_KEYS = Object.freeze(['id', 'displayName', 'provider', 'organizerName', 'location', 'fallbackMode']);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_TEXT = /^[^<>\u0000-\u001f\u007f]+$/u;

function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.startsWith('//') || /%3a/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function validInstant(value) {
  return typeof value === 'string' && UTC_INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function validTimezone(value) {
  if (typeof value !== 'string' || value.length > 80) return false;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

export function validateFeaturedTournament(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({ ok: false, errors: Object.freeze(['configuration-required']) });
  }
  const keys = Object.keys(candidate).sort();
  if (keys.length !== REQUIRED_KEYS.length || keys.some((key, index) => key !== REQUIRED_KEYS[index])) errors.push('fields-invalid');
  if (candidate.schema !== FEATURED_TOURNAMENT_SCHEMA) errors.push('schema-invalid');
  for (const key of TEXT_KEYS) {
    const value = candidate[key];
    if (typeof value !== 'string' || value.length < 1 || value.length > 160 || !SAFE_TEXT.test(value)) errors.push(`${key}-invalid`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id || '')) errors.push('id-invalid');
  if (candidate.provider !== 'ChessBase') errors.push('provider-invalid');
  if (candidate.fallbackMode !== 'replay-if-available') errors.push('fallback-invalid');
  const frame = safeHttpsUrl(candidate.frameUrl);
  if (!frame || frame.origin !== 'https://live.chessbase.com' || !/^\/frame\/[A-Za-z0-9-]+$/.test(frame.pathname) || frame.search) errors.push('frame-url-invalid');
  const provider = safeHttpsUrl(candidate.providerEventUrl);
  if (!provider || provider.origin !== 'https://live.chessbase.com' || provider.pathname !== '/en/Watch' || provider.searchParams.size !== 1 || !provider.searchParams.get('id')) errors.push('provider-url-invalid');
  if (frame && provider && provider.searchParams.get('id') !== frame.pathname.slice('/frame/'.length)) errors.push('event-url-mismatch');
  if (!safeHttpsUrl(candidate.organizerUrl)) errors.push('organizer-url-invalid');
  if (!validInstant(candidate.startsAt)) errors.push('startsAt-invalid');
  if (!validInstant(candidate.endsAt)) errors.push('endsAt-invalid');
  if (!validInstant(candidate.verifiedAt)) errors.push('verifiedAt-invalid');
  if (validInstant(candidate.startsAt) && validInstant(candidate.endsAt) && Date.parse(candidate.startsAt) >= Date.parse(candidate.endsAt)) errors.push('schedule-invalid');
  if (!validTimezone(candidate.eventTimezone)) errors.push('timezone-invalid');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
}

export function featuredTournamentStatus(candidate, now, availability = 'available') {
  if (!validateFeaturedTournament(candidate).ok) return 'configuration-error';
  return externalTournamentStatus(candidate, now, availability);
}
