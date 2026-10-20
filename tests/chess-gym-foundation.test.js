import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Chess Gym foundation keeps the board-first CAISSA workspace contract', () => {
  const html = read('chess-gym.html');
  const page = load(html);

  assert.equal(page('.chess-gym-workspace').length, 1);
  assert.equal(page('#gym-board.chess-gym-board-frame').length, 1);
  assert.equal(page('.chess-gym-panel').length, 1);
  assert.ok(
    html.indexOf('chess-gym-board-column') < html.indexOf('chess-gym-panel'),
    'board must remain ahead of the workspace column in source order'
  );

  assert.deepEqual(
    page('.chess-gym-tabs [role="tab"]').map((_, node) => page(node).text().trim()).get(),
    ['Training', 'Moves', 'Progress']
  );
  assert.deepEqual(
    page('.chess-gym-progress-tabs button').map((_, node) => page(node).text().trim()).get(),
    ['CAISSA', 'Mentor ✦']
  );
  assert.equal(page('#training-train').length, 1);
  assert.equal(page('#training-learn').length, 1);
});

test('Chess Gym reuses the canonical board and starts with skill-first trainers', () => {
  const source = read('js/chess-gym/page.js');
  assert.match(source, /CaissaBoardAdapter/);
  assert.match(source, /dragPolicy:\s*'none'/);

  for (const drill of [
    'loose-pieces',
    'checks-scan',
    'captures-scan',
    'threat-scan',
    'what-changed',
    'attackers-defenders'
  ]) {
    assert.match(source, new RegExp("'" + drill + "'"));
  }

  assert.match(source, /Position Memory/);
  assert.match(source, /Convert the Win/);
  assert.match(source, /Save the Game/);
});

test('Chess Gym responsive geometry preserves one right-column scroll owner', () => {
  const css = read('css/chess-gym.css');
  assert.match(css, /\.chess-gym-workspace\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.chess-gym-panel-body\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.chess-gym-workspace\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('Chess Gym clean route is owned by local and Vercel routing', () => {
  const server = read('server.js');
  const vercel = JSON.parse(read('vercel.json'));

  assert.match(server, /pathname === '\/chess-gym'/);
  assert.equal(
    vercel.rewrites.find(rule => rule.source === '/chess-gym')?.destination,
    '/chess-gym.html'
  );
  assert.equal(
    vercel.rewrites.find(rule => rule.source === '/chess-gym/')?.destination,
    '/chess-gym.html'
  );
});
