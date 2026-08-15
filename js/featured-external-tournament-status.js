export function externalTournamentStatus(candidate, now, availability = 'available') {
  if (availability === 'unavailable') return 'unavailable';
  const instant = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  const start = Date.parse(candidate?.startsAt);
  const end = Date.parse(candidate?.endsAt);
  if (![instant, start, end].every(Number.isFinite) || start >= end) return 'configuration-error';
  if (instant < start) return 'upcoming';
  if (instant < end) return 'coverage-window';
  return 'completed';
}
