(function (global) {
  'use strict';

  const i18n = global.CaissaI18n;

  function render() {
    const body = global.document.body;
    const publicPresentation = global.document.querySelector('[data-caissa-library-public-presentation]');
    const workspace = global.document.querySelector('[data-game-library-workspace]');
    const available = body?.dataset.gameLibraryRelease === 'available';
    if (publicPresentation) publicPresentation.hidden = available;
    if (workspace) workspace.hidden = !available;
    if (available) {
      global.LibraryUI?.open?.();
    }
    return available ? 'available' : 'under-construction';
  }

  function localize() {
    i18n?.apply?.(global.document);
    global.document.title = i18n?.t?.('library.metaTitle', 'Game Library — Under Construction | CAISSA Chess')
      || 'Game Library — Under Construction | CAISSA Chess';
  }

  global.CaissaGameLibraryPage = Object.freeze({ render });
  render();
  localize();
  i18n?.subscribe?.(localize);
})(window);
