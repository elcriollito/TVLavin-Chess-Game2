import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { SavedRepertoireStore } from '../js/opening-trainer/repertoire-store.js';
import { TrainingSession } from '../js/opening-trainer/training-session.js';
import { buildOpeningIndex } from '../js/opening-trainer/opening-index.js';
import { buildLineKey, OpeningGamesClient, splitPgnGames } from '../js/opening-trainer/games-client.js';
import { wikibookTitleForMoves } from '../js/opening-trainer/wikibook-client.js';
import { RepertoireCloudSync } from '../js/opening-trainer/repertoire-cloud-sync.js';
import repertoireHandler, { sanitizeRepertoire } from '../api/opening-trainer/repertoires.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

class MemoryStorage {
    value = null;
    getItem() { return this.value; }
    setItem(_key, value) { this.value = value; }
}

function lineFromSan(tokens) {
    const chess = new Chess();
    return tokens.map(san => {
        const fenBefore = chess.fen();
        const move = chess.move(san);
        return {
            uci: `${move.from}${move.to}${move.promotion || ''}`,
            san: move.san,
            color: move.color,
            fenBefore,
            fenAfter: chess.fen()
        };
    });
}

function repertoire(overrides = {}) {
    return {
        schemaVersion: 'CaissaOpeningRepertoire@1.0.0',
        id: 'rep-test-1',
        name: 'Open Game · Black',
        color: 'black',
        eco: 'C20',
        opening: 'Open Game',
        initialFen: new Chess().fen(),
        lines: [lineFromSan(['e4', 'e5', 'Nf3', 'Nc6'])],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        progress: { sessions: 0, completed: 0, attempts: 0, correct: 0, hints: 0, reveals: 0 },
        ...overrides
    };
}

function response() {
    return {
        statusCode: 200,
        body: undefined,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; },
        setHeader(name, value) { this.headers[name] = value; }
    };
}

