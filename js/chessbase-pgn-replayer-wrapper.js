(function () {
  'use strict';
  const schema = 'CaissaGameReplayerStatus@1.0.0';
  const host = document.querySelector('.cbreplay');
  const failure = document.querySelector('[data-wrapper-failure]');
  let finished = false;
  function notify(type) { parent.postMessage({ schema, type }, '*'); }
  function ready() {
    if (finished) return;
    const rendered = host && host.children.length > 0 && !/LOADING\.\.\./i.test(host.textContent || '');
    if (!rendered) return;
    finished = true;
    document.body.classList.add('is-ready');
    notify('caissa.gpr.ready');
  }
  function fail() {
    if (finished) return;
    finished = true;
    failure.hidden = false;
    notify('caissa.gpr.error');
  }
  window.addEventListener('error', event => {
    if (event.target && /^(SCRIPT|LINK)$/i.test(event.target.tagName || '')) fail();
  }, true);
  new MutationObserver(ready).observe(host, { childList: true, subtree: true, characterData: true });
  window.setInterval(ready, 250);
  window.setTimeout(fail, 12000);
}());
