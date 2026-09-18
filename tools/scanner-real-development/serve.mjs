import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import './../../scanner/recognition/scanner-board-geometry.js';
import { build } from './build-manifest.mjs';
import { ANNOTATION_ROOT, SOURCE_ROOT, deriveIndexes, hash, summary, validateManifest } from './core.mjs';
import { createDevelopmentStore } from './store.mjs';

const toolRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolRoot, '../..');
const manifestPath = join(repoRoot, 'scanner/recognition/datasets/real-development/real-development-v0.1.json');
const defaultOutput = join(ANNOTATION_ROOT, 'real-development-v0.1.annotations.json');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/annotator.css', ['annotator.css', 'text/css; charset=utf-8']],
  ['/annotator-app.js', ['annotator-app.js', 'text/javascript; charset=utf-8']]
]);
const sourceRoute = /^\/api\/source\/(dev-real-v0\.1-\d{3})$/;
const boardRoute = /^\/api\/board\/(dev-real-v0\.1-\d{3})$/;
const pieceRoute = /^\/piece\/([wb][KQRBNP]\.png)$/;
const CSP = "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

function send(response, status, body, type = 'application/json; charset=utf-8', method = 'GET') {
  response.writeHead(status, { 'Content-Type': type });
  response.end(method === 'HEAD' ? undefined : body);
}

