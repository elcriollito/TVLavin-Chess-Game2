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
  buildPgnReaderHref, getPgnCollection, listPublishablePgnCollections,
  REDISTRIBUTION_STATUSES, REGISTRY_MODES, validatePgnCollectionRegistry
} from '../js/game-library/pgn-collection-registry.js';
import { createCaissaPgnReader } from '../js/game-library/caissa-pgn-reader.js';
import { buildArchiveReturnTo, normalizeArchiveReturnTo, readArchiveState } from '../js/game-library/archive-return-state.js';

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

test('PGN registry exposes only rights-cleared assets in production', () => {
  assert.equal(validatePgnCollectionRegistry().valid, true);
  assert.deepEqual(listPublishablePgnCollections().map(value => value.id), ['capablanca-complete']);
  for (const collection of listPublishablePgnCollections()) {
    assert.match(collection.localAsset, /^\/(?:data\/)?pgn\//);
    assert.doesNotMatch(collection.localAsset, /\.\.|[?#]|^https?:/);
    const diskPath = collection.localAsset.startsWith('/data/') ? `public${collection.localAsset}` : collection.localAsset.slice(1);
    assert.equal(fs.existsSync(new URL(`../${diskPath}`, import.meta.url)), true, collection.id);
  }
  assert.deepEqual(validatePgnCollectionRegistry([{ ...pgnCollections[0], localAsset: 'https://example.com/file.pgn' }]).errors, ['capablanca-complete has unsafe localAsset']);
  assert.ok(validatePgnCollectionRegistry([{ ...pgnCollections[0], redistributionStatus: 'UNREVIEWED' }]).errors.includes('capablanca-complete has invalid redistributionStatus'));
  assert.ok(validatePgnCollectionRegistry([{ ...pgnCollections[0], checksum: 'sha256:not-a-digest' }]).errors.includes('capablanca-complete has invalid checksum'));
  assert.equal(getPgnCollection('../../secret'), null);
  assert.equal(getPgnCollection('https://example.com'), null);
  assert.equal(buildPgnReaderHref('not-allowlisted'), null);
  const fischer = getPgnCollection('fischer-spassky-1972-complete');
  assert.equal(fischer.redistributionStatus, REDISTRIBUTION_STATUSES.INTERNAL_TEST_ONLY);
  assert.equal(fischer.localAsset, null);
  assert.equal(fischer.readerCompatible, false);
  assert.doesNotMatch(JSON.stringify(fischer), /__caissa_internal_qa/);
  const internal = getPgnCollection('fischer-spassky-1972-complete', { mode: REGISTRY_MODES.INTERNAL_QA });
  assert.equal(internal.localAsset, '/__caissa_internal_qa/pgn/fischer-spassky-1972-complete.pgn');
  assert.equal(internal.readerCompatible, true);
});

test('Fischer–Spassky review asset is complete, checksummed, internal-only, and attached to 1972', () => {
  const collection = getPgnCollection('fischer-spassky-1972-complete');
  const bytes = fs.readFileSync(new URL('../internal-assets/pgn/fischer-spassky-1972.pgn', import.meta.url));
  const provenance = JSON.parse(read('internal-assets/pgn/fischer-spassky-1972.provenance.json'));
  assert.equal(collection.type, 'championship-match');
  assert.equal(collection.gamesCount, 21);
  assert.equal((bytes.toString('utf8').match(/^\[Event /gm) || []).length, 21);
  assert.equal(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, collection.checksum);
  assert.equal(provenance.publicDerivativeSha256, collection.checksum.slice(7));
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1972').pgnCollectionId, collection.id);
});

test('internal QA PGN is excluded from production output and served by a fixed loopback allowlist', () => {
  assert.equal(fs.existsSync(new URL('../public/data/pgn/world-championships/fischer-spassky-1972.pgn', import.meta.url)), false);
  assert.match(read('.vercelignore'), /^internal-assets\/\*\*$/m);
  assert.doesNotMatch(read('vercel.json'), /fischer-spassky-1972/);
  const server = read('server.js');
  assert.match(server, /INTERNAL_QA_ENABLED = \['127\.0\.0\.1', 'localhost', '::1'\]\.includes\(HOST\)/);
  assert.match(server, /INTERNAL_QA_PGN_ASSETS = new Map/);
  assert.match(server, /\^\\\/__caissa_internal_qa\\\/pgn\\\/\(\[a-z0-9\]/);
});

test('CaissaPgnReader opens only reader-compatible registry entries', () => {
  const navigations = [];
  const reader = createCaissaPgnReader(href => navigations.push(href), { hostname: '127.0.0.1' });
  const returnTo = buildArchiveReturnTo({ view: 'matches', lineage: 'undisputed', champion: 'bobby-fischer', reign: 'fischer-1972', event: 'wcc-1972', scroll: 640, mural: 1200 });
  assert.equal(reader.open({ collectionId: 'fischer-spassky-1972-complete', gameId: null, target: 'best-available', returnTo }), true);
  assert.equal(navigations[0], `/watch/game-replayer?collection=fischer-spassky-1972-complete&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(reader.open({ collectionId: 'fischer-spassky-game-6', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: '../../secret', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: 'capablanca-complete', target: 'desktop' }), false);
  assert.equal(navigations.length, 1);
});

test('archive return state round-trips canonical state and rejects open redirects', () => {
  const href = buildArchiveReturnTo({ view: 'matches', lineage: 'fide', champion: 'vladimir-kramnik', reign: 'kramnik-classical-2000', event: 'wcc-2006-reunification', scroll: 432, mural: 876 });
  assert.equal(normalizeArchiveReturnTo(href), href);
  assert.deepEqual({ ...readArchiveState(new URL(href, 'https://caissa.invalid')) }, { view: 'matches', lineage: 'fide', champion: 'vladimir-kramnik', reign: 'kramnik-classical-2000', event: 'wcc-2006-reunification', scroll: 432, mural: 876 });
  for (const unsafe of ['https://evil.example/', '//evil.example/', '/watch/game-replayer', '/game-library/champions/../secret', '/game-library/champions?next=https://evil.example', '/game-library/champions?view=other', '/game-library/champions#bad']) {
    assert.equal(normalizeArchiveReturnTo(unsafe), null, unsafe);
    assert.equal(buildPgnReaderHref('capablanca-complete', null, { returnTo: unsafe }), null, unsafe);
  }
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
  assert.equal(page('[data-champion-track].champion-grid').length, 1);
  assert.equal(page('#split-era').length, 1);
  assert.equal(page('[data-champion-dialog]').length, 1);
  assert.equal(page('section[data-champion-dialog]').length, 1);
  assert.equal(page('dialog').length, 0);
  assert.equal(page('[data-archive-mode]').length, 2);
  assert.equal(page('[data-match-filter]').length, 5);
  assert.equal(page('[data-filter-count]').length, 5);
  assert.match(page('.prototype-badge').text(), /Photo-free edition/);
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="library"]').length, 1);
  assert.equal(page('img').length, 0, 'prototype must keep unlicensed portraits as generated placeholders');
  assert.match(read('js/game-library/championship-archive-page.js'), /Archival monogram · no portrait/);
  assert.match(read('js/game-library/championship-archive-page.js'), /version: '0\.4\.0'/);
  assert.match(read('server.js'), /\/game-library\/champions/);
  assert.match(read('vercel.json'), /"source": "\/game-library\/champions"/);
});
