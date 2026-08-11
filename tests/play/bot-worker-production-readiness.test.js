import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildPublicRelease } from '../../scripts/build-public-release.mjs';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical Worker URL has one immutable registry source and no override channel', async () => {
    const [registry, adapter, contract] = await Promise.all([
        read('js/engine-registry.js'), read('js/engine-adapter.js'), read('js/play/bots/bot-worker-readiness.js')
    ]);
    assert.equal((registry.match(/workerPath: '\/engine\/stockfish-working\.js'/g) || []).length, 2);
    assert.doesNotMatch(registry + adapter + contract, /searchParams.*worker|localStorage.*worker|sessionStorage.*worker/i);
    assert.match(adapter, /workerUrl !== '\/engine\/stockfish-working\.js'/);
    assert.match(contract, /canonicalWorkerUrl: WORKER_URL/);
});

test('bundled asset provenance, digest, embedded GPL attribution, and notice are pinned', async () => {
    const bytes = await readFile(new URL('../../engine/stockfish-working.js', import.meta.url));
    const notice = await read('engine/STOCKFISH-NOTICE.md');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),
        '723fda70117bfa8d5053a7bc4ae50cdc96dc9e3fd41b57627e4dfa0a0025957a');
    assert.match(bytes.subarray(0, 800).toString(), /GNU General Public License v3/);
    assert.match(notice, /stockfish\.js@10\.0\.2/);
    assert.match(notice, /f8659abcf87ba914a7bafe7e04cb15b8a0625018/);
    assert.match(notice, /723fda70117bfa8d5053a7bc4ae50cdc96dc9e3fd41b57627e4dfa0a0025957a/i);
});

test('Play v2 build and hosting policy use self-only Worker CSP without unsafe eval', async () => {
    const [html, server, vercel] = await Promise.all([read('play-v2.html'), read('server.js'), read('vercel.json')]);
    assert.match(html, /worker-src 'self';/);
    assert.doesNotMatch(html, /worker-src[^;]*(?:blob:|https?:|\*)/);
    assert.doesNotMatch(html, /script-src[^;]*'unsafe-eval'/);
    assert.match(server, /PLAY_V2_CSP = "[^"]*worker-src 'self';/);
    assert.doesNotMatch(server.match(/PLAY_V2_CSP = "[^"]+"/)?.[0] || '', /'unsafe-eval'|worker-src[^;]*(?:blob:|https?:|\*)/);
    const hosting = JSON.parse(vercel);
    const playHeaders = hosting.headers.filter(item => item.source === '/play' || item.source === '/play/:path*');
    assert.equal(playHeaders.length, 2);
    for (const item of playHeaders) {
        const csp = item.headers.find(header => header.key === 'Content-Security-Policy')?.value || '';
        assert.match(csp, /worker-src 'self'/); assert.doesNotMatch(csp, /worker-src[^;]*(?:blob:|https?:|\*)/);
    }
});

test('production-equivalent output contains exact Worker and notice assets', async () => {
    const output = await mkdtemp(join(tmpdir(), 'caissa-worker-readiness-'));
    try {
        await buildPublicRelease({ cwd: fileURLToPath(new URL('../..', import.meta.url)), output });
        assert.equal((await stat(join(output, 'engine', 'stockfish-working.js'))).size, 1579948);
        assert.equal((await stat(join(output, 'engine', 'STOCKFISH-NOTICE.md'))).isFile(), true);
    } finally { await rm(output, { recursive: true, force: true }); }
});

test('Native Bots contract and implementation prohibit fallback, transport, and sensitive diagnostics', async () => {
    const source = await read('js/play/bots/bot-worker-readiness.js');
    for (const declaration of ["silentFallback: 'prohibited'", "ficsFallback: 'prohibited'",
        "remoteFallback: 'prohibited'", "analyticsTransport: 'disabled'"]) assert.match(source, new RegExp(declaration));
    assert.doesNotMatch(source, /fetch\(|WebSocket|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|indexedDB|PGN|FEN|moves/i);
});
