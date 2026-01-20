/**
 * CAISSA Chess - Game Fetcher Worker
 *
 * Cloudflare Worker that fetches games from Chess.com and Lichess
 * to bypass CORS restrictions in the browser.
 *
 * Deploy to: https://api.caissa-chess.org or Workers subdomain
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALLOWED_ORIGINS = [
  'https://caissa-chess.org',
  'https://www.caissa-chess.org',
  'https://tv-lavin-chess-game2.vercel.app',
  'https://tv-lavin-chess-game2-git-main-elcriollitos-projects.vercel.app'
];

const CACHE_TTL = 60; // Cache results for 60 seconds
const MAX_GAMES_LIMIT = 50;
const MAX_PGN_SIZE = 100000; // Max 100KB PGN size
const RATE_LIMIT_MAX = 10; // Max 10 requests per minute per IP
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

// In-memory rate limiting (resets on Worker restart)
const rateLimitMap = new Map();

// ============================================================================
// CORS HELPER
// ============================================================================

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                    origin?.endsWith('.vercel.app') ||
                    origin === 'http://localhost:8080' ||
                    origin === 'http://127.0.0.1:8080';

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function corsResponse(data, status = 200, origin = null) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });
}

// ============================================================================
// RATE LIMITING
// ============================================================================

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];

  // Filter out requests older than the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);

  return true;
}

// ============================================================================
// CHESS.COM FETCHER
// ============================================================================

async function fetchChessComGames(username, maxGames = 20, timeControl = 'all') {
  const warnings = [];
  const games = [];

  try {
    // Step 1: Get player's game archives
    const archivesUrl = `https://api.chess.com/pub/player/${username}/games/archives`;
    const archivesResp = await fetch(archivesUrl);

    if (!archivesResp.ok) {
      if (archivesResp.status === 404) {
        throw new Error(`Chess.com user "${username}" not found`);
      }
      throw new Error(`Chess.com API error: ${archivesResp.status}`);
    }

    const archivesData = await archivesResp.json();
    const archives = archivesData.archives || [];

    if (archives.length === 0) {
      throw new Error(`No game archives found for user "${username}"`);
    }

    // Step 2: Fetch games from most recent archives (newest first)
    const recentArchives = archives.slice(-3).reverse(); // Last 3 months, newest first

    for (const archiveUrl of recentArchives) {
      if (games.length >= maxGames) break;

      const gamesResp = await fetch(archiveUrl);
      if (!gamesResp.ok) continue;

      const gamesData = await gamesResp.json();
      const monthGames = gamesData.games || [];

      // Filter by time control if specified
      const filteredGames = timeControl === 'all'
        ? monthGames
        : monthGames.filter(g => {
            const tc = g.time_class?.toLowerCase();
            return tc === timeControl.toLowerCase();
          });

      // Add games (newest first)
      games.push(...filteredGames.reverse());

      if (games.length > maxGames) {
        games.length = maxGames; // Trim to limit
      }
    }

    if (games.length === 0) {
      throw new Error(`No games found for ${username} with time control: ${timeControl}`);
    }

    // Step 3: Extract PGN from games
    const pgnChunks = games.map(game => {
      if (game.pgn) {
        return game.pgn.trim();
      }

      // Fallback: build minimal PGN from game data
      warnings.push(`Game ${game.url} missing PGN - using fallback`);
      return buildFallbackPGN(game);
    });

    const combinedPGN = pgnChunks.join('\n\n');

    return {
      pgn: combinedPGN,
      count: games.length,
      source: 'chess.com',
      warnings,
    };

  } catch (error) {
    throw new Error(`Chess.com fetch failed: ${error.message}`);
  }
}

function buildFallbackPGN(game) {
  const white = game.white?.username || 'Unknown';
  const black = game.black?.username || 'Unknown';
  const result = game.pgn?.match(/\[Result "([^"]+)"\]/)?.[1] || '*';
  const date = new Date(game.end_time * 1000).toISOString().split('T')[0].replace(/-/g, '.');

  return `[Event "Chess.com Game"]
[Site "${game.url || '?'}"]
[Date "${date}"]
[White "${white}"]
[Black "${black}"]
[Result "${result}"]

${result}`;
}

// ============================================================================
// LICHESS FETCHER
// ============================================================================

async function fetchLichessGames(username, maxGames = 20, timeControl = 'all') {
  const warnings = [];

  try {
    // Lichess API endpoint for user games (PGN format)
    // https://lichess.org/api#tag/Games/operation/apiGamesUser
    let url = `https://lichess.org/api/games/user/${username}?max=${maxGames}&moves=true&tags=true&clocks=false&evals=false&opening=false`;

    // Map time control to Lichess perf types
    if (timeControl !== 'all') {
      const perfTypeMap = {
        'bullet': 'bullet',
        'blitz': 'blitz',
        'rapid': 'rapid',
        'classical': 'classical',
      };

      const perfType = perfTypeMap[timeControl.toLowerCase()];
      if (perfType) {
        url += `&perfType=${perfType}`;
      } else {
        warnings.push(`Unknown time control "${timeControl}" - fetching all games`);
      }
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/x-chess-pgn',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Lichess user "${username}" not found`);
      }
      throw new Error(`Lichess API error: ${response.status}`);
    }

    const pgnText = await response.text();

    if (!pgnText || pgnText.trim().length === 0) {
      throw new Error(`No games found for Lichess user "${username}"`);
    }

    // Count games by counting [Event tags
    const gameCount = (pgnText.match(/\[Event /g) || []).length;

    return {
      pgn: pgnText.trim(),
      count: gameCount,
      source: 'lichess.org',
      warnings,
    };

  } catch (error) {
    throw new Error(`Lichess fetch failed: ${error.message}`);
  }
}

// ============================================================================
// PGN VALIDATION & PARSING
// ============================================================================

/**
 * Validate PGN format and size
 * @param {string} pgn - PGN text to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
function validatePGN(pgn) {
  // Check if PGN is provided
  if (!pgn || typeof pgn !== 'string') {
    return { valid: false, error: 'PGN is required' };
  }

  // Check size limit
  if (pgn.length > MAX_PGN_SIZE) {
    return {
      valid: false,
      error: `PGN too large (max ${MAX_PGN_SIZE} characters, got ${pgn.length})`
    };
  }

  // Check minimum length
  if (pgn.trim().length < 10) {
    return { valid: false, error: 'PGN too short or empty' };
  }

  // Check for basic PGN structure (at least one bracket tag)
  if (!pgn.includes('[') || !pgn.includes(']')) {
    return { valid: false, error: 'Invalid PGN format - missing header tags' };
  }

  return { valid: true };
}

/**
 * Extract game metadata from PGN
 * @param {string} pgn - PGN text
 * @returns {object} - Game metadata
 */
