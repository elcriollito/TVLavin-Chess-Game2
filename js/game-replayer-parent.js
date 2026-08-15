(function () {
  'use strict';
  const shell = document.querySelector('[data-game-replayer-shell]');
  if (!shell) return;
  const frame = shell.querySelector('iframe');
  const status = shell.querySelector('[data-game-replayer-status]');
  const error = shell.querySelector('[data-game-replayer-error]');
  const errorCopy = shell.querySelector('[data-game-replayer-error-copy]');
  const retry = shell.querySelector('[data-game-replayer-retry]');
  let timeoutId = 0;
  let attempt = 0;
  const messages = Object.freeze({ ready: 'caissa.gpr.ready', error: 'caissa.gpr.error' });

  function showFailure(copy) {
    clearTimeout(timeoutId);
    shell.classList.remove('is-ready');
    status.hidden = true;
    errorCopy.textContent = copy;
    error.hidden = false;
  }
  function armTimeout() {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => showFailure('The game replayer took too long to load.'), 15000);
  }
  function retryLoad() {
    attempt += 1;
    error.hidden = true;
    status.hidden = false;
    status.textContent = 'Loading the game replayer…';
    frame.src = `/integrations/chessbase-pgn-replayer.html?attempt=${attempt}`;
    armTimeout();
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.schema !== 'CaissaGameReplayerStatus@1.0.0' || !Object.values(messages).includes(data.type)) return;
    if (data.type === messages.ready) {
      clearTimeout(timeoutId);
      error.hidden = true;
      status.hidden = true;
      shell.classList.add('is-ready');
    } else showFailure('The ChessBase replayer or PGN collection could not be loaded.');
  });
  frame.addEventListener('error', () => showFailure('The provider resource was blocked or unavailable.'));
  retry.addEventListener('click', retryLoad);
  armTimeout();
}());
