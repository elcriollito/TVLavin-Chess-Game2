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

test('online shell removes horizontal chrome and keeps accessible side navigation', () => {
    assert.match(html, /<h1 id="online-title" class="sr-only">Online Chess<\/h1>/);
    assert.doesNotMatch(html, /class="online-header"/);
    assert.doesNotMatch(html, /class="online-titlebar"/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /id="room-status"[\s\S]*?id="find-game"/);
    assert.match(css, /--online-vertical-reserve:calc\(120px \+ clamp\(16px,3\.34dvh,48px\)\)/);
    assert.match(css, /width:min\(1540px,calc\(100vw - 112px\)\)/);
    assert.match(html, /class="online-menu-shell"[\s\S]*aria-label="Primary navigation"/);
    assert.match(html, /id="account-link"/);
});

test('visitor board stays visible and sign-in is an explicit dialog action', () => {
    assert.match(html, /id="board-curtain" hidden/);
    assert.match(html, /id="signin-dialog"[\s\S]*Sign in to play online/);
    assert.match(html, /Sign in to find an opponent or challenge a friend\./);
    assert.match(html, /<button value="cancel">Not now<\/button>/);
    assert.match(html, /<button value="signin" class="primary-action">Sign in<\/button>/);
});

test('player-facing panel copy follows enabled capabilities without internal diagnostics', () => {
    assert.doesNotMatch(html, /Protocol 1\.0\.0|private-game contract|feature flag|service flag/i);
    assert.match(html, /id="game-mode-label">Casual/);
    assert.match(html, /Open games aren't available yet/);
    assert.match(html, /Public joinable games are not enabled in this version/);
    assert.match(html, /id="workspace-foot-context">Private, server-verified games/);
});

test('tournament proposal is an isolated, synthetic and accessible panel', () => {
    assert.ok(vercel.rewrites.some(item => item.source === '/online/tournament-demo' && item.destination === '/online.html'));
    assert.match(html, /id="tab-tournament"[^>]*hidden/);
    assert.match(html, /id="panel-tournament"[\s\S]*Visual demo[\s\S]*Current standings/);
    assert.match(html, /class="is-current-player"[\s\S]*Alexander <span>\(you\)<\/span>/);
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
    assert.match(html, /Open games aren't available yet/);
    assert.match(html, /Public joinable games are not enabled in this version/);
});

test('custom clock labels are complete and share one aligned control grid', () => {
    assert.match(html, /<span>Minutes<\/span><input id="custom-minutes"/);
    assert.match(html, /<span>Increment \(seconds\)<\/span><input id="custom-increment"/);
    assert.doesNotMatch(html, /<span>seconds<\/span>/);
    assert.match(css, /\.custom-clock\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*align-items:start/);
    assert.match(css, /\.custom-clock input\{[^}]*height:40px/);
});
