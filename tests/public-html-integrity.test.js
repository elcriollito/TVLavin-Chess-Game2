import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const vercel = JSON.parse(fs.readFileSync(new URL('vercel.json', root), 'utf8'));
const htmlDestinations = [...new Set(vercel.rewrites
  .map(rule => String(rule.destination || ''))
  .filter(destination => /^\/[A-Za-z0-9._/-]+\.html$/.test(destination))
  .map(destination => destination.slice(1)))];

test('every static HTML rewrite target is valid UTF-8 with standards mode enabled', () => {
  assert.ok(htmlDestinations.includes('index.html'));
  assert.ok(htmlDestinations.includes('yahoo-classic.html'));
  assert.ok(htmlDestinations.length >= 30);
  for (const destination of htmlDestinations) {
    const bytes = fs.readFileSync(new URL(destination, root));
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').trimStart();
    assert.match(html, /^<!DOCTYPE html>/i, `${destination} is not a standards-mode HTML document`);
  }
});