test('route shell exposes exactly the five required tabs and fixed footer actions', () => {
    const html = read('opening-trainer.html');
    const tabs = [...html.matchAll(/data-trainer-tab="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(tabs, ['analysis', 'practice', 'games', 'opening', 'wikibook']);
    for (const id of ['trainerFlipBoard', 'trainerEngineToggle', 'trainerFirstMove', 'trainerPreviousMove', 'trainerNextMove', 'trainerLastMove']) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /trainerRevealButton/);
    assert.match(html, /trainerNextLine/);
    assert.match(html, /trainerSaveTrainDialog/);
    assert.match(html, /trainerWikiReturn/);
    assert.match(read('server.js'), /pathname === '\/opening-trainer'/);
    const vercel = JSON.parse(read('vercel.json'));
    assert.ok(vercel.rewrites.some(rule => rule.source === '/opening-trainer' && rule.destination === '/opening-trainer.html'));
    const routeHeaders = vercel.headers.find(rule => rule.source === '/opening-trainer')?.headers || [];
    const csp = routeHeaders.find(header => header.key === 'Content-Security-Policy')?.value || '';
    assert.match(csp, /connect-src[^;]*https:\/\/en\.wikibooks\.org/);
    assert.match(csp, /connect-src[^;]*https:\/\/downloads\.caissa-chess\.org/);
    assert.equal(routeHeaders.find(header => header.key === 'X-Robots-Tag')?.value, 'noindex, nofollow, noarchive');
});

test('global navigation publishes Opening Trainer once in Learn & Improve', () => {
    const navigation = read('js/caissa-primary-navigation.js');
    assert.equal((navigation.match(/id: 'opening-trainer'/g) || []).length, 1);
    assert.match(navigation, /CaissaGlobalNavigationOrderPolicy@1\.20\.0/);
    assert.ok(navigation.indexOf("id: 'opening-trainer'") > navigation.indexOf("id: 'chess-gym'"));
    assert.ok(navigation.indexOf("id: 'opening-trainer'") < navigation.indexOf("id: 'academy'"));
});

test('saved repertoire validates complete legal lines and keeps a durable copy', () => {
    const store = new SavedRepertoireStore({ storage: new MemoryStorage() });
    const saved = store.save(repertoire());
    assert.equal(store.get(saved.id).lines[0][3].san, 'Nc6');
    assert.throws(() => store.save(repertoire({ id: 'bad', lines: [[{ uci: 'e2e5', color: 'w' }]] })), /illegal move/i);
    const merged = store.mergeRemote([{ ...saved, name: 'Cloud copy', updatedAt: '2027-01-01T00:00:00.000Z' }]);
    assert.equal(merged[0].name, 'Cloud copy');
});

test('training session separates illegal moves, legal deviations, correct moves and reveal', () => {
    const session = new TrainingSession(repertoire());
    const reply = session.advanceCaissa();
    assert.equal(reply[0].san, 'e4');
    assert.equal(session.attempt('e7e4').status, 'illegal');
    assert.equal(session.attempt('c7c5').status, 'repertoire-deviation');
    assert.equal(session.attempt('e7e5').status, 'correct');
    session.advanceCaissa();
    assert.equal(session.reveal().san, 'Nc6');
    assert.equal(session.state().stats.reveals, 1);
    assert.equal(session.completed, true);
});

test('opening resolver recognizes exact sequences and position-verified transpositions', () => {
    const index = buildOpeningIndex([
        { eco: 'A06', name: 'Zukertort', moves: '1. Nf3 d5 2. g3' },
        { eco: 'A06', name: 'Zukertort transposition', moves: '1. g3 d5 2. Nf3' }
    ]);
    const chess = new Chess();
    ['Nf3', 'd5', 'g3'].forEach(move => chess.move(move));
    const exact = index.resolve(chess.fen(), ['Nf3', 'd5', 'g3']);
    assert.equal(exact.matchType, 'sequence');
    const transposed = index.resolve(chess.fen(), ['g3', 'd5', 'Nf3']);
    assert.equal(transposed.transpositionVerified, false, 'cataloged alternate order is itself an exact sequence');
    const positionOnly = index.resolve(chess.fen(), ['not', 'a', 'catalog', 'sequence']);
    assert.equal(positionOnly.transpositionVerified, true);
});

test('Wikibook titles follow the legal sequence and game keys are bounded', () => {
    assert.equal(wikibookTitleForMoves(['e4', 'c5', 'Nf3']), 'Chess Opening Theory/1. e4/1...c5/2. Nf3');
    assert.equal(buildLineKey(lineFromSan(['e4', 'e5', 'Nf3', 'Nc6']), 3), 'e7e5 g1f3 b8c6');
});

test('game client returns at most ten and resolves a selected CAISSA public PGN', async () => {
    const samplePgn = '[Event "Test Event"]\n[Site "Test Site"]\n[Date "2026.01.01"]\n[White "White Player"]\n[Black "Black Player"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
    const fetchFn = async url => {
        const value = String(url);
        if (value.includes('manifest.json') && value.includes('gamesearch')) return new Response(JSON.stringify({ maxPlies: 10 }), { status: 200 });
        if (value.includes('/gamesearch/line')) return new Response(JSON.stringify({ ok: true, games: 12, top: Array.from({ length: 12 }, (_, index) => ({ gameId: `g_${String(index).padStart(16, '0')}`, white: 'White Player', black: 'Black Player', event: 'Test Event', site: 'Test Site', date: '2026.01.01', result: '1-0' })) }), { status: 200 });
        if (value === '/pgn/library.json') return new Response(JSON.stringify({ Public: { Test: [{ file: 'pgn/test.pgn' }] } }), { status: 200 });
        if (value === '/pgn/test.pgn') return new Response(samplePgn, { status: 200, headers: { 'content-length': String(samplePgn.length) } });
        return new Response('', { status: 404 });
    };
    const client = new OpeningGamesClient({ fetchFn });
    const result = await client.search(lineFromSan(['e4', 'e5']));
    assert.equal(result.games.length, 10);
    const loaded = await client.loadGame(result.games[0]);
    assert.equal(loaded.moves.length, 4);
    assert.equal(splitPgnGames(`${samplePgn}\n\n${samplePgn}`).length, 2);
});

test('cloud sync is authenticated, bearer-scoped and falls back cleanly for guests', async () => {
    const calls = [];
    const cloud = new RepertoireCloudSync({
        auth: () => ({ isSignedIn: true, getToken: async () => 'test-token' }),
        fetchFn: async (url, options) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({ repertoires: [repertoire()] }), { status: 200 });
        }
    });
    const result = await cloud.pull();
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
    const guest = new RepertoireCloudSync({ auth: () => ({ isSignedIn: false }) });
    assert.equal((await guest.pull()).status, 'guest');
});

