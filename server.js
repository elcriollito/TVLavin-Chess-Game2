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
import {
  injectPlayGameplayPreviewMarker,
  resolvePlayGameplayDeploymentConfig
} from './api/_lib/play-gameplay-preview-config.js';
import { createScannerBetaHttpAdapter } from './tools/scanner-beta-feedback/http-adapter.mjs';
import { createBetaProgramService } from './api/_lib/beta-program-service.js';
import { renderBetaCenter, renderBetaDenied } from './api/_lib/beta-center-document.js';
import { fetchLichessGames } from './api/_lib/lichess-games.js';
import tablebaseHandler from './api/tablebase/standard.js';
import { worldChampionshipPgnCatalog } from './js/game-library/world-championship-pgn-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.CAISSA_SERVER_HOST || '127.0.0.1';
const RETIRED_PAGE_REDIRECTS = new Map([
  ['/puzzles/chessbase-tactics', '/puzzles'],
  ['/endgame-practice', '/endgame-trainer'],
  ['/watch/lichess-broadcasts', '/watch/live-tournaments']
]);
const INTERNAL_QA_ENABLED = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const INTERNAL_QA_PGN_ASSETS = new Map([
  ['fischer-spassky-1972-complete', path.join(__dirname, 'internal-assets', 'pgn', 'fischer-spassky-1972.pgn')]
]);
const PLAY_V2_CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; script-src-elem 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' https://img.clerk.com data:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://api.chess.com https://lichess.org https://caissa-game-fetcher.elcriollito.workers.dev https://*.clerk.accounts.dev https://api.clerk.com https://clerk-telemetry.com; frame-src 'self' https://*.clerk.accounts.dev; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const PLAY_V2_DIAGNOSTIC_CSP = "worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'";
const BETA_PRIVATE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const scannerExperiment = Object.freeze({ id: 'scanner', slug: 'scanner', displayName: 'CAISSA Scanner',
  description: 'Scan chess positions from your phone or screen.', stage: 'internal-beta', enabled: true,
  route: '/scanner/beta', accessPolicy: 'global-beta', feedbackEnabled: true, sortOrder: 10 });
const testBetaBypass = process.env.NODE_ENV === 'test' && process.env.CAISSA_BETA_TEST_BYPASS === '1';
const localBetaStore = testBetaBypass ? Object.freeze({
  async getUserByClerkId() { return { authenticated: true, id: 'test-user', role: 'member', entitlements: ['beta_tester'] }; },
  async listExperiments() { return [scannerExperiment]; },
  async getBetaActivitySummary() { return { attempted: 0, completed: 0, confirmedCorrect: 0, corrected: 0,
    localizationFailures: 0, scanFailures: 0, pending: 0, completedToday: 0, completedThisWeek: 0,
    completedAllTime: 0 }; },
  async getExperiment(id) { return id === 'scanner' ? scannerExperiment : null; },
  async recordEvent() {}
}) : null;
const betaProgram = createBetaProgramService({
  env: process.env,
  ...(testBetaBypass ? { store: localBetaStore, authenticate: async () => ({ authenticated: true, ok: true, userId: 'test-clerk' }) } : {})
});
const scannerBeta = createScannerBetaHttpAdapter({ env: process.env, authorizeExperiment: betaProgram.authorizeExperiment });

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
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.pgn': 'application/x-chess-pgn'
};

// ============================================================================
// API PROXY HANDLERS (for CORS-blocked APIs like Lichess)
// ============================================================================

async function handleLichessProxy(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }
  const result = await fetchLichessGames(url.searchParams);
  res.writeHead(result.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(result.body));
}

function handleHealthCheck(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/health', '/api/lichess/games']
  }));
}

const PGN_MENTOR_EVENT_FILES = new Set(worldChampionshipPgnCatalog.map(entry => entry.file));
const PGN_MENTOR_MAX_BYTES = 12 * 1024 * 1024;

