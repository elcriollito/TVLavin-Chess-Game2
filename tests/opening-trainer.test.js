import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import {
    REPERTOIRE_STORAGE_KEY,
    REPERTOIRE_STORAGE_PREFIX,
    SavedRepertoireStore
} from '../js/opening-trainer/repertoire-store.js';
import { TrainingSession } from '../js/opening-trainer/training-session.js';
import { buildOpeningIndex } from '../js/opening-trainer/opening-index.js';
import { OpeningGamesClient, rankOpeningCollections, splitPgnGames } from '../js/opening-trainer/games-client.js';
import { PgnOpeningProxyClient, validateOpeningCatalog } from '../js/pgn-replayer/pgn-opening-proxy-client.js';
import { wikibookTitleForMoves } from '../js/opening-trainer/wikibook-client.js';
import { RepertoireCloudSync } from '../js/opening-trainer/repertoire-cloud-sync.js';
import { buildPairedTreeRows } from '../js/opening-trainer/analysis-tree-rows.js';
import repertoireHandler, {
    assertOpeningTrainerDatabaseBoundary,
    sanitizeRepertoire
} from '../api/opening-trainer/repertoires.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

class MemoryStorage {
    values = new Map();
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
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

function linearTreeSnapshot(tokens) {
    const chess = new Chess();
    const nodes = [{ id: 'root', parentId: null, color: null, moveNumber: 0, childrenIds: [], mainChildId: null }];
    let parent = nodes[0];
    tokens.forEach((san, index) => {
        const move = chess.move(san);
        const node = {
            id: `node-${index + 1}`,
            parentId: parent.id,
            san: move.san,
            color: move.color,
            moveNumber: Math.floor(index / 2) + 1,
            childrenIds: [],
            mainChildId: null,
            fen: chess.fen()
        };
        parent.childrenIds.push(node.id);
        parent.mainChildId = node.id;
        nodes.push(node);
        parent = node;
    });
    return { nodes, currentNodeId: parent.id };
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
    for (const id of ['trainerNewStudy', 'trainerFlipBoard', 'trainerEngineToggle', 'trainerSaveButton', 'trainerSaveTrainButton', 'trainerFirstMove', 'trainerPreviousMove', 'trainerNextMove', 'trainerLastMove']) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.equal((html.match(/id="trainerSaveButton"/g) || []).length, 1);
    assert.equal((html.match(/id="trainerSaveTrainButton"/g) || []).length, 1);
    assert.ok(html.indexOf('id="trainerNewStudy"') < html.indexOf('id="trainerFlipBoard"'));
    assert.ok(html.indexOf('id="trainerFlipBoard"') < html.indexOf('id="trainerEngineToggle"'));
    assert.ok(html.indexOf('id="trainerEngineToggle"') < html.indexOf('id="trainerSaveButton"'));
    assert.ok(html.indexOf('id="trainerSaveTrainButton"') < html.indexOf('id="trainerFirstMove"'));
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
    const store = new SavedRepertoireStore({ storage: new MemoryStorage(), identity: { kind: 'user', id: 'user_A' } });
    const saved = store.save(repertoire());
    assert.equal(store.get(saved.id).lines[0][3].san, 'Nc6');
    assert.throws(() => store.save(repertoire({ id: 'bad', lines: [[{ uci: 'e2e5', color: 'w' }]] })), /illegal move/i);
    const merged = store.mergeRemote([{ ...saved, name: 'Cloud copy', updatedAt: '2027-01-01T00:00:00.000Z' }]);
    assert.equal(merged[0].name, 'Cloud copy');
});

