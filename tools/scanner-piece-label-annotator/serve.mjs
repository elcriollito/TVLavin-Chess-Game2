import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPieceRecord, coverageReport } from './piece-label-core.js';
import { DEFAULT_OUTPUT, loadPieceCatalog, rectifiedBoardPng, verifySourceImage } from './catalog.js';
import { createPieceStore, recordRevision } from './store.js';

const TOOL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_ROOT, '../..');
const STATIC = Object.freeze({
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/annotator.css': ['annotator.css', 'text/css; charset=utf-8'],
  '/annotator-app.js': ['annotator-app.js', 'text/javascript; charset=utf-8'],
  '/annotator-app-v2.js': ['annotator-app-v2.js', 'text/javascript; charset=utf-8'],
  '/piece-label-core.js': ['piece-label-core.js', 'text/javascript; charset=utf-8']
});
const PIECE_ASSET = /^\/piece\/([wb][KQRBNP]\.png)$/;
const SAMPLE_BOARD = /^\/api\/board\/([a-zA-Z0-9-]+)$/;
const CSP = "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

function send(response, status, body, contentType = 'application/json; charset=utf-8', method = 'GET') {
  response.writeHead(status, { 'Content-Type': contentType });
  response.end(method === 'HEAD' ? undefined : body);
}

