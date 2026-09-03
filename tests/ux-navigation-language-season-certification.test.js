import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const i18nSource = fs.readFileSync(new URL('../js/caissa-i18n.js', import.meta.url), 'utf8');
const navigationSource = fs.readFileSync(new URL('../js/caissa-primary-navigation.js', import.meta.url), 'utf8');

function inventory() {
    const document = { documentElement: {}, querySelectorAll: () => [], addEventListener() {} };
    const window = {
        document, navigator: { languages: ['en-US'], language: 'en-US' },
        localStorage: { getItem: () => null, setItem() {} }, dispatchEvent() {},
        CustomEvent: class CustomEvent {}
    };
    vm.runInNewContext(i18nSource, { window, document });
    vm.runInNewContext(navigationSource, { window, document });
    return window.CaissaPrimaryNavigation.inventory;
}

const expected = [
    ['play', '/play'], ['yahooClassic', '/yahoo-classic'], ['fics', '/fics'],
    ['playchess', '/play-online/playchess'], ['fritz', '/play-online/fritz'],
    ['tactics', '/puzzles/chessbase-tactics'], ['interactive-diagrams', '/learn/interactive-diagrams'],
    ['academy', '/academy'], ['endgame-trainer', '/endgame-trainer'],
    ['endgame-practice', '/endgame-practice'], ['endgame-library', '/endgame-library'],
    ['insights', '/insights'], ['analyze', '/analyze'], ['pgn-replayer', '/pgn-replayer'],
    ['spectator', '/spectator-tv'], ['lichess-tv', '/watch/lichess-tv'],
    ['live-blitz', '/watch/live-blitz'], ['live-tournaments', '/watch/live-tournaments'],
    ['lichess-broadcasts', '/watch/lichess-broadcasts'], ['game-replayer', '/watch/game-replayer'],
    ['arena', '/arena'], ['cheater-insight', '/cheater-insight'],
    ['polyglot', '/tools/polyglot'], ['opening-database', '/opening-database'], ['eco', '/eco'],
    ['library', '/game-library'], ['history', '/history'], ['dosChess', '/dos-chess'],
    ['vault', '/vault'], ['blog', '/blog'], ['help', '/help'], ['about', '/about'],
    ['facebook', 'https://www.facebook.com/CaissaChessOrg/'],
    ['youtube', 'https://www.youtube.com/@CaissaChessOrg'],
    ['discord', 'https://discord.gg/TM7GJPUVfr'],
    ['feedback', 'mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback&body=Hello%20CAISSA%20Team%2C%0A%0AI%20would%20like%20to%20report%3A%0A%0A%5B%20%5D%20Bug%0A%0A%5B%20%5D%20Feature%20Request%0A%0A%5B%20%5D%20Improvement%20Suggestion%0A%0A%5B%20%5D%20General%20Feedback%0A%0ADetails%3A%0A']
];

test('UX-001 route and ID inventory remains unchanged through UX-007', () => {
    const all = Array.from(inventory().all, item => [item.id, item.route]);
    assert.deepEqual(all.map(([id]) => id), expected.map(([id]) => id));
    for (const [id, route] of expected) {
        const actual = all.find(([candidate]) => candidate === id)?.[1];
        if (id === 'feedback') assert.ok(actual.startsWith('mailto:tvlavin1978@gmail.com?subject=CAISSA%20Feedback'));
        else assert.equal(actual, route, id);
    }
});

test('all public locale catalogs resolve navigation and construction keys', () => {
    const source = i18nSource;
    for (const key of [
        'language.title', 'language.selectorLabel', 'language.suggestion',
        'library.title', 'library.status', 'library.copyPrimary',
        'library.copySecondary', 'library.backToPlay', 'library.metaTitle'
    ]) {
        assert.equal((source.match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g')) || []).length, 2, key);
    }
});
