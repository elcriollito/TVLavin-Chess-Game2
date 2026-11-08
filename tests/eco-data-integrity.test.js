import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Chess } from 'chess.js';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));
const range = Array.from({ length: 13 }, (_, index) => `E${45 + index}`);

const expected = {
  E45: ['Nimzo-Indian Defense: St. Petersburg Variation, Fischer Variation', 'rn1qk2r/p1pp1ppp/bp2pn2/8/1bPP4/2N1P3/PP2NPPP/R1BQKB1R w KQkq - 2 6'],
  E46: ['Nimzo-Indian Defense: Normal Variation', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR w KQ - 1 5'],
  E47: ['Nimzo-Indian Defense: Normal Variation', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2NBP3/PP3PPP/R1BQK1NR b KQ - 2 5'],
  E48: ['Nimzo-Indian Defense: Normal Variation, Classical Defense', 'rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2NBP3/PP3PPP/R1BQK1NR w KQ - 0 6'],
  E49: ['Nimzo-Indian Defense: Normal Variation, Botvinnik System', 'rnbq1rk1/ppp2ppp/4pn2/3p4/2PP4/P1PBP3/5PPP/R1BQK1NR b KQ - 0 7'],
  E50: ['Nimzo-Indian Defense', 'rnbq1rk1/pppp1ppp/4pn2/8/1bPP4/2N1PN2/PP3PPP/R1BQKB1R b KQ - 2 5'],
  E51: ['Nimzo-Indian Defense: Normal Variation, Ragozin Variation', 'rnbq1rk1/ppp2ppp/4pn2/3p4/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6'],
  E52: ['Nimzo-Indian Defense: Normal Variation, Schlechter Defense', 'rnbq1rk1/p1p2ppp/1p2pn2/3p4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7'],
  E53: ['Nimzo-Indian Defense: Normal Variation, Gligoric System', 'rnbq1rk1/pp3ppp/4pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 7'],
  E54: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Exchange Variation', 'rnbq1rk1/pp3ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 b - - 0 8'],
  E55: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bronstein Variation', 'r1bq1rk1/pp1n1ppp/4pn2/2p5/1bBP4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 1 9'],
  E56: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense', 'r1bq1rk1/pp3ppp/2n1pn2/2pp4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 2 8'],
  E57: ['Nimzo-Indian Defense: Normal Variation, Gligoric System, Bernstein Defense', 'r1bq1rk1/pp3ppp/2n1pn2/8/1bBp4/P1N1PN2/1P3PPP/R1BQ1RK1 w - - 0 10']
};

test('E45-E57 source is pinned, licensed, legal, and projected without drift', () => {
  const source = json('data/eco/sources/lichess-e45-e57-3ba6b20d.json');
  const codes = json('data/eco/eco_codes.json');
  const details = json('data/eco/eco_details.json');
  const openings = json('data/openings.json');

  assert.equal(source.sourceCommit, '3ba6b20d31b2e6125cb0e6a2e792f400717d9d39');
  assert.equal(source.license, 'CC0-1.0');
  assert.equal(source.records.length, 25);
  assert.deepEqual([...new Set(source.records.map((record) => record.eco))], range);
  assert.equal(new Set(codes.map((row) => row.code)).size, codes.length);

  const projectedLines = openings.filter((row) => range.includes(row.eco));
  assert.equal(projectedLines.length, source.records.length);

  source.records.forEach((record, index) => {
    const chess = new Chess();
    chess.loadPgn(record.pgn);
    const history = chess.history();
    assert.ok(history.length > 0, `${record.eco} must replay at least one legal move`);
    assert.equal(projectedLines[index].eco, record.eco);
    assert.equal(projectedLines[index].name, record.name);
    assert.deepEqual(projectedLines[index].moves, history);
  });

  for (const code of range) {
    const codeRows = codes.filter((row) => row.code === code);
    const detailRows = details.filter((row) => row.code === code);
    assert.equal(codeRows.length, 1, `${code} must have one catalog row`);
    assert.equal(detailRows.length, 1, `${code} must have one detail row`);
    assert.equal(codeRows[0].name, expected[code][0]);
    assert.equal(detailRows[0].name, expected[code][0]);
    assert.equal(detailRows[0].fen, expected[code][1]);
    assert.equal(detailRows[0].stats, null);

    const representative = projectedLines.find((row) => row.eco === code);
    const chess = new Chess();
    representative.moves.forEach((move) => assert.ok(chess.move(move), `${code}: ${move} must be legal`));
    assert.equal(chess.fen(), expected[code][1], `${code} FEN must come from legal replay`);
  }
});

test('canonical and public ECO projections are byte-identical', () => {
  for (const [canonical, served] of [
    ['data/eco/eco_codes.json', 'public/data/eco/eco_codes.json'],
    ['data/eco/eco_details.json', 'public/data/eco/eco_details.json'],
    ['data/openings.json', 'public/data/openings.json'],
    ['data/openings/eco/manifest.json', 'public/data/openings/eco/manifest.json']
  ]) {
    assert.equal(read(canonical), read(served), `${canonical} and ${served} must be byte-identical`);
  }
  for (const code of ['B20', 'B34', 'B70']) {
    assert.equal(read(`data/openings/eco/${code}.json`), read(`public/data/openings/eco/${code}.json`));
  }
});

test('unverifiable aggregates are quarantined and served aggregates are internally consistent', () => {
  const stats = json('public/data/eco/eco_stats.json');
  const continuations = json('public/data/eco/eco_popular_continuations.json');
  const quarantine = json('data/eco/audit/eco-e45-e57-quarantine-20261107.json');

  for (const code of range) {
    assert.equal(stats[code], undefined);
    assert.equal(continuations[code], undefined);
    assert.ok(Object.hasOwn(quarantine.codes, code));
    if (!['E53', 'E55'].includes(code)) {
      assert.ok(quarantine.codes[code].stats);
      assert.ok(quarantine.codes[code].continuations.length > 0);
    }
  }
  assert.ok(quarantine.codes.E54.continuations.some((row) => row.move.startsWith('e4 c6')));
  assert.ok(quarantine.codes.E57.continuations.some((row) => row.move.startsWith('d4 d5')));
});

test('theory manifest is the sole availability contract', () => {
  const manifest = json('public/data/openings/eco/manifest.json');
  assert.deepEqual(manifest.availableCodes, ['B20', 'B34', 'B70']);
  const theoryFiles = readdirSync(new URL('../public/data/openings/eco', import.meta.url))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .map((name) => name.replace('.json', ''))
    .sort();
  assert.deepEqual(theoryFiles, manifest.availableCodes);
  assert.ok(range.every((code) => !manifest.availableCodes.includes(code)));

  const runtime = read('js/eco-page.js');
  assert.match(runtime, /theoryAvailableCodes\.has\(code\)/);
  assert.doesNotMatch(runtime, /eco_fen\.json/);
  assert.match(runtime, /activeDetailController\?\.abort/);
  assert.match(runtime, /REMOTE_REQUEST_TIMEOUT_MS = 5000/);
});

test('legacy database routes permanently consolidate into canonical ECO routes', () => {
  const vercel = json('vercel.json');
  const redirectMap = new Map(vercel.redirects.map((row) => [row.source, row]));
  assert.deepEqual(redirectMap.get('/database'), {
    source: '/database', destination: '/eco', permanent: true
  });
  assert.deepEqual(redirectMap.get('/database/eco/:code'), {
    source: '/database/eco/:code', destination: '/eco/:code', permanent: true
  });
  assert.equal(vercel.rewrites.some((row) => row.source.startsWith('/database')), false);
  assert.doesNotMatch(read('public/sitemap.xml'), /caissa-chess\.org\/database(?:<|\/)/);
  assert.match(read('server.js'), /legacyEcoMatch/);
  assert.match(read('server.js'), /writeHead\(308/);
});

test('missing-code inventory keeps repaired range complete and unrelated gaps explicit', () => {
  const inventory = read('docs/eco/ECO_MISSING_CODES_INVENTORY_20261107.md');
  assert.match(inventory, /134 codes outside E45-E57 remain absent/);
  assert.doesNotMatch(inventory.split('## E volume')[1], /\bE5[3-7]\b/);
  assert.match(inventory, /\bB27\b/);
});
