export const LICHESS_TV_FRAME_URL = 'https://lichess.org/tv/frame?theme=brown&bg=dark';
export const LICHESS_TV_OFFICIAL_URL = 'https://lichess.org/tv';
export const LICHESS_TV_SANDBOX = 'allow-scripts allow-same-origin';
export const LICHESS_TV_LOADED_COPY = 'Lichess TV viewer loaded. Featured game availability is controlled by Lichess.';

export function isApprovedLichessTvFrameUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'lichess.org' && url.port === '' &&
      url.username === '' && url.password === '' && url.pathname === '/tv/frame' &&
      url.search === '?theme=brown&bg=dark' && url.hash === '' && url.href === LICHESS_TV_FRAME_URL;
  } catch {
    return false;
  }
}

export function initializeLichessTv(root = document, options = {}) {
  const shell = root.querySelector('[data-lichess-tv-shell]');
  if (!shell) return null;
  if (shell.__caissaLichessTvController) return shell.__caissaLichessTvController;

  const mount = shell.querySelector('[data-lichess-tv-frame-mount]');
  const status = shell.querySelector('[data-lichess-tv-status]');
  const error = shell.querySelector('[data-lichess-tv-error]');
  const retry = shell.querySelector('[data-lichess-tv-retry]');
  const timeoutMs = options.timeoutMs ?? 15000;
  let timer = 0;
  let frame = null;
  let generation = 0;
  let state = 'loading';
  let moveFocusAfterLoad = false;

  function clearAttempt() {
    window.clearTimeout(timer);
    timer = 0;
    if (frame) frame.remove();
    frame = null;
  }

  function showUnavailable(nextGeneration) {
    if (nextGeneration !== generation) return;
    window.clearTimeout(timer);
    timer = 0;
    state = 'unavailable';
    status.hidden = true;
    error.hidden = false;
    shell.classList.remove('is-document-loaded');
  }

  function createFrame({ focusStatus = false } = {}) {
    clearAttempt();
    generation += 1;
    const currentGeneration = generation;
    state = 'loading';
    moveFocusAfterLoad = focusStatus;
    error.hidden = true;
    status.hidden = false;
    status.textContent = 'Loading the Lichess TV viewer…';
    status.dataset.state = 'loading';
    shell.classList.remove('is-document-loaded');

    const next = root.createElement('iframe');
    next.src = LICHESS_TV_FRAME_URL;
    next.title = 'Lichess TV Top Rated live chess game';
    next.referrerPolicy = 'no-referrer';
    next.loading = 'eager';
    next.setAttribute('sandbox', LICHESS_TV_SANDBOX);
    next.dataset.lichessTvFrame = '';
    next.addEventListener('load', () => {
      if (currentGeneration !== generation) return;
      window.clearTimeout(timer);
      timer = 0;
      state = 'document-loaded';
      status.textContent = LICHESS_TV_LOADED_COPY;
      status.dataset.state = state;
      status.hidden = false;
      error.hidden = true;
      shell.classList.add('is-document-loaded');
      if (moveFocusAfterLoad) {
        moveFocusAfterLoad = false;
        root.querySelector('[data-lichess-tv-provider-link]')?.focus({ preventScroll: true });
      }
    }, { once: true });
    next.addEventListener('error', () => showUnavailable(currentGeneration), { once: true });
    frame = next;
    mount.replaceChildren(next);
    timer = window.setTimeout(() => showUnavailable(currentGeneration), timeoutMs);
    if (focusStatus) status.focus({ preventScroll: true });
  }

  retry.addEventListener('click', () => createFrame({ focusStatus: true }));
  const controller = Object.freeze({
    get state() { return state; },
    get frame() { return frame; },
    retry() { createFrame({ focusStatus: true }); return true; },
    destroy() { generation += 1; clearAttempt(); state = 'destroyed'; }
  });
  shell.__caissaLichessTvController = controller;
  createFrame();
  return controller;
}

if (typeof document !== 'undefined') initializeLichessTv();
