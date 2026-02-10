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

async function handleDownload(slug, env, origin) {
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

    return new Response(object.body, { headers });

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

  // Download endpoint: /download/{slug}
  const downloadMatch = path.match(/^\/download\/([a-z0-9-]+)$/);
  if (downloadMatch) {
    const slug = downloadMatch[1];
    return handleDownload(slug, env, origin);
  }

  // 404 for unknown routes
  return new Response(JSON.stringify({
    error: 'Not found',
    message: 'Endpoint not found',
    availableEndpoints: ['/health', '/catalog', '/download/{slug}']
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
