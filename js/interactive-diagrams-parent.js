(function () {
  'use strict';
  const shell = document.querySelector('[data-interactive-diagrams-shell]');
  if (!shell) return;
  const frame = shell.querySelector('iframe');
  const status = shell.querySelector('[data-interactive-diagrams-status]');
  const error = shell.querySelector('[data-interactive-diagrams-error]');
  const errorCopy = shell.querySelector('[data-interactive-diagrams-error-copy]');
  const retry = shell.querySelector('[data-interactive-diagrams-retry]');
  let timeoutId = 0; let attempt = 0;
  function showFailure(copy) { clearTimeout(timeoutId); status.hidden = true; errorCopy.textContent = copy; error.hidden = false; shell.classList.remove('is-ready'); }
  function armTimeout() { clearTimeout(timeoutId); timeoutId = window.setTimeout(() => showFailure('The interactive diagrams took too long to load. The lesson summaries remain available below.'), 15000); }
  function retryLoad() { attempt += 1; error.hidden = true; status.hidden = false; status.textContent = 'Loading four interactive diagrams…'; frame.src = `/integrations/chessbase-interactive-diagrams.html?attempt=${attempt}`; armTimeout(); }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.schema !== 'CaissaInteractiveDiagramsStatus@1.0.0' || !['ready', 'partial', 'provider-blocked', 'timeout'].includes(data.state) || data.expected !== 4 || !Number.isInteger(data.rendered)) return;
    if (data.state === 'ready' && data.rendered === data.expected) { clearTimeout(timeoutId); status.hidden = true; error.hidden = true; shell.classList.add('is-ready'); }
    else showFailure(data.state === 'partial' ? `Only ${data.rendered} of ${data.expected} diagrams loaded. The complete textual lessons remain available below.` : 'The ChessBase diagram technology is unavailable. The complete textual lessons remain available below.');
  });
  frame.addEventListener('error', () => showFailure('The diagram provider was blocked or unavailable. The complete textual lessons remain available below.'));
  retry.addEventListener('click', retryLoad);
  armTimeout();
}());
