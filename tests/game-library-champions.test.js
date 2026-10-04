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
  buildPgnReaderHref, getApprovedExternalPgnDownload, getKnownPgnCollection, getPgnCollection,
  getPgnCollectionForEvent, listPublishablePgnCollections, listReaderPgnCollections,
  pgnCollectionRegistryValidation, REDISTRIBUTION_STATUSES, RIGHTS_CLASSIFICATIONS, validatePgnCollectionRegistry
} from '../js/game-library/pgn-collection-registry.js';
import { worldChampionshipPgnCatalog, worldChampionshipPgnCatalogValidation } from '../js/game-library/world-championship-pgn-catalog.js';
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

test('PGN registry separates rights-cleared local assets from remote Reader access', () => {
  assert.equal(pgnCollectionRegistryValidation.valid, true, pgnCollectionRegistryValidation.errors.join('\n'));
  assert.deepEqual(listPublishablePgnCollections().map(value => value.id), ['capablanca-complete']);
  for (const collection of listPublishablePgnCollections()) {
    assert.match(collection.localAsset, /^\/(?:data\/)?pgn\//);
    assert.doesNotMatch(collection.localAsset, /\.\.|[?#]|^https?:/);
    const diskPath = collection.localAsset.startsWith('/data/') ? `public${collection.localAsset}` : collection.localAsset.slice(1);
    assert.equal(fs.existsSync(new URL(`../${diskPath}`, import.meta.url)), true, collection.id);
    assert.equal(collection.downloadFilename, 'capablanca-games-1901-1941.pgn');
    assert.equal(collection.mimeType, 'application/x-chess-pgn');
  }
  assert.deepEqual(validatePgnCollectionRegistry([{ ...pgnCollections[0], localAsset: 'https://example.com/file.pgn' }]).errors, ['capablanca-complete has unsafe localAsset']);
  assert.ok(validatePgnCollectionRegistry([{ ...pgnCollections[0], redistributionStatus: 'UNREVIEWED' }]).errors.includes('capablanca-complete has invalid redistributionStatus'));
  assert.ok(validatePgnCollectionRegistry([{ ...pgnCollections[0], checksum: 'sha256:not-a-digest' }]).errors.includes('capablanca-complete has invalid checksum'));
  assert.equal(getPgnCollection('../../secret'), null);
  assert.equal(getPgnCollection('https://example.com'), null);
  assert.equal(buildPgnReaderHref('not-allowlisted'), null);
  assert.equal(getPgnCollection('fischer-spassky-1972-complete'), null);
  assert.equal(getKnownPgnCollection('fischer-spassky-1972-complete'), null);
  assert.doesNotMatch(JSON.stringify(pgnCollections), /fischer-spassky-1972-complete|__caissa_internal_qa|internalQaAvailable|INTERNAL_TEST_ONLY/);
  const remote = pgnCollections.filter(value => value.redistributionStatus === REDISTRIBUTION_STATUSES.REMOTE_VIEW_ONLY);
  assert.equal(remote.length, 59);
  assert.equal(listReaderPgnCollections().length, 60);
  for (const entry of remote) {
    assert.equal(getPgnCollection(entry.id), entry, entry.id);
    assert.equal(entry.rightsClassification, RIGHTS_CLASSIFICATIONS.REMOTE_VIEW_ONLY);
    assert.equal(entry.localAsset, null, entry.id);
    assert.equal(entry.downloadFilename, null, entry.id);
    assert.equal(entry.mimeType, null, entry.id);
    assert.equal(entry.downloadable, false, entry.id);
    assert.equal(entry.readerCompatible, true, entry.id);
    assert.match(entry.readerAsset, /^\/api\/pgn\/pgnmentor\?kind=event&file=[A-Za-z0-9]+\.pgn$/);
    assert.match(getApprovedExternalPgnDownload(entry.id)?.url || '', /^https:\/\/www\.pgnmentor\.com\/events\/[A-Za-z0-9]+\.pgn$/);
  }
  for (const entry of pgnCollections.filter(value => value.redistributionStatus === REDISTRIBUTION_STATUSES.NEEDS_REVIEW)) {
    assert.equal(getPgnCollection(entry.id), null, entry.id);
    assert.equal(entry.localAsset, null, entry.id);
    assert.equal(entry.downloadFilename, null, entry.id);
    assert.equal(entry.mimeType, null, entry.id);
    assert.equal(entry.downloadable, false, entry.id);
    assert.equal(entry.readerCompatible, false, entry.id);
    assert.equal(getApprovedExternalPgnDownload(entry.id), null, entry.id);
  }
});

test('event reader and external download capabilities require explicit registry approval', () => {
  const approvedMatch = {
    ...pgnCollections[0],
    id: 'capablanca-alekhine-1927',
    title: 'Capablanca–Alekhine 1927',
    type: 'championship-match',
    eventId: 'wcc-1927'
  };
  assert.equal(validatePgnCollectionRegistry([approvedMatch]).valid, true);
  assert.equal(getPgnCollectionForEvent('wcc-1927', [approvedMatch])?.id, approvedMatch.id);
  assert.equal(getPgnCollectionForEvent('wcc-1927')?.id, 'world-championship-worldchamp1927');
  assert.ok(validatePgnCollectionRegistry([approvedMatch, { ...approvedMatch, id: 'second-approved-1927-match' }]).errors.includes('second-approved-1927-match duplicates public event association wcc-1927'));

  const approvedExternal = {
    ...pgnCollections[1],
    id: 'approved-external-match',
    redistributionStatus: REDISTRIBUTION_STATUSES.LINK_ONLY,
    externalDownloadUrl: 'https://archive.example/chess/approved-match.pgn',
    externalDownloadApproved: true
  };
  assert.equal(validatePgnCollectionRegistry([approvedExternal]).valid, true);
  assert.deepEqual(getApprovedExternalPgnDownload(approvedExternal.id, [approvedExternal]), {
    collectionId: approvedExternal.id,
    url: approvedExternal.externalDownloadUrl,
    sourceName: approvedExternal.sourceName
  });
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadUrl: 'http://archive.example/match.pgn' }]).errors.includes(`${approvedExternal.id} has invalid externalDownloadUrl`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadUrl: 'https://user:pass@archive.example/match.pgn' }]).errors.includes(`${approvedExternal.id} has invalid externalDownloadUrl`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadApproved: false }]).errors.includes(`${approvedExternal.id} exposes an unapproved externalDownloadUrl`));
  assert.equal(getApprovedExternalPgnDownload('capablanca-complete'), null, 'no external source is registered for Capablanca');
  const remote = getPgnCollection('world-championship-worldchamp2024');
  assert.ok(validatePgnCollectionRegistry([{ ...remote, externalDownloadUrl: 'https://www.pgnmentor.com/events/WorldChamp2023.pgn' }]).errors.includes(`${remote.id} does not match the canonical remote allowlist`));
});

