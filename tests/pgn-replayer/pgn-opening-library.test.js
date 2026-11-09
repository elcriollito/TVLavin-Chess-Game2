import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import AdmZip from 'adm-zip';
import handler, { openingTitle, splitPgnGames } from '../../api/pgn/opening.js';
import { PGN_MENTOR_OPENING_FILES } from '../../api/pgn/pgnmentor-allowlist.js';
import { PGN_MENTOR_OPENING_METADATA } from '../../api/pgn/pgnmentor-opening-metadata.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: new Map(),
    payload: null,
    setHeader(name, value) { this.headers.set(name, value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    send(value) { this.payload = value; return this; },
    end() { return this; }
  };
}

function openingZip(gameCount = 205) {
  const games = Array.from({ length: gameCount }, (_, index) => [
    `[Event "Vienna sample ${index + 1}"]`,
    '[White "White"]',
    '[Black "Black"]',
    '[Result "*"]',
    '',
    '1. e4 e5 2. Nc3 Nf6 *'
  ].join('\n')).join('\n\n');
  const zip = new AdmZip();
  zip.addFile('Vienna.pgn', Buffer.from(games));
  return zip.toBuffer();
}

function metadataForZip(zipBytes, gameCount = 205) {
  const entry = new AdmZip(zipBytes).getEntries().find(item => !item.isDirectory && /\.pgn$/i.test(item.entryName));
  return {
    'Vienna.zip': {
      games: gameCount,
      pages: Math.ceil(gameCount / 100),
      zipBytes: zipBytes.byteLength,
      pgnBytes: entry?.getData().byteLength || 0,
      zipSha256: createHash('sha256').update(zipBytes).digest('hex')
    }
  };
}

const allowAllRequests = () => ({ allowed: true, remaining: 19 });

test('publishes a searchable 233-item free opening catalog with readable titles', async () => {
  const response = responseRecorder();
  await handler({ method: 'GET', query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.access, 'free');
  assert.equal(response.payload.pageSize, 100);
  assert.equal(response.payload.count, 233);
  assert.equal(response.payload.openings.length, 233);
  assert.ok(response.payload.openings.every(item => Number.isInteger(item.games) && Number.isInteger(item.pages)));
  assert.equal(openingTitle('Caro-KannAdv.zip'), 'Caro–Kann Advance');
  assert.ok(response.payload.openings.some(item => item.file === 'Vienna.zip' && item.title === 'Vienna'));
});

test('trusted metadata covers every allowlisted archive with bounded, hashed records', () => {
  assert.deepEqual(Object.keys(PGN_MENTOR_OPENING_METADATA).sort(), [...PGN_MENTOR_OPENING_FILES].sort());
  for (const metadata of Object.values(PGN_MENTOR_OPENING_METADATA)) {
    assert.ok(Number.isInteger(metadata.games) && metadata.games > 0);
    assert.equal(metadata.pages, Math.ceil(metadata.games / 100));
    assert.ok(Number.isInteger(metadata.zipBytes) && metadata.zipBytes > 0 && metadata.zipBytes <= 32 * 1024 * 1024);
    assert.ok(Number.isInteger(metadata.pgnBytes) && metadata.pgnBytes > 0 && metadata.pgnBytes <= 96 * 1024 * 1024);
    assert.match(metadata.zipSha256, /^[a-f0-9]{64}$/);
  }
});

test('extracts one allowlisted opening ZIP and returns bounded 100-game PGN pages', async () => {
  const zip = openingZip();
  const fetch = async () => new Response(zip, { status: 200, headers: { 'content-length': String(zip.byteLength) } });
  const dependencies = { fetch, openingMetadata: metadataForZip(zip), rateLimiter: allowAllRequests };
  const first = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' } }, first, dependencies);
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers.get('X-CAISSA-PGN-Source'), 'pgnmentor-opening-paged');
  assert.equal(first.headers.get('X-CAISSA-Opening-Page'), '1');
  assert.equal(first.headers.get('X-CAISSA-Opening-Pages'), '3');
  assert.equal(first.headers.get('X-CAISSA-Opening-Games'), '205');
  assert.equal(first.headers.get('X-CAISSA-Opening-Page-Games'), '100');
  assert.equal(splitPgnGames(first.payload.toString('utf8')).length, 100);

  const last = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '3' } }, last, dependencies);
  assert.equal(last.statusCode, 200);
  assert.equal(last.headers.get('X-CAISSA-Opening-Page-Games'), '5');
  assert.equal(splitPgnGames(last.payload.toString('utf8')).length, 5);
});

test('rejects unknown files, traversal, noncanonical pages, and impossible pages before fetch', async () => {
  let fetchCalls = 0;
  const fetch = async () => { fetchCalls += 1; return new Response(openingZip()); };
  const metadata = metadataForZip(openingZip());
  for (const query of [
    { file: '../Vienna.zip', page: '1' },
    { file: 'NotInCatalog.zip', page: '1' },
    { file: ['Vienna.zip', 'Vienna.zip'], page: '1' },
    { file: 'Vienna.zip', page: '0' },
    { file: 'Vienna.zip', page: '01' },
    { file: 'Vienna.zip', page: '1junk' },
    { file: 'Vienna.zip', page: '1.5' },
    { file: 'Vienna.zip', page: ['1', '2'] },
    { file: 'Vienna.zip', page: '4' },
    { file: 'Vienna.zip', page: '10000' },
    { file: 'Vienna.zip', page: '1', cacheAlias: '1' }
  ]) {
    const response = responseRecorder();
    await handler({ method: 'GET', query }, response, { fetch, openingMetadata: metadata, rateLimiter: allowAllRequests });
    assert.ok([400, 404].includes(response.statusCode));
  }
  assert.equal(fetchCalls, 0);
});

