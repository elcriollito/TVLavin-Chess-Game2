import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../online.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../css/online.css', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('online shell is board-first with one tabbed workspace and accessible status', () => {
    assert.match(html, /id="online-board"/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /data-tab="new"[\s\S]+data-tab="games"[\s\S]+data-tab="players"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(css, /grid-template-columns:minmax\(480px,1fr\) minmax\(350px,440px\)/);
});

test('online route is isolated, private-cache, noindex, and keeps the retired play route intact', () => {
    assert.ok(vercel.rewrites.some(item => item.source === '/online' && item.destination === '/online.html'));
    assert.ok(vercel.rewrites.some(item => item.source === '/play' && item.destination === '/play-v2-unavailable.html'));
    const headers = vercel.headers.find(item => item.source === '/online').headers;
    assert.ok(headers.some(item => item.key === 'Cache-Control' && item.value.includes('no-store')));
    assert.ok(headers.some(item => item.key === 'X-Robots-Tag' && item.value.includes('noindex')));
    assert.ok(headers.some(item => item.key === 'Content-Security-Policy' && item.value.includes('wss://*.supabase.co')));
});

test('completed games use the existing opaque Analyze handoff transport', () => {
    const source = fs.readFileSync(new URL('../../js/online/online-page.js', import.meta.url), 'utf8');
    assert.match(source, /CaissaAnalyzeHandoff\?\.createTransport/);
    assert.match(source, /\/analyze\?handoff=/);
    assert.doesNotMatch(source, /[?&](?:pgn|fen)=/i);
});