async function readJson(request) {
  if (request.headers['content-type'] !== 'application/json') throw new Error('json-content-type-required');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new Error('request-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function createDevelopmentAnnotatorServer({ port = 4181, sourceRoot = SOURCE_ROOT,
  outputPath = defaultOutput, manifest = null, protectedCatalog = null } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('invalid-port');
  let catalog = protectedCatalog;
  let certified = manifest;
  let manifestSha256;
  if (!certified) {
    const live = await build({ sourceRoot });
    const committed = await readFile(manifestPath);
    // Git's Windows checkout may change LF to CRLF; corpus identity is the
    // canonical JSON content, not the checkout's text-file line endings.
    certified = JSON.parse(committed);
    if (hash(Buffer.from(`${JSON.stringify(certified, null, 2)}\n`)) !== live.manifestSha256) {
      throw new Error('source-or-audit-manifest-changed-rebuild-required');
    }
    catalog = await (async () => {
      const { protectedSources } = await import('./core.mjs');
      const parent = resolve(repoRoot, '..');
      return protectedSources({ repoRoot,
        corpusV01: join(parent, 'caissa_scanner_real_localization_corpus_v0_1'),
        corpusV03: join(parent, 'caissa_scanner_real_localization_corpus_v0_3'),
        truthPath: join(parent, 'caissa_scanner_piece_labels_v0_1/piece-labels-v0.1.json') });
    })();
    manifestSha256 = live.manifestSha256;
  } else {
    if (!catalog) throw new Error('protected-catalog-required');
    manifestSha256 = hash(Buffer.from(`${JSON.stringify(certified, null, 2)}\n`));
  }
  validateManifest(certified, catalog);
  const store = createDevelopmentStore({ manifest: certified, manifestSha256, protectedCatalog: catalog,
    sourceRoot, outputPath, repoRoot });
  await store.readState(); // Reject corrupt or stale truth before serving any image.
  const byId = new Map(certified.samples.map((sample) => [sample.sampleId, sample]));
  const verifySource = async (sample) => {
    const bytes = await readFile(join(sourceRoot, sample.sourceFilename));
    if (hash(bytes) !== sample.sourceSha256) throw new Error('source-checksum-mismatch');
    return bytes;
  };
  let boundPort = null;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // A request already accepted before close() can outlive server.address().
    // Keep the originally bound port for same-origin checks during shutdown.
    const origin = `http://127.0.0.1:${boundPort}`;
    if (request.headers.host !== `127.0.0.1:${boundPort}`) {
      send(response, 403, 'Forbidden', 'text/plain; charset=utf-8', request.method);
      return;
    }
    const pathname = new URL(request.url || '/', origin).pathname;
    try {
      if (request.method === 'POST' && ['/api/save', '/api/activate'].includes(pathname)) {
        if (request.headers.origin !== origin || request.headers['x-caissa-local-tool'] !== 'real-development-annotator') {
          send(response, 403, JSON.stringify({ error: 'same-origin-local-tool-required' }));
          return;
        }
        const body = await readJson(request);
        if (pathname === '/api/activate') {
          const workspace = await store.savePosition(body.sampleId, body.incompleteOnly);
          send(response, 200, JSON.stringify({ workspace }));
        } else {
          if (!Object.hasOwn(body, 'expectedRevision')
            || (body.expectedRevision !== null && !/^[A-F0-9]{64}$/.test(body.expectedRevision))) {
            throw new Error('expected-revision-required');
          }
          const result = await store.saveRecord(body.record, body.expectedRevision);
          send(response, 200, JSON.stringify({ record: result.record, revision: result.revision,
            coverage: summary(certified, result.annotations), indexCounts: {
              empty: result.indexes.empty.length, occupied: result.indexes.occupied.length,
              kingContrast: result.indexes.kingContrast.length } }));
        }
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD, POST /api/save, POST /api/activate');
        send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8', request.method);
        return;
      }
      if (pathname === '/api/samples' || pathname === '/api/indexes') {
        const state = await store.readState();
        const payload = pathname === '/api/indexes' ? deriveIndexes(certified, state.annotations)
          : { samples: certified.samples, records: state.annotations.samples,
            revisions: Object.fromEntries(state.annotations.samples.map((item) => [item.sampleId, store.revision(item)])),
            workspace: state.workspace, recovery: state.recovery, coverage: summary(certified, state.annotations),
            outputPath: store.outputPath, manifestSha256 };
        send(response, 200, JSON.stringify(payload), 'application/json; charset=utf-8', request.method);
        return;
      }
      const sourceMatch = sourceRoute.exec(pathname);
      if (sourceMatch) {
        const sample = byId.get(sourceMatch[1]);
        if (!sample) { send(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method); return; }
        const bytes = await verifySource(sample);
        const mime = extname(sample.sourceFilename).toLowerCase() === '.png' ? 'image/png'
          : extname(sample.sourceFilename).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
        send(response, 200, bytes, mime, request.method);
        return;
      }
      const boardMatch = boardRoute.exec(pathname);
      if (boardMatch) {
        const sample = byId.get(boardMatch[1]);
        const record = (await store.readState()).annotations.samples.find((item) => item.sampleId === sample?.sampleId);
        if (!sample || !record || !['corners-verified', 'pieces-draft', 'human-verified'].includes(record.status)) {
          send(response, 404, 'Verified corners required', 'text/plain; charset=utf-8', request.method); return;
        }
        const bytes = await verifySource(sample);
        const scale = Math.min(1, 2048 / Math.max(sample.sourceWidth, sample.sourceHeight),
          Math.sqrt(4_000_000 / (sample.sourceWidth * sample.sourceHeight)));
        const { data, info } = await sharp(bytes, { failOn: 'error' }).rotate()
          .resize(Math.round(sample.sourceWidth * scale), Math.round(sample.sourceHeight * scale), { fit: 'fill' })
          .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        const corners = record.corners.map(([x, y]) => [x * info.width / sample.sourceWidth,
          y * info.height / sample.sourceHeight]);
        const board = globalThis.CaissaScannerBoardGeometry.rectifyBoard({ pixels, width: info.width,
          height: info.height, corners, boardSize: 512 });
        const png = await sharp(Buffer.from(board.pixels), { raw: { width: 512, height: 512, channels: 4 } })
          .png().toBuffer();
        send(response, 200, png, 'image/png', request.method);
        return;
      }
      const pieceMatch = pieceRoute.exec(pathname);
      if (pieceMatch) {
        send(response, 200, await readFile(join(repoRoot, 'img/chesspieces/wikipedia', pieceMatch[1])),
          'image/png', request.method);
        return;
      }
      const staticEntry = staticFiles.get(pathname);
      if (staticEntry) {
        send(response, 200, await readFile(join(toolRoot, staticEntry[0])), staticEntry[1], request.method);
        return;
      }
      if (pathname === '/piece-label-core.js') {
        send(response, 200, await readFile(join(repoRoot, 'tools/scanner-piece-label-annotator/piece-label-core.js')),
          'text/javascript; charset=utf-8', request.method);
        return;
      }
      send(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method);
    } catch (error) {
      const reason = String(error?.message || error);
      const status = reason.includes('checksum') || reason.includes('changed') || reason.includes('corrupt') ? 409
        : reason.includes('required') || reason.includes('invalid') || reason.includes('unknown')
          || reason.includes('mismatch') || reason.includes('excluded') || reason.includes('protected') ? 400 : 500;
      send(response, status, JSON.stringify({ error: reason }), 'application/json; charset=utf-8', request.method);
    }
  });
  return new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      boundPort = server.address().port;
      resolveReady({ server, store, manifest: certified,
        url: `http://127.0.0.1:${boundPort}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())) });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.find((item) => item.startsWith('--port='))?.slice(7) || '4181');
  createDevelopmentAnnotatorServer({ port }).then((running) => {
    process.stdout.write(`CAISSA real-development annotator: ${running.url}\n`);
    process.stdout.write(`Sources: ${running.manifest.samples.length}; truth: ${running.store.outputPath}\n`);
    process.stdout.write('Loopback only. No Chessvision, uploads, training, or production Scanner UI.\n');
    const stop = async () => { await running.close(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
