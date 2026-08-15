import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'cheerio';
import {
  FEATURED_TOURNAMENT, FEATURED_TOURNAMENT_SCHEMA,
  validateFeaturedTournament, featuredTournamentStatus
} from '../js/live-tournaments-config.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const invalid = changes => ({ ...FEATURED_TOURNAMENT, ...changes });

test('one immutable configuration owner exposes the verified schema and fields', () => {
  assert.equal(FEATURED_TOURNAMENT_SCHEMA, 'CaissaFeaturedExternalTournament@1.0.0');
  assert.ok(Object.isFrozen(FEATURED_TOURNAMENT));
  assert.equal(validateFeaturedTournament(FEATURED_TOURNAMENT).ok, true);
  assert.deepEqual(Object.keys(FEATURED_TOURNAMENT).sort(), [
    'displayName', 'endsAt', 'eventTimezone', 'fallbackMode', 'frameUrl', 'id', 'location',
    'organizerName', 'organizerUrl', 'provider', 'providerEventUrl', 'schema', 'startsAt', 'verifiedAt'
  ]);
  assert.equal(FEATURED_TOURNAMENT.organizerName, 'Esports World Cup Foundation');
  assert.equal(FEATURED_TOURNAMENT.eventTimezone, 'Europe/Paris');
});

test('configuration validation rejects URL, schema, text, schedule, and timezone attacks', () => {
  const rejected = [
    invalid({ schema: 'other' }), invalid({ id: '' }), invalid({ displayName: '<img src=x onerror=alert(1)>' }),
    invalid({ frameUrl: 'http://live.chessbase.com/frame/Event' }),
    invalid({ frameUrl: 'https://evil.example/frame/Event' }),
    invalid({ frameUrl: 'https://live.chessbase.com:444/frame/Event' }),
    invalid({ frameUrl: 'https://user:pass@live.chessbase.com/frame/Event' }),
    invalid({ frameUrl: 'https://live.chessbase.com/frame/Event?next=https://evil.example' }),
    invalid({ frameUrl: 'https://live.chessbase.com/frame/Event#x' }),
    invalid({ frameUrl: '//live.chessbase.com/frame/Event' }),
    invalid({ frameUrl: 'javascript:alert(1)' }), invalid({ frameUrl: 'data:text/html,x' }),
    invalid({ frameUrl: 'blob:https://live.chessbase.com/x' }), invalid({ frameUrl: 'https%3A//live.chessbase.com/frame/Event' }),
    invalid({ providerEventUrl: 'https://live.chessbase.com/en/Watch?id=Different-Event' }),
    invalid({ startsAt: 'not-a-date' }), invalid({ endsAt: FEATURED_TOURNAMENT.startsAt }),
    invalid({ startsAt: FEATURED_TOURNAMENT.endsAt }), invalid({ eventTimezone: 'Mars/Olympus' }),
    invalid({ organizerUrl: 'https://user:pass@example.com/' }), invalid({ extra: 'field' })
  ];
  for (const candidate of rejected) assert.equal(validateFeaturedTournament(candidate).ok, false, JSON.stringify(candidate));
});

test('UTC status boundaries are exact and availability never implies live play', () => {
  const start = Date.parse(FEATURED_TOURNAMENT.startsAt);
  const end = Date.parse(FEATURED_TOURNAMENT.endsAt);
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(start - 1)), 'upcoming');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(start)), 'coverage-window');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(start + 1)), 'coverage-window');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(end - 1)), 'coverage-window');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(end)), 'completed');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(end + 1)), 'completed');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, new Date(start), 'unavailable'), 'unavailable');
  assert.equal(featuredTournamentStatus(invalid({ schema: 'bad' }), new Date(start)), 'configuration-error');
  assert.equal(featuredTournamentStatus(FEATURED_TOURNAMENT, '2026-08-15T02:35:08Z'), 'coverage-window');
});

