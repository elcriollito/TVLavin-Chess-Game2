import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Scanner header exposes a semantic, direct Home link', async () => {
  const html = await read('scanner/index.html');
  assert.match(
    html,
    /<a class="scanner-home-link" href="\/" aria-label="Go to CAISSA Chess homepage">[\s\S]*?<span>Home<\/span>[\s\S]*?<\/a>/
  );
  assert.doesNotMatch(html, /class="scanner-home-link"[^>]+(?:onclick|target)=/);
});

test('Home link keeps an accessible touch target, focus treatment, and compact mobile layout', async () => {
  const css = await read('scanner/scanner-experience.css');
  assert.match(css, /\.app-topbar\{[^}]*justify-content:flex-start[^}]*gap:14px/);
  assert.match(css, /\.scanner-home-link\{[^}]*min-height:44px[^}]*display:inline-flex/);
  assert.match(css, /\.scanner-home-link:focus-visible\{[^}]*outline:/);
  assert.match(css, /@media\(max-width:520px\)\{[^}]*\.scanner-topbar \.public-beta-badge\{display:none\}/);
});
