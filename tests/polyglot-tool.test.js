import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { load } from 'cheerio';
import {
  buildPolyglotBookFromPgn,
  sanitizeBaseFileName,
  validatePgnMetadata
} from '../api/_lib/polyglot-builder.js';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const canonical = 'https://www.caissa-chess.org/tools/polyglot';
const title = 'Polyglot Opening Book Creator for Chess Engines | CAISSA';
const description = 'Turn PGN game files into Polyglot BIN opening books for compatible chess engines, with clear controls for maximum plies, move frequency, side and download.';

function catalogs() {
  const document = { documentElement: { lang: 'en' }, querySelectorAll: () => [], addEventListener() {} };
  const window = {
    document, navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: () => null, setItem() {} }, dispatchEvent() {}, CustomEvent: class CustomEvent {}
  };
  vm.runInNewContext(read('js/caissa-i18n.js'), { window, document });
  return window.CaissaI18n.catalogs;
}

test('Polyglot page exposes unique aligned metadata and valid structured data', () => {
  const $ = load(read('polyglot.html'));
  const schemas = $('script[type="application/ld+json"]').toArray().map(node => JSON.parse($(node).text()));

  assert.equal($('title').length, 1);
  assert.equal($('title').text(), title);
  assert.ok(title.length < 60);
  assert.equal($('meta[name="description"]').attr('content'), description);
  assert.ok(description.length >= 145 && description.length <= 160);
  assert.equal($('link[rel="canonical"]').attr('href'), canonical);
  assert.equal($('meta[property="og:title"]').attr('content'), title);
  assert.equal($('meta[property="og:description"]').attr('content'), description);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical);
  assert.equal($('meta[name="twitter:title"]').attr('content'), title);
  assert.equal($('meta[name="twitter:description"]').attr('content'), description);
  assert.deepEqual(schemas.map(schema => schema['@type']), ['WebPage', 'BreadcrumbList']);
  assert.equal(schemas[0].url, canonical);
  assert.equal(schemas[1].itemListElement.at(-1).item, canonical);
});

test('Polyglot page provides one H1, accurate guidance and crawlable related links', () => {
  const $ = load(read('polyglot.html'));
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const headings = $('.poly-education h2').toArray().map(node => $(node).text().trim());

  assert.equal($('h1').length, 1);
  assert.equal($('h1').text().trim(), 'Polyglot Opening Book Creator');
  assert.match($('.poly-intro').text(), /BIN opening books/);
  assert.match($('.poly-intro').text(), /chess engines/);
  assert.deepEqual(headings, [
    'What Is a Polyglot Opening Book?',
    'What Is a BIN File?',
    'PGN vs Polyglot BIN',
    'How to Use the CAISSA Polyglot Tool',
    'Important Compatibility Notes'
  ]);
  for (const href of ['/opening-database', '/eco', '/blog']) {
    assert.equal($(`.poly-related a[href="${href}"]`).length, 1);
  }
  assert.match(visibleText, /does not analyze positions or replace an engine/);
  assert.match(visibleText, /uploaded to the CAISSA builder service/);
  assert.equal($('#normalize').length, 0, 'page must not expose a no-op weight option');
  assert.doesNotMatch(visibleText, /works with every chess engine|official Polyglot implementation|guaranteed tournament-ready|convert any PGN/i);
});

test('Polyglot Help is one independent sibling and every core form control remains in the tool column', () => {
  const $ = load(read('polyglot.html'));
  const workspace = $('.polyglot-workspace');
  const tool = workspace.children('.polyglot-tool-column');
  const help = workspace.children('.polyglot-help-column');

  assert.equal(workspace.length, 1);
  assert.equal(tool.length, 1);
  assert.equal(help.length, 1);
  assert.equal($('.poly-education').length, 1);
  assert.equal(tool.find('.poly-education').length, 0, 'Help must not return below the tool');
  assert.equal(help.find('.poly-education').length, 1);
  for (const id of ['polyForm', 'pgnFile', 'maxPly', 'minCount', 'side', 'generateBtn', 'buildLog', 'downloadOutputBtn']) {
    assert.equal(tool.find(`#${id}`).length, 1, id);
  }
  assert.equal($('#buildLog').attr('role'), 'log');
  assert.equal($('#buildLog').attr('aria-live'), 'polite');
});

test('Polyglot layout uses bounded grid columns and a container-driven stacked fallback', () => {
  const css = read('css/polyglot-tool.css');
  assert.match(css, /\.polyglot-workspace\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(320px,\s*0\.92fr\)/);
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container\s*\(max-width:\s*880px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.doesNotMatch(css, /\.polyglot-help-column[^}]*position:\s*(?:absolute|fixed)/s);
});

