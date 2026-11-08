(function openingDatabaseI18nBootstrap(global) {
  'use strict';

  const i18n = global.CaissaI18n;
  const listeners = new Set();

  function t(key, fallback = '', variables = {}) {
    if (!i18n || typeof i18n.t !== 'function') return fallback;
    return i18n.t(key, fallback, variables);
  }

  function apply(root = global.document) {
    if (i18n && typeof i18n.apply === 'function') i18n.apply(root);
    if (!global.document || (root !== global.document && root !== global.document.documentElement)) return;

    global.document.title = t('openingdb.metaTitle', global.document.title);
    const description = global.document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', t('openingdb.metaDescription', description.getAttribute('content') || ''));
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function noop() {};
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  if (i18n && typeof i18n.subscribe === 'function') {
    i18n.subscribe((locale) => {
      apply();
      listeners.forEach((listener) => listener(locale));
    });
  }

  global.CaissaOpeningDatabaseI18n = Object.freeze({
    apply,
    getLocale: () => (i18n && typeof i18n.getLocale === 'function' ? i18n.getLocale() : 'en'),
    subscribe,
    t
  });

  apply();
})(window);
