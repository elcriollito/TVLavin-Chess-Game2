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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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
    endpoints: ['/api/health', '/api/lichess/games']
  }));
}

// ============================================================================
// MAIN SERVER
// ============================================================================

const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API Routes
  if (pathname === '/api/health') {
    handleHealthCheck(res);
    return;
  }

  if (pathname === '/api/lichess/games') {
    await handleLichessProxy(req, res, url);
    return;
  }

  // Static file serving
  let filePath = '.' + pathname;
  if (filePath === './') {
    filePath = './index.html';
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
