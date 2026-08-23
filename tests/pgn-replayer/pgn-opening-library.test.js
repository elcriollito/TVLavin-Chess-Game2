import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import AdmZip from 'adm-zip';
import handler, { openingTitle, splitPgnGames } from '../../api/pgn/opening.js';

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

test('publishes a searchable 233-item free opening catalog with readable titles', async () => {
  const response = responseRecorder();
  await handler({ method: 'GET', query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.access, 'free');
  assert.equal(response.payload.pageSize, 100);
  assert.equal(response.payload.count, 233);
  assert.equal(response.payload.openings.length, 233);
  assert.equal(openingTitle('Caro-KannAdv.zip'), 'Caro–Kann Advance');
  assert.ok(response.payload.openings.some(item => item.file === 'Vienna.zip' && item.title === 'Vienna'));
});

test('extracts one allowlisted opening ZIP and returns bounded 100-game PGN pages', async () => {
  const zip = openingZip();
  const fetch = async () => new Response(zip, { status: 200, headers: { 'content-length': String(zip.byteLength) } });
  const first = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' } }, first, { fetch });
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers.get('X-CAISSA-PGN-Source'), 'pgnmentor-opening-paged');
  assert.equal(first.headers.get('X-CAISSA-Opening-Page'), '1');
  assert.equal(first.headers.get('X-CAISSA-Opening-Pages'), '3');
  assert.equal(first.headers.get('X-CAISSA-Opening-Games'), '205');
  assert.equal(first.headers.get('X-CAISSA-Opening-Page-Games'), '100');
  assert.equal(splitPgnGames(first.payload.toString('utf8')).length, 100);

  const last = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '3' } }, last, { fetch });
  assert.equal(last.statusCode, 200);
  assert.equal(last.headers.get('X-CAISSA-Opening-Page-Games'), '5');
  assert.equal(splitPgnGames(last.payload.toString('utf8')).length, 5);
});

test('rejects unknown files, traversal, invalid pages, and multi-PGN archives', async () => {
  let fetchCalls = 0;
  const fetch = async () => { fetchCalls += 1; return new Response(openingZip()); };
  for (const query of [
    { file: '../Vienna.zip', page: '1' },
    { file: 'NotInCatalog.zip', page: '1' },
    { file: 'Vienna.zip', page: '0' }
  ]) {
    const response = responseRecorder();
    await handler({ method: 'GET', query }, response, { fetch });
    assert.ok([400, 404].includes(response.statusCode));
  }
  assert.equal(fetchCalls, 0);

  const archive = new AdmZip();
  archive.addFile('one.pgn', Buffer.from('[Event "One"]\n[White "W"]\n[Black "B"]\n\n1. e4 *'));
  archive.addFile('two.pgn', Buffer.from('[Event "Two"]\n[White "W"]\n[Black "B"]\n\n1. d4 *'));
  const response = responseRecorder();
  await handler({ method: 'GET', query: { file: 'Vienna.zip', page: '1' } }, response, {
    fetch: async () => new Response(archive.toBuffer(), { status: 200 })
  });
  assert.equal(response.statusCode, 502);
});

test('opening UI keeps the family visible and exposes page navigation in Games', () => {
  const html = read('pgn-replayer.html');
  const controller = read('js/pgn-replayer/pgn-opening-library.js');
  const styles = read('css/pgn-replayer.css');
  assert.match(html, /data-pgn-library-count="openings"/);
  assert.match(html, /data-pgn-opening-pagebar/);
  assert.match(html, /data-pgn-opening-previous/);
  assert.match(html, /data-pgn-opening-next/);
  assert.match(controller, /catalog\.openings\.length !== 233/);
  assert.match(controller, /caissa:pgn-load-text/);
  assert.match(controller, /openingPage: true/);
  assert.match(styles, /\.pgn-opening-pagebar/);
  assert.match(styles, /\.pgn-library-nav \{[^}]*position: sticky;[^}]*width: 100%;[^}]*flex: 0 0 auto/);
});
