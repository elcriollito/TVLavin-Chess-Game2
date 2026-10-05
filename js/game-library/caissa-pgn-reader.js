import { buildChampionshipReplayHref, buildPgnReaderHref, getPgnCollection } from './pgn-collection-registry.js';

export const CAISSA_PGN_READER_VERSION = 'CaissaPgnReader@5.1.0';

export function createCaissaPgnReader(navigate = href => window.location.assign(href)) {
  return Object.freeze({
    open({ collectionId, gameId = null, target = 'best-available', returnTo = null } = {}) {
      const entry = getPgnCollection(collectionId);
      if (!['best-available', 'champions', 'fallback'].includes(target) || !entry?.readerCompatible) return false;
      const href = target === 'champions'
        ? buildChampionshipReplayHref(collectionId, gameId ?? 0, { returnTo, context: entry.type === 'player-collection' ? 'player' : 'match' })
        : buildPgnReaderHref(collectionId, gameId, { returnTo });
      if (!href) return false;
      navigate(href);
      return true;
    }
  });
}

export const CaissaPgnReader = createCaissaPgnReader();

if (typeof window !== 'undefined') window.CaissaPgnReader = CaissaPgnReader;
