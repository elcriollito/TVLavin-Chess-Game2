import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const loader = read('js/caissa-clarity.js');
const PROJECT_ID = 'xskndnmhky';
const TAG_URL = `https://www.clarity.ms/tag/${PROJECT_ID}`;
const OBSOLETE_PROJECT_ID = ['xsj', 'vqwy3ns'].join('');

function environment({
  hostname = 'www.caissa-chess.org',
  protocol = 'https:',
  webdriver = false,
  stored = {}
} = {}) {
  const scripts = [];
  const listeners = new Map();
  const storage = new Map(Object.entries(stored));
  const controls = [];
  const document = {
    readyState: 'complete',
    head: { appendChild: element => scripts.push(element) },
    documentElement: { appendChild: element => scripts.push(element) },
    createElement: tag => ({ tagName: tag.toUpperCase() }),
    getElementById: id => scripts.find(script => script.id === id) || null,
    querySelector: selector => {
      if (selector.startsWith('script[src*=')) {
        return scripts.find(script => script.src === TAG_URL) || null;
      }
      return null;
    },
    querySelectorAll: selector => selector === '[data-caissa-analytics-consent]' ? controls : [],
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const window = {
    location: { hostname, protocol },
    navigator: { webdriver },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    }
  };
  vm.runInNewContext(loader, { window, document, Set });
  return { window, document, scripts, storage, listeners };
}

test('loader uses the approved project and asynchronous official tag URL', () => {
  const result = environment();
  assert.equal(result.window.CaissaClarity.projectId, PROJECT_ID);
  assert.equal(result.scripts.length, 1);
  assert.equal(result.scripts[0].src, TAG_URL);
  assert.equal(result.scripts[0].async, true);
  assert.doesNotMatch(loader, new RegExp(OBSOLETE_PROJECT_ID));
});

test('only exact production hosts initialize Clarity', () => {
  assert.equal(environment({ hostname: 'www.caissa-chess.org' }).scripts.length, 1);
  assert.equal(environment({ hostname: 'caissa-chess.org' }).scripts.length, 1);
  for (const hostname of [
    'localhost', '127.0.0.1', 'caissa-chess.org.example.com',
    'caissa-chess-git-main.vercel.app', 'preview.vercel.app'
  ]) assert.equal(environment({ hostname }).scripts.length, 0, hostname);
  assert.equal(environment({ protocol: 'http:' }).scripts.length, 0);
  assert.equal(environment({ webdriver: true }).scripts.length, 0);
});

test('repeated initialization never duplicates the tag', () => {
  const result = environment();
  assert.equal(result.window.CaissaClarity.initialize(), false);
  assert.equal(result.window.CaissaClarity.initialize(), false);
  assert.equal(result.scripts.length, 1);
});

test('Consent API V2 defaults analytics and advertising storage to denied', () => {
  const result = environment();
  assert.equal(result.window.clarity.q.length, 1);
  assert.equal(result.window.clarity.q[0][0], 'consentv2');
  assert.equal(result.window.clarity.q[0][1].analytics_Storage, 'denied');
  assert.equal(result.window.clarity.q[0][1].ad_Storage, 'denied');
});

test('stored grant and later withdrawal update Consent API V2 without granting ads', () => {
  const result = environment({ stored: { 'caissa:analytics-consent:v1': 'granted' } });
  assert.equal(result.window.clarity.q[0][1].analytics_Storage, 'granted');
  assert.equal(result.window.CaissaClarity.setConsent('denied'), 'denied');
  assert.equal(result.storage.get('caissa:analytics-consent:v1'), 'denied');
  assert.equal(result.window.clarity.q.at(-1)[1].analytics_Storage, 'denied');
  assert.equal(result.window.clarity.q.at(-1)[1].ad_Storage, 'denied');
});

test('eligible pages use one shared loader and generated article template includes it', () => {
  const eligible = [
    'index.html', 'about.html', 'help.html', 'blog/index.html', 'yahoo-classic.html',
    'eco.html', 'opening-database.html', 'polyglot.html', 'endgame-trainer.html',
    'blog/who-is-caissa-goddess-of-chess/index.html',
    'blog/what-is-a-polyglot-opening-book/index.html',
    'blog/yahoo-chess-spirit-caissa-classic/index.html'
  ];
  for (const path of eligible) {
    assert.equal((read(path).match(/caissa-clarity\.js/g) || []).length, 1, path);
  }
  assert.match(read('scripts/build-blog.mjs'), /caissa-clarity\.js/);
  assert.match(read('scripts/build-yahoo-classic.mjs'), /index\.html/);
});

test('sensitive and account-oriented page categories are masked or excluded', () => {
  for (const path of [
    'index.html', 'yahoo-classic.html', 'eco.html', 'opening-database.html',
    'polyglot.html', 'endgame-trainer.html'
  ]) assert.match(read(path), /<body[^>]*data-clarity-mask/, path);
  assert.match(read('yahoo-classic.html'), /<body class="yc-standalone-page" data-clarity-mask>/);
  for (const path of ['signin.html', 'signup.html', 'premium.html', 'vault.html', 'library.html']) {
    assert.doesNotMatch(read(path), /caissa-clarity\.js/, path);
  }
  const changedPublicPages = [
    'index.html', 'about.html', 'help.html', 'blog/index.html', 'yahoo-classic.html',
    'eco.html', 'opening-database.html', 'polyglot.html', 'endgame-trainer.html'
  ].map(read).join('\n');
  assert.doesNotMatch(changedPublicPages, /data-clarity-unmask/);
});

test('privacy disclosure and narrow consent controls are present', () => {
  const about = read('about.html');
  assert.match(about, /Microsoft Clarity/);
  assert.match(about, /data-caissa-analytics-consent="granted"/);
  assert.match(about, /data-caissa-analytics-consent="denied"/);
  assert.match(about, /limited interaction and device data outside your browser/);
});

test('CSP additions are limited to required Clarity script and connection hosts', () => {
  for (const path of ['index.html', 'about.html', 'yahoo-classic.html']) {
    const html = read(path);
    assert.match(html, /script-src-elem[^;]+https:\/\/\*\.clarity\.ms/);
    assert.match(html, /connect-src[^;]+https:\/\/\*\.clarity\.ms/);
    assert.match(html, /connect-src[^;]+https:\/\/c\.bing\.com/);
  }
});

test('SEO metadata remains route-specific and unchanged in purpose', () => {
  assert.match(read('index.html'), /<title>CAISSA Chess – Play Online, Stockfish Analysis & Training<\/title>/);
  assert.match(read('eco.html'), /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/eco">/);
  assert.match(read('opening-database.html'), /<title>Chess Opening Database - CAISSA<\/title>/);
  assert.match(read('polyglot.html'), /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/tools\/polyglot">/);
});
