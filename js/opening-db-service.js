(function () {
  const DEFAULT_BASE = '/data/book_chunks';
  const SHARD_CACHE = new Map();

  function normalizeFenForHash(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return String(fen || '').trim();
    const placement = parts[0];
    const turn = parts[1] || 'w';
    const castling = parts[2] || '-';
    const ep = parts[3] || '-';
    return `${placement} ${turn} ${castling} ${ep}`;
  }

  function fnv1a64(input) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;

    for (let i = 0; i < input.length; i += 1) {
      hash ^= BigInt(input.charCodeAt(i));
      hash = (hash * prime) & 0xffffffffffffffffn;
    }

    return hash.toString(16).padStart(16, '0');
  }

  function hashFen(fen) {
    return fnv1a64(normalizeFenForHash(fen));
  }

  function shardFromHash(hash) {
    return String(hash || '').slice(0, 2).toLowerCase();
  }

  async function loadShard(shard, baseUrl) {
    const normalizedShard = String(shard || '').toLowerCase();
    if (!/^[0-9a-f]{2}$/.test(normalizedShard)) return null;

    const cacheKey = `${baseUrl}|${normalizedShard}`;
    if (SHARD_CACHE.has(cacheKey)) {
      return { payload: SHARD_CACHE.get(cacheKey), shardLoaded: SHARD_CACHE.get(cacheKey) !== null, fromCache: true };
    }

    const url = `${baseUrl}/book_chunk_${normalizedShard}.json`;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) {
        SHARD_CACHE.set(cacheKey, null);
        return { payload: null, shardLoaded: false, fromCache: false, status: res.status };
      }
      const payload = await res.json();
      SHARD_CACHE.set(cacheKey, payload);
      return { payload, shardLoaded: true, fromCache: false, status: res.status };
    } catch (_err) {
      SHARD_CACHE.set(cacheKey, null);
      return { payload: null, shardLoaded: false, fromCache: false, status: 0 };
    }
  }

  async function lookupByFen(fen, options) {
    const baseUrl = (options && options.baseUrl) ? options.baseUrl : DEFAULT_BASE;
    const hash = hashFen(fen);
    const shard = shardFromHash(hash);
    const shardLoad = await loadShard(shard, baseUrl);
    const payload = shardLoad.payload;
    const entry = payload && payload.entries ? payload.entries[hash] : null;
    return {
      hash,
      shard,
      entry: entry || null,
      entryFound: !!entry,
      shardLoaded: !!shardLoad.shardLoaded,
      fromCache: !!shardLoad.fromCache,
      status: typeof shardLoad.status === 'number' ? shardLoad.status : null,
      meta: payload ? payload.meta || null : null
    };
  }

  function clearCache() {
    SHARD_CACHE.clear();
  }

  window.OpeningDbService = {
    normalizeFenForHash,
    hashFen,
    shardFromHash,
    lookupByFen,
    clearCache
  };
})();