test('local repertoires are isolated by Clerk subject with a separate guest workspace', () => {
    const storage = new MemoryStorage();
    const store = new SavedRepertoireStore({ storage });
    assert.equal(store.isReady, false);
    assert.deepEqual(store.list(), []);
    assert.throws(() => store.save(repertoire()), /still loading/i);

    store.setIdentity({ kind: 'user', id: 'user_A' });
    store.save(repertoire({ id: 'rep-a', name: 'Account A' }));
    const keyA = store.storageKey;
    store.setIdentity({ kind: 'user', id: 'user_B' });
    assert.deepEqual(store.list(), []);
    store.save(repertoire({ id: 'rep-b', name: 'Account B' }));
    const keyB = store.storageKey;
    store.setIdentity({ kind: 'guest' });
    assert.deepEqual(store.list(), []);
    store.save(repertoire({ id: 'rep-guest', name: 'Guest' }));

    store.setIdentity({ kind: 'user', id: 'user_A' });
    assert.deepEqual(store.list().map(item => item.name), ['Account A']);
    store.setIdentity({ kind: 'user', id: 'user_B' });
    assert.deepEqual(store.list().map(item => item.name), ['Account B']);
    assert.notEqual(keyA, keyB);
    assert.match(keyA, new RegExp(`^${REPERTOIRE_STORAGE_PREFIX.replaceAll('.', '\\.')}:clerk:user_A$`));
    assert.throws(() => store.setIdentity({ kind: 'user', id: 'person@example.test' }), /valid Clerk/i);
});

test('legacy ownerless data stays quarantined until explicit guest import consent', () => {
    const storage = new MemoryStorage();
    storage.setItem(REPERTOIRE_STORAGE_KEY, JSON.stringify([repertoire({ id: 'legacy-rep', name: 'Legacy' })]));
    const store = new SavedRepertoireStore({ storage, identity: { kind: 'user', id: 'user_A' } });
    assert.equal(store.hasLegacyData(), true);
    assert.deepEqual(store.list(), [], 'legacy data must not be assigned to a signed-in account');
    assert.throws(() => store.importLegacyToGuest({ consent: true }), /guest workspace/i);
    store.setIdentity({ kind: 'guest' });
    assert.deepEqual(store.list(), [], 'legacy data must not appear to a guest without consent');
    assert.throws(() => store.importLegacyToGuest(), /explicit consent/i);
    assert.deepEqual(store.importLegacyToGuest({ consent: true }).map(item => item.name), ['Legacy']);
    assert.ok(storage.getItem(REPERTOIRE_STORAGE_KEY), 'the source is retained for recovery');
});

test('private-browsing memory fallback remains isolated after storage write failures', () => {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) || null,
        setItem: () => { throw new Error('quota'); }
    };
    const store = new SavedRepertoireStore({ storage, identity: { kind: 'user', id: 'user_A' } });
    store.save(repertoire({ id: 'memory-a', name: 'Memory A' }));
    assert.deepEqual(store.list().map(item => item.id), ['memory-a']);
    store.setIdentity({ kind: 'user', id: 'user_B' });
    assert.deepEqual(store.list(), []);
    store.save(repertoire({ id: 'memory-b', name: 'Memory B' }));
    store.setIdentity({ kind: 'user', id: 'user_A' });
    assert.deepEqual(store.list().map(item => item.id), ['memory-a']);
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

test('paired tree rows group complete and incomplete move pairs without changing node identity', () => {
    const six = linearTreeSnapshot(['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4']);
    const completeRows = buildPairedTreeRows(six);
    assert.equal(completeRows.length, 3);
    assert.deepEqual(completeRows.map(row => [row.whiteId, row.blackId]), [
        ['node-1', 'node-2'], ['node-3', 'node-4'], ['node-5', 'node-6']
    ]);

    const five = linearTreeSnapshot(['e4', 'c6', 'd4', 'd5', 'Nc3']);
    const incompleteRows = buildPairedTreeRows(five);
    assert.equal(incompleteRows.length, 3);
    assert.deepEqual([incompleteRows[2].whiteId, incompleteRows[2].blackId], ['node-5', null]);
    assert.deepEqual(five.nodes.map(node => node.id), ['root', 'node-1', 'node-2', 'node-3', 'node-4', 'node-5']);
});

