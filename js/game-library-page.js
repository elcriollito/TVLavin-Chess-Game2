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
    localize();
    return available ? 'available' : 'under-construction';
  }

  function localize() {
    i18n?.apply?.(global.document);
    const available = global.document.body?.dataset.gameLibraryRelease === 'available';
    global.document.title = available
      ? `${i18n?.t?.('library.title', 'Game Library') || 'Game Library'} | CAISSA Chess`
      : i18n?.t?.('library.metaTitle', 'Game Library — Under Construction | CAISSA Chess')
        || 'Game Library — Under Construction | CAISSA Chess';
    if (available) {
      global.LibraryUI?.renderTagFilter?.();
      global.LibraryUI?.updateStats?.();
    }
  }

  global.CaissaGameLibraryPage = Object.freeze({ render });
  render();
  i18n?.subscribe?.(localize);
})(window);