async function handlePgnMentorEvent(req, res, url) {
  const file = url.searchParams.get('file');
  const valid = url.searchParams.get('kind') === 'event'
    && typeof file === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._()-]{0,119}\.pgn$/.test(file)
    && !file.includes('..') && !file.includes('/') && !file.includes('\\')
    && PGN_MENTOR_EVENT_FILES.has(file);
  const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); res.end(JSON.stringify({ error: 'Method not allowed' })); return;
  }
  if (!valid) {
    res.writeHead(404, headers); res.end(JSON.stringify({ error: 'Unknown PGN collection' })); return;
  }
  try {
    const upstream = await fetch(`https://www.pgnmentor.com/events/${encodeURIComponent(file)}`, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET', redirect: 'follow',
      headers: { 'User-Agent': 'CAISSA-Chess-PGN-Gateway/1.0 (+https://www.caissa-chess.org/)', Accept: 'application/x-chess-pgn, text/plain;q=0.9, */*;q=0.1' }
    });
    if (!upstream.ok || Number(upstream.headers.get('content-length') || 0) > PGN_MENTOR_MAX_BYTES) throw new Error('Source unavailable');
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/x-chess-pgn; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
      res.end(); return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > PGN_MENTOR_MAX_BYTES || !body.includes(Buffer.from('[Event ')) || !body.includes(Buffer.from('[White ')) || !body.includes(Buffer.from('[Black '))) throw new Error('Invalid PGN');
    res.writeHead(200, { 'Content-Type': 'application/x-chess-pgn; charset=utf-8', 'Content-Disposition': `inline; filename="${file}"`, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-CAISSA-PGN-Source': 'pgnmentor-event' });
    res.end(body);
  } catch {
    res.writeHead(502, headers); res.end(JSON.stringify({ error: 'PGN source unavailable' }));
  }
}

// ============================================================================
// MENTOR AI CHAT PROXY (for LLM API calls)
// ============================================================================

