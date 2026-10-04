import { normalizeArchiveReturnTo } from './archive-return-state.js';

export const PGN_COLLECTION_REGISTRY_VERSION = 'CaissaPgnCollectionRegistry@3.0.0';

export const REDISTRIBUTION_STATUSES = Object.freeze({
  VERIFIED_REDISTRIBUTABLE: 'VERIFIED_REDISTRIBUTABLE',
  LINK_ONLY: 'LINK_ONLY',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED'
});

const collection = value => Object.freeze(value);
const legacySourceName = 'Legacy repository PGN catalog (README attribution only)';
const legacySourceUrl = 'https://www.pgnmentor.com/files.html';
const legacyLicense = 'No collection-specific redistribution permission recorded';
const needsReview = Object.freeze({
  sourceName: legacySourceName,
  sourceUrl: legacySourceUrl,
  retrievedAt: null,
  license: legacyLicense,
  licenseUrl: null,
  redistributionStatus: REDISTRIBUTION_STATUSES.NEEDS_REVIEW,
  transformations: Object.freeze([]),
  notes: 'A free-download statement and the PGN tooling package MIT license do not establish redistribution rights for the game data.',
  localAsset: null,
  downloadFilename: null,
  mimeType: null,
  downloadable: false,
  readerCompatible: false
});

