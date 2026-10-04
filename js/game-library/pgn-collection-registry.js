import { normalizeArchiveReturnTo } from './archive-return-state.js';
import { worldChampionshipPgnCatalog, worldChampionshipPgnCatalogValidation } from './world-championship-pgn-catalog.js';

export const PGN_COLLECTION_REGISTRY_VERSION = 'CaissaPgnCollectionRegistry@4.1.0';

export const REDISTRIBUTION_STATUSES = Object.freeze({
  VERIFIED_REDISTRIBUTABLE: 'VERIFIED_REDISTRIBUTABLE',
  REMOTE_VIEW_ONLY: 'REMOTE_VIEW_ONLY',
  LINK_ONLY: 'LINK_ONLY',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  REJECTED: 'REJECTED'
});

export const RIGHTS_CLASSIFICATIONS = Object.freeze({
  RIGHTS_CLEARED_LOCAL: 'RIGHTS_CLEARED_LOCAL',
  REMOTE_VIEW_ONLY: 'REMOTE_VIEW_ONLY',
  NEEDS_REVIEW: 'NEEDS_REVIEW'
});

export const EXTERNAL_LINK_KINDS = Object.freeze({
  DIRECT_PGN: 'direct-pgn',
  PROVIDER_PAGE: 'provider-page'
});

const collection = value => Object.freeze(value);
const needsReview = Object.freeze({
  sourceName: 'Legacy repository PGN catalog (README attribution only)',
  sourceUrl: 'https://www.pgnmentor.com/files.html',
  retrievedAt: null,
  license: 'No collection-specific redistribution permission recorded',
  licenseUrl: null,
  redistributionStatus: REDISTRIBUTION_STATUSES.NEEDS_REVIEW,
  rightsClassification: RIGHTS_CLASSIFICATIONS.NEEDS_REVIEW,
  transformations: Object.freeze([]),
  notes: 'A free-download statement and the PGN tooling package MIT license do not establish redistribution rights for the game data.',
  externalDownloadUrl: null, externalDownloadApproved: false, externalLinkKind: null,
  localAsset: null,
  readerAsset: null,
  downloadFilename: null,
  mimeType: null,
  downloadable: false,
  readerCompatible: false
});

