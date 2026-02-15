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
const shardCache = new Map();

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
  const cached = shardCache.get(shardId);
  if (cached && (now - cached.at) < SHARD_CACHE_TTL_MS) {
    return cached.data;
  }

  const key = `stats/shards/pos_stats_${shardId}.json`;
  const object = await env.POS_STATS_BUCKET.get(key);
  if (!object) {
    shardCache.set(shardId, { at: now, data: { entries: {} } });
    return { entries: {} };
  }

  const parsed = await object.json();
  shardCache.set(shardId, { at: now, data: parsed || { entries: {} } });
  return parsed || { entries: {} };
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
    const shard = await loadShard(env, shardId);
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

