import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import {
  archiveMeta, champions, championshipEvents, getChampion, pgnCollections, reigns,
  validateChampionshipArchive
} from '../js/game-library/championship-archive-data.js';
import {
  buildChampionshipReplayHref, buildPgnReaderHref, getApprovedExternalPgnDownload, getKnownPgnCollection, getPgnCollection,
  getPgnCollectionForEvent, listPublishablePgnCollections, listReaderPgnCollections,
  EXTERNAL_LINK_KINDS, pgnCollectionRegistryValidation, REDISTRIBUTION_STATUSES, RIGHTS_CLASSIFICATIONS, validatePgnCollectionRegistry
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

  const approvedExternal = getKnownPgnCollection('smallchess-wilhelm-steinitz');
  assert.equal(validatePgnCollectionRegistry([approvedExternal]).valid, true);
  assert.deepEqual(getApprovedExternalPgnDownload(approvedExternal.id, [approvedExternal]), {
    collectionId: approvedExternal.id,
    url: approvedExternal.externalDownloadUrl,
    sourceName: approvedExternal.sourceName,
    linkKind: EXTERNAL_LINK_KINDS.DIRECT_PGN
  });
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadUrl: 'http://www.smallchess.com/Games/Wilhelm%20Steinitz.pgn' }]).errors.includes(`${approvedExternal.id} has invalid externalDownloadUrl`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadUrl: 'https://user:pass@www.smallchess.com/Games/Wilhelm%20Steinitz.pgn' }]).errors.includes(`${approvedExternal.id} has invalid externalDownloadUrl`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadUrl: 'https://evil.example/Wilhelm%20Steinitz.pgn' }]).errors.includes(`${approvedExternal.id} does not match the canonical external allowlist`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, externalDownloadApproved: false }]).errors.includes(`${approvedExternal.id} exposes an unapproved externalDownloadUrl`));
  assert.ok(validatePgnCollectionRegistry([{ ...approvedExternal, id: 'unregistered-player-collection' }]).errors.includes('unregistered-player-collection does not match the canonical external allowlist'));
  assert.equal(getApprovedExternalPgnDownload('../../secret'), null);
  assert.equal(getApprovedExternalPgnDownload('INTERNAL_TEST_ONLY'), null);
  assert.equal(getApprovedExternalPgnDownload('fischer-byrne-1963'), null, 'NEEDS_REVIEW remains closed unless an external link is explicitly allowlisted');
  assert.equal(getApprovedExternalPgnDownload('capablanca-complete'), null, 'no external source is registered for Capablanca');
  const remote = getPgnCollection('world-championship-worldchamp2024');
  assert.ok(validatePgnCollectionRegistry([{ ...remote, externalDownloadUrl: 'https://www.pgnmentor.com/events/WorldChamp2023.pgn' }]).errors.includes(`${remote.id} does not match the canonical remote allowlist`));
});

