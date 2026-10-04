import { buildPgnReaderHref, getPgnCollection } from './pgn-collection-registry.js';

export const CAISSA_PGN_READER_VERSION = 'CaissaPgnReader@1.0.0';

export function createCaissaPgnReader(navigate = href => window.location.assign(href)) {
  return Object.freeze({
    open({ collectionId, gameId = null, target = 'best-available' } = {}) {
      if (target !== 'best-available' || !getPgnCollection(collectionId)?.readerCompatible) return false;
      const href = buildPgnReaderHref(collectionId, gameId);
      if (!href) return false;
      navigate(href);
      return true;
    }
  });
}

export const CaissaPgnReader = createCaissaPgnReader();

if (typeof window !== 'undefined') window.CaissaPgnReader = CaissaPgnReader;