test('HTML has no static iframe or duplicated event record and preserves SEO/disclosure mounts', () => {
  const html = read('live-tournaments.html');
  const page = load(html);
  assert.equal(page('title').text(), 'Watch Live Chess Tournaments | CAISSA Chess');
  assert.equal(page('meta[name="description"]').attr('content'), 'Watch a featured live chess tournament through the official ChessBase broadcast viewer, available from CAISSA Chess.');
  assert.equal(page('link[rel="canonical"]').attr('href'), 'https://www.caissa-chess.org/watch/live-tournaments');
  assert.equal(page('meta[property="og:title"]').attr('content'), 'Watch Live Chess Tournaments | CAISSA Chess');
  assert.equal(page('meta[name="twitter:title"]').attr('content'), 'Watch Live Chess Tournaments | CAISSA Chess');
  assert.equal(page('h1').length, 1);
  assert.equal(page('h1').text(), 'Watch a Featured Live Chess Tournament');
  assert.equal(page('iframe').length, 0);
  assert.equal(page('meta[name="keywords"]').length, 0);
  assert.doesNotMatch(page('meta[name="robots"]').attr('content') || '', /noindex/i);
  assert.doesNotMatch(html, /Esports-World-Cup-Chess-Playoff-2026|Esports World Cup Chess Finals 2026/);
  assert.equal(page('[data-live-tournaments-frame-mount]').length, 1);
  assert.match(page('.live-tournaments-disclosure').text(), /CAISSA Chess is an independent credited gateway/);
  assert.match(page('main').text(), /Coverage window reflects the published event schedule/);
  assert.match(page('main').text(), /future CAISSA Weekend Tournament.*separate/s);
  assert.equal(page('[data-live-tournaments-error][role="alert"]').length, 1);
  assert.equal(page('[data-live-tournaments-retry]').length, 1);
});

test('event framing policy and provider runtime remain cross-origin and frame-only', () => {
  const page = load(read('live-tournaments.html'));
  const csp = page('meta[http-equiv="Content-Security-Policy"]').attr('content') || '';
  assert.match(csp, /frame-src https:\/\/live\.chessbase\.com;/);
  assert.doesNotMatch(csp, /\*\.chessbase\.com|wss:|connect-src[^;]*chessbase/i);
  const source = read('live-tournaments.html') + read('js/live-tournaments-parent.js');
  assert.doesNotMatch(source, /class=["']cblive|data-event|data-date|WebSocket|EventSource|fetch\(|XMLHttpRequest|setInterval|postMessage/i);
  assert.doesNotMatch(source, /URLSearchParams|location\.search/i);
  assert.match(read('js/live-tournaments-parent.js'), /allow-scripts allow-same-origin/);
  const globalCsp = JSON.parse(read('vercel.json')).headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /frame-src[^;]*https:\/\/live\.chessbase\.com/);
  assert.doesNotMatch(globalCsp, /script-src[^;]*live\.chessbase\.com|connect-src[^;]*live\.chessbase\.com/);
});

test('route, sitemap, and canonical navigation remain unchanged', () => {
  const window = {};
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document: { querySelectorAll: () => [] } });
  const navigation = window.CaissaPrimaryNavigation;
  assert.equal(navigation.contractId, 'CaissaGlobalNavigationOrderPolicy@1.8.0');
  assert.equal(navigation.inventory.primary.length + navigation.inventory.connect.length, 31);
  assert.deepEqual(Array.from(navigation.inventory.groups[2], item => item.label), ['Insights', 'Analyze', 'Spectator TV', 'Live Blitz', 'Live Tournaments', 'Game Replayer', 'Arena']);
  assert.equal(navigation.inventory.all.filter(item => item.id === 'live-tournaments').length, 1);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/watch/live-tournaments' && rule.destination === '/live-tournaments.html'));
  assert.match(read('server.js'), /pathname === '\/watch\/live-tournaments'/);
  assert.equal((read('public/sitemap.xml').match(/<loc>https:\/\/www\.caissa-chess\.org\/watch\/live-tournaments<\/loc>/g) || []).length, 1);
});

test('responsive gateway geometry remains native-sized without transform scaling', () => {
  const css = read('css/live-tournaments.css');
  assert.match(css, /width:\s*min\(100%,900px\)/);
  assert.match(css, /height:\s*650px/);
  assert.match(css, /@media \(max-width:800px\)/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.doesNotMatch(css, /transform:\s*scale/i);
});