test('paired tree rows indent white and black alternatives from their exact branch point', () => {
    const snapshot = linearTreeSnapshot(['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4']);
    const byId = new Map(snapshot.nodes.map(node => [node.id, node]));
    byId.get('node-4').childrenIds.push('white-variation');
    snapshot.nodes.push({
        id: 'white-variation', parentId: 'node-4', san: 'e5', color: 'w', moveNumber: 3,
        childrenIds: ['white-variation-reply'], mainChildId: 'white-variation-reply'
    }, {
        id: 'white-variation-reply', parentId: 'white-variation', san: 'c5', color: 'b', moveNumber: 3,
        childrenIds: [], mainChildId: null
    });
    byId.get('node-5').childrenIds.push('black-variation');
    snapshot.nodes.push({
        id: 'black-variation', parentId: 'node-5', san: 'Nf6', color: 'b', moveNumber: 3,
        childrenIds: [], mainChildId: null
    });

    const rows = buildPairedTreeRows(snapshot);
    const whiteVariation = rows.find(row => row.whiteId === 'white-variation');
    const blackVariation = rows.find(row => row.blackId === 'black-variation');
    assert.equal(whiteVariation.depth, 1);
    assert.equal(whiteVariation.variation, true);
    assert.equal(blackVariation.depth, 1);
    assert.equal(blackVariation.whiteId, null);
    assert.equal(blackVariation.moveNumber, 3);
});

