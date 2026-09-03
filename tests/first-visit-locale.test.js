import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/caissa-i18n.js', import.meta.url), 'utf8');

function boot({ languages = ['en-US'], stored } = {}) {
    const values = new Map(stored === undefined ? [] : [['caissa.locale', stored]]);
    const document = {
        documentElement: { lang: 'en' }, querySelectorAll: () => [], addEventListener() {}
    };
    const window = {
        document,
        navigator: { languages, language: languages[0] || '' },
        localStorage: {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, value)
        },
        dispatchEvent() {}, CustomEvent: class CustomEvent {}
    };
    vm.runInNewContext(source, { window, document }, { filename: 'caissa-i18n.js' });
    return { api: window.CaissaI18n, values };
}

test('all requested Spanish browser variants produce one advisory Spanish suggestion', () => {
    for (const language of ['es-ES', 'es-MX', 'es-AR', 'es-CU', 'es-419']) {
        const { api } = boot({ languages: [language] });
        assert.equal(api.getLocale(), 'en', `${language} must not silently change the UI`);
        assert.equal(api.getSuggestedLocale(), 'es', `${language} must suggest Spanish`);
    }
});

test('browser preference selection walks the ordered language list', () => {
    const { api } = boot({ languages: ['ja-JP', 'es-AR', 'en-US'] });
    assert.equal(api.detectBrowserLocale(['ja-JP', 'es-AR', 'en-US']), 'es');
    assert.equal(api.getSuggestedLocale(), 'es');
});

test('an explicit saved choice always suppresses first-visit suggestions', () => {
    for (const stored of ['en', 'es']) {
        const { api } = boot({ languages: ['es-MX'], stored });
        assert.equal(api.getLocale(), stored);
        assert.equal(api.getSuggestedLocale(), '');
    }
});

test('accepting the suggestion persists the choice and prevents a repeat on reload', () => {
    const first = boot({ languages: ['es-CU'] });
    assert.equal(first.api.getSuggestedLocale(), 'es');
    first.api.setLocale(first.api.getSuggestedLocale());
    assert.equal(first.values.get('caissa.locale'), 'es');
    assert.equal(first.api.getSuggestedLocale(), '');

    const reload = boot({ languages: ['es-CU'], stored: first.values.get('caissa.locale') });
    assert.equal(reload.api.getLocale(), 'es');
    assert.equal(reload.api.getSuggestedLocale(), '');
});

test('unknown or disabled browser locales use English without a misleading prompt', () => {
    for (const language of ['ja-JP', 'ru-RU', 'hi-IN', '']) {
        const { api } = boot({ languages: [language] });
        assert.equal(api.getLocale(), 'en');
        assert.equal(api.getSuggestedLocale(), '');
    }
});

test('first-visit detection remains local and contains no regional tracking transport', () => {
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|geolocation|geoip|ip address|document\.cookie/i);
});