function extractPGNMetadata(pgn) {
  const metadata = {
    moveCount: 0,
    result: '*',
    white: null,
    black: null,
    event: null,
    site: null,
    date: null,
  };

  try {
    // Extract result from [Result "..."] tag
    const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/i);
    if (resultMatch) {
      metadata.result = resultMatch[1];
    }

    // Extract white player
    const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/i);
    if (whiteMatch) {
      metadata.white = whiteMatch[1];
    }

    // Extract black player
    const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/i);
    if (blackMatch) {
      metadata.black = blackMatch[1];
    }

    // Extract event
    const eventMatch = pgn.match(/\[Event\s+"([^"]+)"\]/i);
    if (eventMatch) {
      metadata.event = eventMatch[1];
    }

    // Extract site
    const siteMatch = pgn.match(/\[Site\s+"([^"]+)"\]/i);
    if (siteMatch) {
      metadata.site = siteMatch[1];
    }

    // Extract date
    const dateMatch = pgn.match(/\[Date\s+"([^"]+)"\]/i);
    if (dateMatch) {
      metadata.date = dateMatch[1];
    }

    // Count moves (count move numbers like "1.", "2.", etc.)
    // Split by newlines and filter lines that don't start with [
    const moveText = pgn.split('\n')
      .filter(line => !line.trim().startsWith('['))
      .join(' ');

    // Count move numbers (e.g., "1.", "2.", "3.")
    const moveMatches = moveText.match(/\b\d+\./g);
    if (moveMatches) {
      metadata.moveCount = moveMatches.length;
    }

  } catch (error) {
    // If parsing fails, return partial metadata
    console.error('PGN metadata extraction error:', error);
  }

  return metadata;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handleRequest(request) {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // Health check endpoint
  if (path === '/api/health' || path === '/health') {
    return corsResponse({
      ok: true,
      service: 'CAISSA Chess Game Fetcher',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    }, 200, origin);
  }

  // Games endpoint
  if (path === '/api/games' || path === '/games') {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a minute and try again.',
      }, 429, origin);
    }

    // Parse query parameters
    const platform = url.searchParams.get('platform') || 'chesscom';
    const username = url.searchParams.get('username');
    const maxGames = Math.min(parseInt(url.searchParams.get('max') || '20'), MAX_GAMES_LIMIT);
    const timeControl = url.searchParams.get('tc') || 'all';

    // Validate parameters
    if (!username) {
      return corsResponse({
        error: 'Missing parameter',
        message: 'Username is required',
      }, 400, origin);
    }

    if (!['chesscom', 'lichess'].includes(platform)) {
      return corsResponse({
        error: 'Invalid platform',
        message: 'Platform must be "chesscom" or "lichess"',
      }, 400, origin);
    }

    // Check cache (using Cloudflare Cache API)
    const cacheKey = `${platform}:${username}:${timeControl}:${maxGames}`;
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cache_key', cacheKey);

    let cachedResponse = await cache.match(cacheUrl);
    if (cachedResponse) {
      const data = await cachedResponse.json();
      data.cached = true;
      return corsResponse(data, 200, origin);
    }

    // Fetch games
    try {
      let result;

      if (platform === 'chesscom') {
        result = await fetchChessComGames(username, maxGames, timeControl);
      } else {
        result = await fetchLichessGames(username, maxGames, timeControl);
      }

      result.cached = false;
      result.timestamp = new Date().toISOString();

      // Cache the response
      const response = corsResponse(result, 200, origin);
      const responseToCache = response.clone();

      // Store in cache with TTL
      const cacheResponse = new Response(responseToCache.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });

      await cache.put(cacheUrl, cacheResponse);

      return response;

    } catch (error) {
      return corsResponse({
        error: 'Fetch failed',
        message: error.message,
        platform,
        username,
      }, 500, origin);
    }
  }

  // Game endpoint - PGN validation and metadata extraction
  if (path === '/api/game' || path === '/game') {
    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(ip)) {
      return corsResponse({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait a minute and try again.',
      }, 429, origin);
    }

    // Get PGN from query parameter
    const pgn = url.searchParams.get('pgn');

    // Validate PGN
    const validation = validatePGN(pgn);
    if (!validation.valid) {
      return corsResponse({
        error: 'Invalid PGN',
        message: validation.error,
      }, 400, origin);
    }

    try {
      // Extract metadata from PGN
      const metadata = extractPGNMetadata(pgn);

      // Return clean response
      return corsResponse({
        success: true,
        game: {
          moveCount: metadata.moveCount,
          result: metadata.result,
          white: metadata.white,
          black: metadata.black,
          event: metadata.event,
          site: metadata.site,
          date: metadata.date,
        },
        pgnSize: pgn.length,
        timestamp: new Date().toISOString(),
      }, 200, origin);

    } catch (error) {
      return corsResponse({
        error: 'Parsing failed',
        message: error.message,
      }, 500, origin);
    }
  }

  // 404 for unknown routes
  return corsResponse({
    error: 'Not found',
    message: 'Endpoint not found',
    availableEndpoints: ['/api/health', '/api/games', '/api/game'],
  }, 404, origin);
}

// ============================================================================
// WORKER ENTRY POINT
// ============================================================================

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
