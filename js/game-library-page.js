(function (global) {
  'use strict';

  const i18n = global.CaissaI18n;

  function localize() {
    i18n?.apply?.(global.document);
    global.document.title = i18n?.t?.('library.metaTitle', 'Game Library — Under Construction | CAISSA Chess')
      || 'Game Library — Under Construction | CAISSA Chess';
  }

  localize();
  i18n?.subscribe?.(localize);
})(window);
