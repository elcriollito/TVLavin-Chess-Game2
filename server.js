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

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = MIME_TYPES[extname] || 'application/octet-stream';

  // Try to read from root first, then from public/ folder
  fs.readFile(filePath, (error, content) => {
    if (error && error.code === 'ENOENT') {
      // Try public/ folder as fallback (for favicons, manifest, etc.)
      const publicPath = './public' + req.url;
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
