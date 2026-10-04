export const PGN_COLLECTION_REGISTRY_VERSION = 'CaissaPgnCollectionRegistry@1.0.0';

const collection = value => Object.freeze(value);

export const pgnCollections = Object.freeze([
  collection({
    id: 'capablanca-complete',
    title: 'Capablanca Games 1901–1941',
    type: 'player-collection',
    eventId: null,
    championId: 'jose-raul-capablanca',
    gamesCount: 597,
    source: 'Owner-authorized, user-supplied collection',
    attribution: 'Factual Capablanca game scores supplied by the collection owner; line endings normalized by CAISSA.',
    localAsset: '/data/pgn/capablanca-games-1901-1941.pgn',
    downloadable: true,
    readerCompatible: true,
    checksum: 'sha256:33cbbea9421f14f51bf55dbd772fed3031e855235fedf05d9247886a9d96f71f'
  }),
  collection({
    id: 'fischer-spassky-1972-complete',
    title: 'Fischer–Spassky 1972 · Complete Match',
    type: 'championship-match',
    eventId: 'wcc-1972',
    championId: 'bobby-fischer',
    gamesCount: 21,
    source: 'https://www.pgnmentor.com/events/WorldChamp1972/',
    attribution: 'PGN Mentor event collection; factual game scores for the 1972 World Championship match.',
    localAsset: '/data/pgn/world-championships/fischer-spassky-1972.pgn',
    downloadable: true,
    readerCompatible: true,
    checksum: 'sha256:562adc8a35bcd62d7c0ad0974de9a75e662fd808f704915cfe2ea0f00bd97c24'
  }),
  collection({ id: 'fischer-spassky-game-6', title: 'Fischer–Spassky 1972 · Game 6', type: 'championship-match', eventId: 'wcc-1972', championId: 'bobby-fischer', gamesCount: 1, source: 'Existing repository asset', attribution: 'Incomplete one-game repository excerpt.', localAsset: '/pgn/demo/fischer-spassky-1972-g6.pgn', downloadable: true, readerCompatible: false }),
  collection({ id: 'fischer-byrne-1963', title: 'Fischer–Byrne 1963', type: 'player-collection', eventId: null, championId: 'bobby-fischer', gamesCount: 1, source: 'Existing repository asset', attribution: 'Single factual game score; not a championship game.', localAsset: '/pgn/world-champions/Fischer_Bobby/fischer-byrne-1963.pgn', downloadable: true, readerCompatible: false }),
  collection({ id: 'karpov-kasparov-1985', title: 'Karpov–Kasparov 1985 · Local Game', type: 'championship-match', eventId: 'wcc-1985', championId: 'anatoly-karpov', gamesCount: 1, source: 'Existing repository asset', attribution: 'Incomplete one-game repository excerpt.', localAsset: '/pgn/world-champions/Karpov_Anatoly/karpov-kasparov-1985.pgn', downloadable: true, readerCompatible: false }),
  collection({ id: 'kasparov-topalov-1999', title: 'Kasparov–Topalov 1999', type: 'player-collection', eventId: null, championId: 'garry-kasparov', gamesCount: 1, source: 'Existing repository asset', attribution: 'Single factual game score; not a championship game.', localAsset: '/pgn/world-champions/Kasparov_Garry/kasparov-topalov-1999.pgn', downloadable: true, readerCompatible: false }),
  collection({ id: 'carlsen-caruana-2018', title: 'Carlsen–Caruana 2018 · Local Game', type: 'championship-match', eventId: null, championId: 'magnus-carlsen', gamesCount: 1, source: 'Existing repository asset', attribution: 'Incomplete one-game repository excerpt.', localAsset: '/pgn/world-champions/Carlsen_Magnus/carlsen-caruana-2018.pgn', downloadable: true, readerCompatible: false }),
  collection({ id: 'tal-smyslov-1959', title: 'Tal–Smyslov 1959', type: 'player-collection', eventId: null, championId: 'mikhail-tal', gamesCount: 1, source: 'Existing repository asset', attribution: 'Single Candidates Tournament game score.', localAsset: '/pgn/world-champions/Tal_Mikhail/tal-smyslov-1959.pgn', downloadable: true, readerCompatible: false })
]);

const allowedKeys = new Set(['id', 'title', 'type', 'eventId', 'championId', 'gamesCount', 'source', 'attribution', 'localAsset', 'downloadable', 'readerCompatible', 'checksum']);
const collectionIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localAssetPattern = /^\/(?:data\/)?pgn\/[A-Za-z0-9_./-]+\.pgn$/;

export function getPgnCollection(collectionId) {
  if (typeof collectionId !== 'string' || !collectionIdPattern.test(collectionId)) return null;
  return pgnCollections.find(entry => entry.id === collectionId) || null;
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
    if (!localAssetPattern.test(entry.localAsset || '') || /\.\.|[?#]/.test(entry.localAsset || '')) errors.push(`${entry.id} has unsafe localAsset`);
    if (typeof entry.downloadable !== 'boolean' || typeof entry.readerCompatible !== 'boolean') errors.push(`${entry.id} has invalid capability flags`);
    if (entry.checksum && !/^sha256:[a-f0-9]{64}$/.test(entry.checksum)) errors.push(`${entry.id} has invalid checksum`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function buildPgnReaderHref(collectionId, gameId = null) {
  const entry = getPgnCollection(collectionId);
  if (!entry?.readerCompatible) return null;
  const params = new URLSearchParams({ collection: entry.id });
  if (gameId !== null) {
    const normalizedGameId = String(gameId);
    if (!/^\d+$/.test(normalizedGameId)) return null;
    params.set('game', normalizedGameId);
  }
  return `/watch/game-replayer?${params.toString()}`;
}
