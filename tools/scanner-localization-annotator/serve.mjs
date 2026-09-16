import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ALLOWED_FILES = new Set(['/index.html', '/annotator.css', '/annotator-app.js', '/annotator-core.js']);
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
});

export function createAnnotatorServer({ host = '127.0.0.1', port = 4178 } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}`);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    if (!ALLOWED_FILES.has(pathname)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    try {
      const body = await readFile(resolve(TOOL_ROOT, `.${pathname}`));
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(pathname)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Local annotator file unavailable');
    }
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolvePromise({
        server,
        url: `http://${host}:${actualPort}`,
        close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
      });
    });
  });
}

async function main() {
  const portArg = process.argv.find((argument) => argument.startsWith('--port='));
  const port = portArg ? Number(portArg.slice('--port='.length)) : 4178;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid --port value.');
  const running = await createAnnotatorServer({ port });
  process.stdout.write(`CAISSA local annotator: ${running.url}\n`);
  process.stdout.write('Open this URL in Chrome or Edge, then select the extracted corpus folder.\n');
  const stop = async () => {
    await running.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
