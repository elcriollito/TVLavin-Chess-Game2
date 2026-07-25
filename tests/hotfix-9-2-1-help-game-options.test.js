import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function inventory() {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), {
    window,
    document: { querySelectorAll: () => [] }
  });
  return window.CaissaPrimaryNavigation.inventory;
}

test('/help is a canonical standalone page in the persistent shell', () => {
  const page = load(read('help.html'));
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/help');
  assert.equal(page('[data-caissa-standalone-sidebar][data-active="help"]').length, 1);
  assert.equal(page('main h1').text().trim(), 'Help & Quick Start');
  assert.equal(page('.modal').length, 0);
  assert.ok(read('vercel.json').includes('"source": "/help"'));
  assert.match(read('server.js'), /pathname === '\/help'/);
  assert.ok(read('public/sitemap.xml').includes('https://www.caissa-chess.org/help'));
});

test('Help is a route and game-specific Settings is absent from global navigation', () => {
  const support = inventory().support;
  assert.equal(support.find(item => item.id === 'help').route, '/help');
  assert.equal(support.some(item => item.id === 'settings'), false);
});

test('Play owns focused Game Options without duplicate product destinations', () => {
  const page = load(read('index.html'));
  const modal = page('#menuModal');
  assert.equal(modal.find('#game-options-title').text(), 'Game Options');
  assert.equal(modal.find('h3').first().text(), 'Board Setup');
  for (const id of [
    'menuEngineSelect', 'menuChess960Toggle', 'menuNewGame', 'menuFlipBoard',
    'menuPasteFEN', 'menuEditBoard', 'menuEngineVsEngine', 'menuExportPGN'
  ]) assert.equal(modal.find(`#${id}`).length, 1, `${id} missing`);
  assert.equal(modal.find('a[href]').length, 0);
  for (const removed of [
    '#menuAnalyzeGame', '#menuBlogLibrary', '#menuPremium', '#menuVault',
    '#menuPolyglotTool', '#menuLibrary', '#menuCaissaInsight', '#menuMentor',
    '#menuCheaterInsight', '#menuEmbed', '#menuAbout', '#menuCredits'
  ]) assert.equal(modal.find(removed).length, 0, `${removed} remains`);
  assert.equal(page('#helpModal').length, 0);
  assert.ok(!read('index.html').includes('helpModal'));
  assert.match(page('#topbarSettings').attr('aria-label'), /game options/i);
});

test('legacy Help and Settings URLs remain deterministic', () => {
  const middleware = read('middleware.js');
  const navigation = read('js/caissa-navigation.js');
  assert.match(middleware, /searchParams\.get\('action'\) === 'help'/);
  assert.match(middleware, /new URL\('\/help', url\)/);
  assert.match(navigation, /action === 'settings'/);
  assert.match(navigation, /openSettingsModal\(\)/);
  assert.match(navigation, /navigateToSection\('play'\)/);
  assert.doesNotMatch(navigation, /openHelpModal/);
});

test('Game Options X and Escape use the shared close path even from form controls', () => {
  const page = load(read('index.html'));
  const app = read('app.js');
  assert.equal(page('#menuModal .modal-close[data-modal="menuModal"]').length, 1);
  const escape = app.indexOf("if (e.key === 'Escape')");
  const inputGuard = app.indexOf("e.target.tagName === 'INPUT'", escape);
  assert.ok(escape >= 0 && inputGuard > escape);
  assert.match(app.slice(escape, inputGuard), /hideModal\(openModal\.id\)/);
  assert.match(app, /modal\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(app, /safeOn\(topbarSettings, 'click'/);
});

test('Help and Game Options retain responsive shell contracts', () => {
  const help = read('help.html');
  assert.match(help, /caissa-mobile-foundation\.css/);
  assert.match(help, /caissa-standalone-sidebar\.css/);
  assert.match(read('js/caissa-navigation.js'), /if \(window\.innerWidth <= 768\)/);
});
