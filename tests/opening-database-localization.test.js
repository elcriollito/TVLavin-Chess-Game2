import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function loadI18n() {
  const document = {
    documentElement: { lang: 'en' },
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  const storage = new Map();
  const window = {
    document,
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    dispatchEvent() {}
  };
  vm.runInNewContext(read('js/caissa-i18n.js'), { window, console, CustomEvent: class CustomEvent {} });
  return window.CaissaI18n;
}

test('Opening Database catalogs have exact EN ES PT key parity and no empty values', () => {
  const i18n = loadI18n();
  const openingKeys = (locale) => Object.keys(i18n.catalogs[locale]).filter((key) => key.startsWith('openingdb.')).sort();
  const english = openingKeys('en');
  assert.ok(english.length >= 180, `expected broad Opening Database coverage, received ${english.length} keys`);
  assert.deepEqual(openingKeys('es'), english);
  assert.deepEqual(openingKeys('pt'), english);
  for (const locale of ['en', 'es', 'pt']) {
    for (const key of english) assert.ok(String(i18n.catalogs[locale][key]).trim(), `${locale}:${key}`);
  }
  assert.equal(i18n.catalogs.es['openingdb.title'], 'Explorador de aperturas');
  assert.equal(i18n.catalogs.pt['openingdb.title'], 'Explorador de aberturas');
});

test('every Opening Database HTML and runtime translation reference resolves in all enabled catalogs', () => {
  const i18n = loadI18n();
  const html = read('opening-database.html');
  const runtime = read('js/opening-database.js');
  const adapter = read('js/opening-database-i18n.js');
  const references = new Set();
  for (const source of [html, runtime, adapter]) {
    for (const match of source.matchAll(/openingdb\.[a-zA-Z0-9_.]+/g)) references.add(match[0]);
  }
  references.delete('openingdb.debug');
  for (const key of references) if (key.endsWith('.')) references.delete(key);
  assert.ok(references.size >= 180);
  for (const locale of ['en', 'es', 'pt']) {
    const missing = [...references].filter((key) => !(key in i18n.catalogs[locale]));
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);
  }
});

test('page adapter loads after the global catalog and runtime subscribes without board reconstruction', () => {
  const html = read('opening-database.html');
  const runtime = read('js/opening-database.js');
  const globalIndex = html.indexOf('/js/caissa-i18n.js');
  const adapterIndex = html.indexOf('/js/opening-database-i18n.js');
  const runtimeIndex = html.indexOf('/js/opening-database.js');
  assert.ok(globalIndex >= 0 && globalIndex < adapterIndex && adapterIndex < runtimeIndex);
  assert.match(runtime, /openingDbI18n\?\.subscribe\?\.\(refreshOpeningDatabaseLocale\)/);
  const refreshBody = runtime.match(/function refreshOpeningDatabaseLocale\(\) \{([\s\S]*?)\n  \}\n\n  async function runInit/)?.[1] || '';
  assert.ok(refreshBody);
  assert.doesNotMatch(refreshBody, /initBoard|destroyBoard|startEngineAnalysis|loadDatasets|updatePositionView/);
  assert.match(refreshBody, /renderGamesRows\(state\.gamesResults\)/);
  assert.match(refreshBody, /renderMoveReview\(\)/);
});
