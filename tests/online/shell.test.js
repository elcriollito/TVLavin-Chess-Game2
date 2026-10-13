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
    assert.match(css, /--online-layout-gap:clamp\(24px,2vw,32px\)/);
    assert.match(css, /--online-board-size:min\(/);
    assert.match(css, /\.online-main\{container-type:inline-size\}/);
    assert.match(css, /calc\(100cqw - var\(--online-workspace-width\) - var\(--online-layout-gap\)\)/);
    assert.match(css, /justify-content:center/);
    assert.match(css, /grid-template-rows:60px var\(--online-board-size\) 60px/);
    assert.match(css, /\.play-workspace\{[\s\S]*?align-self:stretch/);
    assert.match(css, /\.move-list\{[\s\S]*?overflow:visible/);
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

test('turn status is screen-reader only while clocks retain the visual turn signal', () => {
    assert.match(html, /id="turn-copy" class="sr-only" role="status" aria-live="polite"/);
    assert.doesNotMatch(html, /class="game-status-line"/);
    assert.match(css, /\.player-strip\[data-running=true\] \.player-clock/);
    assert.match(css, /\.sr-only\{/);
});

test('Games distinguishes personal history from unsupported open games', () => {
    assert.match(html, /data-games-view="history"[\s\S]+data-games-view="open"/);
    assert.match(html, /id="games-list"/);
    assert.match(html, /No open games available/);
    assert.match(html, /Public joinable games are not part of the current private-game contract/);
});

test('custom clock labels are complete and share one aligned control grid', () => {
    assert.match(html, /<span>Minutes<\/span><input id="custom-minutes"/);
    assert.match(html, /<span>Increment \(seconds\)<\/span><input id="custom-increment"/);
    assert.doesNotMatch(html, /<span>seconds<\/span>/);
    assert.match(css, /\.custom-clock\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*align-items:start/);
    assert.match(css, /\.custom-clock input\{[^}]*height:40px/);
});