test('Polyglot page and dynamic states have exact EN ES PT catalog parity', () => {
  const values = catalogs();
  const keys = Object.fromEntries(['en', 'es', 'pt'].map(locale => [locale, Object.keys(values[locale]).sort()]));
  assert.equal(keys.en.length, 621);
  assert.deepEqual(keys.es, keys.en);
  assert.deepEqual(keys.pt, keys.en);
  const polyglotKeys = keys.en.filter(key => key.startsWith('polyglot.'));
  assert.equal(polyglotKeys.length, 63);
  for (const key of polyglotKeys) {
    for (const locale of ['en', 'es', 'pt']) assert.ok(values[locale][key], `${locale}:${key}`);
  }
  assert.equal(values.es['polyglot.generate'], 'Generar libro de aperturas');
  assert.equal(values.pt['polyglot.generate'], 'Gerar livro de aberturas');
  assert.match(values.pt['polyglot.bookCopy'], /Polyglot/);
});

test('Polyglot client localizes live logs, errors, result summary, metadata, and busy state', () => {
  const source = read('js/polyglot-tool.js');
  for (const token of ['i18n?.subscribe', 'renderLog()', 'renderOutputSummary()', 'localizeBuildError', 'polyglot.log.buildFailed', 'polyglot.outputSummary']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), token);
  }
  assert.match(source, /generateBtn\.disabled = pending/);
  assert.match(source, /generateBtn\.setAttribute\('aria-busy'/);
});

test('Polyglot route is represented once in sitemap and reciprocal link is present', () => {
  const sitemap = read('public/sitemap.xml');
  const matches = sitemap.match(/<loc>https:\/\/www\.caissa-chess\.org\/tools\/polyglot<\/loc>/g) || [];
  const openingDatabase = load(read('opening-database.html'));
  const server = read('server.js');

  assert.equal(matches.length, 1);
  assert.ok(!sitemap.includes('<loc>https://www.caissa-chess.org/tools/polyglot/</loc>'));
  assert.ok(!sitemap.includes('/tools/polyglot?'));
  assert.equal(openingDatabase('a[href="/tools/polyglot"]').length, 1);
  assert.match(read('public/robots.txt'), /User-agent:\s*\*\s*[\r\n]+Allow:\s*\//);
  assert.match(server, /pathname === '\/tools\/polyglot'/);
});

test('Polyglot title and description are unique across repository HTML', () => {
  const matches = { title: [], description: [] };
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name.endsWith('.html')) {
        const $ = load(fs.readFileSync(absolute, 'utf8'));
        if ($('title').text() === title) matches.title.push(path.relative(root, absolute));
        if ($('meta[name="description"]').attr('content') === description) matches.description.push(path.relative(root, absolute));
      }
    }
  };
  walk(root);

  assert.deepEqual(matches.title, ['polyglot.html']);
  assert.deepEqual(matches.description, ['polyglot.html']);
});

test('Polyglot builder creates sorted standard 16-byte entries from PGN', () => {
  const pgn = `[Event "King Pawn"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n\n[Event "Queen Pawn"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 e6 1/2-1/2`;
  const { buffer, summary } = buildPolyglotBookFromPgn(pgn, {
    maxPly: 4,
    minCount: 1,
    side: 'both'
  });

  assert.equal(summary.gamesParsed, 2);
  assert.equal(buffer.length, summary.entriesWritten * 16);
  assert.ok(summary.entriesWritten > 0);

  const entries = [];
  for (let offset = 0; offset < buffer.length; offset += 16) {
    entries.push({
      key: buffer.readBigUInt64BE(offset),
      move: buffer.readUInt16BE(offset + 8),
      weight: buffer.readUInt16BE(offset + 10),
      learn: buffer.readUInt32BE(offset + 12)
    });
  }
  for (let index = 1; index < entries.length; index += 1) {
    assert.ok(
      entries[index - 1].key < entries[index].key
        || (entries[index - 1].key === entries[index].key && entries[index - 1].move <= entries[index].move)
    );
  }
  assert.ok(entries.every(entry => entry.weight >= 1 && entry.learn === 0));
  assert.ok(entries.some(entry => entry.key === 0x463b96181691fc9cn), 'standard starting-position key missing');
});

test('Polyglot builder rejects invalid metadata and unusable PGN', () => {
  assert.deepEqual(validatePgnMetadata('games.pgn', 'application/x-chess-pgn'), { ok: true });
  assert.equal(validatePgnMetadata('games.txt', 'text/plain').ok, false);
  assert.equal(validatePgnMetadata('games.pgn', 'image/png').ok, false);
  assert.equal(sanitizeBaseFileName('My Tournament Games.PGN'), 'my-tournament-games');
  assert.throws(() => buildPolyglotBookFromPgn('not a chess game'), /Could not parse any valid PGN games/);
});