const localCollections = [
  collection({
    id: 'capablanca-complete', title: 'Capablanca Games 1901–1941', type: 'player-collection', eventId: null,
    championId: 'jose-raul-capablanca', gamesCount: 597,
    sourceName: 'CAISSA repository owner', sourceUrl: null, retrievedAt: '2026-08-14',
    attribution: 'Factual Capablanca game scores supplied and authorized by the repository owner.',
    license: 'Owner authorization for use in the CAISSA Game Replayer', licenseUrl: null,
    redistributionStatus: REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE,
    rightsClassification: RIGHTS_CLASSIFICATIONS.RIGHTS_CLEARED_LOCAL,
    checksum: 'sha256:33cbbea9421f14f51bf55dbd772fed3031e855235fedf05d9247886a9d96f71f',
    transformations: Object.freeze(['CRLF line endings normalized to LF; game ordering and scores preserved.']),
    notes: 'Approved with disclosed incomplete metadata; no comments, variations, or NAG symbols were present.',
    externalDownloadUrl: null, externalDownloadApproved: false, externalLinkKind: null,
    localAsset: '/data/pgn/capablanca-games-1901-1941.pgn',
    readerAsset: '/data/pgn/capablanca-games-1901-1941.pgn',
    downloadFilename: 'capablanca-games-1901-1941.pgn', mimeType: 'application/x-chess-pgn',
    downloadable: true, readerCompatible: true
  }),
  collection({ id: 'fischer-spassky-game-6', title: 'Fischer–Spassky 1972 · Game 6', type: 'championship-match', eventId: 'wcc-1972', championId: 'bobby-fischer', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:064797882f026935696f6911dd4627671d0d426055482b94256d4216fa7710ee', ...needsReview }),
  collection({ id: 'fischer-byrne-1963', title: 'Fischer–Byrne 1963', type: 'player-collection', eventId: null, championId: 'bobby-fischer', gamesCount: 1, attribution: 'Single factual game score; not a championship game.', checksum: 'sha256:d27848a5a5107638d2b5d944316ead21eafc04e038b8c2b95b5c559c0a248fe5', ...needsReview }),
  collection({ id: 'karpov-kasparov-1985', title: 'Karpov–Kasparov 1985 · Local Game', type: 'championship-match', eventId: 'wcc-1985', championId: 'anatoly-karpov', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:e9af4fb8b99b80d59e67a29225649896b9a0e224d58c929c1151eeff964db9b1', ...needsReview }),
  collection({ id: 'kasparov-topalov-1999', title: 'Kasparov–Topalov 1999', type: 'player-collection', eventId: null, championId: 'garry-kasparov', gamesCount: 1, attribution: 'Single factual game score; not a championship game.', checksum: 'sha256:4863048f0a60476f10d14ff9e1eb62d1c400329a0535707cead2626dd955d3f5', ...needsReview }),
  collection({ id: 'carlsen-caruana-2018', title: 'Carlsen–Caruana 2018 · Local Game', type: 'championship-match', eventId: null, championId: 'magnus-carlsen', gamesCount: 1, attribution: 'Incomplete one-game repository excerpt.', checksum: 'sha256:ad66743a47fc277ef52e4725bef92973be81f0033a3ac84f5e39ee1a9e6b0b05', ...needsReview }),
  collection({ id: 'tal-smyslov-1959', title: 'Tal–Smyslov 1959', type: 'player-collection', eventId: null, championId: 'mikhail-tal', gamesCount: 1, attribution: 'Single Candidates Tournament game score.', checksum: 'sha256:959ac06c59748e54c1380ad37b0ee14afd037461d407a5d54ee38e90d36db4c7', ...needsReview })
];

// Reviewed Champion bindings for IDs already present in the canonical
// PGN Reader Players catalog. These entries grant external linking only:
// they do not activate CAISSA-hosted player assets or Reader access.
const externalPlayerRows = [
  ['smallchess-wilhelm-steinitz', 'Wilhelm Steinitz', 'wilhelm-steinitz', 1089, 'Wilhelm Steinitz.pgn'],
  ['smallchess-emanuel-lasker', 'Emanuel Lasker', 'emanuel-lasker', 378, 'Emanuel Lasker.pgn'],
  ['smallchess-alexander-alekhine', 'Alexander Alekhine', 'alexander-alekhine', 785, 'Alexander Alekhine.pgn'],
  ['smallchess-max-euwe', 'Max Euwe', 'max-euwe', 1759, 'Max Euwe.pgn'],
  ['smallchess-mikhail-botvinnik', 'Mikhail Botvinnik', 'mikhail-botvinnik', 1201, 'Mikhail Botvinnik.pgn'],
  ['smallchess-vasily-smyslov', 'Vasily Smyslov', 'vasily-smyslov', 1478, 'Vasily Smyslov.pgn'],
  ['smallchess-mikhail-tal', 'Mikhail Tal', 'mikhail-tal', 2960, 'Mikhail Tal.pgn'],
  ['smallchess-tigran-petrosian', 'Tigran Petrosian', 'tigran-petrosian', 2159, 'Tigran Petrosian.pgn'],
  ['smallchess-boris-spassky', 'Boris Spassky', 'boris-spassky', 2499, 'Boris Spassky.pgn'],
  ['smallchess-bobby-fischer', 'Bobby Fischer', 'bobby-fischer', 1101, 'Bobby Fischer.pgn'],
  ['smallchess-anatoly-karpov', 'Anatoly Karpov', 'anatoly-karpov', 1105, 'Anatoly Karpov.pgn'],
  ['smallchess-garry-kasparov', 'Garry Kasparov', 'garry-kasparov', 1669, 'Garry Kasparov.pgn'],
  ['smallchess-vladimir-kramnik', 'Vladimir Kramnik', 'vladimir-kramnik', 2763, 'Vladimir Kramnik.pgn'],
  ['smallchess-viswanathan-anand', 'Viswanathan Anand', 'viswanathan-anand', 4079, 'Viswanathan Anand.pgn'],
  ['smallchess-magnus-carlsen', 'Magnus Carlsen', 'magnus-carlsen', 5097, 'Magnus Carlsen.pgn'],
  ['smallchess-ding-liren', 'Ding Liren', 'ding-liren', 635, 'Ding Liren.pgn'],
  ['smallchess-dommaraju-gukesh', 'Dommaraju Gukesh', 'gukesh-dommaraju', 1514, 'Dommaraju Gukesh.pgn']
];
const smallChessSourceUrl = 'https://www.smallchess.com/Games/';
const externalPlayerCollections = externalPlayerRows.map(([id, title, championId, gamesCount, file]) => collection({
  id, title: `${title} — Player Games`, type: 'player-collection', eventId: null,
  championId, gamesCount,
  sourceName: 'SmallChess', sourceUrl: smallChessSourceUrl, retrievedAt: '2026-10-04',
  attribution: `Player game collection maintained by SmallChess; download remains on the provider's site.`,
  license: 'External-source linking only; no CAISSA redistribution grant recorded', licenseUrl: null,
  redistributionStatus: REDISTRIBUTION_STATUSES.LINK_ONLY,
  rightsClassification: RIGHTS_CLASSIFICATIONS.NEEDS_REVIEW,
  checksum: null, transformations: Object.freeze([]),
  notes: 'Existing canonical Reader player ID. This registry entry approves only the reviewed direct provider link.',
  externalDownloadUrl: `${smallChessSourceUrl}${encodeURIComponent(file)}`,
  externalDownloadApproved: true, externalLinkKind: EXTERNAL_LINK_KINDS.DIRECT_PGN,
  localAsset: null, readerAsset: null, downloadFilename: null, mimeType: null,
  downloadable: false, readerCompatible: false
}));
const canonicalExternalPlayerById = new Map(externalPlayerCollections.map(entry => [entry.id, entry]));

const remoteWorldChampionshipCollections = worldChampionshipPgnCatalog.map(entry => collection({
  id: entry.id, title: `${entry.year} — ${entry.title}`, type: 'championship-match', eventId: entry.eventId,
  championId: null, gamesCount: entry.gamesCount,
  sourceName: entry.sourceName, sourceUrl: entry.sourceUrl, retrievedAt: '2026-10-04',
  attribution: `Remote championship game scores from ${entry.sourceName}; CAISSA does not redistribute this PGN.`,
  license: 'Remote viewing and external-source linking only; no CAISSA redistribution grant recorded', licenseUrl: null,
  redistributionStatus: REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY,
  rightsClassification: RIGHTS_CLASSIFICATIONS.REMOTE_VIEW_ONLY,
  checksum: null, transformations: Object.freeze([]),
  notes: 'Existing Reader catalog entry. Runtime access uses the fixed, allowlisted PGN Mentor gateway; external download leaves CAISSA.',
  externalDownloadUrl: entry.externalDownloadUrl, externalDownloadApproved: true, externalLinkKind: EXTERNAL_LINK_KINDS.DIRECT_PGN,
  localAsset: null,
  readerAsset: `/api/pgn/pgnmentor?kind=event&file=${encodeURIComponent(entry.file)}`,
  downloadFilename: null, mimeType: null, downloadable: false, readerCompatible: true
}));
const canonicalRemoteById = new Map(worldChampionshipPgnCatalog.map(entry => [entry.id, entry]));

export const pgnCollections = Object.freeze([...localCollections, ...externalPlayerCollections, ...remoteWorldChampionshipCollections]);

const allowedKeys = new Set(['id', 'title', 'type', 'eventId', 'championId', 'gamesCount', 'sourceUrl', 'sourceName', 'retrievedAt', 'attribution', 'license', 'licenseUrl', 'redistributionStatus', 'rightsClassification', 'checksum', 'transformations', 'notes', 'externalDownloadUrl', 'externalDownloadApproved', 'externalLinkKind', 'localAsset', 'readerAsset', 'downloadFilename', 'mimeType', 'downloadable', 'readerCompatible']);
const collectionIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localAssetPattern = /^\/data\/pgn\/[A-Za-z0-9_./-]+\.pgn$/;
const remoteReaderAssetPattern = /^\/api\/pgn\/pgnmentor\?kind=event&file=[A-Za-z0-9][A-Za-z0-9._()-]{0,119}\.pgn$/;
const downloadFilenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.pgn$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const validStatuses = new Set(Object.values(REDISTRIBUTION_STATUSES));
const validRights = new Set(Object.values(RIGHTS_CLASSIFICATIONS));
const validExternalLinkKinds = new Set(Object.values(EXTERNAL_LINK_KINDS));
const readerStatuses = new Set([REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE, REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY]);

function isSafeHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.hash;
  } catch { return false; }
}

function isCanonicalExternalLink(entry) {
  if (!isSafeHttpsUrl(entry.externalDownloadUrl) || !validExternalLinkKinds.has(entry.externalLinkKind)) return false;
  const player = canonicalExternalPlayerById.get(entry.id);
  if (player) {
    return entry.type === 'player-collection' && entry.eventId === null
      && entry.championId === player.championId && entry.title === player.title
      && entry.gamesCount === player.gamesCount && entry.sourceName === player.sourceName
      && entry.externalDownloadUrl === player.externalDownloadUrl
      && entry.externalLinkKind === player.externalLinkKind;
  }
  const event = canonicalRemoteById.get(entry.id);
  return Boolean(event) && entry.type === 'championship-match' && entry.eventId === event.eventId
    && entry.externalDownloadUrl === event.externalDownloadUrl
    && entry.externalLinkKind === EXTERNAL_LINK_KINDS.DIRECT_PGN;
}

function registryIsValid(entries) {
  return entries === pgnCollections ? pgnCollectionRegistryValidation.valid : validatePgnCollectionRegistry(entries).valid;
}

export function getKnownPgnCollection(collectionId) {
  if (typeof collectionId !== 'string' || !collectionIdPattern.test(collectionId)) return null;
  return pgnCollections.find(entry => entry.id === collectionId) || null;
}

export function getPgnCollection(collectionId) {
  const entry = getKnownPgnCollection(collectionId);
  if (!entry || !pgnCollectionRegistryValidation.valid || !entry.readerCompatible) return null;
  return readerStatuses.has(entry.redistributionStatus) ? entry : null;
}

export function getKnownPgnCollectionForEvent(eventId) {
  if (typeof eventId !== 'string' || !collectionIdPattern.test(eventId)) return null;
  return pgnCollections.find(entry => entry.type === 'championship-match' && entry.eventId === eventId && (entry.readerCompatible || entry.externalDownloadApproved)) || null;
}

export function getPgnCollectionForEvent(eventId, entries = pgnCollections) {
  if (typeof eventId !== 'string' || !collectionIdPattern.test(eventId) || !registryIsValid(entries)) return null;
  return entries.find(entry => entry.type === 'championship-match' && entry.eventId === eventId
    && readerStatuses.has(entry.redistributionStatus) && entry.readerCompatible) || null;
}

export function getPgnReaderAsset(collectionId) {
  return getPgnCollection(collectionId)?.readerAsset || null;
}

export function getApprovedExternalPgnDownload(collectionId, entries = pgnCollections) {
  if (typeof collectionId !== 'string' || !collectionIdPattern.test(collectionId) || !registryIsValid(entries)) return null;
  const entry = entries.find(value => value.id === collectionId);
  if (!entry?.externalDownloadApproved || !isCanonicalExternalLink(entry)) return null;
  if (![REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE, REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY, REDISTRIBUTION_STATUSES.LINK_ONLY].includes(entry.redistributionStatus)) return null;
  return Object.freeze({ collectionId: entry.id, url: entry.externalDownloadUrl, sourceName: entry.sourceName, linkKind: entry.externalLinkKind });
}

export function listPublishablePgnCollections() {
  return Object.freeze(pgnCollections.filter(entry => entry.redistributionStatus === REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE));
}

export function listReaderPgnCollections() {
  return Object.freeze(pgnCollections.filter(entry => entry.readerCompatible && readerStatuses.has(entry.redistributionStatus)));
}

export function getPgnAvailability(collectionId) {
  const entry = getKnownPgnCollection(collectionId);
  if (!entry) return Object.freeze({ code: 'historical-only', label: 'Historical data only', accessible: false, readerAvailable: false, externalDownloadAvailable: false });
  const readerAvailable = Boolean(getPgnCollection(collectionId)?.readerCompatible);
  const externalDownloadAvailable = Boolean(getApprovedExternalPgnDownload(collectionId));
  if (readerAvailable) return Object.freeze({ code: 'available', label: 'Reader available', accessible: true, readerAvailable, externalDownloadAvailable });
  if (externalDownloadAvailable) return Object.freeze({ code: 'external-only', label: 'External download available', accessible: true, readerAvailable, externalDownloadAvailable });
  return Object.freeze({ code: 'pending-review', label: 'PGN pending review', accessible: false, readerAvailable, externalDownloadAvailable });
}

export function validatePgnCollectionRegistry(entries = pgnCollections) {
  const errors = [];
  const ids = new Set();
  const publicEventIds = new Set();
  if (entries === pgnCollections && !worldChampionshipPgnCatalogValidation.valid) errors.push(...worldChampionshipPgnCatalogValidation.errors);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push('Collection entry must be an object'); continue; }
    for (const key of Object.keys(entry)) if (!allowedKeys.has(key)) errors.push(`${entry.id || 'unknown'} has unsupported field ${key}`);
    if (!collectionIdPattern.test(entry.id || '')) errors.push(`Invalid collection id: ${entry.id || 'missing'}`);
    if (ids.has(entry.id)) errors.push(`Duplicate collection id: ${entry.id}`);
    ids.add(entry.id);
    if (!['championship-match', 'player-collection'].includes(entry.type)) errors.push(`${entry.id} has invalid type`);
    if (!Number.isInteger(entry.gamesCount) || entry.gamesCount < 1) errors.push(`${entry.id} has invalid gamesCount`);
    if (!validStatuses.has(entry.redistributionStatus)) errors.push(`${entry.id} has invalid redistributionStatus`);
    if (!validRights.has(entry.rightsClassification)) errors.push(`${entry.id} has invalid rightsClassification`);
    const local = entry.redistributionStatus === REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE;
    const remoteView = entry.redistributionStatus === REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY;
    const linkOnly = entry.redistributionStatus === REDISTRIBUTION_STATUSES.LINK_ONLY;
    if (local && !sha256Pattern.test(entry.checksum || '')) errors.push(`${entry.id} has invalid checksum`);
    if (remoteView && entry.checksum !== null) errors.push(`${entry.id} must not claim a local checksum`);
    if (linkOnly && entry.checksum !== null) errors.push(`${entry.id} must not claim a local checksum`);
    if (!local && !remoteView && !linkOnly && !sha256Pattern.test(entry.checksum || '')) errors.push(`${entry.id} has invalid checksum`);
    if (entry.sourceUrl !== null && !isSafeHttpsUrl(entry.sourceUrl)) errors.push(`${entry.id} has invalid sourceUrl`);
    if (entry.licenseUrl !== null && !isSafeHttpsUrl(entry.licenseUrl)) errors.push(`${entry.id} has invalid licenseUrl`);
    if (entry.retrievedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(entry.retrievedAt || '')) errors.push(`${entry.id} has invalid retrievedAt`);
    if (!Array.isArray(entry.transformations)) errors.push(`${entry.id} has invalid transformations`);
    if (typeof entry.externalDownloadApproved !== 'boolean') errors.push(`${entry.id} has invalid externalDownloadApproved`);
    if (entry.externalDownloadApproved && !isSafeHttpsUrl(entry.externalDownloadUrl)) errors.push(`${entry.id} has invalid externalDownloadUrl`);
    if (!entry.externalDownloadApproved && entry.externalDownloadUrl !== null) errors.push(`${entry.id} exposes an unapproved externalDownloadUrl`);
    if (!entry.externalDownloadApproved && entry.externalLinkKind !== null) errors.push(`${entry.id} exposes an unapproved externalLinkKind`);
    if (entry.externalDownloadApproved && !validExternalLinkKinds.has(entry.externalLinkKind)) errors.push(`${entry.id} has invalid externalLinkKind`);
    if (entry.externalDownloadApproved && ![REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE, REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY, REDISTRIBUTION_STATUSES.LINK_ONLY].includes(entry.redistributionStatus)) errors.push(`${entry.id} exposes an external download without an approved status`);
    if (entry.externalDownloadApproved && !isCanonicalExternalLink(entry)) errors.push(`${entry.id} does not match the canonical external allowlist`);
    const eventCapability = entry.type === 'championship-match' && ((readerStatuses.has(entry.redistributionStatus) && entry.readerCompatible) || entry.externalDownloadApproved);
    if (eventCapability && !collectionIdPattern.test(entry.eventId || '')) errors.push(`${entry.id} has an invalid public event association`);
    if (eventCapability && publicEventIds.has(entry.eventId)) errors.push(`${entry.id} duplicates public event association ${entry.eventId}`);
    if (eventCapability && entry.eventId) publicEventIds.add(entry.eventId);
    const safeLocalAsset = localAssetPattern.test(entry.localAsset || '') && !/\.\.|[?#]/.test(entry.localAsset || '');
    if (local && !safeLocalAsset) errors.push(`${entry.id} has unsafe localAsset`);
    if (!local && entry.localAsset !== null) errors.push(`${entry.id} exposes a non-publishable localAsset`);
    if (local && safeLocalAsset && entry.readerAsset !== entry.localAsset) errors.push(`${entry.id} has an invalid local readerAsset`);
    if (remoteView && (!remoteReaderAssetPattern.test(entry.readerAsset || '') || /\.\.|%2f|%5c/i.test(entry.readerAsset || ''))) errors.push(`${entry.id} has an unsafe remote readerAsset`);
    if (!local && !remoteView && entry.readerAsset !== null) errors.push(`${entry.id} exposes an unapproved readerAsset`);
    if (local && !downloadFilenamePattern.test(entry.downloadFilename || '')) errors.push(`${entry.id} has invalid downloadFilename`);
    if (!local && entry.downloadFilename !== null) errors.push(`${entry.id} exposes a non-publishable downloadFilename`);
    if (local && entry.mimeType !== 'application/x-chess-pgn') errors.push(`${entry.id} has invalid mimeType`);
    if (!local && entry.mimeType !== null) errors.push(`${entry.id} exposes a non-publishable mimeType`);
    if (!local && entry.downloadable) errors.push(`${entry.id} exposes a non-publishable download`);
    if (!readerStatuses.has(entry.redistributionStatus) && entry.readerCompatible) errors.push(`${entry.id} exposes an unapproved reader capability`);
    if (typeof entry.downloadable !== 'boolean' || typeof entry.readerCompatible !== 'boolean') errors.push(`${entry.id} has invalid capability flags`);
    if (local && entry.rightsClassification !== RIGHTS_CLASSIFICATIONS.RIGHTS_CLEARED_LOCAL) errors.push(`${entry.id} has inconsistent local rights`);
    if (remoteView && entry.rightsClassification !== RIGHTS_CLASSIFICATIONS.REMOTE_VIEW_ONLY) errors.push(`${entry.id} has inconsistent remote rights`);
    if (remoteView && (!entry.externalDownloadApproved || !entry.externalDownloadUrl?.startsWith('https://www.pgnmentor.com/events/'))) errors.push(`${entry.id} lacks its canonical external source`);
    if (remoteView) {
      const canonical = canonicalRemoteById.get(entry.id);
      const expectedReaderAsset = canonical ? `/api/pgn/pgnmentor?kind=event&file=${encodeURIComponent(canonical.file)}` : null;
      if (!canonical || entry.eventId !== canonical.eventId || entry.gamesCount !== canonical.gamesCount
        || entry.externalDownloadUrl !== canonical.externalDownloadUrl || entry.readerAsset !== expectedReaderAsset) {
        errors.push(`${entry.id} does not match the canonical remote allowlist`);
      }
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export const pgnCollectionRegistryValidation = validatePgnCollectionRegistry();

function appendReaderParams(entry, gameId, returnTo) {
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
  return params;
}

export function buildPgnReaderHref(collectionId, gameId = null, { returnTo = null } = {}) {
  const entry = getPgnCollection(collectionId);
  if (!entry?.readerCompatible) return null;
  const params = appendReaderParams(entry, gameId, returnTo);
  return params ? `/watch/game-replayer?${params.toString()}` : null;
}

export function buildChampionshipReplayHref(collectionId, gameId = 0, { returnTo = null } = {}) {
  const entry = getPgnCollection(collectionId);
  if (!entry?.readerCompatible || entry.type !== 'championship-match') return null;
  const params = appendReaderParams(entry, gameId, returnTo);
  return params ? `/game-library/champions/replay?${params.toString()}` : null;
}