export const pgnCollections = Object.freeze([
  collection({
    id: 'capablanca-complete', title: 'Capablanca Games 1901–1941', type: 'player-collection', eventId: null,
    championId: 'jose-raul-capablanca', gamesCount: 597,
    sourceName: 'CAISSA repository owner', sourceUrl: null, retrievedAt: '2026-08-14',
    attribution: 'Factual Capablanca game scores supplied and authorized by the repository owner.',
    license: 'Owner authorization for use in the CAISSA Game Replayer', licenseUrl: null,
    redistributionStatus: REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE,
    checksum: 'sha256:33cbbea9421f14f51bf55dbd772fed3031e855235fedf05d9247886a9d96f71f',
    transformations: Object.freeze(['CRLF line endings normalized to LF; game ordering and scores preserved.']),
    notes: 'Approved with disclosed incomplete metadata; no comments, variations, or NAG symbols were present.',
    localAsset: '/data/pgn/capablanca-games-1901-1941.pgn',
    downloadFilename: 'capablanca-games-1901-1941.pgn',
    mimeType: 'application/x-chess-pgn',
    downloadable: true,
    readerCompatible: true
  }),
  collection({ id: 'fischer-spassky-game-6', title: 'Fischer–Spassky 1972 · Game 6', type: 'championship-match', eventId: 'wcc-1972', championId: 'bobby-fischer', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:064797882f026935696f6911dd4627671d0d426055482b94256d4216fa7710ee', ...needsReview }),
  collection({ id: 'fischer-byrne-1963', title: 'Fischer–Byrne 1963', type: 'player-collection', eventId: null, championId: 'bobby-fischer', gamesCount: 1, attribution: 'Single factual game score; not a championship game.', checksum: 'sha256:d27848a5a5107638d2b5d944316ead21eafc04e038b8c2b95b5c559c0a248fe5', ...needsReview }),
  collection({ id: 'karpov-kasparov-1985', title: 'Karpov–Kasparov 1985 · Local Game', type: 'championship-match', eventId: 'wcc-1985', championId: 'anatoly-karpov', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:e9af4fb8b99b80d59e67a29225649896b9a0e224d58c929c1151eeff964db9b1', ...needsReview }),
  collection({ id: 'kasparov-topalov-1999', title: 'Kasparov–Topalov 1999', type: 'player-collection', eventId: null, championId: 'garry-kasparov', gamesCount: 1, attribution: 'Single factual game score; not a championship game.', checksum: 'sha256:4863048f0a60476f10d14ff9e1eb62d1c400329a0535707cead2626dd955d3f5', ...needsReview }),
  collection({ id: 'carlsen-caruana-2018', title: 'Carlsen–Caruana 2018 · Local Game', type: 'championship-match', eventId: null, championId: 'magnus-carlsen', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:ad66743a47fc277ef52e4725bef92973be81f0033a3ac84f5e39ee1a9e6b0b05', ...needsReview }),
  collection({ id: 'tal-smyslov-1959', title: 'Tal–Smyslov 1959', type: 'player-collection', eventId: null, championId: 'mikhail-tal', gamesCount: 1, attribution: 'Single Candidates Tournament game score.', checksum: 'sha256:959ac06c59748e54c1380ad37b0ee14afd037461d407a5d54ee38e90d36db4c7', ...needsReview })
]);

const allowedKeys = new Set(['id', 'title', 'type', 'eventId', 'championId', 'gamesCount', 'sourceUrl', 'sourceName', 'retrievedAt', 'attribution', 'license', 'licenseUrl', 'redistributionStatus', 'checksum', 'transformations', 'notes', 'localAsset', 'downloadFilename', 'mimeType', 'downloadable', 'readerCompatible']);
const collectionIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localAssetPattern = /^\/data\/pgn\/[A-Za-z0-9_./-]+\.pgn$/;
const downloadFilenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.pgn$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const validStatuses = new Set(Object.values(REDISTRIBUTION_STATUSES));

export function getKnownPgnCollection(collectionId) {
  if (typeof collectionId !== 'string' || !collectionIdPattern.test(collectionId)) return null;
  return pgnCollections.find(entry => entry.id === collectionId) || null;
}

export function getPgnCollection(collectionId) {
  const entry = getKnownPgnCollection(collectionId);
  if (!entry || !pgnCollectionRegistryValidation.valid) return null;
  return entry.redistributionStatus === REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE ? entry : null;
}

export function listPublishablePgnCollections() {
  return Object.freeze(pgnCollections.filter(entry => entry.redistributionStatus === REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE));
}

export function getPgnAvailability(collectionId) {
  const entry = getKnownPgnCollection(collectionId);
  if (!entry) return Object.freeze({ code: 'historical-only', label: 'Historical data only', accessible: false });
  if (getPgnCollection(collectionId)) return Object.freeze({ code: 'available', label: 'PGN available', accessible: true });
  return Object.freeze({ code: 'pending-review', label: 'PGN pending review', accessible: false });
}

export function validatePgnCollectionRegistry(entries = pgnCollections) {
  const errors = [];
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push('Collection entry must be an object'); continue; }
    for (const key of Object.keys(entry)) if (!allowedKeys.has(key)) errors.push(`${entry.id || 'unknown'} has unsupported field ${key}`);
    if (!collectionIdPattern.test(entry.id || '')) errors.push(`Invalid collection id: ${entry.id || 'missing'}`);
    if (ids.has(entry.id)) errors.push(`Duplicate collection id: ${entry.id}`);
    ids.add(entry.id);
    if (!['championship-match', 'player-collection'].includes(entry.type)) errors.push(`${entry.id} has invalid type`);
    if (!Number.isInteger(entry.gamesCount) || entry.gamesCount < 1) errors.push(`${entry.id} has invalid gamesCount`);
    if (!validStatuses.has(entry.redistributionStatus)) errors.push(`${entry.id} has invalid redistributionStatus`);
    if (!sha256Pattern.test(entry.checksum || '')) errors.push(`${entry.id} has invalid checksum`);
    if (entry.sourceUrl !== null && !/^https:\/\//.test(entry.sourceUrl || '')) errors.push(`${entry.id} has invalid sourceUrl`);
    if (entry.licenseUrl !== null && !/^https:\/\//.test(entry.licenseUrl || '')) errors.push(`${entry.id} has invalid licenseUrl`);
    if (entry.retrievedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.retrievedAt || '')) errors.push(`${entry.id} has invalid retrievedAt`);
    if (!Array.isArray(entry.transformations)) errors.push(`${entry.id} has invalid transformations`);
    const publishable = entry.redistributionStatus === REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE;
    if (publishable && (!localAssetPattern.test(entry.localAsset || '') || /\.\.|[?#]/.test(entry.localAsset || ''))) errors.push(`${entry.id} has unsafe localAsset`);
    if (!publishable && entry.localAsset !== null) errors.push(`${entry.id} exposes a non-publishable localAsset`);
    if (publishable && !downloadFilenamePattern.test(entry.downloadFilename || '')) errors.push(`${entry.id} has invalid downloadFilename`);
    if (!publishable && entry.downloadFilename !== null) errors.push(`${entry.id} exposes a non-publishable downloadFilename`);
    if (publishable && entry.mimeType !== 'application/x-chess-pgn') errors.push(`${entry.id} has invalid mimeType`);
    if (!publishable && entry.mimeType !== null) errors.push(`${entry.id} exposes a non-publishable mimeType`);
    if (!publishable && (entry.downloadable || entry.readerCompatible)) errors.push(`${entry.id} exposes non-publishable capabilities`);
    if (typeof entry.downloadable !== 'boolean' || typeof entry.readerCompatible !== 'boolean') errors.push(`${entry.id} has invalid capability flags`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export const pgnCollectionRegistryValidation = validatePgnCollectionRegistry();

export function buildPgnReaderHref(collectionId, gameId = null, { returnTo = null } = {}) {
  const entry = getPgnCollection(collectionId);
  if (!entry?.readerCompatible) return null;
  const params = new URLSearchParams({ collection: entry.id });
  if (gameId !== null) {
    const normalizedGameId = String(gameId);
    if (!/^\d+$/.test(normalizedGameId)) return null;
    params.set('game', normalizedGameId);
  }
  if (returnTo !== null) {
    const safeReturnTo = normalizeArchiveReturnTo(returnTo);
    if (!safeReturnTo) return null;
    params.set('returnTo', safeReturnTo);
  }
  return `/watch/game-replayer?${params.toString()}`;
}
