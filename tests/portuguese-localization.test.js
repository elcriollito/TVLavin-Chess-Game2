import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const i18nSource = fs.readFileSync(new URL('../js/caissa-i18n.js', import.meta.url), 'utf8');
const localizationSource = fs.readFileSync(new URL('../js/caissa-first-party-localization.js', import.meta.url), 'utf8');

function boot({ languages = ['en-US'], stored = '' } = {}) {
    const values = new Map(stored ? [['caissa.locale', stored]] : []);
    const document = { documentElement: { lang: 'en' }, querySelectorAll: () => [], addEventListener() {} };
    const window = {
        document, navigator: { languages, language: languages[0] || '' },
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
        dispatchEvent() {}, CustomEvent: class CustomEvent {}
    };
    vm.runInNewContext(i18nSource, { window, document }, { filename: 'caissa-i18n.js' });
    return { api: window.CaissaI18n, values, document };
}

const placeholders = value => [...String(value).matchAll(/\{[a-zA-Z][\w]*\}/g)].map(match => match[0]).sort();

test('Portuguese is complete, enabled, and has exact EN/ES key and placeholder parity', () => {
    const { api } = boot();
    const keys = Object.keys(api.catalogs.en).sort();
    assert.equal(keys.length, 607);
    assert.deepEqual(Object.keys(api.catalogs.es).sort(), keys);
    assert.deepEqual(Object.keys(api.catalogs.pt).sort(), keys);
    assert.deepEqual(Array.from(api.enabledLocales), ['en', 'es', 'pt']);
    for (const key of keys) {
        assert.ok(api.catalogs.pt[key], `missing Portuguese ${key}`);
        assert.notEqual(api.catalogs.pt[key], key);
        assert.deepEqual(placeholders(api.catalogs.pt[key]), placeholders(api.catalogs.en[key]), key);
    }
});

test('Portuguese native name, manual selection, fallback, and persistence are safe', () => {
    const first = boot({ languages: ['en-US'] });
    assert.equal(first.api.supportedLocales.pt.name, 'Português');
    assert.equal(first.api.setLocale('pt'), 'pt');
    assert.equal(first.values.get('caissa.locale'), 'pt');
    assert.equal(first.document.documentElement.lang, 'pt');
    assert.equal(first.api.t('play.tabs.bots'), 'Jogar contra bots');
    assert.equal(first.api.t('missing.key', 'Safe fallback'), 'Safe fallback');
    const reload = boot({ languages: ['es-MX'], stored: 'pt' });
    assert.equal(reload.api.getLocale(), 'pt');
    assert.equal(reload.api.getSuggestedLocale(), '');
});

test('Portuguese browser variants normalize without enabling GL-007 suggestions', () => {
    for (const language of ['pt-BR', 'pt-PT']) {
        const { api } = boot({ languages: [language] });
        assert.equal(api.normalizeLocale(language), 'pt');
        assert.equal(api.detectBrowserLocale([language]), 'en');
        assert.equal(api.getLocale(), 'en');
        assert.equal(api.getSuggestedLocale(), '');
    }
});

test('Portuguese chess and product terminology follows the approved glossary', () => {
    const { api } = boot({ stored: 'pt' });
    assert.deepEqual({
        play: api.t('common.play'), game: api.t('common.game'), white: api.t('common.white'),
        black: api.t('common.black'), draw: api.t('common.draw'), move: api.catalogs.pt['pgn.moveTemplate'],
        checkmate: api.t('play.byCheckmate'), stalemate: api.t('play.byStalemate'), resign: api.t('play.resign')
    }, {
        play: 'Jogar', game: 'Partida', white: 'Brancas', black: 'Pretas', draw: 'Empate',
        move: 'Lance {number}{suffix}{detail}', checkmate: 'Por xeque-mate',
        stalemate: 'Por afogamento', resign: 'Abandonar'
    });
    assert.equal(api.t('common.bullet'), 'Bullet');
    assert.equal(api.t('common.blitz'), 'Blitz');
    assert.equal(api.t('common.rapid'), 'Rápida');
});

test('only approved proper names and established Portuguese UI terms remain identical to English', () => {
    const { api } = boot();
    const equal = Object.keys(api.catalogs.en).filter(key => api.catalogs.en[key] === api.catalogs.pt[key]).sort();
    assert.deepEqual(equal, [
        'common.blitz', 'common.bullet', 'common.casual', 'common.elite', 'nav.item.arena',
        'nav.item.blog', 'nav.item.facebook', 'nav.item.fics', 'nav.item.fritz', 'nav.item.lichess-tv',
        'nav.item.playchess', 'nav.item.yahooClassic', 'pgn.collectionDetailsTemplate', 'pgn.zoom',
        'play.menu', 'shell.avatar', 'shell.premium', 'shell.status'
    ]);
});

test('Portuguese catalog rejects known English and Spanish residual UI phrases', () => {
    const { api } = boot();
    const corpus = Object.entries(api.catalogs.pt).map(([key, value]) => `${key}\t${value}`).join('\n');
    assert.doesNotMatch(corpus, /\b(?:Game setup|Time control|Play as|Opponent Strength|New Game|Start Game|Choose a bot|No Timer|Coming soon|Preview ready|Create Account|Under Construction)\b/i);
    assert.doesNotMatch(corpus, /\b(?:Jugar|Jugada|Jugadas|Tablas|Oponente|Configuración|Próximamente|Blancas|Negras|Aleatorio seleccionado)\b/i);
    assert.doesNotMatch(localizationSource, /getLocale\(\)\s*!==\s*['"]es['"]/);
    assert.doesNotMatch(localizationSource, /return\s+`(?:Resultado|Jugada)\s/);
});
