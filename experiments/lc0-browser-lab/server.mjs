import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.LC0_LAB_PORT || 8789);
const host = '127.0.0.1';
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.wasm', 'application/wasm'],
  ['.gz', 'application/gzip']
]);

const server = http.createServer(async (request, response) => {
  setIsolationHeaders(response);
  if (!['GET', 'HEAD'].includes(request.method || '')) return end(response, 405, 'Method not allowed');
  const url = new URL(request.url || '/', `http://${host}:${port}`);
  if (url.pathname === '/health') return end(response, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8');

  const mapping = url.pathname.startsWith('/artifacts/')
    ? { base: path.join(root, '.artifacts'), relative: url.pathname.slice('/artifacts/'.length) }
    : { base: path.join(root, 'dist'), relative: url.pathname === '/' ? 'index.html' : url.pathname.slice(1) };
  const candidate = path.resolve(mapping.base, mapping.relative);
  if (!candidate.startsWith(`${path.resolve(mapping.base)}${path.sep}`)) return end(response, 403, 'Forbidden');
  try {
    if (!(await stat(candidate)).isFile()) return end(response, 404, 'Not found');
    const body = await readFile(candidate);
    response.writeHead(200, { 'Content-Type': types.get(path.extname(candidate)) || 'application/octet-stream', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { end(response, 404, 'Not found'); }
});

server.listen(port, host, () => console.log(`LC0_LAB_READY http://${host}:${port}`));

function setIsolationHeaders(response) {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
}

function end(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}
