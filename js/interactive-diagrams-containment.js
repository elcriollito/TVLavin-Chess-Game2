(function (global) {
  'use strict';
  const state = { violations: [], engineMessages: 0 };
  global.CaissaInteractiveDiagramContainment = state;
  document.addEventListener('securitypolicyviolation', event => {
    const blocked = String(event.blockedURI || '');
    if (!/Common\/Chess\/Engine\/Enginemin\.js$/i.test(blocked)) return;
    state.violations.push({ blockedURI: blocked, effectiveDirective: event.effectiveDirective, disposition: event.disposition });
  });
  global.addEventListener('message', event => {
    if (/engine/i.test(String(event.data?.type || ''))) state.engineMessages += 1;
  });
}(window));
