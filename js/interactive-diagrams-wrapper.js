(function () {
  'use strict';
  const schema = 'CaissaInteractiveDiagramsStatus@1.0.0';
  const hosts = [...document.querySelectorAll('.cbdiagram')];
  const expected = Number(document.documentElement.dataset.interactiveDiagramCount || 0);
  let finished = false;
  function notify(state, rendered) { parent.postMessage({ schema, state, expected, rendered }, '*'); }
  function renderedCount() { return hosts.filter(host => host.children.length > 0 && !/LOADING\.\.\./i.test(host.textContent || '')).length; }
  function check() { if (finished) return; const rendered = renderedCount(); if (rendered === expected && expected > 0) { finished = true; document.body.classList.add('is-ready'); notify('ready', rendered); } }
  function fail(state) { if (finished) return; finished = true; document.body.classList.add('is-failed'); notify(state, renderedCount()); }
  window.addEventListener('error', event => { if (event.target && /^(SCRIPT|LINK)$/i.test(event.target.tagName || '')) fail('provider-blocked'); }, true);
  new MutationObserver(check).observe(document.querySelector('[data-interactive-diagrams-host]'), { childList: true, subtree: true, characterData: true });
  window.setInterval(check, 250);
  window.setTimeout(() => fail(renderedCount() ? 'partial' : 'timeout'), 12000);
}());