function clientSample(sample) {
  const { sourcePath, corners, ...safe } = sample;
  return safe;
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error('request-too-large');
    chunks.push(chunk);
  }
  if (request.headers['content-type'] !== 'application/json') throw new Error('json-content-type-required');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function createPieceAnnotatorServer({ port = 4179, outputPath = DEFAULT_OUTPUT, catalog = null,
  corpusV01, corpusV03 } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('invalid-port');
  const certified = catalog || await loadPieceCatalog({ corpusV01, corpusV03 });
  const store = createPieceStore({ outputPath, catalog: certified });
  const startupState = await store.readState();
  const boardCache = new Map(); // Compressed 512px boards only; original decoded buffers are never retained.
  const pieceCache = new Map();
  // Capture the bound origin once. server.address() becomes null as soon as
  // teardown starts, while a browser may still finish an already accepted request.
  let localOrigin = '';
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!localOrigin || request.headers.host !== new URL(localOrigin).host) {
      send(response, 403, 'Forbidden', 'text/plain; charset=utf-8', request.method);
      return;
    }
    const pathname = new URL(request.url || '/', localOrigin).pathname;
    try {
      if (request.method === 'POST' && (pathname === '/api/save' || pathname === '/api/activate')) {
        if (request.headers.origin !== localOrigin || request.headers['x-caissa-local-tool'] !== 'piece-label-annotator') {
          send(response, 403, JSON.stringify({ error: 'same-origin-local-tool-required' }));
          return;
        }
        const body = await readJson(request);
        if (pathname === '/api/activate') {
          const workspace = await store.savePosition(body.sampleId, body.incompleteOnly);
          send(response, 200, JSON.stringify({ lastActiveSampleId: workspace.lastActiveSampleId,
            incompleteOnly: workspace.incompleteOnly }));
          return;
        }
        const sample = certified.samples.find((item) => item.sampleId === body.sampleId);
        if (!sample) throw new Error('unknown-piece-sample');
        if (!Object.hasOwn(body, 'expectedRecordRevision')
            || (body.expectedRecordRevision !== null && !/^[A-F0-9]{64}$/.test(body.expectedRecordRevision))) {
          throw new Error('expected-record-revision-required');
        }
        const record = createPieceRecord(sample, body);
        const before = await store.readState();
        const canonical = before.manifest.samples.find((item) => item.sampleId === sample.sampleId);
        const result = record.annotation.status === 'draft' && canonical?.annotation.status === 'verified'
          ? await store.saveVerifiedDraft(record, body.expectedRecordRevision)
          : await store.saveRecord(record, body.expectedRecordRevision);
        send(response, 200, JSON.stringify({ record, saveTarget: result.workingDraft ? 'verified-workspace' : 'manifest',
          canonicalRevision: recordRevision(result.manifest.samples.find((item) => item.sampleId === sample.sampleId)),
          coverage: coverageReport(certified, result.manifest) }));
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD, POST /api/save, POST /api/activate');
        send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8', request.method);
        return;
      }
      if (pathname === '/api/samples') {
        const current = await store.readState();
        send(response, 200, JSON.stringify({ samples: certified.samples.map(clientSample), records: current.manifest.samples,
          revisions: Object.fromEntries(current.manifest.samples.map((item) => [item.sampleId, recordRevision(item)])),
          workingDrafts: current.workspace.verifiedDrafts.map((item) => item.record),
          workspace: { lastActiveSampleId: current.workspace.lastActiveSampleId,
            incompleteOnly: current.workspace.incompleteOnly },
          recovery: current.recovery.length ? current.recovery : startupState.recovery,
          ignoredStaleDrafts: current.ignoredStaleDrafts,
          duplicateAliases: certified.duplicateAliases, outOfScope: certified.outOfScope,
          coverage: coverageReport(certified, current.manifest), outputPath: store.outputPath }),
        'application/json; charset=utf-8', request.method);
        return;
      }
      if (pathname === '/api/coverage') {
        send(response, 200, JSON.stringify(coverageReport(certified, await store.read())),
          'application/json; charset=utf-8', request.method);
        return;
      }
      const boardMatch = SAMPLE_BOARD.exec(pathname);
      if (boardMatch) {
        const sample = certified.samples.find((item) => item.sampleId === boardMatch[1]);
        if (!sample) { send(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method); return; }
        await verifySourceImage(sample);
        let png = boardCache.get(sample.sampleId);
        if (png) { boardCache.delete(sample.sampleId); boardCache.set(sample.sampleId, png); }
        else {
          png = await rectifiedBoardPng(sample);
          boardCache.set(sample.sampleId, png);
          if (boardCache.size > 4) boardCache.delete(boardCache.keys().next().value);
        }
        send(response, 200, png, 'image/png', request.method);
        return;
      }
      const pieceMatch = PIECE_ASSET.exec(pathname);
      if (pieceMatch) {
        let png = pieceCache.get(pieceMatch[1]);
        if (!png) { png = await readFile(join(REPO_ROOT, 'img/chesspieces/wikipedia', pieceMatch[1])); pieceCache.set(pieceMatch[1], png); }
        response.setHeader('Cache-Control', 'private, max-age=86400');
        send(response, 200, png, 'image/png', request.method);
        return;
      }
      const staticEntry = STATIC[pathname === '/' ? '/index.html' : pathname];
      if (staticEntry) {
        const bytes = await readFile(join(TOOL_ROOT, staticEntry[0]));
        send(response, 200, bytes, staticEntry[1], request.method);
        return;
      }
      send(response, 404, 'Not found', 'text/plain; charset=utf-8', request.method);
    } catch (error) {
      const reason = String(error?.message || error);
      const status = reason.includes('checksum') || reason.includes('corpus-identity') || reason.includes('changed-reload')
        || reason.includes('record-protected') ? 409
        : reason.includes('required') || reason.includes('invalid') || reason.includes('unknown') || reason.includes('mismatch')
          || reason.includes('duplicate') || reason.includes('fen-') || reason.includes('out-of-range') ? 400 : 500;
      send(response, status, JSON.stringify({ error: reason }), 'application/json; charset=utf-8', request.method);
    }
  });
  return new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      localOrigin = `http://127.0.0.1:${address.port}`;
      resolveReady({ server, url: localOrigin, catalog: certified, store,
        close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose())) });
    });
  });
}

async function main() {
  const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const port = Number(argument('port', '4179'));
  const running = await createPieceAnnotatorServer({ port, outputPath: argument('output', DEFAULT_OUTPUT),
    corpusV01: argument('corpus-v01', undefined), corpusV03: argument('corpus-v03', undefined) });
  process.stdout.write(`CAISSA local piece-label annotator: ${running.url}\n`);
  process.stdout.write(`Verified-corner 2D boards: ${running.catalog.samples.length}; output: ${running.store.outputPath}\n`);
  process.stdout.write('Loopback only. No upload, telemetry, training, or source-image changes.\n');
  const stop = async () => { await running.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
