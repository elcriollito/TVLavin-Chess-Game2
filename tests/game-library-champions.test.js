import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import {
  archiveMeta, champions, championshipEvents, pgnCollections, reigns,
  validateChampionshipArchive
} from '../js/game-library/championship-archive-data.js';

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
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1975').format, 'forfeit');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1984').format, 'match-aborted');
  assert.equal(championshipEvents.find(event => event.id === 'wcc-split-1993').format, 'administrative');
});

test('PGN actions use only declared local assets and the single certified reader route', () => {
  for (const collection of pgnCollections) {
    assert.match(collection.asset, /^\/(?:data\/)?pgn\//);
    const diskPath = collection.asset.startsWith('/data/')
      ? `public${collection.asset}`
      : collection.asset.slice(1);
    assert.equal(fs.existsSync(new URL(`../${diskPath}`, import.meta.url)), true, collection.id);
    if (collection.readerCompatible) assert.equal(collection.readerHref, '/watch/game-replayer');
  }
  assert.equal(pgnCollections.filter(collection => collection.readerCompatible).length, 1);
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
