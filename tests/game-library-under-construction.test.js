import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const i18n = read('js/caissa-i18n.js');
const presentation = read('js/caissa-game-library-presentation.js');
const navigation = read('js/caissa-navigation.js');
const libraryRuntime = read('caissa-library-ui.js');

test('public Game Library route has an isolated localized construction boundary', () => {
    assert.match(html, /data-caissa-library-public-presentation/);
    assert.match(html, /data-caissa-i18n="library\.title">Game Library/);
    assert.match(html, /data-caissa-i18n="library\.status">Under Construction/);
    assert.match(html, /We’re building your personal chess library\./);
    assert.match(html, /Soon you’ll be able to save positions, games and analysis here\./);
    assert.match(html, /class="caissa-library-construction-home" href="\/play"/);
    assert.match(presentation, /const route = '\/game-library'/);
    assert.match(navigation, /CaissaGameLibraryPresentation\?\.shouldPresent/);
});

test('English and Spanish construction copy are complete semantic catalog entries', () => {
    for (const value of [
        'Game Library', 'Under Construction', 'We’re building your personal chess library.',
        'Biblioteca de partidas', 'En construcción', 'Estamos creando tu biblioteca personal de ajedrez.',
        'Próximamente podrás guardar posiciones, partidas y análisis aquí.'
    ]) assert.ok(i18n.includes(value), value);
});

test('the prior Game Library implementation remains recoverable and loaded', () => {
    for (const id of [
        'libraryTabPositions', 'libraryTabGames', 'librarySearch', 'libraryPositionList',
        'libraryCollectionList', 'libraryExportJson', 'libraryImportBtn', 'libraryImportInput'
    ]) assert.match(html, new RegExp(`id="${id}"`));
    for (const script of ['caissa-library-db.js', 'caissa-library.js', 'caissa-library-ui.js']) {
        assert.ok(html.includes(script), script);
    }
    assert.match(libraryRuntime, /async open\(\)/);
    assert.match(libraryRuntime, /handleExportJSON/);
    assert.match(libraryRuntime, /handleImport/);
    assert.doesNotMatch(presentation, /remove\(|innerHTML\s*=|replaceChildren/);
});

test('construction presentation contains no commercial or launch-date claims', () => {
    const boundary = html.match(/<main class="caissa-library-construction"[\s\S]*?<\/main>/)?.[0] || '';
    assert.ok(boundary);
    assert.doesNotMatch(boundary, /premium|pricing|price|subscribe|launch date|release date/i);
});
