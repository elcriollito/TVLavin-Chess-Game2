import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import {
  archiveMeta, champions, championshipEvents, pgnCollections, reigns,
  validateChampionshipArchive
} from '../js/game-library/championship-archive-data.js';
import {
  buildPgnReaderHref, getPgnCollection, validatePgnCollectionRegistry
} from '../js/game-library/pgn-collection-registry.js';
import { createCaissaPgnReader } from '../js/game-library/caissa-pgn-reader.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('championship archive graph has unique, resolving identifiers', () => {
  const result = validateChampionshipArchive();
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(new Set(champions.map(value => value.id)).size, champions.length);
  assert.equal(new Set(reigns.map(value => value.id)).size, reigns.length);
  assert.equal(new Set(championshipEvents.map(value => value.id)).size, championshipEvents.length);
  assert.equal(archiveMeta.primaryChampionIds.length, 18);
});
test('primary lineage is chronological from Steinitz through current champion Gukesh', () => {
  const primary = archiveMeta.primaryChampionIds.map(id => champions.find(champion => champion.id === id));
  assert.equal(primary[0].id, 'wilhelm-steinitz');
  assert.equal(primary.at(-1).id, 'gukesh-dommaraju');
  assert.deepEqual(primary.map(champion => champion.order), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(archiveMeta.currentChampionId, 'gukesh-dommaraju');
});

test('split title era remains parallel until the explicit 2006 reunification event', () => {
  assert.equal(archiveMeta.splitEra.startYear, 1993);
  assert.equal(archiveMeta.splitEra.endYear, 2006);
  assert.ok(archiveMeta.splitEra.classicalReignIds.length >= 2);
  assert.ok(archiveMeta.splitEra.fideReignIds.length >= 6);
  const splitReigns = reigns.filter(reign => [...archiveMeta.splitEra.classicalReignIds, ...archiveMeta.splitEra.fideReignIds].includes(reign.id));
  assert.deepEqual(new Set(splitReigns.map(reign => reign.lineage)), new Set(['classical', 'fide']));
  const reunification = championshipEvents.find(event => event.id === archiveMeta.splitEra.reunificationEventId);
  assert.equal(reunification.lineage, 'reunification');
  assert.equal(reunification.winnerId, 'vladimir-kramnik');
});

test('special transition events are encoded without pretending they were normal matches', () => {
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1948').format, 'quintuple-round-robin');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1948').status, 'tournament');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1975').format, 'forfeit');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1975').status, 'forfeited');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1984').status, 'aborted');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1984').numberOfGames, 48);
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1987').status, 'drawn');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-split-1993').format, 'administrative');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-2006-reunification').status, 'reunification');
});

test('PGN registry is a strict local-asset allowlist', () => {
  assert.equal(validatePgnCollectionRegistry().valid, true);
  for (const collection of pgnCollections) {
    assert.match(collection.localAsset, /^\/(?:data\/)?pgn\//);
    assert.doesNotMatch(collection.localAsset, /\.\.|[?#]|^https?:/);
    const diskPath = collection.localAsset.startsWith('/data/')
      ? `public${collection.localAsset}`
      : collection.localAsset.slice(1);
    assert.equal(fs.existsSync(new URL(`../${diskPath}`, import.meta.url)), true, collection.id);
  }
  assert.deepEqual(validatePgnCollectionRegistry([{ ...pgnCollections[0], localAsset: 'https://example.com/file.pgn' }]).errors, ['capablanca-complete has unsafe localAsset']);
  assert.deepEqual(validatePgnCollectionRegistry([{ ...pgnCollections[0], localAsset: '/../secret.pgn' }]).errors, ['capablanca-complete has unsafe localAsset']);
  assert.equal(getPgnCollection('../../secret'), null);
  assert.equal(getPgnCollection('https://example.com'), null);
  assert.equal(buildPgnReaderHref('not-allowlisted'), null);
});

test('Fischer–Spassky collection is complete, checksummed, and attached to the 1972 event', () => {
  const collection = getPgnCollection('fischer-spassky-1972-complete');
  const bytes = fs.readFileSync(new URL('../public/data/pgn/world-championships/fischer-spassky-1972.pgn', import.meta.url));
  const provenance = JSON.parse(read('public/data/pgn/world-championships/fischer-spassky-1972.provenance.json'));
  assert.equal(collection.type, 'championship-match');
  assert.equal(collection.gamesCount, 21);
  assert.equal((bytes.toString('utf8').match(/^\[Event /gm) || []).length, 21);
  assert.equal(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, collection.checksum);
  assert.equal(provenance.publicDerivativeSha256, collection.checksum.slice(7));
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1972').pgnCollectionId, collection.id);
});

test('CaissaPgnReader opens only reader-compatible registry entries', () => {
  const navigations = [];
  const reader = createCaissaPgnReader(href => navigations.push(href));
  assert.equal(reader.open({ collectionId: 'fischer-spassky-1972-complete', gameId: null, target: 'best-available' }), true);
  assert.equal(navigations[0], '/watch/game-replayer?collection=fischer-spassky-1972-complete');
  assert.equal(reader.open({ collectionId: 'fischer-spassky-game-6', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: '../../secret', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: 'capablanca-complete', target: 'desktop' }), false);
  assert.equal(navigations.length, 1);
});

test('events remain chronological and portrait policy fields are present without image dependencies', () => {
  assert.deepEqual([...championshipEvents].sort((a, b) => a.year - b.year).map(event => event.id), championshipEvents.map(event => event.id));
  for (const champion of champions) {
    assert.equal(champion.portraitAsset, null);
    assert.equal(champion.attribution, null);
    assert.equal(champion.source, null);
    assert.equal(champion.license, null);
    assert.equal(champion.licenseUrl, null);
  }
});

test('prototype route has the archive hierarchy, desktop shell and no portrait dependency', () => {
  const page = load(read('game-library-champions.html'));
  assert.equal(page('h1#archive-title').text().replace(/\s+/g, ' ').trim(), 'World Chess Champions');
  assert.equal(page('[data-champion-track]').length, 1);
  assert.equal(page('#split-era').length, 1);
  assert.equal(page('[data-champion-dialog]').length, 1);
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="library"]').length, 1);
  assert.equal(page('img').length, 0, 'prototype must keep unlicensed portraits as generated placeholders');
  assert.match(read('server.js'), /\/game-library\/champions/);
  assert.match(read('vercel.json'), /"source": "\/game-library\/champions"/);
});
