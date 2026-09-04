import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { load as loadHtml } from 'cheerio';

const i18nSource = fs.readFileSync(new URL('../js/caissa-i18n.js', import.meta.url), 'utf8');
const navigationSource = fs.readFileSync(new URL('../js/caissa-primary-navigation.js', import.meta.url), 'utf8');

function boot({ languages = ['en-US'], stored = '' } = {}) {
    const values = new Map(stored ? [['caissa.locale', stored]] : []);
    const listeners = new Map();
    const document = {
        documentElement: { lang: 'en' },
        querySelectorAll: () => [],
        addEventListener: (type, handler) => listeners.set(type, handler)
    };
    const window = {
        document,
        navigator: { languages, language: languages[0] || '' },
        localStorage: {
            getItem: key => values.get(key) || null,
            setItem: (key, value) => values.set(key, value)
        },
        dispatchEvent() {},
        CustomEvent: class CustomEvent {
            constructor(type, options) { this.type = type; this.detail = options.detail; }
        }
    };
    const sandbox = { window, document };
    vm.runInNewContext(i18nSource, sandbox, { filename: 'caissa-i18n.js' });
    return { api: window.CaissaI18n, window, values, listeners, sandbox };
}

test('English is the universal default and unknown browser locales fall back safely', () => {
    assert.equal(boot({ languages: ['en-US'] }).api.getLocale(), 'en');
    const unknown = boot({ languages: ['ja-JP'] });
    assert.equal(unknown.api.getLocale(), 'en');
    assert.equal(unknown.api.getSuggestedLocale(), '');
    assert.equal(unknown.window.document.documentElement.lang, 'en');
});

test('Spanish browser variants normalize to a visible suggestion without an imposed locale', () => {
    for (const browserLocale of ['es-ES', 'es-MX']) {
        const { api } = boot({ languages: [browserLocale] });
        assert.equal(api.normalizeLocale(browserLocale), 'es');
        assert.equal(api.detectBrowserLocale([browserLocale]), 'es');
        assert.equal(api.getLocale(), 'en');
        assert.equal(api.getSuggestedLocale(), 'es');
    }
});

test('manual Spanish selection updates immediately and persists across reloads', () => {
    const first = boot({ languages: ['en-US'] });
    assert.equal(first.api.setLocale('es'), 'es');
    assert.equal(first.api.getLocale(), 'es');
    assert.equal(first.values.get('caissa.locale'), 'es');
    assert.equal(first.window.document.documentElement.lang, 'es');

    const reload = boot({ languages: ['en-US'], stored: first.values.get('caissa.locale') });
    assert.equal(reload.api.getLocale(), 'es');
    assert.equal(reload.api.getSuggestedLocale(), '');
});

test('manual English remains authoritative over a Spanish browser', () => {
    const { api, values } = boot({ languages: ['es-ES'], stored: 'en' });
    assert.equal(api.getLocale(), 'en');
    assert.equal(api.getSuggestedLocale(), '');
    api.setLocale('en');
    assert.equal(values.get('caissa.locale'), 'en');
});

test('translation resolution falls back per key to English and never exposes technical values', () => {
    const { api } = boot({ stored: 'es' });
    assert.equal(api.t('nav.item.play'), 'Jugar');
    assert.equal(api.t('common.close'), 'Cerrar');
    assert.equal(api.t('missing.key', 'Safe fallback'), 'Safe fallback');
    assert.equal(api.t('missing.key'), '');
});

test('UX-009 first-party interface catalogs have complete English and Spanish parity', () => {
    const { api } = boot();
    const namespaces = /^(?:common|play|bots|coach|pgn|library)\./;
    const englishKeys = Object.keys(api.catalogs.en).filter(key => namespaces.test(key)).sort();
    const spanishKeys = Object.keys(api.catalogs.es).filter(key => namespaces.test(key)).sort();
    assert.deepEqual(spanishKeys, englishKeys);
    assert.ok(englishKeys.length >= 190);
    for (const key of englishKeys) {
        assert.ok(api.catalogs.en[key], `missing English ${key}`);
        assert.ok(api.catalogs.es[key], `missing Spanish ${key}`);
        assert.notEqual(api.catalogs.es[key], key);
    }
});

test('UX-010 dynamic Play and authentication residuals resolve through the shared catalog', () => {
    const { api } = boot({ stored: 'es' });
    assert.equal(api.t('shell.createAccount'), 'Crear cuenta');
    assert.equal(api.t('shell.accountUnavailable'), 'Cuenta no disponible');
    assert.equal(api.t('play.whiteSelected'), 'Blancas seleccionadas.');
    assert.equal(api.t('play.blackSelected'), 'Negras seleccionadas.');
    assert.equal(api.t('play.randomSelected'), 'Aleatorio seleccionado.');
    assert.deepEqual(Object.keys(api.catalogs.es).sort(), Object.keys(api.catalogs.en).sort());
    assert.ok(Object.keys(api.catalogs.en).length > 421);
});

