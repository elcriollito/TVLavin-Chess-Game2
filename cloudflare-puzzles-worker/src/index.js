const CATALOG_VERSION = '2026-09-10';
const TAG = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const PUZZLE_ID = /^[A-Za-z0-9]{1,16}$/;
const CURSOR_TTL_SECONDS = 60 * 60;
const MAX_CURSOR_LENGTH = 1024;
const MAX_SHUFFLE_KEY = 2 ** 48 - 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
    },
});

const base64url = bytes => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};

const unbase64url = value => {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
};

async function hmacKey(secret) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('CURSOR_SECRET must contain at least 32 characters');
    return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signCursor(payload, secret) {
    const body = base64url(encoder.encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
    return `${body}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyCursor(value, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!value || value.length > MAX_CURSOR_LENGTH) throw new Error('invalid cursor');
    const [body, signature, extra] = value.split('.');
    if (!body || !signature || extra) throw new Error('invalid cursor');
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), unbase64url(signature), encoder.encode(body));
    if (!valid) throw new Error('invalid cursor');
    const payload = JSON.parse(decoder.decode(unbase64url(body)));
    if (payload.version !== CATALOG_VERSION || !Number.isInteger(payload.expires) || payload.expires < nowSeconds) {
        throw new Error('expired cursor');
    }
    return payload;
}

const integer = (params, name, fallback, minimum, maximum) => {
    const raw = params.get(name);
    if (raw == null || raw === '') return fallback;
    if (!/^\d+$/u.test(raw)) throw new Error(`${name} must be an integer`);
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} is outside the allowed range`);
    return parsed;
};

export function parseSelection(url) {
    const params = url.searchParams;
    const dimensions = ['themes', 'openings'].filter(name => params.get(name));
    if (dimensions.length !== 1) throw new Error('provide exactly one of themes or openings');
    const parameter = dimensions[0];
    const tags = [...new Set(params.get(parameter).split(',').map(value => value.trim()).filter(Boolean))];
    if (!tags.length || tags.length > 12 || tags.some(tag => !TAG.test(tag))) throw new Error('invalid catalog tags');
    const minimum = integer(params, 'minRating', 1600, 400, 3500);
    const maximum = integer(params, 'maxRating', 2000, 400, 3500);
    if (maximum < minimum || maximum - minimum > 600) throw new Error('invalid rating range');
    const limit = integer(params, 'limit', 8, 1, 16);
    const defaultQuality = parameter === 'themes' && tags.length === 1 && tags[0] === 'equality' ? 'relaxed' : 'standard';
    const quality = params.get('quality') || defaultQuality;
    if (!['standard', 'relaxed', 'all'].includes(quality)) throw new Error('invalid quality');
    return {
        dimension: parameter === 'themes' ? 'theme' : 'opening',
        tags,
        minimum,
        maximum,
        limit,
        quality,
        cursor: params.get('cursor') || '',
    };
}

const tiersFor = quality => quality === 'standard' ? [2] : quality === 'relaxed' ? [1, 2] : [0, 1, 2];

export function poolKeys(selection) {
    const keys = [];
    const firstBucket = Math.floor(selection.minimum / 100);
    const lastBucket = Math.floor(selection.maximum / 100);
    const firstCompleteBucket = Math.ceil(selection.minimum / 100);
    const lastCompleteBucket = Math.floor((selection.maximum - 99) / 100);
    // The measured full catalog showed that a one-rating-point edge bucket
    // (for example rating 1900 in a 1700-1900 request) can scan more than a
    // thousand rows to return 12 matches. Prefer complete 100-point bands when
    // the requested range contains any; every returned puzzle still satisfies
    // the exact rating predicate. Narrow ranges retain their edge buckets.
    const bucketStart = firstCompleteBucket <= lastCompleteBucket ? firstCompleteBucket : firstBucket;
    const bucketEnd = firstCompleteBucket <= lastCompleteBucket ? lastCompleteBucket : lastBucket;
    for (const tag of selection.tags) {
        for (const tier of tiersFor(selection.quality)) {
            for (let bucket = bucketStart; bucket <= bucketEnd; bucket += 1) {
                keys.push(`${selection.dimension}:${tag}:q${tier}:b${bucket}`);
            }
        }
    }
    if (keys.length > 252) throw new Error('selection expands to too many pools');
    return keys;
}

async function filterDigest(selection) {
    const canonical = JSON.stringify({
        version: CATALOG_VERSION,
        dimension: selection.dimension,
        tags: [...selection.tags].sort(),
        minimum: selection.minimum,
        maximum: selection.maximum,
        quality: selection.quality,
        limit: selection.limit,
    });
    return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical))));
}

function randomShuffleKey() {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return (values[0] & 0xffff) * 2 ** 32 + values[1];
}

const AFTER_SQL = `
    select shuffle_key, puzzle_id
      from puzzle_pool_entries
     where pool_key = ? and (shuffle_key, puzzle_id) > (?, ?)
       and rating between ? and ?
     order by shuffle_key, puzzle_id limit ?
`;

const WRAP_SQL = `
    select shuffle_key, puzzle_id
      from puzzle_pool_entries
     where pool_key = ? and (shuffle_key, puzzle_id) > (?, ?)
       and shuffle_key <= ? and rating between ? and ?
     order by shuffle_key, puzzle_id limit ?
`;

const metricNumber = (meta, key) => Number(meta?.[key] || meta?.timings?.[key] || 0);

