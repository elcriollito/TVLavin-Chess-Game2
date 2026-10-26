/**
 * CAISSA Position Stats Worker
 *
 * Endpoint:
 *   GET /api/pos-stats?key=<16-hex-polyglot-key>
 *
 * Reads prebuilt shards from private R2 bucket:
 *   stats/shards/pos_stats_<00-ff>.json
 *
 * Response:
 *   { key, games, w, d, l, lastPlayed, topMoves:[{uci,count,w,d,l}] }
 */

const SHARD_CACHE_TTL_MS = 5 * 60 * 1000;
const SHARD_CACHE_MAX_ENTRIES = 8;
const SHARD_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const SHARD_MAX_BYTES = 8 * 1024 * 1024;
const shardCache = new Map();

function evictShardCache(now = Date.now()) {
  for (const [key, value] of shardCache) {
    if ((now - value.at) >= SHARD_CACHE_TTL_MS) shardCache.delete(key);
  }
  const totalBytes = () => Array.from(shardCache.values()).reduce((sum, item) => sum + item.bytes, 0);
  while (shardCache.size > SHARD_CACHE_MAX_ENTRIES || totalBytes() > SHARD_CACHE_MAX_BYTES) {
    const oldest = Array.from(shardCache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!oldest) break;
    shardCache.delete(oldest[0]);
  }
}

function cacheShard(shardId, data, bytes, now) {
  shardCache.delete(shardId);
  shardCache.set(shardId, { at: now, lastUsed: now, bytes, data });
  evictShardCache(now);
}

export function clearShardCacheForTest() {
  shardCache.clear();
}

export function shardCacheSnapshotForTest() {
  return Array.from(shardCache.entries()).map(([id, value]) => ({ id, bytes: value.bytes }));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200, origin = '*', extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
      ...extra
    }
  });
}

function normalizeKey(input) {
  const key = String(input || '').trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(key)) return '';
  return key;
}

async function loadShard(env, shardId) {
  const now = Date.now();
  evictShardCache(now);
  const cached = shardCache.get(shardId);
  if (cached && (now - cached.at) < SHARD_CACHE_TTL_MS) {
    cached.lastUsed = now;
    return cached.data;
  }

  const key = `stats/shards/pos_stats_${shardId}.json`;
  const object = await env.POS_STATS_BUCKET.get(key);
  if (!object) {
    cacheShard(shardId, { entries: {} }, 2, now);
    return { entries: {} };
  }

  if (Number.isFinite(object.size) && object.size > SHARD_MAX_BYTES) throw new Error('SHARD_TOO_LARGE');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength > SHARD_MAX_BYTES) throw new Error('SHARD_TOO_LARGE');
  const candidate = JSON.parse(new TextDecoder().decode(bytes));
  const parsed = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    && candidate.entries && typeof candidate.entries === 'object' && !Array.isArray(candidate.entries)
    ? candidate
    : { entries: {} };
  cacheShard(shardId, parsed, bytes.byteLength, now);
  return parsed;
}

function etagForKey(key) {
  return `"pos-${key}"`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (path !== '/api/pos-stats' && path !== '/pos-stats') {
      return json({
        ok: true,
        service: 'caissa-pos-stats',
        endpoints: ['/api/pos-stats?key=<polyglotKey>']
      }, 200, origin);
    }

    const key = normalizeKey(url.searchParams.get('key'));
    if (!key) {
      return json({
        error: 'Missing or invalid key',
        usage: '/api/pos-stats?key=<16-hex-polyglot-key>'
      }, 400, origin);
    }

    const etag = etagForKey(key);
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ...corsHeaders(origin),
          ETag: etag,
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    const shardId = key.slice(0, 2);
    let shard;
    try {
      shard = await loadShard(env, shardId);
    } catch (error) {
      return json({ error: error?.message === 'SHARD_TOO_LARGE' ? 'Position shard exceeds service limit' : 'Position shard unavailable' }, 503, origin, {
        'Cache-Control': 'no-store'
      });
    }
    const record = (shard?.entries && shard.entries[key]) || null;

    if (!record) {
      return json({
        key,
        found: false,
        games: 0,
        w: 0,
        d: 0,
        l: 0,
        lastPlayed: '',
        topMoves: []
      }, 200, origin, {
        ETag: etag,
        'Cache-Control': 'public, max-age=300'
      });
    }

    return json({
      key,
      found: true,
      games: Number(record.games) || 0,
      w: Number(record.w) || 0,
      d: Number(record.d) || 0,
      l: Number(record.l) || 0,
      lastPlayed: record.lastPlayed || '',
      topMoves: Array.isArray(record.topMoves) ? record.topMoves : []
    }, 200, origin, {
      ETag: etag,
      'Cache-Control': 'public, max-age=300'
    });
  }
};

