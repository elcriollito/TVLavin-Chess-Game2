/**
 * CAISSA Book Registry (shared singleton)
 *
 * Reuses the same cloud opening-book endpoint used by Play:
 * https://caissa-game-fetcher.elcriollito.workers.dev/api/book
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

  function normalizeKey(raw) {
    const key = String(raw || '').toLowerCase().trim();
    return /^[0-9a-f]{16}$/.test(key) ? key : '';
  }

  function mapMove(raw) {
    return {
      uci: raw.uci || '',
      san: raw.san || raw.uci || '',
      weight: Number(raw.weight) || 0,
      percent: Number(raw.percent) || 0
    };
  }

  async function lookupPosition(fen, max = 15) {
    const fenKey = normalizeFenKey(fen);
    if (!fenKey) {
      return { key: '', fen: fenKey, moves: [], totalWeight: 0 };
    }

    const cached = fenCache.get(fenKey);
    if (cached) {
      return {
        key: cached.key,
        fen: fenKey,
        totalWeight: cached.totalWeight,
        moves: cached.moves.slice(0, max)
      };
    }

    const queryMax = Math.max(1, Math.min(32, max));
    const url = `${DEFAULT_BOOK_URL}?fen=${encodeURIComponent(fenKey)}&max=${queryMax}`;
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

    const key = normalizeKey(payload?.hash || payload?.key);
    const totalWeight = moves.reduce((sum, m) => sum + (Number(m.weight) || 0), 0);
    fenCache.set(fenKey, { key, moves, totalWeight });

    return {
      key,
      fen: fenKey,
      totalWeight,
      moves: moves.slice(0, max)
    };
  }

  async function getMovesForFen(fen, max = 15) {
    const data = await lookupPosition(fen, max);
    return data.moves;
  }

  function createUnavailableBook() {
    return {
      isAvailable: false,
      isReady() {
        return false;
      },
      async getContinuations() {
        return { key: '', fen: '', moves: [], totalWeight: 0 };
      },
      async lookupPosition() {
        return { key: '', fen: '', moves: [], totalWeight: 0 };
      }
    };
  }

  function adaptBook(rawBook) {
    if (!rawBook || typeof rawBook !== 'object') {
      return createUnavailableBook();
    }

    const normalized = { ...rawBook };
    normalized.isAvailable = normalized.isAvailable !== false;
    normalized.isReady = typeof normalized.isReady === 'function'
      ? normalized.isReady.bind(normalized)
      : () => normalized.isAvailable !== false;

    if (typeof normalized.getContinuations === 'function') {
      if (typeof normalized.lookupPosition !== 'function') {
        normalized.lookupPosition = normalized.getContinuations.bind(normalized);
      }
      return normalized;
    }

    if (typeof normalized.lookupPosition === 'function') {
      normalized.getContinuations = normalized.lookupPosition.bind(normalized);
      return normalized;
    }

    if (typeof normalized.getMovesForFen === 'function') {
      const wrapped = {
        ...normalized,
        isAvailable: true,
        isReady() {
          return true;
        },
        async getContinuations(fen, max = 15) {
          const moves = await normalized.getMovesForFen(fen, max);
          const totalWeight = Array.isArray(moves)
            ? moves.reduce((sum, m) => sum + (Number(m.weight) || 0), 0)
            : 0;
          return {
            key: '',
            fen: normalizeFenKey(fen),
            moves: Array.isArray(moves) ? moves : [],
            totalWeight
          };
        }
      };
      wrapped.lookupPosition = wrapped.getContinuations;
      return wrapped;
    }

    return createUnavailableBook();
  }

  function getDefaultOpeningBook() {
    if (!singletonPromise) {
      singletonPromise = Promise.resolve(adaptBook({
        name: 'Cerebellum (Cloud)',
        source: 'r2-worker',
        isAvailable: true,
        isReady() {
          return true;
        },
        getContinuations: lookupPosition,
        getMovesForFen,
        lookupPosition,
        normalizeFenKey
      }));
    }
    return singletonPromise;
  }

  async function getActiveBook() {
    const book = await getDefaultOpeningBook();
    return adaptBook(book);
  }

  function markUnavailableOnce(err) {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    console.warn('[ECO][Book] Cloud opening book unavailable:', err);
  }

  window.CAISSA_BOOK_REGISTRY = {
    getActiveBook,
    getDefaultOpeningBook,
    markUnavailableOnce
  };
})();
