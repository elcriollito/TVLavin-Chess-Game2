import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateHeaderValue } from 'node:http';
import test from 'node:test';
import { load } from 'cheerio';
import { CREDIT_OFFERS } from '../../api/_lib/credit-offers.js';
import { inlineContentDisposition } from '../../api/_lib/http-content-disposition.js';
import { PGN_PLAYER_OFFERS, isPlayerAlbumCommerceEnabled } from '../../api/_lib/pgn-player-offers.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('server player offer catalog owns exactly 82 allowlisted physical collections', () => {
  const offers = Object.values(PGN_PLAYER_OFFERS);
  assert.equal(offers.length, 82);
  assert.equal(new Set(offers.map(offer => offer.id)).size, 82);
  assert.ok(offers.every(offer => offer.credits === 0));
  assert.ok(offers.every(offer => fs.existsSync(offer.filePath)));
  assert.ok(offers.every(offer => offer.filePath.includes('/api/_private/pgn/')));
});

test('all 82 player download names produce valid RFC 5987 response headers', () => {
  const offers = Object.values(PGN_PLAYER_OFFERS);
  for (const offer of offers) {
    const value = inlineContentDisposition(offer.fileName);
    assert.doesNotThrow(() => validateHeaderValue('Content-Disposition', value), offer.id);
    assert.match(value, /^inline; filename="[\x20-\x7E]+"; filename\*=UTF-8''[\x20-\x7E]+$/);
  }
  const gligoric = inlineContentDisposition(PGN_PLAYER_OFFERS['pgnmentor-svetozar-gligoric'].fileName);
  assert.match(gligoric, /filename="Svetozar Gligoric\.pgn"/);
  assert.match(gligoric, /filename\*=UTF-8''Svetozar%20Gligori%C4%87\.pgn/);
});

test('player download headers reject response splitting through encoded filenames', () => {
  const value = inlineContentDisposition('game\r\nX-Injected: yes.pgn');
  assert.doesNotThrow(() => validateHeaderValue('Content-Disposition', value));
  assert.doesNotMatch(value, /[\r\n]/);
  assert.match(value, /filename\*=UTF-8''gameX-Injected%3A%20yes\.pgn/);
});

test('commercial rights registry blocks all player sales until both source grants are retained', () => {
  const rights = JSON.parse(read('data/pgn/player-commercial-rights.json'));
  const offers = Object.values(PGN_PLAYER_OFFERS);
  assert.equal(rights.catalogAlbumCount, 82);
  assert.equal(rights.commerciallyCertifiedAlbumCount, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(rights.sources).map(([key, value]) => [key, value.albumCount])), {
    pgnmentor: 17,
    smallchess: 65
  });
  assert.equal(offers.filter(offer => offer.sourceKey === 'pgnmentor').length, 17);
  assert.equal(offers.filter(offer => offer.sourceKey === 'smallchess').length, 65);
  assert.ok(offers.every(offer => offer.commercialRightsCertified === false));
  assert.equal(isPlayerAlbumCommerceEnabled({ CAISSA_PLAYER_ALBUM_COMMERCE_ENABLED: 'true' }), false);
  assert.equal(isPlayerAlbumCommerceEnabled({ CAISSA_PLAYER_ALBUM_COMMERCE_ENABLED: 'false' }), false);
  assert.match(read('docs/legal/PGN_PLAYER_COMMERCIAL_RIGHTS_AUDIT.md'), /0 of 82 albums are certified/);
});

test('player PGNs stay outside the public tree and are bundled only with controlled PGN endpoints', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(fs.existsSync(new URL('../../public/data/pgn/capablanca-games-1901-1941.pgn', import.meta.url)), false);
  const publicPlayerRoot = new URL('../../public/data/pgn/players', import.meta.url);
  const publicPlayerPgns = fs.existsSync(publicPlayerRoot)
    ? fs.readdirSync(publicPlayerRoot, { recursive: true }).filter(name => String(name).endsWith('.pgn'))
    : [];
  assert.deepEqual(publicPlayerPgns, []);
  assert.match(vercel.functions['api/pgn/player.js'].includeFiles, /api\/_private\/pgn\/\*\*/);
  assert.match(vercel.functions['api/pgn/player.js'].includeFiles, /player-commercial-rights\.json/);
  assert.match(vercel.functions['api/pgn/unlock.js'].includeFiles, /api\/_private\/pgn\/players/);
  assert.match(vercel.functions['api/pgn/unlock.js'].includeFiles, /player-commercial-rights\.json/);
  assert.match(vercel.functions['api/pgn/entitlements.js'].includeFiles, /player-commercial-rights\.json/);
  assert.equal(vercel.rewrites.some(rule => String(rule.destination).includes('/api/pgn/legacy')), false);
  assert.equal(fs.existsSync(new URL('../../api/pgn/legacy.js', import.meta.url)), false);
});

test('unlock migration makes ownership permanent, atomic, one-credit, and server-only', () => {
  const sql = read('supabase/migrations/20260823021500_player_album_entitlements.sql');
  assert.match(sql, /unique \(user_id, album_id\)/i);
  assert.match(sql, /unique \(user_id, operation_id\)/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /v_balance := v_user\.credits - 1/);
  assert.match(sql, /insert into public\.player_album_entitlements/);
  assert.match(sql, /insert into public\.credit_events/);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.match(sql, /enable row level security/i);
});

test('Credit Store renders only internal offer keys and obtains currency prices from the server', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CREDIT_OFFERS).map(([key, offer]) => [key, offer.credits])), {
    starter: 25, standard: 75, pro: 200
  });
  const page = load(read('credit-store.html'));
  assert.equal(page('[data-store-package]').length, 3);
  assert.deepEqual(page('[data-store-buy]').map((_, node) => page(node).attr('data-store-buy')).get(), ['starter', 'standard', 'pro']);
  assert.equal(page('[data-caissa-standalone-sidebar]').length, 1);
  assert.match(page('link[rel="canonical"]').attr('href'), /\/store$/);
  assert.doesNotMatch(read('credit-store.html') + read('js/credit-store.js'), /price_[A-Za-z0-9]+/);
  assert.match(read('js/credit-store.js'), /\/api\/store\/offers/);
  assert.match(read('js/credit-store.js'), /type: 'credits', package: packageKey/);
});

test('commerce stays fail-closed while free player delivery bypasses auth and entitlements', () => {
  const checkout = read('api/checkout/session.js');
  const fulfillment = read('api/_lib/stripe-webhook-fulfillment.js');
  const unlock = read('api/pgn/unlock.js');
  const player = read('api/pgn/player.js');
  assert.match(checkout, /isCreditStoreEnabled\(\)/);
  assert.match(checkout, /CREDIT_STORE_NOT_ENABLED/);
  assert.match(fulfillment, /import \{ CREDIT_OFFERS \}/);
  assert.match(unlock, /isPlayerAlbumCommerceEnabled\(\)/);
  assert.match(unlock, /PLAYER_ALBUM_COMMERCE_NOT_ENABLED/);
  assert.match(unlock, /Idempotency|idempotency-key/i);
  assert.doesNotMatch(player, /player_album_entitlements|commercialRightsCertified|PLAYER_ALBUM_RIGHTS_NOT_CERTIFIED/);
  assert.match(player, /Cache-Control', 'public, s-maxage=86400/);
  assert.match(player, /X-CAISSA-PGN-Access', 'free-player-library'/);
  assert.match(player, /inlineContentDisposition\(offer\.fileName\)/);
  assert.doesNotMatch(player, /is_premium|premium.*bypass/i);
});
