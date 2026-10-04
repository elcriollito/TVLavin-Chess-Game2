import { buildPgnReaderHref, getPgnCollection } from './pgn-collection-registry.js';

export const CAISSA_PGN_READER_VERSION = 'CaissaPgnReader@3.0.0';

export function createCaissaPgnReader(navigate = href => window.location.assign(href)) {
  return Object.freeze({
    open({ collectionId, gameId = null, target = 'best-available', returnTo = null } = {}) {
      if (target !== 'best-available' || !getPgnCollection(collectionId)?.readerCompatible) return false;
      const href = buildPgnReaderHref(collectionId, gameId, { returnTo });
      if (!href) return false;
      navigate(href);
      return true;
    }
  });
}

export const CaissaPgnReader = createCaissaPgnReader();

if (typeof window !== 'undefined') window.CaissaPgnReader = CaissaPgnReader;
