import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const exec = promisify(execFile);

test('generated Play v2 owns every executable static dependency', async () => {
  const html = await read('play-v2.html');
  const resources = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  assert.equal(resources.filter(element => /(?:src|href)=["']https?:\/\//i.test(element)).length, 0);
  for (const path of [
    '/assets/vendor/jquery/jquery-3.6.0.min.js',
    '/assets/vendor/chess.js/chess-0.10.3.min.js',
    '/assets/vendor/chessboard.js/chessboard-1.0.0.min.js',
    '/assets/vendor/font-awesome/css/all-6.4.0.min.css',
  ]) assert(html.includes(path), path);
  assert.match(html, /connect-src 'self';/);
  assert.doesNotMatch(html, /connect-src[^;]*https?:/);
});

test('vendored dependency bytes match the pinned manifest', async () => {
  const { stdout } = await exec(process.execPath, ['scripts/vendor-play-v2-dependencies.mjs'], {
    cwd: new URL('../..', import.meta.url),
  });
  assert.match(stdout, /Verified 16 Play v2 dependency assets/);
});

test('Classic retains its existing external dependency ownership', async () => {
  const html = await read('index.html');
  assert.match(html, /https:\/\/code\.jquery\.com\/jquery-3\.6\.0\.min\.js/);
  assert.match(html, /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/chess\.js\/0\.10\.3\/chess\.min\.js/);
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\/npm\/@chrisoakman\/chessboardjs@1\.0\.0/);
});
