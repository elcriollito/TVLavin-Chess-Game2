// Simple HTTP Server for TVLavin Chess Game
// Usage: node server.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPrivateRunOperationalConfig } from './js/endgame-trainer/v2/private-run-operational-config.js';
import { resolvePlayV2BetaEntry } from './js/play/play-v2-beta-entry-gate.js';
import { resolvePlayV2PhysicalPromotionQA } from './js/play/play-v2-physical-promotion-qa-gate.js';
import { resolvePlayV2PhysicalIpadAnalyzeDiagnostic } from './js/play/play-v2-physical-ipad-analyze-diagnostic-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8000;
const HOST = process.env.CAISSA_SERVER_HOST || '127.0.0.1';
const PLAY_V2_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const PLAY_V2_DIAGNOSTIC_CSP = "worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'";

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.pgn': 'application/x-chess-pgn'
};

// ============================================================================
// API PROXY HANDLERS (for CORS-blocked APIs like Lichess)
// ============================================================================

async function handleLichessProxy(req, res, url) {
  const username = url.searchParams.get('username');
  const max = url.searchParams.get('max') || '20';
  const timeControl = url.searchParams.get('timeControl') || 'all';

  console.log(`🎯 Lichess Proxy: user=${username}, max=${max}, timeControl=${timeControl}`);

  if (!username) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Missing username parameter' }));
    return;
  }

  try {
    // Build Lichess API URL
    let lichessUrl = `https://lichess.org/api/games/user/${username}?max=${max}&pgnInJson=true&clocks=false&evals=false&opening=false`;

    // Add perf filter if specified
    if (timeControl && timeControl !== 'all') {
      const perfMap = { 'bullet': 'bullet', 'blitz': 'blitz', 'rapid': 'rapid', 'classical': 'classical' };
      if (perfMap[timeControl]) {
        lichessUrl += `&perfType=${perfMap[timeControl]}`;
      }
    }

    console.log(`📡 Fetching from Lichess: ${lichessUrl}`);

    const response = await fetch(lichessUrl, {
      headers: { 'Accept': 'application/x-ndjson' }
    });

    console.log(`📥 Lichess response status: ${response.status}`);

    if (!response.ok) {
      const errorMsg = response.status === 404
        ? `User "${username}" not found on Lichess`
        : `Lichess API error: ${response.status}`;
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: errorMsg }));
      return;
    }

    const text = await response.text();
    const lines = text.trim().split('\n');
    const games = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const game = JSON.parse(line);
        if (game.pgn) {
          games.push({
            id: game.id || `lichess-${game.createdAt}`,
            pgn: game.pgn,
            timeControl: game.perf || 'unknown',
            playedAt: game.createdAt ? new Date(game.createdAt).toISOString() : null
          });
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse game:', e.message);
      }
    }

    console.log(`✅ Parsed ${games.length} games from Lichess`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, games, count: games.length }));

  } catch (error) {
    console.error('❌ Lichess proxy error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
}

function handleHealthCheck(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/health', '/api/lichess/games']
  }));
}

// ============================================================================
// MENTOR AI CHAT PROXY (for LLM API calls)
// ============================================================================

// Remote callers may select a provider, never the server's network destination.
const MENTOR_PROVIDER_ENDPOINTS = Object.freeze({
  together: 'https://api.together.xyz/v1/chat/completions',
  llama: 'https://api.llama.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages'
});
const ALLOWED_PROVIDERS = new Set(Object.keys(MENTOR_PROVIDER_ENDPOINTS));

// Input validation limits
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 100000; // 100KB per message

