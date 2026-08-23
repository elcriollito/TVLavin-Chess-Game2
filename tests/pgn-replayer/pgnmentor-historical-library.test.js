import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));

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

test('publishes complete free championship and qualification families from the allowlisted snapshot', () => {
  const remote = json('data/pgn/pgnmentor-remote-catalog.json');
  const history = json('public/data/pgn/pgnmentor-historical-catalog.json');
  const championships = history.families.worldChampionships;
  const qualifiers = history.families.qualifiers;
  const allowed = new Set(remote.events);

  assert.equal(history.playerDirectoryExposed, false);
  assert.equal(history.runtimePolicy.players, 'physical-caissa-archives-only');
  assert.equal(history.runtimePolicy.events, 'remote-through-caissa-gateway');
  assert.equal(history.updatedAt, remote.generatedAt);
  assert.equal(history.sourceUpdates.players, remote.sourceUpdates.players);
  assert.equal(history.sourceUpdates.openings, remote.sourceUpdates.openings);
  assert.match(history.sourceUpdates.players, /^[A-Za-z]+ \d{4}$/);
  assert.match(history.sourceUpdates.openings, /^[A-Za-z]+ \d{4}$/);
  assert.equal(championships.length, 59);
  assert.equal(qualifiers.length, 58);
  assert.equal(history.counts.worldChampionships, championships.length);
  assert.equal(history.counts.qualifiers, qualifiers.length);
  assert.equal(new Set([...championships, ...qualifiers].map(item => item.id)).size, 117);
  assert.ok([...championships, ...qualifiers].every(item => item.access === 'free' && allowed.has(item.file)));
  assert.ok([...championships, ...qualifiers].every(item => !/[\\/]|\.\./.test(item.file)));
});

test('covers the unified, split-title, Candidates, World Cup, and Interzonal archives', () => {
  const history = json('public/data/pgn/pgnmentor-historical-catalog.json');
  const championships = history.families.worldChampionships;
  const qualifiers = history.families.qualifiers;

  assert.equal(championships[0].title, '2024 — Gukesh vs Ding Liren');
  assert.ok(championships.some(item => item.file === 'WorldChamp1886.pgn' && /Steinitz vs Zukertort/.test(item.title)));
  assert.ok(championships.some(item => item.file === 'WorldChamp1972.pgn' && /Fischer vs Spassky/.test(item.title)));
  assert.ok(championships.some(item => item.file === 'WorldChamp1927.pgn' && /Alekhine vs Capablanca/.test(item.title)));
  assert.ok(championships.some(item => item.file === 'PCAChamp1995.pgn' && /PCA World Championship/.test(item.details)));
  assert.ok(championships.some(item => item.file === 'FideChamp2002.pgn' && /FIDE World Championship/.test(item.details)));
  assert.equal(qualifiers.filter(item => item.kind === 'candidates').length, 25);
  assert.equal(qualifiers.filter(item => item.kind === 'world-cup').length, 8);
  assert.equal(qualifiers.filter(item => item.kind === 'interzonal').length, 25);
  assert.ok(qualifiers.some(item => item.file === 'Interzonal1948.pgn'));
  assert.ok(qualifiers.some(item => item.file === 'Candidates2024.pgn'));
  assert.ok(qualifiers.some(item => item.file === 'WorldCup2023.pgn'));
});

test('loads historical archives only through the bounded CAISSA event gateway', () => {
  const controller = read('js/pgn-replayer/pgn-mentor-historical-library.js');
  const gateway = read('api/pgn/pgnmentor.js');
  const page = read('js/pgn-replayer/pgn-replayer-page.js');

  assert.match(controller, /\/api\/pgn\/pgnmentor\?kind=event&file=/);
  assert.match(controller, /SAFE_EVENT_FILE/);
  assert.match(controller, /MAX_PGN_BYTES = 10 \* 1024 \* 1024/);
  assert.match(controller, /caissa:pgn-load-text/);
  assert.doesNotMatch(controller, /pgnmentor\.com\/(?:players|events)/i);
  assert.match(page, /root\.addEventListener\('caissa:pgn-load-text'/);
  assert.match(gateway, /Deliberately no `player` source/);
  assert.match(gateway, /source\.allowlist\.has\(file\)/);
  assert.match(gateway, /X-Robots-Tag', 'noindex, nofollow, noarchive'/);
  assert.doesNotMatch(gateway, /baseUrl:\s*['"]https:\/\/www\.pgnmentor\.com\/players\//);
});

test('gateway serves an allowlisted event and rejects player or traversal requests before fetch', async () => {
  const { default: handler } = await import('../../api/pgn/pgnmentor.js');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    return new Response('[Event "1972"]\n[White "Fischer"]\n[Black "Spassky"]\n\n1. d4 Nf6 *', {
      status: 200,
      headers: { 'content-length': '73' }
    });
  };
  try {
    const served = responseRecorder();
    await handler({ method: 'GET', query: { kind: 'event', file: 'WorldChamp1972.pgn' } }, served);
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers.get('X-CAISSA-PGN-Source'), 'pgnmentor-event');
    assert.equal(served.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/events\/WorldChamp1972\.pgn$/);

    for (const query of [
      { kind: 'player', file: 'Fischer.zip' },
      { kind: 'event', file: '../WorldChamp1972.pgn' },
      { kind: 'event', file: 'NotInCatalog.pgn' }
    ]) {
      const rejected = responseRecorder();
      await handler({ method: 'GET', query }, rejected);
      assert.equal(rejected.statusCode, 404);
    }
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the five approved library families visible without flattening their collections', () => {
  const html = read('pgn-replayer.html');
  const families = [...html.matchAll(/data-pgn-library-family="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(families, ['players', 'world-championships', 'qualifiers', 'tournaments', 'openings']);
  assert.match(html, />World Championships</);
  assert.match(html, />Candidates &amp; World Cups</);
  assert.match(html, /pgn-mentor-historical-library\.js\?v=1\.1\.0/);
  assert.match(html, /pgn-opening-library\.js\?v=1\.0\.2/);
  assert.match(read('css/pgn-replayer.css'), /\.pgn-library-nav/);
  assert.match(read('css/pgn-replayer.css'), /\.pgn-library-search/);
  assert.match(read('js/pgn-replayer/pgn-mentor-historical-library.js'), /enrichment source updated/);
});

test('integrates the added player albums alphabetically with the same visual description', () => {
  const mentorCatalog = read('js/pgn-replayer/pgn-mentor-player-catalog.js');
  const controller = read('js/pgn-replayer/pgn-mentor-historical-library.js');
  const titles = [...mentorCatalog.matchAll(/title: "([^"]+)"/g)].map(match => match[1]);
  const expected = [...titles].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));

  assert.equal(titles.length, 16);
  assert.deepEqual(titles, expected);
  assert.equal((mentorCatalog.match(/details: "Player game collection · PGN"/g) || []).length, 16);
  assert.doesNotMatch(mentorCatalog, /physical archive/i);
  assert.match(controller, /function sortPlayerCollections\(\)/);
  assert.match(controller, /localeCompare\(rightTitle, 'en', \{ sensitivity: 'base' \}\)/);
  assert.doesNotMatch(controller, /physical CAISSA archives/i);
});