test('server-side repertoire sanitizer rejects illegal or oversized payloads', () => {
    const clean = sanitizeRepertoire(repertoire(), new Date('2026-10-21T00:00:00Z'));
    assert.equal(clean.lines[0][0].san, 'e4');
    assert.equal(clean.lines[0][0].fenBefore, new Chess().fen(), 'server replaces client FEN claims with canonical replay state');
    assert.throws(() => sanitizeRepertoire(repertoire({ lines: [[{ uci: 'e2e5' }]] })), /Illegal move/);
    assert.throws(() => sanitizeRepertoire(repertoire({ lines: Array.from({ length: 51 }, () => lineFromSan(['e4'])) })), /between 1 and 50/);
});

test('repertoire API denies guests before database access', async () => {
    let databaseAccessed = false;
    const res = response();
    await repertoireHandler({ method: 'GET', headers: {}, query: {} }, res, {
        verifyAuth: async () => ({ authenticated: false, status: 401 }),
        getSupabase: () => { databaseAccessed = true; throw new Error('must not run'); }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(databaseAccessed, false);
    assert.deepEqual(res.body, { code: 'AUTH_REQUIRED', error: 'Authentication required.' });
});

test('repertoire API resolves Clerk identity and scopes every read to the internal user id', async () => {
    const scopes = [];
    const db = {
        from(name) {
            if (name === 'users') return {
                select: () => ({ eq(column, value) {
                    scopes.push([name, column, value]);
                    return { single: async () => ({ data: { id: 'user-internal-a' }, error: null }) };
                } })
            };
            assert.equal(name, 'opening_repertoires');
            return {
                select: () => ({ eq(column, value) {
                    scopes.push([name, column, value]);
                    return { order: () => ({ limit: async () => ({ data: [], error: null }) }) };
                } })
            };
        }
    };
    const res = response();
    await repertoireHandler({ method: 'GET', headers: {}, query: {} }, res, {
        verifyAuth: async () => ({ authenticated: true, userId: 'clerk-sub-a' }),
        getSupabase: () => db
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.repertoires, []);
    assert.deepEqual(scopes, [
        ['users', 'clerk_id', 'clerk-sub-a'],
        ['opening_repertoires', 'user_id', 'user-internal-a']
    ]);
});

test('repertoire API upsert derives ownership on the server and never trusts a client user id', async () => {
    let inserted = null;
    const db = {
        from(name) {
            if (name === 'users') return {
                select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'user-internal-a' }, error: null }) }) })
            };
            return {
                upsert(row, options) {
                    inserted = { row, options };
                    return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
                }
            };
        }
    };
    const res = response();
    await repertoireHandler({
        method: 'PUT', headers: {}, query: {}, body: { ...repertoire(), user_id: 'user-attacker' }
    }, res, {
        verifyAuth: async () => ({ authenticated: true, userId: 'clerk-sub-a' }),
        getSupabase: () => db
    });
    assert.equal(res.statusCode, 200);
    assert.equal(inserted.row.user_id, 'user-internal-a');
    assert.equal('user_id' in res.body.repertoire, false);
    assert.deepEqual(inserted.options, { onConflict: 'user_id,local_id' });
});

test('review-only repertoire migration enables RLS and keeps browser roles closed', () => {
    const migration = read('supabase/migrations/20261021214528_opening_trainer_repertoires.sql');
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.opening_repertoires from anon, authenticated/i);
    assert.match(migration, /grant all on table public\.opening_repertoires to service_role/i);
    assert.doesNotMatch(migration, /create policy/i, 'server-mediated table must not gain direct browser policies');
});