async function handleMentorChat(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Read request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  try {
    const data = JSON.parse(body);
    const { provider, apiKey, messages, model, maxTokens, temperature } = data;

    if (provider === 'custom') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: 'CUSTOM_PROVIDER_DISABLED',
        error: 'Custom AI endpoints are temporarily unavailable.'
      }));
      return;
    }

    if (provider === 'local') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code: 'LOCAL_PROVIDER_DISABLED',
        error: 'Local AI endpoints are unavailable through the server.'
      }));
      return;
    }

    // Validate provider
    if (!ALLOWED_PROVIDERS.has(provider)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'UNKNOWN_PROVIDER', error: 'Unknown AI provider.' }));
      return;
    }

    // All supported legacy providers use a caller-supplied key.
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API key is required' }));
      return;
    }

    if (!messages || !Array.isArray(messages)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Messages array is required' }));
      return;
    }

    // Validate message count
    if (messages.length > MAX_MESSAGES) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Too many messages. Maximum: ${MAX_MESSAGES}` }));
      return;
    }

    // Validate message content length
    for (const msg of messages) {
      if (msg.content && msg.content.length > MAX_CONTENT_LENGTH) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Message content too long. Maximum: ${MAX_CONTENT_LENGTH} characters` }));
        return;
      }
    }

    console.log(`🤖 Mentor Chat: provider=${provider}, model=${model}, messages=${messages.length}`);

    const apiUrl = MENTOR_PROVIDER_ENDPOINTS[provider];
    let headers, requestBody;

    // Configure request based on provider
    switch (provider) {
      case 'together':
        // Together.ai - cost-efficient LLaMA hosting
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'llama':
        // Meta Llama API - OpenAI-compatible chat completions format
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'llama-4-scout-17b-16e-instruct',
          messages,
          max_completion_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'anthropic':
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        // Convert OpenAI format to Anthropic format
        const systemMsg = messages.find(m => m.role === 'system');
        const otherMsgs = messages.filter(m => m.role !== 'system');
        requestBody = JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens || 1024,
          system: systemMsg ? systemMsg.content : '',
          messages: otherMsgs
        });
        break;

      case 'openai':
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      default:
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'UNKNOWN_PROVIDER', error: 'Unknown AI provider.' }));
        return;
    }

    // Make API request
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: requestBody,
      redirect: 'error'
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error('❌ LLM API error:', responseData);
      res.writeHead(apiResponse.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: responseData.error?.message || responseData.detail || 'LLM API request failed',
        details: responseData
      }));
      return;
    }

    // Parse response based on provider
    let content, usage;
    if (provider === 'anthropic') {
      content = responseData.content?.[0]?.text || '';
      usage = {
        prompt_tokens: responseData.usage?.input_tokens,
        completion_tokens: responseData.usage?.output_tokens,
        total_tokens: (responseData.usage?.input_tokens || 0) + (responseData.usage?.output_tokens || 0)
      };
    } else {
      // OpenAI-compatible format (Together, Llama, OpenAI)
      content = responseData.choices?.[0]?.message?.content || '';
      usage = responseData.usage;
    }

    console.log(`✅ Mentor response: ${content.length} chars`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content, usage, provider, model }));

  } catch (error) {
    console.error('❌ Mentor chat error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============================================================================
// MAIN SERVER
// ============================================================================

const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Consolidate public blog routes on the canonical no-trailing-slash form.
  if (pathname === '/blog/' || /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(pathname)) {
    res.writeHead(308, { Location: pathname.slice(0, -1) + url.search });
    res.end();
    return;
  }

  if (pathname === '/yahoo-classic/' || (pathname === '/' && url.searchParams.get('section') === 'yahooClassic')) {
    res.writeHead(308, { Location: '/yahoo-classic' });
    res.end();
    return;
  }

  if (pathname === '/' && url.searchParams.get('action') === 'help') {
    res.writeHead(308, { Location: '/help' });
    res.end();
    return;
  }

  // API Routes
  if (pathname === '/api/endgame/private-run-availability') {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    };
    if (req.method !== 'GET') {
      res.writeHead(405, headers); res.end(JSON.stringify({ error: 'Method not allowed' })); return;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify(createPrivateRunOperationalConfig(process.env)));
    return;
  }

  if (pathname === '/api/health') {
    handleHealthCheck(res);
    return;
  }

  if (pathname === '/api/lichess/games') {
    await handleLichessProxy(req, res, url);
    return;
  }

  if (pathname === '/api/mentor/chat') {
    res.writeHead(410, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ code: 'MENTOR_PROXY_RETIRED', error: 'Use the authenticated serverless Mentor API.' }));
    return;
  }

  // Static file serving
  if (pathname === '/api/public-auth-config') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ clerkPublishableKey: '', registrationTracking: false }));
    return;
  }
  if (pathname === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(308, { Location: '/play' });
    res.end();
    return;
  }
  let filePath = '.' + pathname;
  let responseStatus = 200;
  if (filePath === './') {
    filePath = './index.html';
  }
  if (pathname === '/blog') {
    filePath = './blog/index.html';
  }
  if (pathname === '/about' || pathname === '/about/') {
    filePath = './about.html';
  }
  if (pathname === '/help' || pathname === '/help/') {
    filePath = './help.html';
  }
  if (pathname === '/vault' || pathname === '/vault/') {
    filePath = './vault.html';
  }
  if (pathname === '/yahoo-classic') {
    filePath = './yahoo-classic.html';
  }
  if (pathname === '/play-online/playchess' || pathname === '/play-online/playchess/') {
    filePath = './playchess.html';
  }
  if (pathname === '/play-online/fritz' || pathname === '/play-online/fritz/') {
    filePath = './fritz.html';
  }
  if (pathname === '/puzzles/chessbase-tactics' || pathname === '/puzzles/chessbase-tactics/') {
    filePath = './tactics.html';
  }
  if (pathname === '/learn/interactive-diagrams' || pathname === '/learn/interactive-diagrams/') {
    filePath = './interactive-diagrams.html';
  }
  if (pathname === '/watch/live-blitz' || pathname === '/watch/live-blitz/') {
    filePath = './live-blitz.html';
  }
  if (pathname === '/watch/lichess-tv' || pathname === '/watch/lichess-tv/') {
    filePath = './lichess-tv.html';
  }
  if (pathname === '/watch/live-tournaments' || pathname === '/watch/live-tournaments/') {
    filePath = './live-tournaments.html';
  }
  if (pathname === '/watch/game-replayer' || pathname === '/watch/game-replayer/') {
    filePath = './game-replayer.html';
  }
  if (pathname === '/academy') {
    filePath = './index.html';
  }
  if (['/insights', '/fics', '/analyze', '/spectator-tv', '/arena', '/cheater-insight',
    '/game-library', '/history', '/dos-chess'].includes(pathname)) {
    filePath = './index.html';
  }
  const physicalPromotionQA = resolvePlayV2PhysicalPromotionQA(pathname, url.search, process.env);
  const ipadAnalyzeDiagnostic = resolvePlayV2PhysicalIpadAnalyzeDiagnostic(pathname, url.search, process.env);
  const retiredBetaRedirects = new Map([
    ['/play/beta', '/play'], ['/play/beta/games', '/play/games'],
    ['/play/beta/bots', '/play/bots'], ['/play/beta/coach', '/play/coach']
  ]);
  if (pathname === '/play/beta' || pathname.startsWith('/play/beta/')) {
    const destination = retiredBetaRedirects.get(pathname);
    if ((req.method === 'GET' || req.method === 'HEAD') && destination) { res.writeHead(308, { Location: destination }); res.end(); return; }
    filePath = './play-v2-unavailable.html';
  }
  const betaEntry = physicalPromotionQA.requested ? physicalPromotionQA
    : ipadAnalyzeDiagnostic.requested ? ipadAnalyzeDiagnostic
      : resolvePlayV2BetaEntry(pathname, process.env);
  if (betaEntry.requested) {
    filePath = `./${betaEntry.document}`;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', ipadAnalyzeDiagnostic.requested ? PLAY_V2_DIAGNOSTIC_CSP : PLAY_V2_CSP);
  }
  if (pathname === '/play-v2.html' || pathname === '/play-v2-public-beta.html' || pathname === '/play-v2-invite.html' || pathname === '/play-v2-promotion-qa.html'
      || pathname === '/play-v2-ipad-analyze-diagnostic.html') {
    filePath = './play-v2-unavailable.html';
    responseStatus = 404;
  }
  if (pathname === '/endgame-trainer' || pathname === '/endgame-trainer/') {
    filePath = './endgame-trainer.html';
  }
  if (pathname === '/endgame-practice' || pathname === '/endgame-practice/') {
    filePath = './endgame-practice.html';
  }
  if (pathname === '/endgame-library' || pathname === '/endgame-library/') {
    filePath = './endgame-library.html';
  }
  if (/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) {
    filePath = `.${pathname}/index.html`;
  }
  if (pathname === '/database' || pathname.startsWith('/database/eco/')) {
    filePath = './database.html';
  }
  if (pathname === '/eco' || pathname.startsWith('/eco/')) {
    filePath = './eco.html';
  }
  if (pathname === '/opening-database' || pathname === '/opening-database/') {
    filePath = './opening-database.html';
  }
  if (pathname === '/tools/polyglot') {
    filePath = './polyglot.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = MIME_TYPES[extname] || 'application/octet-stream';
  const publicPgn = pathname === '/data/pgn/capablanca-games-1901-1941.pgn';

  // Try to read from root first, then from public/ folder
  fs.readFile(filePath, (error, content) => {
    if (error && error.code === 'ENOENT') {
      // Try public/ folder as fallback (for favicons, manifest, etc.)
      const publicPath = './public' + pathname;
      fs.readFile(publicPath, (err2, content2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 - File Not Found</h1>', 'utf-8');
        } else {
          res.writeHead(200, { 'Content-Type': mimeType, ...(publicPgn ? { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' } : {}) });
          res.end(content2, 'utf-8');
        }
      });
    } else if (error) {
      res.writeHead(500);
      res.end('Server Error: ' + error.code, 'utf-8');
    } else {
      res.writeHead(responseStatus, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log('========================================');
  console.log('  TVLavin Chess - Server Running!');
  console.log('========================================');
  console.log('');
  console.log(`  Bound: http://${HOST}:${PORT}`);
  console.log('');
  console.log('  Press Ctrl+C to stop the server');
  console.log('========================================');
  console.log('');
});

export { handleMentorChat, server };
