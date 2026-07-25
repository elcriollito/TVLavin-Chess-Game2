import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const publicHtml = [
  'index.html', 'yahoo-classic.html', 'about.html', 'help.html', 'roadmap.html',
  'endgame-library.html', 'endgame-trainer.html', 'polyglot.html',
  'eco.html', 'opening-database.html', 'vault.html', 'blog/index.html',
  'blog/who-is-caissa-goddess-of-chess/index.html',
  'blog/what-is-a-polyglot-opening-book/index.html',
  'blog/yahoo-chess-spirit-caissa-classic/index.html'
];

test('About describes benefits without publishing the protected implementation stack', () => {
  const about = read('about.html');
  const page = load(about);
  const text = page('main').text().replace(/\s+/g, ' ');
  for (const disclosure of [
    'Technology Stack', 'WebAssembly', 'Chess.js', 'Chessboard.js', 'Together.ai',
    'OpenAI', 'Anthropic', 'Llama API', 'IndexedDB', 'Supabase', 'Vercel',
    'serverless', 'open source', 'auditable on GitHub'
  ]) {
    assert.ok(!text.toLowerCase().includes(disclosure.toLowerCase()), `${disclosure} remains public`);
  }
  assert.match(text, /strong analysis/i);
  assert.match(text, /guided study/i);
  assert.equal(page('a[href*="github.com/anthropics/caissa-chess"]').length, 0);
});

test('About privacy language is bounded to verified browser and online behavior', () => {
  const text = load(read('about.html'))('main').text().replace(/\s+/g, ' ');
  for (const absolute of [
    'We never see your positions or games',
    "We don't use Google Analytics or third-party trackers",
    'We never store them permanently',
    'run entirely in your browser',
    'no server-side game processing'
  ]) assert.ok(!text.includes(absolute), `${absolute} remains public`);
  assert.match(text, /browser storage/i);
  assert.match(text, /online services/i);
  assert.match(text, /optional accounts/i);
});

test('public roadmap remains useful without exposing delivery or infrastructure blueprints', () => {
  const roadmap = JSON.parse(read('data/roadmap.json'));
  const text = JSON.stringify(roadmap);
  for (const disclosure of [
    'Supabase', 'Vercel', 'IndexedDB', 'Stripe', 'Clerk', 'API endpoint',
    'conflict resolution', 'service', 'schema', 'February 2026'
  ]) assert.ok(!text.includes(disclosure), `${disclosure} remains in public roadmap`);
  assert.ok(roadmap.completed.length);
  assert.ok(roadmap.inProgress.length);
  assert.ok(roadmap.planned.length);
});

test('internal architecture and authoring sources are excluded from deployment', () => {
  const ignored = read('.vercelignore');
  for (const pattern of [
    'docs/**', 'PROJECT_ARCHITECTURE.md', 'knowledge/AUTHORING.md',
    'knowledge/authoring/**', 'knowledge/domains/**', 'knowledge/schema/**'
  ]) assert.ok(ignored.includes(pattern), `${pattern} is not deployment-excluded`);
  const releaseBuilder = read('scripts/build-public-release.mjs');
  for (const protectedPath of [
    "'docs/'", "'knowledge/authoring/'", "'knowledge/domains/'",
    "'knowledge/schema/'", "'knowledge/consumer/'"
  ]) assert.ok(releaseBuilder.includes(protectedPath), `${protectedPath} is not physically excluded`);
  assert.match(read('package.json'), /"release:public:audit"/);
  const sitemap = read('public/sitemap.xml');
  assert.doesNotMatch(sitemap, /docs\/|PROJECT_ARCHITECTURE|knowledge\/AUTHORING/);
});

test('public HTML has no local machine path or obvious secret token', () => {
  const secret = /(?:sk_live_|sk_test_|ghp_|vercel_)[A-Za-z0-9_-]{16,}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/;
  const localPath = /(?:[A-Z]:[\\/]+Users[\\/]+|\/Users\/[^/]+\/)/i;
  for (const path of publicHtml) {
    const source = read(path);
    assert.doesNotMatch(source, secret, `${path} contains a secret-like value`);
    assert.doesNotMatch(source, localPath, `${path} contains a local machine path`);
  }
});

test('required third-party engine attribution remains available', () => {
  const page = read('index.html');
  for (const required of ['Stockfish 16 - GPLv3', 'Arasan - MIT', 'Fairy-Stockfish - GPLv3']) {
    assert.ok(page.includes(required), `${required} attribution was removed`);
  }
});