// Remote callers may select a provider, never the server's network destination.
const MENTOR_PROVIDER_ENDPOINTS = Object.freeze({
  together: 'https://api.together.ai/v1/chat/completions',
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
  let decodedPathname = pathname;
  try { decodedPathname = decodeURIComponent(pathname); } catch (_) { /* malformed paths remain unavailable */ }
  const normalizedPathname = decodedPathname.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

  if (pathname === '/api/tablebase/standard') {
    let statusCode = 200;
    await tablebaseHandler({ method: req.method, query: { fen: url.searchParams.getAll('fen').length > 1
      ? url.searchParams.getAll('fen') : url.searchParams.get('fen') } }, {
      setHeader: (name, value) => res.setHeader(name, value),
      status(code) { statusCode = code; return this; },
      json(body) { res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); return this; }
    });
    return;
  }

  if (normalizedPathname === '/scanner/beta/index.html' && pathname !== '/scanner/beta/index.html') {
    res.writeHead(307, { Location: '/scanner/beta', 'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    res.end();
    return;
  }

  if (await scannerBeta.handle(req, res, pathname)) return;

  if (pathname === '/api/beta/access') {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
      return;
    }
    const access = await betaProgram.listForRequest(req);
    res.writeHead(access.ok ? 200 : (access.status || 403), { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(access.ok
      ? { authorized: true, activeExperimentCount: access.experiments.length }
      : { authorized: false }));
    return;
  }

  if (pathname === '/beta' || pathname === '/beta/') {
    const access = await betaProgram.listForRequest(req);
    const betaHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': BETA_PRIVATE_CSP, 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
    if (!access.ok && !access.authenticated && access.status === 401) {
      res.writeHead(302, { ...betaHeaders, Location: `/signin?redirect_url=${encodeURIComponent('/beta')}` });
      res.end();
      return;
    }
    res.writeHead(access.ok ? 200 : (access.status || 403), betaHeaders);
    res.end(req.method === 'HEAD' ? '' : access.ok ? renderBetaCenter(access.experiments, access.activitySummaries) : renderBetaDenied());
    if (access.ok) betaProgram.audit({ userId: access.user.id, eventType: 'beta_center_viewed' });
    return;
  }

  // Developer-only Scanner corpus tooling is served exclusively by its
  // loopback launcher and must never become a public application route.
  if (pathname === '/tools/scanner-localization-annotator'
      || pathname.startsWith('/tools/scanner-localization-annotator/')
      || pathname === '/tools/scanner-piece-label-annotator'
      || pathname.startsWith('/tools/scanner-piece-label-annotator/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Not found');
    return;
  }

  if (pathname === '/scanner/beta' || pathname === '/scanner/beta/' || pathname === '/scanner/beta/index.html') {
    const access = await betaProgram.authorizeExperiment(req, 'scanner');
    const betaHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': BETA_PRIVATE_CSP, 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
    if (!access.ok && !access.authenticated && access.status === 401) {
      res.writeHead(302, { ...betaHeaders, Location: `/signin?redirect_url=${encodeURIComponent('/scanner/beta')}` });
      res.end();
      return;
    }
    if (!access.ok) {
      res.writeHead(access.status || 403, betaHeaders);
      res.end(renderBetaDenied());
      return;
    }
    betaProgram.audit({ userId: access.user.id, experimentId: 'scanner', eventType: 'experiment_opened' });
  }
  if (pathname.startsWith('/scanner/beta/') && process.env.CAISSA_SCANNER_BETA_STAGE !== 'internal') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    res.end('Not found');
    return;
  }

  // Consolidate public blog routes on the canonical no-trailing-slash form.
  if ((pathname === '/index.html' || pathname === '/home.html') && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(308, { Location: '/' });
    res.end();
    return;
  }

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

  if (pathname === '/api/pgn/pgnmentor') {
    await handlePgnMentorEvent(req, res, url);
    return;
  }

  if (pathname === '/api/mentor/chat') {
    res.writeHead(410, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ code: 'MENTOR_PROXY_RETIRED', error: 'Use the authenticated serverless Mentor API.' }));
    return;
  }

  // Local development never grants rollout authority. Production uses the
  // serverless EAE-016 gateway, while the local Arena stays deterministically disabled.
  if (pathname === '/api/eae016') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ enabled: false, eligible: false, authenticated: false,
      reason: 'RELEASE_DISABLED', mode: 'DISABLED', releaseStage: 'DISABLED' }));
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
  const internalPgnMatch = pathname.match(/^\/__caissa_internal_qa\/pgn\/([a-z0-9]+(?:-[a-z0-9]+)*)\.pgn$/);
  if (internalPgnMatch) {
    const assetPath = INTERNAL_QA_ENABLED ? INTERNAL_QA_PGN_ASSETS.get(internalPgnMatch[1]) : null;
    if (!assetPath || !['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(assetPath ? 405 : 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(assetPath ? 'Method Not Allowed' : 'Not Found');
      return;
    }
    fs.readFile(assetPath, (error, content) => {
      if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('Not Found'); return; }
      res.writeHead(200, {
        'Content-Type': 'application/x-chess-pgn',
        'Content-Disposition': 'attachment; filename="fischer-spassky-world-championship-1972.pgn"',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
    return;
  }
  const retiredDestination = RETIRED_PAGE_REDIRECTS.get(pathname.replace(/\/$/, ''));
  if (retiredDestination && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(308, { Location: retiredDestination });
    res.end();
    return;
  }
  let filePath = '.' + pathname;
  let responseStatus = 200;
  if (filePath === './') {
    filePath = './home.html';
    res.setHeader('Cache-Control', 'public, no-store, max-age=0, must-revalidate');
  }
  if (pathname === '/blog') {
    filePath = './blog/index.html';
  }
  if (pathname === '/scanner/beta' || pathname === '/scanner/beta/' || pathname === '/scanner/beta/index.html') {
    filePath = './api/_private/scanner-beta-index.html';
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
  if (pathname === '/mentor' || pathname === '/mentor/') {
    filePath = './mentor.html';
  }
  if (pathname === '/puzzles' || pathname === '/puzzles/') {
    filePath = './puzzles.html';
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
  if (pathname === '/pgn-replayer' || pathname === '/pgn-replayer/') {
    filePath = './pgn-replayer.html';
  }
  if (pathname === '/store' || pathname === '/store/') {
    filePath = './credit-store.html';
  }
  if (pathname === '/support' || pathname === '/support/') {
    filePath = './support.html';
  }
  if (pathname === '/pgn-replayer' || pathname === '/pgn-replayer/') {
    filePath = './pgn-replayer.html';
  }
  if (pathname === '/game-library/champions/replay' || pathname === '/game-library/champions/replay/') {
    filePath = './championship-replay.html';
  }
  if (pathname === '/game-library/champions' || pathname === '/game-library/champions/') {
    filePath = './game-library-champions.html';
  }
  if (pathname === '/academy') {
    filePath = './index.html';
  }
  if (['/insights', '/fics', '/analyze', '/spectator-tv', '/arena', '/cheater-insight',
    '/history', '/dos-chess'].includes(pathname)) {
    filePath = './index.html';
  }
  if (pathname === '/game-library' || pathname === '/game-library/') {
    filePath = './game-library.html';
  }
  if (pathname === '/dos/dos_chess_games.json') {
    filePath = './public/dos/dos_chess_games.json';
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
    const canonicalPublicPlay = betaEntry.authorized
      && ['/play', '/play/games', '/play/bots', '/play/coach'].includes(pathname)
      && !physicalPromotionQA.requested && !ipadAnalyzeDiagnostic.requested;
    res.setHeader('X-Robots-Tag', canonicalPublicPlay ? 'index, follow' : 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', ipadAnalyzeDiagnostic.requested ? PLAY_V2_DIAGNOSTIC_CSP : PLAY_V2_CSP);
    if (betaEntry.authorized) {
      const gameplayPreview = resolvePlayGameplayDeploymentConfig(process.env);
      res.setHeader('X-Caissa-Gameplay-Provider', gameplayPreview.providerKey);
    }
  }
  if (pathname === '/play-v2.html' || pathname === '/play-v2-public-beta.html' || pathname === '/play-v2-invite.html' || pathname === '/play-v2-promotion-qa.html'
      || pathname === '/play-v2-ipad-analyze-diagnostic.html') {
    filePath = './play-v2-unavailable.html';
    responseStatus = 404;
  }
  if (pathname === '/endgame-trainer' || pathname === '/endgame-trainer/') {
    filePath = './endgame-trainer.html';
  }
  if (pathname === '/endgame-library' || pathname === '/endgame-library/') {
    filePath = './endgame-library.html';
  }
  if (pathname === '/endgame-tablebase' || pathname === '/endgame-tablebase/') {
    filePath = './endgame-tablebase.html';
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

  const protectedPlayerPgn = pathname.startsWith('/data/pgn/players/')
    || pathname.startsWith('/public/data/pgn/players/')
    || pathname.startsWith('/api/_private/pgn/');
  if (protectedPlayerPgn) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    res.end(JSON.stringify({ code: 'AUTH_REQUIRED', error: 'Protected player album access requires the CAISSA API.' }));
    return;
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
          res.writeHead(200, { 'Content-Type': mimeType, ...(publicPgn ? { 'Content-Disposition': 'attachment; filename="capablanca-games-1901-1941.pgn"', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } : {}) });
          res.end(req.method === 'HEAD' ? undefined : content2);
        }
      });
    } else if (error) {
      res.writeHead(500);
      res.end('Server Error: ' + error.code, 'utf-8');
    } else {
      const servedContent = betaEntry.authorized && mimeType === 'text/html'
        ? injectPlayGameplayPreviewMarker(content.toString('utf8'), resolvePlayGameplayDeploymentConfig(process.env))
        : content;
      res.writeHead(responseStatus, { 'Content-Type': mimeType });
      res.end(servedContent, 'utf-8');
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