test('all 18 primary champions resolve to the reviewed canonical Player catalog audit', () => {
  const expected = new Map([
    ['wilhelm-steinitz', ['Wilhelm Steinitz', 'smallchess-wilhelm-steinitz', 1089, 'Wilhelm Steinitz.pgn']],
    ['emanuel-lasker', ['Emanuel Lasker', 'smallchess-emanuel-lasker', 378, 'Emanuel Lasker.pgn']],
    ['jose-raul-capablanca', ['José Raúl Capablanca', 'capablanca-complete', 597, null]],
    ['alexander-alekhine', ['Alexander Alekhine', 'smallchess-alexander-alekhine', 785, 'Alexander Alekhine.pgn']],
    ['max-euwe', ['Max Euwe', 'smallchess-max-euwe', 1759, 'Max Euwe.pgn']],
    ['mikhail-botvinnik', ['Mikhail Botvinnik', 'smallchess-mikhail-botvinnik', 1201, 'Mikhail Botvinnik.pgn']],
    ['vasily-smyslov', ['Vasily Smyslov', 'smallchess-vasily-smyslov', 1478, 'Vasily Smyslov.pgn']],
    ['mikhail-tal', ['Mikhail Tal', 'smallchess-mikhail-tal', 2960, 'Mikhail Tal.pgn']],
    ['tigran-petrosian', ['Tigran Petrosian', 'smallchess-tigran-petrosian', 2159, 'Tigran Petrosian.pgn']],
    ['boris-spassky', ['Boris Spassky', 'smallchess-boris-spassky', 2499, 'Boris Spassky.pgn']],
    ['bobby-fischer', ['Bobby Fischer', 'smallchess-bobby-fischer', 1101, 'Bobby Fischer.pgn']],
    ['anatoly-karpov', ['Anatoly Karpov', 'smallchess-anatoly-karpov', 1105, 'Anatoly Karpov.pgn']],
    ['garry-kasparov', ['Garry Kasparov', 'smallchess-garry-kasparov', 1669, 'Garry Kasparov.pgn']],
    ['vladimir-kramnik', ['Vladimir Kramnik', 'smallchess-vladimir-kramnik', 2763, 'Vladimir Kramnik.pgn']],
    ['viswanathan-anand', ['Viswanathan Anand', 'smallchess-viswanathan-anand', 4079, 'Viswanathan Anand.pgn']],
    ['magnus-carlsen', ['Magnus Carlsen', 'smallchess-magnus-carlsen', 5097, 'Magnus Carlsen.pgn']],
    ['ding-liren', ['Ding Liren', 'smallchess-ding-liren', 635, 'Ding Liren.pgn']],
    ['gukesh-dommaraju', ['Gukesh Dommaraju', 'smallchess-dommaraju-gukesh', 1514, 'Dommaraju Gukesh.pgn']]
  ]);
  const readerCatalog = read('js/pgn-replayer/pgn-album-catalog.js');
  assert.equal(expected.size, 18);
  for (const championId of archiveMeta.primaryChampionIds) {
    const champion = getChampion(championId);
    const [name, collectionId, gamesCount, file] = expected.get(championId);
    const collection = getKnownPgnCollection(collectionId);
    assert.equal(champion.displayName, name, championId);
    assert.equal(collection.type, 'player-collection', championId);
    assert.equal(collection.championId, championId, championId);
    assert.equal(collection.gamesCount, gamesCount, championId);
    assert.ok(champion.collectionIds.includes(collectionId), championId);
    if (!file) {
      assert.equal(collection.readerCompatible, true, championId);
      assert.equal(getApprovedExternalPgnDownload(collectionId), null, championId);
      continue;
    }
    const external = getApprovedExternalPgnDownload(collectionId);
    assert.equal(collection.readerCompatible, false, championId);
    assert.equal(collection.redistributionStatus, REDISTRIBUTION_STATUSES.LINK_ONLY, championId);
    assert.equal(collection.rightsClassification, RIGHTS_CLASSIFICATIONS.NEEDS_REVIEW, championId);
    assert.equal(external.sourceName, 'SmallChess', championId);
    assert.equal(external.linkKind, EXTERNAL_LINK_KINDS.DIRECT_PGN, championId);
    assert.equal(external.url, `https://www.smallchess.com/Games/${encodeURIComponent(file)}`, championId);
    assert.match(readerCatalog, new RegExp(`"id":"${collectionId}"[^\\n]+"file":"${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), championId);
  }
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
  assert.equal(reader.open({ collectionId: 'world-championship-worldchamp2024', gameId: 0, target: 'champions', returnTo }), true);
  assert.equal(navigations[2], `/game-library/champions/replay?collection=world-championship-worldchamp2024&game=0&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(reader.open({ collectionId: 'world-championship-worldchamp2024', gameId: 0, target: 'fallback', returnTo }), true);
  assert.equal(navigations[3], `/watch/game-replayer?collection=world-championship-worldchamp2024&game=0&returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(reader.open({ collectionId: 'capablanca-complete', gameId: 0, target: 'champions', returnTo }), true, 'approved player collections enter the isolated Champions replay');
  assert.equal(navigations[4], `/game-library/champions/replay?collection=capablanca-complete&game=0&returnTo=${encodeURIComponent(returnTo)}&context=player`);
  assert.equal(buildPgnReaderHref('world-championship-worldchamp2024', 0), '/watch/game-replayer?collection=world-championship-worldchamp2024&game=0');
  assert.equal(buildChampionshipReplayHref('world-championship-worldchamp2024', 0), '/game-library/champions/replay?collection=world-championship-worldchamp2024&game=0');
  assert.equal(buildChampionshipReplayHref('capablanca-complete', 0), '/game-library/champions/replay?collection=capablanca-complete&game=0&context=player');
  assert.equal(buildChampionshipReplayHref('capablanca-complete', 0, { context: 'match' }), null);
  assert.equal(buildChampionshipReplayHref('world-championship-worldchamp2024', 0, { context: 'player' }), null);
  assert.equal(buildChampionshipReplayHref('capablanca-complete', 597), null);
  assert.equal(navigations.length, 5);
});

test('archive return state round-trips canonical state and rejects open redirects', () => {
  const href = buildArchiveReturnTo({ view: 'matches', lineage: 'fide', champion: 'vladimir-kramnik', reign: 'kramnik-classical-2000', event: 'wcc-2006-reunification', collection: 'capablanca-complete', scroll: 432, mural: 876 });
  assert.equal(normalizeArchiveReturnTo(href), href);
  assert.deepEqual({ ...readArchiveState(new URL(href, 'https://caissa.invalid')) }, { view: 'matches', lineage: 'fide', champion: 'vladimir-kramnik', reign: 'kramnik-classical-2000', event: 'wcc-2006-reunification', collection: 'capablanca-complete', scroll: 432, mural: 876 });
  for (const unsafe of ['https://evil.example/', '//evil.example/', '/watch/game-replayer', '/game-library/champions/../secret', '/game-library/champions?next=https://evil.example', '/game-library/champions?view=other', '/game-library/champions#bad']) {
    assert.equal(normalizeArchiveReturnTo(unsafe), null, unsafe);
    assert.equal(buildPgnReaderHref('capablanca-complete', null, { returnTo: unsafe }), null, unsafe);
  }
});

test('events remain chronological and approved original-art portraits follow the asset contract', () => {
  assert.deepEqual([...championshipEvents].sort((a, b) => a.year - b.year).map(event => event.id), championshipEvents.map(event => event.id));
  const approvedPortraits = new Map([
    ['wilhelm-steinitz', ['/images/champions/steinitz.webp', 'Illustrated portrait of Wilhelm Steinitz']],
    ['emanuel-lasker', ['/images/champions/lasker.webp', 'Illustrated portrait of Emanuel Lasker']],
    ['jose-raul-capablanca', ['/images/champions/capablanca.webp', 'Illustrated portrait of José Raúl Capablanca']],
    ['alexander-alekhine', ['/images/champions/alekhine.webp', 'Illustrated portrait of Alexander Alekhine']],
    ['max-euwe', ['/images/champions/euwe.webp', 'Illustrated portrait of Max Euwe']],
    ['mikhail-botvinnik', ['/images/champions/botvinnik.webp', 'Illustrated portrait of Mikhail Botvinnik']],
    ['vasily-smyslov', ['/images/champions/smyslov.webp', 'Illustrated portrait of Vasily Smyslov']],
    ['mikhail-tal', ['/images/champions/tal.webp', 'Illustrated portrait of Mikhail Tal']],
    ['tigran-petrosian', ['/images/champions/petrosian.webp', 'Illustrated portrait of Tigran Petrosian']],
    ['boris-spassky', ['/images/champions/spassky.webp', 'Illustrated portrait of Boris Spassky']],
    ['bobby-fischer', ['/images/champions/fischer.webp', 'Illustrated portrait of Bobby Fischer']],
    ['anatoly-karpov', ['/images/champions/karpov.webp', 'Illustrated portrait of Anatoly Karpov']],
    ['garry-kasparov', ['/images/champions/kasparov.webp', 'Illustrated portrait of Garry Kasparov']],
    ['vladimir-kramnik', ['/images/champions/kramnik.webp', 'Illustrated portrait of Vladimir Kramnik']],
    ['viswanathan-anand', ['/images/champions/anand.webp', 'Illustrated portrait of Viswanathan Anand']],
    ['magnus-carlsen', ['/images/champions/carlsen.webp', 'Illustrated portrait of Magnus Carlsen']],
    ['ding-liren', ['/images/champions/ding.webp', 'Illustrated portrait of Ding Liren']],
    ['gukesh-dommaraju', ['/images/champions/gukesh.webp', 'Illustrated portrait of Gukesh Dommaraju']]
  ]);
  for (const champion of champions) {
    const expected = approvedPortraits.get(champion.id);
    if (expected) {
      assert.deepEqual(champion.portrait, { asset: `/public${expected[0]}`, alt: expected[1], type: 'original-art', objectPosition: '50% 36%' });
      const asset = fs.statSync(new URL(`../public${expected[0]}`, import.meta.url));
      assert.ok(asset.size > 0 && asset.size < 100_000, `${champion.id} should ship a compact production derivative`);
    } else {
      assert.equal(champion.portrait, null);
    }
    assert.equal(champion.portraitAsset, null);
    assert.equal(champion.attribution, null);
    assert.equal(champion.source, null);
    assert.equal(champion.license, null);
    assert.equal(champion.licenseUrl, null);
  }
});

test('release-candidate route has the archive hierarchy and progressive portrait enhancement', () => {
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
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="world-champions"]').length, 1);
  assert.equal(page('img').length, 0, 'portraits should be data-driven instead of hard-coded into the document shell');
  assert.match(archivePage, /CAISSA archival monogram/);
  assert.match(archivePage, /championCardVisual/);
  assert.match(archivePage, /championDetailVisual/);
  assert.match(archivePage, /loading="\$\{loading\}"/);
  assert.match(archivePage, /version: '1\.0\.0-rc\.4'/);
  assert.match(archivePage, /openReader\(button\.dataset\.openPgn, uiState\.event, 0, 'champions'\)/);
  assert.match(archivePage, /semanticReturnAnchor/);
  assert.match(archivePage, /document\.fonts\?\.ready/);
  assert.match(archivePage, /Math\.max\(0, root\.scrollHeight - viewportHeight\)/);
  assert.match(archivePage, /openReader\(button\.dataset\.eventPgn, button\.dataset\.event, 0, 'champions'\)/);
  assert.match(archivePage, /href="\$\{escapeHtml\(external\.url\)\}" target="_blank" rel="noopener noreferrer external"/);
  assert.doesNotMatch(archivePage, /href="\$\{escapeHtml\(runtime\.localAsset\)\}"/);
  assert.doesNotMatch(page.text(), /prototype|internal|test asset|registry mode|portrait rights pending/i);
  assert.equal(load(read('game-library.html'))('a.library-archive-link[href="/game-library/champions"]').length, 1);
  assert.match(read('server.js'), /\/game-library\/champions/);
  assert.match(read('vercel.json'), /"source": "\/game-library\/champions"/);
});

test('original PGN Reader is restored and isolated from Champions replay', () => {
  const page = load(read('pgn-replayer.html'));
  const runtime = read('js/pgn-replayer/pgn-replayer-page.js');
  assert.equal(page('[data-pgn-app]').length, 1);
  assert.deepEqual(page('[data-pgn-tab]').map((_, node) => page(node).find('[data-pgn-copy]').text().trim()).get(), ['Albums', 'Games', 'Notation', 'Analysis']);
  assert.equal(page('[data-pgn-tab="albums"]').attr('aria-selected'), 'true');
  assert.equal(page('[data-pgn-games]').length, 1);
  assert.equal(page('[data-pgn-notation]').length, 1);
  assert.equal(page('[data-pgn-engine]').length, 1);
  assert.equal(page('[data-pgn-open]').length, 1);
  assert.equal(page('[data-pgn-language]').length, 1);
  assert.equal(page('[data-pgn-options]').length, 1);
  assert.equal(page('[data-pgn-return], [data-pgn-fallback]').length, 0);
  assert.equal(page('script[src*="pgn-mentor-historical-library"]').length, 1);
  assert.equal(page('script[src*="pgn-opening-library"]').length, 1);
  assert.doesNotMatch(runtime, /getPgnCollection|normalizeArchiveReturnTo|loadRegisteredCollectionFromLocation|returnTo/);
  assert.match(read('server.js'), /pathname === '\/pgn-replayer'/);
  assert.match(read('vercel.json'), /"source": "\/pgn-replayer"/);
});

test('isolated Champions replay is registry-gated, hidden from navigation, and has no download path', () => {
  const page = load(read('championship-replay.html'));
  const runtime = read('js/game-library/championship-replay-page.js');
  const navigation = read('js/caissa-primary-navigation.js') + read('js/caissa-standalone-sidebar.js');
  assert.equal(page('[data-championship-replay]').length, 1);
  assert.equal(page('[data-replay-return]').text().replace(/\s+/g, ' ').trim(), 'Return to Champions');
  assert.equal(page('[data-replay-games]').length, 1);
  assert.deepEqual(page('[data-replay-tab]').map((_, node) => page(node).find('span').text().trim()).get(), ['Games', 'Notation']);
  assert.equal(page('[data-replay-tab="games"]').attr('aria-selected'), 'true');
  assert.equal(page('[data-replay-tabpanel="games"]').attr('hidden'), undefined);
  assert.equal(page('[data-replay-tabpanel="notation"]').attr('hidden'), 'hidden');
  assert.equal(page('#championship-replay-board').length, 1);
  assert.equal(page('[download]').length, 0);
  assert.equal(page('[data-caissa-standalone-sidebar]').length, 0);
  assert.doesNotMatch(navigation, /game-library\/champions\/replay/);
  assert.match(runtime, /getPgnCollection\(collectionId\)/);
  assert.match(runtime, /requiredType = context === 'player' \? 'player-collection' : 'championship-match'/);
  assert.match(runtime, /selectTab\('games'\)/);
  assert.match(runtime, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(runtime, /ALLOWED_PARAMS = new Set\(\['collection', 'game', 'context', 'returnTo'\]\)/);
  assert.match(runtime, /fetch\(entry\.readerAsset/);
  assert.doesNotMatch(runtime, /externalDownloadUrl|downloadBlob|params\.get\(['"]url/);
  assert.match(read('server.js'), /pathname === '\/game-library\/champions\/replay'/);
  assert.match(read('vercel.json'), /"source": "\/game-library\/champions\/replay"/);
  assert.equal(buildChampionshipReplayHref('fischer-spassky-game-6', 0), null);
  assert.equal(buildChampionshipReplayHref('capablanca-complete', 0, { context: 'player' }), '/game-library/champions/replay?collection=capablanca-complete&game=0&context=player');
});
