// Simple HTTP Server for TVLavin Chess Game
// Usage: node server.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8000;

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
    endpoints: ['/api/health', '/api/lichess/games', '/api/mentor/chat']
  }));
}

// ============================================================================
// MENTOR AI CHAT PROXY (for LLM API calls)
// ============================================================================

// Allowed providers for validation
const ALLOWED_PROVIDERS = ['together', 'llama', 'openai', 'anthropic', 'local', 'custom'];

// Input validation limits
const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 100000; // 100KB per message

// API base URLs (can be overridden via env vars)
const LLAMA_API_BASE_URL = process.env.LLAMA_API_BASE_URL || 'https://api.llama.com';
const TOGETHER_API_BASE_URL = process.env.TOGETHER_API_BASE_URL || 'https://api.together.xyz';

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

    // Validate provider
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown provider: ${provider}. Allowed: ${ALLOWED_PROVIDERS.join(', ')}` }));
      return;
    }

    // API key required for non-local providers
    if (provider !== 'local' && !apiKey) {
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

    let apiUrl, headers, requestBody;

    // Configure request based on provider
    switch (provider) {
      case 'together':
        // Together.ai - cost-efficient LLaMA hosting
        apiUrl = `${TOGETHER_API_BASE_URL}/v1/chat/completions`;
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
        apiUrl = `${LLAMA_API_BASE_URL}/v1/chat/completions`;
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
        apiUrl = 'https://api.anthropic.com/v1/messages';
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

      case 'local':
        apiUrl = 'http://localhost:1234/v1/chat/completions';
        headers = { 'Content-Type': 'application/json' };
        requestBody = JSON.stringify({
          model: model || 'local-model',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;

      case 'openai':
        apiUrl = 'https://api.openai.com/v1/chat/completions';
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

      case 'custom':
      default:
        // Custom endpoint - use OpenAI-compatible format
        apiUrl = data.endpoint || 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        requestBody = JSON.stringify({
          model: model || 'default',
          messages,
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7
        });
        break;
    }

    // Make API request
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: requestBody
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
      // OpenAI-compatible format (llama, openai, local, custom)
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

  // API Routes
  if (pathname === '/api/health') {
    handleHealthCheck(res);
    return;
  }

  if (pathname === '/api/lichess/games') {
    await handleLichessProxy(req, res, url);
    return;
  }

  if (pathname === '/api/mentor/chat') {
    await handleMentorChat(req, res);
    return;
  }

  // Static file serving
  let filePath = '.' + pathname;
  if (filePath === './') {
    filePath = './index.html';
  }
  if (pathname === '/blog') {
    filePath = './blog/index.html';
  }
  if (pathname === '/about' || pathname === '/about/') {
    filePath = './about.html';
  }
  if (pathname === '/endgame-trainer' || pathname === '/endgame-trainer/') {
    filePath = './endgame-trainer.html';
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

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = MIME_TYPES[extname] || 'application/octet-stream';

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
          res.writeHead(200, { 'Content-Type': mimeType });
          res.end(content2, 'utf-8');
        }
      });
    } else if (error) {
      res.writeHead(500);
      res.end('Server Error: ' + error.code, 'utf-8');
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('  TVLavin Chess - Server Running!');
  console.log('========================================');
  console.log('');
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`  Network: http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  Press Ctrl+C to stop the server');
  console.log('========================================');
  console.log('');
});
