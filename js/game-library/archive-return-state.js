export const ARCHIVE_RETURN_STATE_VERSION = 'CaissaArchiveReturnState@1.1.0';

export const ARCHIVE_VIEWS = Object.freeze(['champions', 'matches']);
export const MATCH_LINEAGE_FILTERS = Object.freeze(['all', 'undisputed', 'classical', 'fide', 'special']);

const identifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedKeys = new Set(['view', 'lineage', 'champion', 'reign', 'event', 'collection', 'scroll', 'mural']);

const safeIdentifier = value => typeof value === 'string' && identifierPattern.test(value) ? value : null;
const safeOffset = value => {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 1_000_000 ? number : 0;
};

export function buildArchiveReturnTo(state = {}) {
  const params = new URLSearchParams();
  const view = ARCHIVE_VIEWS.includes(state.view) ? state.view : 'champions';
  const lineage = MATCH_LINEAGE_FILTERS.includes(state.lineage) ? state.lineage : 'all';
  params.set('view', view);
  params.set('lineage', lineage);
  for (const key of ['champion', 'reign', 'event', 'collection']) {
    const value = safeIdentifier(state[key]);
    if (value) params.set(key, value);
  }
  const scroll = safeOffset(state.scroll);
  const mural = safeOffset(state.mural);
  if (scroll) params.set('scroll', String(scroll));
  if (mural) params.set('mural', String(mural));
  return `/game-library/champions?${params.toString()}`;
}

export function normalizeArchiveReturnTo(value) {
  if (typeof value !== 'string' || value.length > 1200 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  let url;
  try { url = new URL(value, 'https://caissa.invalid'); } catch { return null; }
  if (url.origin !== 'https://caissa.invalid' || !['/game-library/champions', '/game-library/champions/'].includes(url.pathname) || url.hash) return null;
  if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key))) return null;
  const view = url.searchParams.get('view') || 'champions';
  const lineage = url.searchParams.get('lineage') || 'all';
  if (!ARCHIVE_VIEWS.includes(view) || !MATCH_LINEAGE_FILTERS.includes(lineage)) return null;
  for (const key of ['champion', 'reign', 'event', 'collection']) {
    const valueForKey = url.searchParams.get(key);
    if (valueForKey !== null && !safeIdentifier(valueForKey)) return null;
  }
  for (const key of ['scroll', 'mural']) {
    const valueForKey = url.searchParams.get(key);
    if (valueForKey !== null && String(safeOffset(valueForKey)) !== valueForKey) return null;
  }
  return buildArchiveReturnTo({
    view,
    lineage,
    champion: url.searchParams.get('champion'),
    reign: url.searchParams.get('reign'),
    event: url.searchParams.get('event'),
    collection: url.searchParams.get('collection'),
    scroll: url.searchParams.get('scroll'),
    mural: url.searchParams.get('mural')
  });
}

export function readArchiveState(locationLike = globalThis.location) {
  const params = new URLSearchParams(locationLike?.search || '');
  const legacyChampion = (locationLike?.hash || '').match(/^#champion=([a-z0-9-]+)$/)?.[1] || null;
  return Object.freeze({
    view: ARCHIVE_VIEWS.includes(params.get('view')) ? params.get('view') : 'champions',
    lineage: MATCH_LINEAGE_FILTERS.includes(params.get('lineage')) ? params.get('lineage') : 'all',
    champion: safeIdentifier(params.get('champion')) || legacyChampion,
    reign: safeIdentifier(params.get('reign')),
    event: safeIdentifier(params.get('event')),
    collection: safeIdentifier(params.get('collection')),
    scroll: safeOffset(params.get('scroll')),
    mural: safeOffset(params.get('mural'))
  });
}
