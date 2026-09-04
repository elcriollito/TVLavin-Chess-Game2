import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('game-library.html');
const server = read('server.js');
const vercel = read('vercel.json');
const navigation = read('js/caissa-navigation.js');
const database = read('caissa-library-db.js');
const library = read('caissa-library.js');
const page = load(html);

function catalogs() {
    const source = read('js/caissa-i18n.js');
    const document = { documentElement: {}, querySelectorAll: () => [], addEventListener() {} };
    const window = {
        document, navigator: { languages: ['en'] },
        localStorage: { getItem: () => null, setItem() {} }, dispatchEvent() {}, CustomEvent: class {}
    };
    vm.runInNewContext(source, { window, document });
    return window.CaissaI18n.catalogs;
}

test('Game Library owns a standalone route instead of the Classic document', () => {
    assert.match(server, /pathname === '\/game-library'.*game-library\.html/s);
    const legacyHostList = server.match(/if \((\['\/insights'[\s\S]*?\]\.includes\(pathname\))\)/)?.[1];
    assert.ok(legacyHostList);
    assert.ok(!legacyHostList.includes('/game-library'));
    assert.equal(JSON.parse(vercel).rewrites.find(route => route.source === '/game-library')?.destination, '/game-library.html');
    assert.match(navigation, /window\.location\.href = '\/game-library'/);
    assert.doesNotMatch(navigation, /isLibraryRoute|CaissaGameLibraryPresentation/);
});

test('standalone entry uses the shared CAISSA shell and retains the public construction boundary', () => {
    assert.equal(page('.caissa-standalone-layout').length, 1);
    assert.equal(page('[data-caissa-standalone-sidebar][data-active="library"]').length, 1);
    assert.equal(page('#game-library-main.caissa-standalone-content').length, 1);
    assert.equal(page('body[data-game-library-release="under-construction"]').length, 1);
    assert.equal(page('[data-caissa-library-public-presentation]').length, 1);
    assert.equal(page('[data-game-library-workspace][hidden]').length, 1);
});

test('anti-regression guard rejects every Classic-only host marker and dependency', () => {
    const forbidden = [
        'yahooClassicSection', 'yc-classic-root', 'chess-room', 'room-tables',
        'fics-lobby', 'player-lobby', 'yahoo-classic-section.js', 'classic-bridge', '<iframe'
    ];
    for (const marker of forbidden) assert.ok(!html.toLowerCase().includes(marker.toLowerCase()), marker);
    assert.equal(page('iframe').length, 0);
});

test('recoverable first-party workspace preserves Library behavior and storage boundaries', () => {
    for (const id of [
        'libraryTabPositions', 'libraryTabGames', 'librarySearch', 'queryEngineMount', 'libraryTagFilter',
        'libraryPositionList', 'libraryCollectionList', 'libraryExportJson', 'libraryImportBtn', 'libraryImportInput',
        'libraryEmptyState', 'libraryEmptyGames', 'libraryPagination'
    ]) assert.equal(page(`#${id}`).length, 1, id);
    for (const script of [
        'caissa-library-db.js', 'caissa-library.js', 'caissa-library-ui.js',
        'query-engine.js', 'query-engine-ui.js', 'position-forge.js', 'position-forge-ui.js'
    ]) assert.ok(html.includes(script), script);
    for (const store of ['positions', 'tags', 'collections', 'sync_metadata', 'deletions']) assert.ok(database.includes(`'${store}'`), store);
    for (const operation of ['savePosition', 'listPositions', 'listCollections', 'exportAsJSON', 'exportAsFEN', 'importFromJSON']) {
        assert.match(library, new RegExp(`async ${operation}\\(`), operation);
    }
});

test('EN ES PT catalogs remain exactly equal after the documented shared additions', () => {
    const values = catalogs();
    const keys = Object.fromEntries(['en', 'es', 'pt'].map(locale => [locale, Object.keys(values[locale]).sort()]));
    assert.equal(keys.en.length, 544);
    assert.deepEqual(keys.es, keys.en);
    assert.deepEqual(keys.pt, keys.en);
    for (const key of ['library.title', 'library.positions', 'library.games', 'library.advancedFilters', 'library.backup', 'library.import', 'library.noPositions', 'library.syncFailed']) {
        for (const locale of ['en', 'es', 'pt']) assert.ok(values[locale][key], `${locale}:${key}`);
    }
});

test('Classic remains owned by its authoritative route', () => {
    assert.match(server, /pathname === '\/yahoo-classic'/);
    assert.equal(JSON.parse(vercel).rewrites.find(route => route.source === '/yahoo-classic')?.destination, '/yahoo-classic.html');
    assert.ok(fs.existsSync(new URL('../yahoo-classic.html', import.meta.url)));
});