test('fails closed when an upstream archive no longer matches trusted game metadata', async () => {
  const zip = openingZip();
  const staleMetadata = metadataForZip(zip, 206);
  const response = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' } }, response, {
    fetch: async () => new Response(zip, { status: 200, headers: { 'content-length': String(zip.byteLength) } }),
    openingMetadata: staleMetadata,
    rateLimiter: allowAllRequests
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.payload, { error: 'Opening source unavailable' });
});

test('rate limiting rejects valid pages before upstream archive work', async () => {
  let fetchCalls = 0;
  const zip = openingZip();
  const response = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' }, headers: {} }, response, {
    fetch: async () => { fetchCalls += 1; return new Response(zip); },
    openingMetadata: metadataForZip(zip),
    rateLimiter: () => ({ allowed: false, remaining: 0, retryAfter: 27 })
  });
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers.get('Retry-After'), '27');
  assert.equal(fetchCalls, 0);
});

test('rate-limit identity accepts only Vercel-authenticated client IP metadata in hosted runtime', async () => {
  const zip = openingZip();
  const keys = [];
  const rateLimiter = key => { keys.push(key); return { allowed: true, remaining: 19 }; };
  const baseRequest = {
    method: 'GET',
    query: { file: 'Vienna.zip', page: '1' },
    socket: { remoteAddress: '127.0.0.1' }
  };
  const dependencies = {
    fetch: async () => new Response(zip),
    openingMetadata: metadataForZip(zip),
    rateLimiter
  };

  await handler({ ...baseRequest, headers: { 'x-forwarded-for': '198.51.100.9' } }, responseRecorder(), {
    ...dependencies,
    env: {}
  });
  await handler({ ...baseRequest, headers: { 'x-vercel-forwarded-for': '198.51.100.9' } }, responseRecorder(), {
    ...dependencies,
    env: { VERCEL: '1' }
  });
  await handler({ ...baseRequest, headers: { 'x-forwarded-for': '198.51.100.10' } }, responseRecorder(), {
    ...dependencies,
    env: { VERCEL: '1' }
  });

  assert.match(keys[0], /^opening-source:[a-f0-9]{64}$/);
  assert.match(keys[1], /^opening-source:[a-f0-9]{64}$/);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[2], 'opening-source:unverified');
  assert.ok(keys.every(key => !key.includes('198.51.100')));
});

test('aborts archive reads that exceed the exact trusted byte length', async () => {
  const zip = openingZip();
  const response = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' }, headers: {} }, response, {
    fetch: async () => new Response(Buffer.concat([zip, Buffer.from([0])])),
    openingMetadata: metadataForZip(zip),
    rateLimiter: allowAllRequests
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.payload, { error: 'Opening source unavailable' });
});

test('rejects multi-PGN archives after bounded integrity checks', async () => {
  const archive = new AdmZip();
  archive.addFile('one.pgn', Buffer.from('[Event "One"]\n[White "W"]\n[Black "B"]\n\n1. e4 *'));
  archive.addFile('two.pgn', Buffer.from('[Event "Two"]\n[White "W"]\n[Black "B"]\n\n1. d4 *'));
  const archiveBytes = archive.toBuffer();
  const response = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' } }, response, {
    fetch: async () => new Response(archiveBytes, { status: 200 }),
    openingMetadata: metadataForZip(archiveBytes, 1),
    rateLimiter: allowAllRequests
  });
  assert.equal(response.statusCode, 502);
});

test('opening UI keeps the family visible and exposes page navigation in Games', () => {
  const html = read('pgn-replayer.html');
  const controller = read('js/pgn-replayer/pgn-opening-library.js');
  const styles = read('css/pgn-replayer.css');
  assert.match(html, /data-pgn-library-count="openings"/);
  assert.match(html, /data-pgn-opening-pagebar/);
  assert.match(html, /data-pgn-opening-back/);
  assert.match(html, /data-pgn-opening-previous/);
  assert.match(html, /data-pgn-opening-next/);
  assert.match(controller, /catalog\.openings\.length !== 233/);
  assert.match(controller, /caissa:pgn-load-text/);
  assert.match(controller, /new MutationObserver\(queueCatalogRender\)\.observe\(albumRoot, \{ childList: true \}\)/);
  assert.match(controller, /openingPage: true/);
  assert.match(controller, /backButton\.addEventListener\('click', returnToOpeningLibrary\)/);
  assert.match(controller, /librarySearch\.focus\(\{ preventScroll: true \}\)/);
  assert.match(styles, /\.pgn-opening-pagebar/);
  assert.match(styles, /\.pgn-library-nav \{[^}]*position: sticky;[^}]*width: 100%;[^}]*flex: 0 0 auto/);
});