test('training color is a validated session override and never mutates the saved repertoire', () => {
    const savedWhite = repertoire({ color: 'white' });
    const blackSession = new TrainingSession(savedWhite, { userColor: 'black' });
    assert.equal(blackSession.userColor, 'b');
    assert.equal(blackSession.snapshot.color, 'white');
    assert.equal(blackSession.advanceCaissa()[0].san, 'e4');
    assert.equal(blackSession.attempt('e7e5').status, 'correct');
    assert.equal(blackSession.advanceCaissa()[0].san, 'Nf3');
    assert.equal(blackSession.attempt('b8c6').status, 'complete');
    assert.equal(blackSession.result().userColor, 'b');

    const whiteSession = new TrainingSession(repertoire({ color: 'black' }), { userColor: 'white' });
    assert.equal(whiteSession.userColor, 'w');
    assert.equal(whiteSession.snapshot.color, 'black');
    assert.equal(new TrainingSession(repertoire()).userColor, 'b', 'legacy repertoires retain their saved default');
    assert.throws(() => new TrainingSession(repertoire(), { userColor: 'green' }), /white or black/i);
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

test('Wikibook titles follow the legal sequence and opening proxy searches rank real collections', () => {
    assert.equal(wikibookTitleForMoves(['e4', 'c5', 'Nf3']), 'Chess Opening Theory/1. e4/1...c5/2. Nf3');
    const ranked = rankOpeningCollections({ openings: [
        { id: 'opening-vienna', title: 'Vienna', file: 'Vienna.zip' },
        { id: 'opening-sicilian-najdorf', title: 'Sicilian Najdorf', file: 'SicilianNajdorf6Bg5.zip' }
    ] }, 'B90', ['Sicilian Defense', 'Najdorf Variation']);
    assert.equal(ranked[0].id, 'opening-sicilian-najdorf');
});

test('game client uses the shared PGN Reader proxy, caps pages at ten and resolves selected notation', async () => {
    const samplePgn = index => `[Event "Test Event ${index}"]\n[Site "Test Site"]\n[Date "2026.01.${String(index + 1).padStart(2, '0')}"]\n[White "White ${index}"]\n[Black "Black ${index}"]\n[Result "1-0"]\n[ECO "C25"]\n\n1. e4 e5 2. Nc3 Nf6 1-0`;
    const pagePgn = Array.from({ length: 12 }, (_, index) => samplePgn(index)).join('\n\n');
    const catalog = { schemaVersion: 1, access: 'free', sourceUpdated: 'January 2026', pageSize: 100, count: 233,
        openings: [
            { id: 'opening-vienna', title: 'Vienna', file: 'Vienna.zip' },
            ...Array.from({ length: 232 }, (_, index) => ({ id: `opening-fill-${index}`, title: `Filler ${index}`, file: `Filler${index}.zip` }))
        ] };
    const calls = [];
    const fetchFn = async url => {
        const value = String(url);
        calls.push(value);
        if (value === '/api/pgn/opening') return new Response(JSON.stringify(catalog), { status: 200 });
        if (value === '/api/pgn/opening?file=Vienna.zip&page=1') return new Response(pagePgn, { status: 200, headers: {
            'content-length': String(pagePgn.length),
            'X-CAISSA-PGN-Source': 'pgnmentor-opening-paged',
            'X-CAISSA-Opening-Page': '1',
            'X-CAISSA-Opening-Pages': '1',
            'X-CAISSA-Opening-Games': '12',
            'X-CAISSA-Opening-Page-Games': '12'
        } });
        return new Response('', { status: 404 });
    };
    const client = new OpeningGamesClient({ fetchFn });
    const result = await client.search({ query: 'C25', aliases: ['Vienna'], page: 1 });
    assert.equal(result.games.length, 10);
    assert.equal(result.pageCount, 2);
    assert.equal(result.source, 'pgnmentor-opening-paged');
    assert.ok(calls.every(url => url.startsWith('/api/pgn/opening')));
    const loaded = await client.loadGame(result.games[0]);
    assert.equal(loaded.moves.length, 4);
    assert.match(loaded.pgn, /White 0/);
    const second = await client.search({ query: 'Vienna', page: 2 });
    assert.equal(second.games.length, 2);
    assert.equal(splitPgnGames(`${samplePgn(1)}\n\n${samplePgn(2)}`).length, 2);
});

test('PGN Reader and Opening Trainer share one bounded same-origin opening proxy client', () => {
    const reader = read('js/pgn-replayer/pgn-opening-library.js');
    const trainer = read('js/opening-trainer/games-client.js');
    const shared = read('js/pgn-replayer/pgn-opening-proxy-client.js');
    assert.match(reader, /PgnOpeningProxyClient/);
    assert.match(trainer, /PgnOpeningProxyClient/);
    assert.match(shared, /credentials: 'same-origin'/);
    assert.match(shared, /PGN_OPENING_PROXY_MAX_PAGE_BYTES = 10 \* 1024 \* 1024/);
    assert.doesNotMatch(trainer, /pgnmentor\.com|downloads\.caissa-chess\.org|gamesearch/);
    assert.match(read('server.js'), /pgnOpeningHandler/);
    assert.throws(() => validateOpeningCatalog({ access: 'free', pageSize: 100, openings: [] }), /catalog is invalid/i);
    assert.equal(typeof PgnOpeningProxyClient, 'function');
});

test('cloud sync is authenticated, bearer-scoped and falls back cleanly for guests', async () => {
    const calls = [];
    const auth = { isLoaded: true, isSignedIn: true, userId: 'user_A', getToken: async () => 'test-token' };
    const cloud = new RepertoireCloudSync({
        auth: () => auth,
        fetchFn: async (url, options) => {
            calls.push({ url, options });
            return new Response(JSON.stringify({ repertoires: [repertoire()] }), { status: 200 });
        }
    });
    const result = await cloud.pull({ userId: 'user_A' });
    assert.equal(result.ok, true);
    assert.equal(result.userId, 'user_A');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
    const guest = new RepertoireCloudSync({ auth: () => ({ isLoaded: true, isSignedIn: false }) });
    assert.equal((await guest.pull({ userId: 'user_A' })).status, 'identity-changed');
});

test('cloud sync rejects stale responses across account switches and refreshes tokens per operation', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let tokenCount = 0;
    const auth = {
        isLoaded: true,
        isSignedIn: true,
        userId: 'user_A',
        getToken: async () => `token-${++tokenCount}`
    };
    const calls = [];
    const cloud = new RepertoireCloudSync({
        auth: () => auth,
        fetchFn: async (_url, options) => {
            calls.push(options.headers.Authorization);
            await gate;
            return new Response(JSON.stringify({ repertoires: [repertoire({ name: 'Wrong account' })] }), { status: 200 });
        }
    });
    const pending = cloud.pull({ userId: 'user_A' });
    await Promise.resolve();
    auth.userId = 'user_B';
    release();
    assert.equal((await pending).status, 'identity-changed');
    auth.userId = 'user_A';
    const immediate = new RepertoireCloudSync({
        auth: () => auth,
        fetchFn: async (_url, options) => {
            calls.push(options.headers.Authorization);
            return new Response(JSON.stringify({ repertoires: [] }), { status: 200 });
        }
    });
    await immediate.pull({ userId: 'user_A' });
    await immediate.pull({ userId: 'user_A' });
    assert.deepEqual(calls.slice(-2), ['Bearer token-2', 'Bearer token-3']);
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

test('repertoire API rate limits a verified identity before database access', async () => {
    let databaseAccessed = false;
    const res = response();
    await repertoireHandler({ method: 'PUT', headers: {}, query: {}, body: repertoire() }, res, {
        verifyAuth: async () => ({ authenticated: true, userId: 'user_A' }),
        checkRateLimit: () => ({ allowed: false, remaining: 0, retryAfter: 17 }),
        getSupabase: () => { databaseAccessed = true; throw new Error('must not run'); }
    });
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '17');
    assert.equal(res.headers['X-RateLimit-Remaining'], '0');
    assert.equal(databaseAccessed, false);
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

test('repertoire API delete is constrained by both verified owner and local id', async () => {
    const scopes = [];
    const db = {
        from(name) {
            if (name === 'users') return {
                select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'internal-b' }, error: null }) }) })
            };
            return {
                delete: () => ({
                    eq(column, value) {
                        scopes.push([column, value]);
                        return { eq: async (nextColumn, nextValue) => {
                            scopes.push([nextColumn, nextValue]);
                            return { error: null };
                        } };
                    }
                })
            };
        }
    };
    const res = response();
    await repertoireHandler({ method: 'DELETE', headers: {}, query: { id: 'rep-a' } }, res, {
        verifyAuth: async () => ({ authenticated: true, userId: 'user_B' }),
        getSupabase: () => db
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(scopes, [['user_id', 'internal-b'], ['local_id', 'rep-a']]);
});

