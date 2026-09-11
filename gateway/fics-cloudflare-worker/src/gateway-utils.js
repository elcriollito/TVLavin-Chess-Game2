export function parseAllowedOrigins(value = '') {
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .map(exactWebOrigin)
    .filter(Boolean)
    .filter((origin, index, origins) => origins.indexOf(origin) === index);
}

export function exactWebOrigin(value = '') {
  const candidate = String(value).trim();
  if (!candidate || candidate === '*' || candidate === 'null') return null;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin === candidate ? candidate : null;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin, allowedOrigins) {
  const candidate = exactWebOrigin(origin);
  return candidate !== null && allowedOrigins.includes(candidate);
}

export function createRateLimiter(limit, windowMs = 1000) {
  const timestamps = [];

  return {
    allow(now = Date.now()) {
      while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
        timestamps.shift();
      }
      if (timestamps.length >= limit) return false;
      timestamps.push(now);
      return true;
    }
  };
}

export function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isExpectedCloseError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'network connection lost',
    'socket is closed',
    'websocket closed',
    'connection closed',
    'connection reset',
    'disconnected',
    'stream was cancelled',
    'writer has been released'
  ].some((expected) => message.includes(expected));
}
