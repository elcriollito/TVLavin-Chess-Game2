import { FEATURED_LICHESS_BROADCAST, validateLichessBroadcast, lichessBroadcastStatus } from './lichess-broadcasts-config.js';

export const LICHESS_BROADCAST_SANDBOX = 'allow-scripts allow-same-origin';
export const LICHESS_BROADCAST_STATUS_COPY = Object.freeze({
  upcoming: 'Upcoming tournament coverage',
  'coverage-window': 'Published tournament coverage window',
  completed: 'Event completed — games may remain available for replay',
  unavailable: 'Tournament viewer currently unavailable',
  'configuration-error': 'Featured tournament information is temporarily unavailable'
});

const setText = (root, selector, value) => root.querySelectorAll(selector).forEach(node => { node.textContent = value; });
function setLink(root, selector, href, label) { const link = root.querySelector(selector); if (link) { link.href = href; link.textContent = label; } }
function scheduleText(config) {
  const format = new Intl.DateTimeFormat('en-US', { timeZone: config.eventTimezone, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return `${format.format(new Date(config.startsAt))} through ${format.format(new Date(config.endsAt))}`;
}

export function initializeLichessBroadcasts(root = document, config = FEATURED_LICHESS_BROADCAST, options = {}) {
  const shell = root.querySelector('[data-lichess-broadcasts-shell]');
  if (!shell) return null;
  if (shell.__caissaLichessBroadcastsController) return shell.__caissaLichessBroadcastsController;
  const mount = shell.querySelector('[data-lichess-broadcasts-frame-mount]');
  const status = root.querySelector('[data-lichess-broadcasts-event-status]');
  const loading = shell.querySelector('[data-lichess-broadcasts-loading]');
  const error = shell.querySelector('[data-lichess-broadcasts-error]');
  const retry = shell.querySelector('[data-lichess-broadcasts-retry]');
  const now = options.now ?? new Date();
  const timeoutMs = options.timeoutMs ?? 15000;
  let availability = 'available', frame = null, timer = 0, generation = 0;
  const renderStatus = () => { const state = lichessBroadcastStatus(config, now, availability); status.textContent = LICHESS_BROADCAST_STATUS_COPY[state]; status.dataset.status = state; return state; };
  function clearAttempt() { window.clearTimeout(timer); timer = 0; frame?.remove(); frame = null; }
  function fail(attempt) { if (attempt !== generation) return; window.clearTimeout(timer); availability = 'unavailable'; loading.hidden = true; error.hidden = false; shell.classList.remove('is-ready'); renderStatus(); }
  function createFrame() {
    clearAttempt(); generation += 1; const attempt = generation; availability = 'available'; error.hidden = true; loading.hidden = false; shell.classList.remove('is-ready'); renderStatus();
    const next = root.createElement('iframe');
    next.src = config.frameUrl; next.title = `${config.displayName} official Lichess tournament viewer`; next.loading = 'eager'; next.referrerPolicy = 'no-referrer'; next.setAttribute('sandbox', LICHESS_BROADCAST_SANDBOX); next.dataset.lichessBroadcastsFrame = '';
    next.addEventListener('load', () => { if (attempt !== generation) return; window.clearTimeout(timer); loading.hidden = true; error.hidden = true; shell.classList.add('is-ready'); renderStatus(); }, { once: true });
    next.addEventListener('error', () => fail(attempt), { once: true }); frame = next; mount.replaceChildren(next); timer = window.setTimeout(() => fail(attempt), timeoutMs);
  }
  const validation = validateLichessBroadcast(config);
  if (!validation.ok) { loading.hidden = true; error.hidden = false; retry.hidden = true; renderStatus(); return Object.freeze({ state: 'configuration-error', retry: () => false }); }
  setText(root, '[data-lichess-broadcasts-name]', config.displayName); setText(root, '[data-lichess-broadcasts-organizer]', config.organizerName); setText(root, '[data-lichess-broadcasts-location]', config.location); setText(root, '[data-lichess-broadcasts-schedule]', scheduleText(config)); setText(root, '[data-lichess-broadcasts-timezone]', config.eventTimezone); setText(root, '[data-lichess-broadcasts-schedule-note]', config.scheduleNote); setText(root, '[data-lichess-broadcasts-verified]', new Date(config.verifiedAt).toISOString().slice(0, 10));
  setLink(root, '[data-lichess-broadcasts-provider-link]', config.providerEventUrl, 'Open the official Lichess broadcast'); setLink(root, '[data-lichess-broadcasts-organizer-link]', config.organizerUrl, `Visit ${config.organizerName}`); setLink(root, '[data-lichess-broadcasts-schedule-link]', config.scheduleUrl, 'View the organizer schedule');
  shell.querySelector('[data-lichess-broadcasts-fallback]').href = config.providerEventUrl; retry.addEventListener('click', createFrame); createFrame();
  const controller = Object.freeze({ get state() { return lichessBroadcastStatus(config, now, availability); }, get frame() { return frame; }, retry() { createFrame(); return true; } }); shell.__caissaLichessBroadcastsController = controller; return controller;
}
if (typeof document !== 'undefined') initializeLichessBroadcasts();