test('preview database boundary fails closed unless the URL and explicit ref are staging-only', () => {
    const base = {
        VERCEL_ENV: 'preview',
        SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret',
        CAISSA_OPENING_TRAINER_SUPABASE_REF: 'aqizagaskicotorfpwfn'
    };
    assert.equal(assertOpeningTrainerDatabaseBoundary({
        ...base,
        SUPABASE_URL: 'https://aqizagaskicotorfpwfn.supabase.co'
    }), 'aqizagaskicotorfpwfn');
    assert.throws(() => assertOpeningTrainerDatabaseBoundary({
        ...base,
        SUPABASE_URL: 'https://jczauvkfkweuvdpurpem.supabase.co'
    }), /not confirmed/i);
    assert.throws(() => assertOpeningTrainerDatabaseBoundary({
        ...base,
        CAISSA_OPENING_TRAINER_SUPABASE_REF: '',
        SUPABASE_URL: 'https://aqizagaskicotorfpwfn.supabase.co'
    }), /not confirmed/i);
});

test('review-only repertoire migration enables RLS and keeps browser roles closed', () => {
    const migration = read('supabase/migrations/20261021214528_opening_trainer_repertoires.sql');
    const rollback = read('supabase/rollback/20261021214528_opening_trainer_repertoires.rollback.sql');
    const gate = read('docs/security/OPENING_TRAINER_STAGING_SECURITY_GATE.md');
    assert.match(migration, /user_id uuid not null references public\.users\(id\) on delete cascade/i);
    assert.match(migration, /unique \(user_id, local_id\)/i);
    assert.match(migration, /opening_repertoires_user_updated_idx/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.opening_repertoires from public, anon, authenticated/i);
    assert.match(migration, /grant select, insert, update, delete on table public\.opening_repertoires to service_role/i);
    assert.doesNotMatch(migration, /grant all/i);
    assert.doesNotMatch(migration, /create policy/i, 'server-mediated table must not gain direct browser policies');
    assert.match(rollback, /drop table if exists public\.opening_repertoires/i);
    assert.match(gate, /process-local serverless limiter/i);
    assert.match(gate, /not certified or represented as a distributed control/i);
    assert.match(gate, /no service credential configured for this branch/i);
});
