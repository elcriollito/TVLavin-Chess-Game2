/**
 * CAISSA Vault - Downloads Worker
 *
 * Serves software downloads and files from R2 storage
 * Uses private R2 bucket with slug-based download URLs
 */

// ============================================================================
// DOWNLOADS CATALOG
// ============================================================================

const DOWNLOADS = {
  // CAISSA Book Creator v0.2.0 (current)
  'caissa-book-creator': {
    key: 'apps/caissa-book-creator/v0.2.0/CAISSA-Book-Creator-v0.2.0-portable.zip',
    filename: 'CAISSA-Book-Creator-v0.2.0-portable.zip',
    contentType: 'application/zip',
    version: 'v0.2.0',
    category: 'software'
  },

  // Polyglot Book Creator v1.0.0
  'polyglot-book-creator': {
    key: 'apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip',
    filename: 'CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip',
    contentType: 'application/zip',
    version: 'v1.0.0',
    category: 'software'
  },
  'polyglot-book-creator-changelog': {
    key: 'apps/polyglot-book-creator/v1.0.0/CHANGELOG.txt',
    filename: 'CHANGELOG.txt',
    contentType: 'text/plain',
    version: 'v1.0.0',
    category: 'documentation'
  },
  'polyglot-book-creator-sha256': {
    key: 'apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256',
    filename: 'CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256',
    contentType: 'text/plain',
    version: 'v1.0.0',
    category: 'checksum'
  },

  // DEPRECATED: Old broken polyglot book creator
  // Kept for backwards compatibility but redirects to v1.0.0
  'polyglot-book-creator-old': {
    redirect: 'polyglot-book-creator',
    deprecated: true,
    deprecationNote: 'Redirected to v1.0.0 - old version was broken'
  }
};

const COUNTED_SLUG = 'caissa-book-creator';
const COUNTED_DOWNLOAD_KEY = 'apps/caissa-book-creator/v0.2.0/CAISSA-Book-Creator-v0.2.0-portable.zip';

const DOWNLOAD_PATH_TO_SLUG = Object.entries(DOWNLOADS).reduce((acc, [slug, config]) => {
  if (!config.deprecated && config.key) {
    acc[config.key] = slug;
  }
  return acc;
}, {});

// ============================================================================
// CORS HELPER
// ============================================================================

const ALLOWED_ORIGINS = [
  'https://caissa-chess.org',
  'https://www.caissa-chess.org',
  'https://tv-lavin-chess-game2.vercel.app',
  'https://tv-lavin-chess-game2-git-main-elcriollitos-projects.vercel.app',
  'https://downloads.caissa-chess.org'
];

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                    origin?.endsWith('.vercel.app') ||
                    origin?.startsWith('http://localhost:') ||
                    origin?.startsWith('http://127.0.0.1:');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-caissa-tier',
    'Access-Control-Max-Age': '86400',
  };
}

// ============================================================================
// DOWNLOAD HANDLER
// ============================================================================

function getCounterStub(env) {
  const id = env.DOWNLOAD_COUNTER.idFromName('global');
  return env.DOWNLOAD_COUNTER.get(id);
}

