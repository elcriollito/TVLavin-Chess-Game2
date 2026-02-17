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
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