test('supported and enabled locales are separate and preserve future Unicode names', () => {
    const { api } = boot();
    assert.deepEqual(Object.keys(api.supportedLocales), ['en', 'es', 'pt', 'fr', 'de', 'ru', 'hi']);
    assert.deepEqual(Object.fromEntries(Object.entries(api.localeFamilies)), {
        en: 'en', es: 'es', pt: 'pt', fr: 'fr', de: 'de', ru: 'ru', hi: 'hi'
    });
    assert.deepEqual(Array.from(api.enabledLocales), ['en', 'es', 'pt']);
    assert.deepEqual(Array.from(api.suggestionLocales), ['en', 'es']);
    assert.equal(api.supportedLocales.pt.name, 'Português');
    assert.equal(api.supportedLocales.fr.name, 'Français');
    assert.equal(api.supportedLocales.de.name, 'Deutsch');
    assert.equal(api.supportedLocales.ru.name, 'Русский');
    assert.equal(api.supportedLocales.hi.name, 'हिन्दी');
    assert.equal(api.supportedLocales.pt.enabled, true);
    for (const locale of ['fr', 'de', 'ru', 'hi']) assert.equal(api.supportedLocales[locale].enabled, false);
    for (const locale of ['en-US', 'es-MX', 'pt-BR', 'pt-PT', 'fr-CA', 'de-DE', 'ru-RU', 'hi-IN']) {
        assert.equal(api.normalizeLocale(locale), locale.slice(0, 2));
    }
});

test('canonical navigation translates presentation while preserving routes, IDs, and active identity', () => {
    const runtime = boot({ stored: 'es' });
    vm.runInNewContext(navigationSource, runtime.sandbox, { filename: 'caissa-primary-navigation.js' });
    const navigation = runtime.window.CaissaPrimaryNavigation;
    const $ = loadHtml(navigation.adapters.modernStandalone.renderGroups({ activeKey: 'play' }));
    assert.equal($('[data-nav-key="play"]').attr('href'), '/play');
    assert.equal($('[data-nav-key="play"]').attr('aria-current'), 'page');
    assert.equal($('[data-nav-key="play"] .nav-label').text(), 'Jugar');
    assert.equal($('.nav-group-heading').first().text().trim(), 'Jugar y competir');
    assert.equal(navigation.inventory.primary[0].id, 'play');
    assert.equal(navigation.inventory.primary[0].label, 'Play');
});

test('every enabled locale resolves every visible navigation key without a technical placeholder', () => {
    const runtime = boot();
    vm.runInNewContext(navigationSource, runtime.sandbox, { filename: 'caissa-primary-navigation.js' });
    const navigation = runtime.window.CaissaPrimaryNavigation;
    for (const locale of runtime.api.enabledLocales) {
        runtime.api.setLocale(locale, { persist: false });
        for (const item of navigation.inventory.all) {
            const translated = runtime.api.t(`nav.item.${item.id}`, item.label);
            assert.ok(translated);
            assert.doesNotMatch(translated, /^(?:undefined|null|\[object Object\])$/);
        }
    }
});

test('language control exposes only enabled locales by their native names', () => {
    const runtime = boot({ languages: ['es-MX'] });
    vm.runInNewContext(navigationSource, runtime.sandbox, { filename: 'caissa-primary-navigation.js' });
    const $ = loadHtml(runtime.window.CaissaPrimaryNavigation.renderLanguageControl());
    assert.deepEqual($('option').map((_, option) => $(option).text()).get(), ['English', 'Español', 'Português']);
    assert.equal($('[data-caissa-locale-suggestion="es"]').text().replace(/\s+/g, ' ').trim(), '🌐 Español');
    assert.equal($('option').text().includes('Русский'), false);
    assert.equal($('option').text().includes('हिन्दी'), false);
    for (const code of ['fr', 'de', 'ru', 'hi']) assert.equal($(`option[value="${code}"]`).length, 0);
});

test('every shared-navigation HTML consumer loads i18n before the navigation owner', () => {
    const root = new URL('../', import.meta.url);
    const candidates = [];
    const visit = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (['node_modules', '.git'].includes(entry.name)) continue;
            const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith('.html')) candidates.push(path);
        }
    };
    visit(root);
    const consumers = candidates.filter(path => fs.readFileSync(path, 'utf8').includes('caissa-primary-navigation.js'));
    assert.ok(consumers.length >= 25);
    for (const path of consumers) {
        const html = fs.readFileSync(path, 'utf8');
        assert.ok(html.includes('caissa-i18n.js'), path.pathname);
        assert.ok(html.indexOf('caissa-i18n.js') < html.indexOf('caissa-primary-navigation.js'), path.pathname);
    }
});

test('locale foundation has no GeoIP, GPS, external transport, or account migration behavior', () => {
    assert.doesNotMatch(i18nSource, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|geolocation|geoip|latitude|longitude|document\.cookie/i);
});