test('Capablanca public collection has exact release metadata and is honestly classified', () => {
  const collection = getPgnCollection('capablanca-complete');
  const bytes = fs.readFileSync(new URL('../public/data/pgn/capablanca-games-1901-1941.pgn', import.meta.url));
  const provenance = JSON.parse(read('public/data/pgn/capablanca-games-1901-1941.provenance.json'));
  assert.equal(collection.type, 'player-collection');
  assert.equal(collection.eventId, null);
  assert.equal(collection.gamesCount, 597);
  assert.equal(collection.sourceName, 'CAISSA repository owner');
  assert.equal(collection.sourceUrl, null);
  assert.equal(collection.attribution, 'Factual Capablanca game scores supplied and authorized by the repository owner.');
  assert.equal(collection.license, 'Owner authorization for use in the CAISSA Game Replayer');
  assert.equal(collection.redistributionStatus, REDISTRIBUTION_STATUSES.VERIFIED_REDISTRIBUTABLE);
  assert.equal(collection.localAsset, '/data/pgn/capablanca-games-1901-1941.pgn');
  assert.equal(collection.downloadFilename, 'capablanca-games-1901-1941.pgn');
  assert.equal(collection.mimeType, 'application/x-chess-pgn');
  assert.equal(collection.readerCompatible, true);
  assert.equal(collection.externalDownloadUrl, null);
  assert.equal(collection.externalDownloadApproved, false);
  assert.equal((bytes.toString('utf8').match(/^\[Event /gm) || []).length, 597);
  assert.equal(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, collection.checksum);
  assert.equal(provenance.collectionId, collection.id);
  assert.equal(provenance.publicFilename, collection.downloadFilename);
  assert.equal(provenance.publicDerivativeSha256, collection.checksum.slice(7));
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1927').pgnCollectionId, 'world-championship-worldchamp1927');
});

test('non-public Fischer asset and local-only endpoint are absent from production surfaces', () => {
  assert.equal(fs.existsSync(new URL('../public/data/pgn/world-championships/fischer-spassky-1972.pgn', import.meta.url)), false);
  assert.match(read('.vercelignore'), /^internal-assets\/\*\*$/m);
  assert.doesNotMatch(read('vercel.json'), /fischer-spassky-1972/);
  const server = read('server.js');
  assert.doesNotMatch(server, /__caissa_internal_qa|INTERNAL_QA_PGN_ASSETS|fischer-spassky-1972/);
  assert.equal(championshipEvents.find(event => event.id === 'wcc-1972').pgnCollectionId, 'world-championship-worldchamp1972');
  assert.equal(getPgnCollection('fischer-spassky-game-6'), null, 'the unreviewed local excerpt stays closed');
  assert.equal(getPgnCollectionForEvent('wcc-1972')?.id, 'world-championship-worldchamp1972', 'the existing remote Reader album is a distinct approved capability');
});

test('World Championship catalog audit and archive mapping are complete and deterministic', () => {
  assert.equal(worldChampionshipPgnCatalogValidation.valid, true, worldChampionshipPgnCatalogValidation.errors.join('\n'));
  assert.equal(worldChampionshipPgnCatalog.length, 59);
  assert.equal(new Set(worldChampionshipPgnCatalog.map(value => value.id)).size, 59);
  assert.equal(new Set(worldChampionshipPgnCatalog.map(value => value.eventId)).size, 59);
  assert.equal(championshipEvents.filter(event => event.pgnCollectionId).length, 59);
  assert.deepEqual(championshipEvents.filter(event => !event.pgnCollectionId).map(event => event.id), ['wcc-1975', 'wcc-split-1993']);
  for (const catalogEntry of worldChampionshipPgnCatalog) {
    const event = championshipEvents.find(value => value.id === catalogEntry.eventId);
    assert.ok(event, catalogEntry.eventId);
    assert.equal(event.year, catalogEntry.year, catalogEntry.id);
    assert.equal(event.pgnCollectionId, catalogEntry.id, catalogEntry.eventId);
    assert.equal(getPgnCollectionForEvent(event.id)?.id, catalogEntry.id, event.id);
  }
  for (const eventId of ['wcc-2024', 'wcc-2023', 'wcc-2021', 'wcc-2018', 'wcc-2016', 'wcc-2014']) {
    const mapped = getPgnCollectionForEvent(eventId);
    assert.ok(mapped?.readerCompatible, eventId);
    assert.match(buildPgnReaderHref(mapped.id, 0), /&game=0$/);
  }
});

test('CaissaPgnReader opens only reader-compatible registry entries', () => {
  const navigations = [];
  const reader = createCaissaPgnReader(href => navigations.push(href));
  const returnTo = buildArchiveReturnTo({ view: 'matches', lineage: 'undisputed', champion: 'jose-raul-capablanca', reign: 'capablanca-1921', event: 'wcc-1927', scroll: 640, mural: 1200 });
  assert.equal(reader.open({ collectionId: 'capablanca-complete', gameId: null, target: 'best-available', returnTo }), true);
  assert.equal(navigations[0], `/watch/game-replayer?collection=capablanca-complete&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(reader.open({ collectionId: 'capablanca-complete', gameId: 0, target: 'best-available', returnTo }), true);
  assert.equal(navigations[1], `/watch/game-replayer?collection=capablanca-complete&game=0&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(reader.open({ collectionId: 'fischer-spassky-1972-complete', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: 'fischer-spassky-game-6', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: '../../secret', target: 'best-available' }), false);
  assert.equal(reader.open({ collectionId: 'capablanca-complete', target: 'desktop' }), false);
  assert.equal(reader.open({ collectionId: 'world-championship-worldchamp2024', gameId: 0, target: 'best-available', returnTo }), true);
  assert.equal(navigations[2], `/watch/game-replayer?collection=world-championship-worldchamp2024&game=0&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(navigations.length, 3);
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

test('release-candidate route has the archive hierarchy, intentional monograms, and no portrait dependency', () => {
  const page = load(read('game-library-champions.html'));
  const archivePage = read('js/game-library/championship-archive-page.js');
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
  assert.match(page('.archive-edition-badge').text(), /Historical archive/);
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="library"]').length, 1);
  assert.equal(page('img').length, 0, 'release candidate must not include portrait assets');
  assert.match(archivePage, /CAISSA archival monogram/);
  assert.match(archivePage, /version: '1\.0\.0-rc\.3'/);
  assert.match(archivePage, /openReader\(button\.dataset\.eventPgn, button\.dataset\.event, 0\)/);
  assert.match(archivePage, /href="\$\{escapeHtml\(external\.url\)\}" target="_blank" rel="noopener noreferrer external"/);
  assert.doesNotMatch(archivePage, /href="\$\{escapeHtml\(runtime\.localAsset\)\}"/);
  assert.doesNotMatch(page.text(), /prototype|internal|test asset|registry mode|portrait rights pending/i);
  assert.equal(load(read('index.html'))('a.library-archive-link[href="/game-library/champions"]').length, 1);
  assert.match(read('server.js'), /\/game-library\/champions/);
  assert.match(read('vercel.json'), /"source": "\/game-library\/champions"/);
});
