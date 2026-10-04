import { getPgnCollection } from './game-library/pgn-collection-registry.js';

const schema = 'CaissaGameReplayerStatus@1.0.0';
const host = document.querySelector('.cbreplay');
const status = document.querySelector('[data-wrapper-status]');
const failure = document.querySelector('[data-wrapper-failure]');
const download = document.querySelector('[data-wrapper-download]');
const requestedId = new URLSearchParams(location.search).get('collection') || 'capablanca-complete';
const selected = getPgnCollection(requestedId);
let finished = false;

function notify(type, detail = {}) { parent.postMessage({ schema, type, collectionId: selected?.id || null, ...detail }, location.origin); }
function ready() {
  if (finished) return;
  const rendered = host && host.children.length > 0 && !/LOADING\.\.\./i.test(host.textContent || '');
  if (!rendered) return;
  finished = true;
  document.body.classList.add('is-ready');
  notify('caissa.gpr.ready');
}
function fail(code = 'PROVIDER_UNAVAILABLE') {
  if (finished) return;
  finished = true;
  failure.hidden = false;
  notify('caissa.gpr.error', { code });
}
function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.integrity = integrity;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });
}

if (!selected?.readerCompatible) {
  fail('COLLECTION_NOT_ALLOWLISTED');
} else {
  host.dataset.url = selected.localAsset;
  status.textContent = `Loading ${selected.title}…`;
  download.href = selected.localAsset;
  download.download = selected.downloadFilename;
  try {
    await loadScript('https://pgn.chessbase.com/jquery-3.0.0.min.js', 'sha384-THPy051/pYDQGanwU6poAc/hOdQxjnOEXzbT+OuUAFqNqFjL+4IGLBgCJC3ZOShY');
    await loadScript('https://pgn.chessbase.com/cbreplay.js', 'sha384-v5TWW+6GNCylyjk5btsxh/9rU0h1eYECLHbJA9FomL6xwz1lAViAJa9eVNbh136I');
    new MutationObserver(ready).observe(host, { childList: true, subtree: true, characterData: true });
    window.setInterval(ready, 250);
    window.setTimeout(() => fail('RENDER_TIMEOUT'), 12000);
  } catch {
    fail('PROVIDER_RESOURCE_BLOCKED');
  }
}
