(function () {
  'use strict';
  const shell = document.querySelector('[data-live-tournaments-shell]');
  if (!shell) return;
  const frame = shell.querySelector('[data-live-tournaments-frame]');
  const status = shell.querySelector('[data-live-tournaments-status]');
  const error = shell.querySelector('[data-live-tournaments-error]');
  const retry = shell.querySelector('[data-live-tournaments-retry]');
  const source = frame.getAttribute('src');
  let timeoutId = 0;

  function showFailure() {
    window.clearTimeout(timeoutId);
    shell.classList.remove('is-ready');
    status.hidden = true;
    error.hidden = false;
  }
  function armTimeout() {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(showFailure, 15000);
  }
  function showReady() {
    if (frame.getAttribute('src') !== source) return;
    window.clearTimeout(timeoutId);
    error.hidden = true;
    status.hidden = true;
    shell.classList.add('is-ready');
  }
  function retryLoad() {
    shell.classList.remove('is-ready');
    error.hidden = true;
    status.hidden = false;
    status.textContent = 'Loading the featured tournament broadcast…';
    frame.setAttribute('src', source);
    armTimeout();
  }
  frame.addEventListener('load', showReady);
  frame.addEventListener('error', showFailure);
  retry.addEventListener('click', retryLoad);
  armTimeout();
}());