async function incrementDownloadCount(slug, env) {
  const stub = getCounterStub(env);
  await stub.fetch('https://download-counter/inc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getDownloadCount(slug, env) {
  const stub = getCounterStub(env);
  const resp = await stub.fetch('https://download-counter/get', {
    method: 'GET'
  });
  if (!resp.ok) {
    throw new Error(`Counter get failed: ${resp.status}`);
  }
  const payload = await resp.json();
  return Number(payload?.count || 0);
}

async function handleDownload(slug, env, origin, method = 'GET', shouldCount = false) {
  // Look up download config
  const config = DOWNLOADS[slug];

  if (!config) {
    return new Response(JSON.stringify({
      error: 'Download not found',
      slug,
      availableSlugs: Object.keys(DOWNLOADS).filter(s => !DOWNLOADS[s].deprecated)
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  // Handle deprecated/redirect entries
  if (config.redirect) {
    const redirectSlug = config.redirect;
    const redirectUrl = `/download/${redirectSlug}`;

    return new Response(JSON.stringify({
      redirect: redirectUrl,
      deprecated: config.deprecated,
      note: config.deprecationNote
    }), {
      status: 301,
      headers: {
        'Location': redirectUrl,
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  // Fetch from R2
  try {
    const object = await env.VAULT_BUCKET.get(config.key);

    if (!object) {
      return new Response(JSON.stringify({
        error: 'File not found in storage',
        slug,
        key: config.key
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }

    // Serve file with proper headers
    const headers = {
      'Content-Type': config.contentType,
      'Content-Disposition': `attachment; filename="${config.filename}"`,
      'Content-Length': object.size,
      'ETag': object.etag,
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache for versioned files
      ...getCorsHeaders(origin)
    };

    // Add version header if available
    if (config.version) {
      headers['X-CAISSA-Version'] = config.version;
    }

    // Count only successful file GET downloads for the exact tracked asset path.
    if (method === 'GET' && shouldCount) {
      try {
        await incrementDownloadCount(slug, env);
      } catch (counterError) {
        console.warn('Counter increment failed', { slug, error: counterError?.message });
      }
    }

    return new Response(method === 'HEAD' ? null : object.body, { headers });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Download failed',
      message: error.message,
      slug
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }
}

// ============================================================================
// CATALOG HANDLER (JSON listing)
// ============================================================================

async function handleCatalog(origin) {
  const catalog = {};

  for (const [slug, config] of Object.entries(DOWNLOADS)) {
    if (config.deprecated) continue; // Skip deprecated entries

    catalog[slug] = {
      filename: config.filename,
      version: config.version,
      category: config.category,
      downloadUrl: `/download/${slug}`,
      contentType: config.contentType
    };
  }

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin)
    }
  });
}

async function handleDownloadCount(url, env, origin) {
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return new Response(JSON.stringify({
      error: 'Missing required query param: slug'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  if (slug !== COUNTED_SLUG) {
    return new Response(JSON.stringify({
      error: 'Unsupported slug',
      slug
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  try {
    const count = await getDownloadCount(slug, env);
    return new Response(JSON.stringify({ slug, count }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch download count',
      slug,
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function handleOpeningDbShard(path, env, origin, method = 'GET') {
  const match = path.match(/^\/openingdb\/shards\/([a-zA-Z0-9._-]+)\/([0-9a-f]{2})(?:\.json)?$/i);
  if (!match) {
    return new Response(JSON.stringify({
      error: 'Invalid openingdb shard route',
      expected: '/openingdb/shards/:version/:shard(.json)'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  const version = String(match[1] || '').trim();
  const shard = String(match[2] || '').toLowerCase();
  const key = `openingdb/shards/${version}/${shard}.json`;
  const bucket = env.OPENINGDB_BUCKET || env.VAULT_BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({
      error: 'Storage bucket not configured',
      key
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response(JSON.stringify({
        error: 'Shard not found',
        shard,
        version
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(object.size || 0),
        'ETag': object.etag || '',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...getCorsHeaders(origin)
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to read shard',
      shard,
      version,
      message: error?.message || String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }
}

async function handleOpeningDbManifest(env, origin, method = 'GET') {
  const bucket = env.OPENINGDB_BUCKET || env.VAULT_BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({
      error: 'Storage bucket not configured',
      key: 'openingdb/manifest.json'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  try {
    const object = await bucket.get('openingdb/manifest.json');
    if (!object) {
      return new Response(JSON.stringify({ error: 'Manifest not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }

    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(object.size || 0),
        'ETag': object.etag || '',
        'Cache-Control': 'public, max-age=300',
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to read manifest',
      message: error?.message || String(error)
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

function getTier(url, request) {
  const fromQuery = String(url.searchParams.get('tier') || '').toLowerCase();
  const fromHeader = String(request.headers.get('x-caissa-tier') || '').toLowerCase();
  if (fromQuery === 'premium' || fromHeader === 'premium') return 'premium';
  return 'free';
}

async function getOpeningDbGamesObject(env, key) {
  const bucket = env.OPENINGDB_BUCKET || env.VAULT_BUCKET;
  if (!bucket) return null;
  return bucket.get(key);
}

async function handleOpeningDbGamesManifest(env, origin, method = 'GET') {
  try {
    const object = await getOpeningDbGamesObject(env, 'openingdb/games/manifest.json');
    if (!object) {
      return new Response(JSON.stringify({ error: 'Games manifest not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin), 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response(method === 'HEAD' ? null : object.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to read games manifest', message: error?.message || String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin), 'Access-Control-Allow-Origin': '*' }
    });
  }
}

async function handleOpeningDbGamesShard(path, env, origin, method = 'GET') {
  const m = path.match(/^\/openingdb\/games\/([a-zA-Z0-9._-]+)\/shards\/([0-9a-f]{2})\.json$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Invalid games shard route' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  const version = String(m[1]);
  const shard = String(m[2]).toLowerCase();
  const key = `openingdb/games/${version}/shards/${shard}.json`;
  const object = await getOpeningDbGamesObject(env, key);
  if (!object) {
    return new Response(JSON.stringify({ error: 'Shard not found', shard, version }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  return new Response(method === 'HEAD' ? null : object.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...getCorsHeaders(origin)
    }
  });
}

async function handleOpeningDbGamesCatalog(path, env, origin, method = 'GET') {
  const m = path.match(/^\/openingdb\/games\/([a-zA-Z0-9._-]+)\/catalog\/([0-9a-f]{2})\.json$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Invalid games catalog route' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  const version = String(m[1]);
  const prefix = String(m[2]).toLowerCase();
  const key = `openingdb/games/${version}/catalog/${prefix}.json`;
  const object = await getOpeningDbGamesObject(env, key);
  if (!object) {
    return new Response(JSON.stringify({ error: 'Catalog not found', prefix, version }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  return new Response(method === 'HEAD' ? null : object.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...getCorsHeaders(origin)
    }
  });
}

async function handleOpeningDbGamesPgn(path, env, origin, method = 'GET') {
  const m = path.match(/^\/openingdb\/games\/([a-zA-Z0-9._-]+)\/pgn\/(g_[0-9a-f]+)\.pgn$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Invalid games pgn route' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  const version = String(m[1]);
  const gameId = String(m[2]).toLowerCase();
  const key = `openingdb/games/${version}/pgn/${gameId}.pgn`;
  const object = await getOpeningDbGamesObject(env, key);
  if (!object) {
    return new Response(JSON.stringify({ error: 'PGN not found', gameId, version }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  return new Response(method === 'HEAD' ? null : object.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-chess-pgn; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...getCorsHeaders(origin)
    }
  });
}

function parseDownloadFilters(rawFilters) {
  const filters = rawFilters && typeof rawFilters === 'object' ? rawFilters : {};
  const yearMin = Number.parseInt(String(filters.yearMin || ''), 10);
  const yearMax = Number.parseInt(String(filters.yearMax || ''), 10);
  const eloMin = Number.parseInt(String(filters.eloMin || ''), 10);
  const rawResult = String(filters.result || 'all').toLowerCase();
  let result = 'all';
  if (rawResult === 'white' || rawResult === '1-0') result = 'white';
  else if (rawResult === 'draw' || rawResult === '1/2-1/2') result = 'draw';
  else if (rawResult === 'black' || rawResult === '0-1') result = 'black';
  return {
    yearMin: Number.isFinite(yearMin) ? yearMin : null,
    yearMax: Number.isFinite(yearMax) ? yearMax : null,
    eloMin: Number.isFinite(eloMin) ? eloMin : null,
    result
  };
}

function passesGameFilters(meta, filters) {
  const year = Number.parseInt(String(meta?.year || ''), 10);
  const whiteElo = Number.parseInt(String(meta?.whiteElo || ''), 10);
  const blackElo = Number.parseInt(String(meta?.blackElo || ''), 10);
  const avgElo = Number.isFinite(whiteElo) && Number.isFinite(blackElo)
    ? Math.round((whiteElo + blackElo) / 2)
    : null;
  const result = String(meta?.result || '').trim();

  if (filters.yearMin && Number.isFinite(year) && year < filters.yearMin) return false;
  if (filters.yearMax && Number.isFinite(year) && year > filters.yearMax) return false;
  if (filters.eloMin) {
    if (!Number.isFinite(avgElo)) return false;
    if (avgElo < filters.eloMin) return false;
  }
  if (filters.result === 'white' && result !== '1-0') return false;
  if (filters.result === 'draw' && result !== '1/2-1/2') return false;
  if (filters.result === 'black' && result !== '0-1') return false;
  return true;
}

function sortGamesForZip(a, b) {
  const aYear = Number.parseInt(String(a.meta?.year || ''), 10);
  const bYear = Number.parseInt(String(b.meta?.year || ''), 10);
  if (Number.isFinite(bYear) && Number.isFinite(aYear) && bYear !== aYear) return bYear - aYear;
  const aWhiteElo = Number.parseInt(String(a.meta?.whiteElo || ''), 10);
  const aBlackElo = Number.parseInt(String(a.meta?.blackElo || ''), 10);
  const bWhiteElo = Number.parseInt(String(b.meta?.whiteElo || ''), 10);
  const bBlackElo = Number.parseInt(String(b.meta?.blackElo || ''), 10);
  const aElo = Number.isFinite(aWhiteElo) && Number.isFinite(aBlackElo) ? aWhiteElo + aBlackElo : -1;
  const bElo = Number.isFinite(bWhiteElo) && Number.isFinite(bBlackElo) ? bWhiteElo + bBlackElo : -1;
  if (bElo !== aElo) return bElo - aElo;
  return String(a.gameId || '').localeCompare(String(b.gameId || ''));
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16LE(view, offset, value) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeU32LE(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function dosDateTime(inputDate) {
  const date = inputDate instanceof Date ? inputDate : new Date();
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function concatUint8(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function buildZipBuffer(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralChunks = [];
  const now = dosDateTime(new Date());
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(String(file.name || 'file.bin'));
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || []);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    writeU32LE(lv, 0, 0x04034b50);
    writeU16LE(lv, 4, 20);
    writeU16LE(lv, 6, 0);
    writeU16LE(lv, 8, 0);
    writeU16LE(lv, 10, now.dosTime);
    writeU16LE(lv, 12, now.dosDate);
    writeU32LE(lv, 14, crc);
    writeU32LE(lv, 18, data.length);
    writeU32LE(lv, 22, data.length);
    writeU16LE(lv, 26, nameBytes.length);
    writeU16LE(lv, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    writeU32LE(cv, 0, 0x02014b50);
    writeU16LE(cv, 4, 20);
    writeU16LE(cv, 6, 20);
    writeU16LE(cv, 8, 0);
    writeU16LE(cv, 10, 0);
    writeU16LE(cv, 12, now.dosTime);
    writeU16LE(cv, 14, now.dosDate);
    writeU32LE(cv, 16, crc);
    writeU32LE(cv, 20, data.length);
    writeU32LE(cv, 24, data.length);
    writeU16LE(cv, 28, nameBytes.length);
    writeU16LE(cv, 30, 0);
    writeU16LE(cv, 32, 0);
    writeU16LE(cv, 34, 0);
    writeU16LE(cv, 36, 0);
    writeU32LE(cv, 38, 0);
    writeU32LE(cv, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (const c of centralChunks) centralSize += c.length;
  chunks.push(...centralChunks);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  writeU32LE(ev, 0, 0x06054b50);
  writeU16LE(ev, 4, 0);
  writeU16LE(ev, 6, 0);
  writeU16LE(ev, 8, files.length);
  writeU16LE(ev, 10, files.length);
  writeU32LE(ev, 12, centralSize);
  writeU32LE(ev, 16, offset);
  writeU16LE(ev, 20, 0);
  chunks.push(eocd);

  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  return concatUint8(chunks, totalLength);
}

async function handleOpeningDbGamesDownloadZip(request, path, url, env, origin) {
  const m = path.match(/^\/openingdb\/games\/([a-zA-Z0-9._-]+)\/download\.zip$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Invalid games zip route' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }

  const startedAt = Date.now();
  const version = String(m[1]);
  let body = {};
  try {
    body = await request.json();
  } catch (_err) {
    body = {};
  }

  const fenHash = String(body.fenHash || '').toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(fenHash)) {
    return new Response(JSON.stringify({ error: 'Invalid fenHash' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }

  const tier = getTier(url, request);
  const cap = tier === 'premium' ? 200 : 10;
  const sizeCapBytes = tier === 'premium' ? 80 * 1024 * 1024 : 15 * 1024 * 1024;
  const asked = Number.parseInt(String(body.limit || cap), 10);
  const finalLimit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : cap;
  const filters = parseDownloadFilters(body.filters);

  const shard = fenHash.slice(0, 2);
  const shardKey = `openingdb/games/${version}/shards/${shard}.json`;
  const shardObj = await getOpeningDbGamesObject(env, shardKey);
  if (!shardObj) {
    return new Response(JSON.stringify({ error: 'Shard not found', shard, version }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }

  const shardJson = await shardObj.json();
  const gameIds = Array.isArray(shardJson?.[fenHash]) ? shardJson[fenHash] : [];

  const prefixes = Array.from(new Set(gameIds
    .map((id) => String(id || '').slice(2, 4).toLowerCase())
    .filter((p) => /^[0-9a-f]{2}$/.test(p))));

  const catalogList = await Promise.all(prefixes.map(async (prefix) => {
    const obj = await getOpeningDbGamesObject(env, `openingdb/games/${version}/catalog/${prefix}.json`);
    if (!obj) return {};
    try {
      return await obj.json();
    } catch (_err) {
      return {};
    }
  }));

  const catalog = {};
  for (const cat of catalogList) Object.assign(catalog, cat);

  const candidates = gameIds
    .map((id) => ({ gameId: id, meta: catalog[id] || {} }))
    .filter((row) => passesGameFilters(row.meta, filters))
    .sort(sortGamesForZip);

  const selected = candidates.slice(0, finalLimit);
  const encoder = new TextEncoder();
  const files = [];
  const indexLines = [
    `CAISSA OpeningDB Games Export`,
    `fenHash=${fenHash}`,
    `version=${version}`,
    `tier=${tier}`,
    `requested=${asked || finalLimit}`,
    `cap=${cap}`,
    `filters=${JSON.stringify(filters)}`,
    ''
  ];

  let bytesUsed = 0;
  let truncatedBySize = false;
  for (const row of selected) {
    const gameId = String(row.gameId || '');
    const pgnObj = await getOpeningDbGamesObject(env, `openingdb/games/${version}/pgn/${gameId}.pgn`);
    if (!pgnObj) continue;
    const ab = await pgnObj.arrayBuffer();
    const data = new Uint8Array(ab);
    const projected = bytesUsed + data.length;
    if (projected > sizeCapBytes) {
      truncatedBySize = true;
      break;
    }
    bytesUsed = projected;
    files.push({ name: `games/${gameId}.pgn`, data });
    const white = String(row.meta?.white || 'Unknown');
    const black = String(row.meta?.black || 'Unknown');
    const year = row.meta?.year ? String(row.meta.year) : '?';
    const result = String(row.meta?.result || '?');
    indexLines.push(`${gameId} | ${white} vs ${black} | ${year} | ${result}`);
  }

  if (files.length === 0) {
    indexLines.push('No games found for this position and filters.');
  }
  if (truncatedBySize) {
    indexLines.push('');
    indexLines.push(`truncated=true (size cap reached at ${sizeCapBytes} bytes)`);
  }
  const indexData = encoder.encode(`${indexLines.join('\n')}\n`);
  files.unshift({ name: 'index.txt', data: indexData });

  const zipData = buildZipBuffer(files);
  const filename = `caissa-games_${fenHash.slice(0, 8)}_${Math.max(0, files.length - 1)}.zip`;
  const totalMs = Date.now() - startedAt;
  console.log('[OpeningDBGamesZIP]', {
    fenHash,
    shard,
    tier,
    totalGameIds: gameIds.length,
    afterFiltering: candidates.length,
    finalLimit,
    includedGames: Math.max(0, files.length - 1),
    zipSizeBytes: zipData.length,
    truncatedBySize,
    totalMs
  });

  return new Response(zipData, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Caissa-Truncated': truncatedBySize ? 'true' : 'false',
      ...getCorsHeaders(origin),
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleOpeningDbGamesDownload(request, path, url, env, origin) {
  const m = path.match(/^\/openingdb\/games\/([a-zA-Z0-9._-]+)\/download$/i);
  if (!m) {
    return new Response(JSON.stringify({ error: 'Invalid games download route' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }
  const version = String(m[1]);
  let body = {};
  try {
    body = await request.json();
  } catch (_err) {
    body = {};
  }
  const fenHash = String(body.fenHash || '').toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(fenHash)) {
    return new Response(JSON.stringify({ error: 'Invalid fenHash' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }

  const tier = getTier(url, request);
  const maxByTier = tier === 'premium' ? 200 : 10;
  const asked = Number.parseInt(String(body.limit || maxByTier), 10);
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, maxByTier) : maxByTier;

  const shard = fenHash.slice(0, 2);
  const shardKey = `openingdb/games/${version}/shards/${shard}.json`;
  const shardObj = await getOpeningDbGamesObject(env, shardKey);
  if (!shardObj) {
    return new Response(JSON.stringify({ error: 'Shard not found', shard, version }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
    });
  }

  const shardJson = await shardObj.json();
  const ids = Array.isArray(shardJson?.[fenHash]) ? shardJson[fenHash] : [];
  const selected = ids.slice(0, limit);
  const urls = selected.map((id) => `https://downloads.caissa-chess.org/openingdb/games/${version}/pgn/${id}.pgn`);

  return new Response(JSON.stringify({
    ok: true,
    tier,
    version,
    fenHash,
    count: urls.length,
    maxAllowed: maxByTier,
    urls,
    upgradeMessage: tier === 'free' && ids.length > limit ? 'Upgrade to Premium to download more games.' : null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handleRequest(request, env) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin)
    });
  }

  // Health check
  if (path === '/health' || path === '/') {
    return new Response(JSON.stringify({
      ok: true,
      service: 'CAISSA Vault Downloads',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin)
      }
    });
  }

  // Catalog endpoint
  if (path === '/catalog') {
    return handleCatalog(origin);
  }

  // Download count endpoints
  if (path === '/api/download-count' && request.method === 'GET') {
    return handleDownloadCount(url, env, origin);
  }

  if (path === '/openingdb/manifest.json') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }
    return handleOpeningDbManifest(env, origin, request.method);
  }

  if (path === '/openingdb/games/manifest.json') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }
    return handleOpeningDbGamesManifest(env, origin, request.method);
  }

  if (/^\/openingdb\/games\/[a-zA-Z0-9._-]+\/shards\/[0-9a-f]{2}\.json$/i.test(path)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
      });
    }
    return handleOpeningDbGamesShard(path, env, origin, request.method);
  }

  if (/^\/openingdb\/games\/[a-zA-Z0-9._-]+\/catalog\/[0-9a-f]{2}\.json$/i.test(path)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
      });
    }
    return handleOpeningDbGamesCatalog(path, env, origin, request.method);
  }

  if (/^\/openingdb\/games\/[a-zA-Z0-9._-]+\/pgn\/g_[0-9a-f]+\.pgn$/i.test(path)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
      });
    }
    return handleOpeningDbGamesPgn(path, env, origin, request.method);
  }

  if (/^\/openingdb\/games\/[a-zA-Z0-9._-]+\/download$/i.test(path)) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
      });
    }
    return handleOpeningDbGamesDownload(request, path, url, env, origin);
  }

  if (/^\/openingdb\/games\/[a-zA-Z0-9._-]+\/download\.zip$/i.test(path)) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) }
      });
    }
    return handleOpeningDbGamesDownloadZip(request, path, url, env, origin);
  }

  // OpeningDB shard endpoint:
  // /openingdb/shards/{version}/{shard}
  // /openingdb/shards/{version}/{shard}.json
  if (path.startsWith('/openingdb/shards/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }
    return handleOpeningDbShard(path, env, origin, request.method);
  }

  // Download endpoint: /download/{slug}
  const downloadMatch = path.match(/^\/download\/([a-z0-9-]+)$/);
  if (downloadMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }
    const slug = downloadMatch[1];
    return handleDownload(slug, env, origin, request.method, false);
  }

  // Direct key endpoint: /apps/... for known catalog entries
  const directKey = path.replace(/^\/+/, '');
  const directSlug = DOWNLOAD_PATH_TO_SLUG[directKey];
  if (directSlug) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin)
        }
      });
    }
    const shouldCount = request.method === 'GET' &&
      directSlug === COUNTED_SLUG &&
      directKey === COUNTED_DOWNLOAD_KEY;
    return handleDownload(directSlug, env, origin, request.method, shouldCount);
  }

  // 404 for unknown routes
  return new Response(JSON.stringify({
    error: 'Not found',
    message: 'Endpoint not found',
    availableEndpoints: [
      '/health',
      '/catalog',
      '/download/{slug}',
      '/openingdb/manifest.json',
      '/openingdb/shards/{version}/{shard}.json',
      '/openingdb/games/manifest.json',
      '/openingdb/games/{version}/shards/{shard}.json',
      '/openingdb/games/{version}/catalog/{prefix}.json',
      '/openingdb/games/{version}/pgn/{gameId}.pgn',
      '/openingdb/games/{version}/download',
      '/openingdb/games/{version}/download.zip',
      '/api/download-count?slug=caissa-book-creator'
    ]
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin)
    }
  });
}

// ============================================================================
// WORKER ENTRY POINT
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

export class DownloadCounter {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const key = 'count';

    if (url.pathname === '/inc' && request.method === 'POST') {
      const current = Number((await this.state.storage.get(key)) || 0);
      const next = current + 1;
      await this.state.storage.put(key, next);
      return new Response(JSON.stringify({ count: next }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/get' && request.method === 'GET') {
      const count = Number((await this.state.storage.get(key)) || 0);
      return new Response(JSON.stringify({ count }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