function mergeMetrics(results) {
    return {
        d1DurationMs: Number(results.reduce((sum, result) => sum + metricNumber(result.meta, 'duration'), 0).toFixed(3)),
        rowsRead: results.reduce((sum, result) => sum + metricNumber(result.meta, 'rows_read'), 0),
        rowsWritten: results.reduce((sum, result) => sum + metricNumber(result.meta, 'rows_written'), 0),
        queryCount: results.length,
        regions: [...new Set(results.map(result => result.meta?.served_by_region).filter(Boolean))],
    };
}

async function queryPools(session, keys, selection, afterKey, afterId, wrapUpper = null) {
    const results = [];
    for (let index = 0; index < keys.length; index += 6) {
        const wave = keys.slice(index, index + 6).map(key => wrapUpper == null
            ? session.prepare(AFTER_SQL).bind(key, afterKey, afterId, selection.minimum, selection.maximum, selection.limit).all()
            : session.prepare(WRAP_SQL).bind(key, afterKey, afterId, wrapUpper, selection.minimum, selection.maximum, selection.limit).all());
        results.push(...await Promise.all(wave));
    }
    return results;
}

function choose(results, limit, already = new Set()) {
    const candidates = results.flatMap(result => result.results || [])
        .sort((left, right) => Number(left.shuffle_key) - Number(right.shuffle_key)
            || String(left.puzzle_id).localeCompare(String(right.puzzle_id)));
    const chosen = [];
    for (const candidate of candidates) {
        if (already.has(candidate.puzzle_id)) continue;
        already.add(candidate.puzzle_id);
        chosen.push(candidate);
        if (chosen.length === limit) break;
    }
    return chosen;
}

async function selectPuzzles(request, env) {
    const started = performance.now();
    const selection = parseSelection(new URL(request.url));
    const digest = await filterDigest(selection);
    let startKey = randomShuffleKey();
    let afterKey = startKey;
    let afterId = '';
    let wrapped = false;
    if (selection.cursor) {
        const cursor = await verifyCursor(selection.cursor, env.CURSOR_SECRET);
        if (cursor.filters !== digest) throw new Error('cursor does not match filters');
        ({ startKey, afterKey, afterId, wrapped } = cursor);
        if (![startKey, afterKey].every(value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_SHUFFLE_KEY)
            || !PUZZLE_ID.test(afterId)) throw new Error('invalid cursor state');
    }

    const session = env.PUZZLES.withSession('first-unconstrained');
    const keys = poolKeys(selection);
    const queryResults = await queryPools(session, keys, selection, afterKey, afterId, wrapped ? startKey : null);
    const seen = new Set();
    let chosen = choose(queryResults, selection.limit, seen);
    let didWrap = wrapped;
    if (chosen.length < selection.limit && !wrapped) {
        const wrapResults = await queryPools(session, keys, selection, -1, '', startKey);
        queryResults.push(...wrapResults);
        chosen = chosen.concat(choose(wrapResults, selection.limit - chosen.length, seen));
        didWrap = true;
    }

    let puzzleResult = { results: [], meta: {} };
    if (chosen.length) {
        const placeholders = chosen.map(() => '?').join(',');
        puzzleResult = await session.prepare(`
            select puzzle_id, fen, moves, rating, rating_deviation, popularity,
                   nb_plays, themes, game_url, opening_tags
              from puzzles where puzzle_id in (${placeholders})
        `).bind(...chosen.map(item => item.puzzle_id)).all();
    }
    queryResults.push(puzzleResult);
    const byId = new Map((puzzleResult.results || []).map(row => [row.puzzle_id, row]));
    const puzzles = chosen.map(item => byId.get(item.puzzle_id)).filter(Boolean);
    const last = chosen.at(-1);
    const hasMore = chosen.length === selection.limit;
    const nextCursor = hasMore ? await signCursor({
        version: CATALOG_VERSION,
        filters: digest,
        startKey,
        afterKey: Number(last.shuffle_key),
        afterId: String(last.puzzle_id),
        wrapped: didWrap,
        expires: Math.floor(Date.now() / 1000) + CURSOR_TTL_SECONDS,
    }, env.CURSOR_SECRET) : null;
    return json({
        source: 'cloudflare-d1-full-catalog',
        sourceVersion: CATALOG_VERSION,
        cursor: nextCursor,
        hasMore,
        estimatedTotal: null,
        puzzles,
        internalMetrics: {
            ...mergeMetrics(queryResults),
            workerWallMs: Number((performance.now() - started).toFixed(3)),
        },
    });
}

export default {
    async fetch(request, env) {
        if (request.headers.get('Authorization') !== `Bearer ${env.WORKER_TOKEN}`) return new Response(null, { status: 404 });
        if (request.method !== 'GET') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
        const path = new URL(request.url).pathname;
        try {
            if (path === '/v1/select') return await selectPuzzles(request, env);
            if (path === '/health') {
                const result = await env.PUZZLES.prepare("select value from catalog_metadata where key = 'source_version'").first();
                return json({ ok: result?.value === CATALOG_VERSION, sourceVersion: result?.value || null });
            }
            return new Response(null, { status: 404 });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'catalog request failed';
            const status = /invalid|provide|outside|expired|match|many/u.test(message) ? 400 : 503;
            return json({ code: status === 400 ? 'INVALID_SELECTION' : 'CATALOG_UNAVAILABLE', error: message }, status);
        }
    },
};
