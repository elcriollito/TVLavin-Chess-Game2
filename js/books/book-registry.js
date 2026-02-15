/**
 * CAISSA Book Registry (shared singleton)
 *
 * Reuses the same cloud opening-book endpoint used by Play:
 * https://caissa-game-fetcher.elcriollito.workers.dev/api/book
 *
 * Notes:
 * - R2 bucket is private; client fetches book lookups via Worker endpoint.
 * - Caches lookups by normalized FEN in-memory to avoid repeated requests.
 */
(function () {
  const DEFAULT_BOOK_URL = 'https://caissa-game-fetcher.elcriollito.workers.dev/api/book';
  const fenCache = new Map();
  let warnedUnavailable = false;
  let singletonPromise = null;

  function normalizeFenKey(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return String(fen || '').trim();
    return parts.slice(0, 4).join(' ');
  }

  function mapMove(raw) {
    return {
      uci: raw.uci || '',
      san: raw.san || raw.uci || '',
      weight: Number(raw.weight) || 0,
      percent: Number(raw.percent) || 0
    };
  }

  async function fetchMoves(fen, max = 15) {
    const fenKey = normalizeFenKey(fen);
    if (!fenKey) return [];

    const cacheKey = `${fenKey}|${max}`;
    if (fenCache.has(cacheKey)) {
      return fenCache.get(cacheKey);
    }

    const url = `${DEFAULT_BOOK_URL}?fen=${encodeURIComponent(fenKey)}&max=${Math.max(1, Math.min(32, max))}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      throw new Error(`Cloud book HTTP ${resp.status}`);
    }

    const payload = await resp.json();
    if (payload?.error) {
      throw new Error(String(payload.error));
    }

    const moves = Array.isArray(payload?.moves) ? payload.moves.map(mapMove) : [];
    moves.sort((a, b) => b.weight - a.weight);
    fenCache.set(cacheKey, moves);
    return moves;
  }

  function getDefaultOpeningBook() {
    if (!singletonPromise) {
      singletonPromise = Promise.resolve({
        name: 'Cerebellum (Cloud)',
        source: 'r2-worker',
        getMovesForFen: fetchMoves,
        normalizeFenKey
      });
    }
    return singletonPromise;
  }

  function markUnavailableOnce(err) {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    console.warn('[ECO][Book] Cloud opening book unavailable:', err);
  }

  window.CAISSA_BOOK_REGISTRY = {
    getDefaultOpeningBook,
    markUnavailableOnce
  };
})();

