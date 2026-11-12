((global) => {
  'use strict';

  const destinations = Object.freeze([
    Object.freeze({ id: 'play', route: '/play-hub' }),
    Object.freeze({ id: 'puzzles', route: '/puzzles' }),
    Object.freeze({ id: 'bots', route: '/play/bots' }),
    Object.freeze({ id: 'coach', route: '/play/coach' }),
    Object.freeze({ id: 'analyze', route: '/analyze' }),
    Object.freeze({ id: 'scanner', route: '/scanner' }),
    Object.freeze({ id: 'opening-explorer', route: '/opening-database' }),
    Object.freeze({ id: 'watch-games', route: '/watch/lichess-tv' }),
    Object.freeze({ id: 'settings', route: null })
  ]);
  const settingsCategories = Object.freeze([
    'account', 'board', 'appearance', 'engine-coach', 'language', 'notation', 'accessibility', 'advanced'
  ]);

  global.CaissaMobileHome = Object.freeze({ destinations, settingsCategories });
  if (!global.document) return;

  const document = global.document;
  const home = document.querySelector('[data-mobile-home]');
  const sheet = document.getElementById('mobile-settings');
  const list = sheet?.querySelector('[data-mobile-settings-list]');
  const title = sheet?.querySelector('#mobile-settings-title');
  const back = sheet?.querySelector('[data-mobile-settings-back]');
  const closeButton = sheet?.querySelector('[data-mobile-settings-close]');
  const panels = [...(sheet?.querySelectorAll('[data-mobile-settings-panel]') || [])];
  const localeSelect = sheet?.querySelector('[data-caissa-locale-select]');
  let settingsTrigger = null;

  if (!home || !sheet || !list || !title || !back || !closeButton) return;

  function showCategories({ focus = false } = {}) {
    list.hidden = false;
    panels.forEach(panel => { panel.hidden = true; });
    back.hidden = true;
    title.textContent = 'Settings';
    if (focus) list.querySelector('button')?.focus();
  }

  function showCategory(button) {
    const category = button?.dataset.mobileSettingsView;
    if (!settingsCategories.includes(category)) return;
    const panel = panels.find(item => item.dataset.mobileSettingsPanel === category);
    if (!panel) return;
    list.hidden = true;
    panels.forEach(item => { item.hidden = item !== panel; });
    back.hidden = false;
    title.textContent = button.querySelector('strong')?.textContent || 'Settings';
    panel.querySelector('select, a, button')?.focus?.();
  }

  function openSettings(trigger) {
    settingsTrigger = trigger;
    showCategories();
    global.CaissaI18n?.apply?.(sheet);
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
    closeButton.focus();
  }

  function closeSettings() {
    if (typeof sheet.close === 'function' && sheet.open) sheet.close();
    else {
      sheet.removeAttribute('open');
      settingsTrigger?.focus?.();
      settingsTrigger = null;
      showCategories();
    }
  }

  home.querySelectorAll('[data-mobile-settings-open]').forEach(trigger => {
    trigger.addEventListener('click', () => openSettings(trigger));
  });
  sheet.querySelectorAll('[data-mobile-settings-view]').forEach(button => {
    button.addEventListener('click', () => showCategory(button));
  });
  back.addEventListener('click', () => showCategories({ focus: true }));
  closeButton.addEventListener('click', closeSettings);
  sheet.addEventListener('click', event => {
    if (event.target === sheet) closeSettings();
  });
  sheet.addEventListener('close', () => {
    showCategories();
    settingsTrigger?.focus?.();
    settingsTrigger = null;
  });

  function selectLocale(event) {
    const nextLocale = event.currentTarget?.value;
    if (!nextLocale || !global.CaissaI18n?.setLocale) return;
    event.stopPropagation();
    global.CaissaI18n.setLocale(nextLocale);
  }

  // Native iOS pickers are more reliable with a listener on the control
  // itself than with document-only delegation from inside a modal dialog.
  localeSelect?.addEventListener('input', selectLocale);
  localeSelect?.addEventListener('change', selectLocale);

  global.matchMedia?.('(max-width: 720px)').addEventListener?.('change', event => {
    if (!event.matches && sheet.open) closeSettings();
  });
})(globalThis);
