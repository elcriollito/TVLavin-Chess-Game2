import { FEATURED_TOURNAMENT, validateFeaturedTournament, featuredTournamentStatus } from './live-tournaments-config.js';

export const STATUS_COPY = Object.freeze({
  upcoming: 'Upcoming tournament coverage',
  'coverage-window': 'Live coverage window',
  completed: 'Event completed — games may remain available for replay',
  unavailable: 'Tournament viewer currently unavailable',
  'configuration-error': 'Featured tournament information is temporarily unavailable'
});

const FRAME_SANDBOX = 'allow-scripts allow-same-origin';

function setText(root, selector, value) {
  root.querySelectorAll(selector).forEach(element => { element.textContent = value; });
}

function setLink(root, selector, href, label) {
  const link = root.querySelector(selector);
  if (!link) return;
  link.href = href;
  link.textContent = label;
}

function scheduleText(config) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: config.eventTimezone, month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  return `${format.format(new Date(config.startsAt))} through ${format.format(new Date(config.endsAt))}`;
}

export function initializeLiveTournaments(root = document, config = FEATURED_TOURNAMENT, options = {}) {
  const shell = root.querySelector('[data-live-tournaments-shell]');
  if (!shell) return null;
  const mount = shell.querySelector('[data-live-tournaments-frame-mount]');
  const loading = shell.querySelector('[data-live-tournaments-loading]');
  const error = shell.querySelector('[data-live-tournaments-error]');
  const retry = shell.querySelector('[data-live-tournaments-retry]');
  const status = root.querySelector('[data-live-tournaments-event-status]');
  const fallback = root.querySelector('[data-live-tournaments-fallback]');
  const timeoutMs = options.timeoutMs ?? 15000;
  const now = options.now ?? new Date();
  let timer = 0;
  let frame = null;
  let availability = 'available';

  function renderStatus() {
    const state = featuredTournamentStatus(config, now, availability);
    status.textContent = STATUS_COPY[state];
    status.dataset.status = state;
    return state;
  }
  function clearFrame() {
    window.clearTimeout(timer);
    if (frame) frame.remove();
    frame = null;
  }
  function fail() {
    window.clearTimeout(timer);
    availability = 'unavailable';
    loading.hidden = true;
    error.hidden = false;
    shell.classList.remove('is-ready');
    renderStatus();
  }
  function createFrame() {
    clearFrame();
    availability = 'available';
    error.hidden = true;
    loading.hidden = false;
    shell.classList.remove('is-ready');
    renderStatus();
    const next = root.createElement('iframe');
    next.src = config.frameUrl;
    next.title = `${config.displayName} viewer from ${config.provider}`;
    next.referrerPolicy = 'no-referrer';
    next.loading = 'eager';
    next.setAttribute('sandbox', FRAME_SANDBOX);
    next.dataset.liveTournamentsFrame = '';
    next.addEventListener('load', () => {
      window.clearTimeout(timer);
      loading.hidden = true;
      error.hidden = true;
      shell.classList.add('is-ready');
      renderStatus();
    }, { once: true });
    next.addEventListener('error', fail, { once: true });
    frame = next;
    mount.append(next);
    timer = window.setTimeout(fail, timeoutMs);
  }

  const validation = validateFeaturedTournament(config);
  if (!validation.ok) {
    clearFrame();
    loading.hidden = true;
    error.hidden = false;
    retry.hidden = true;
    renderStatus();
    return Object.freeze({ state: 'configuration-error', retry: () => false });
  }

  setText(root, '[data-live-tournaments-name]', config.displayName);
  setText(root, '[data-live-tournaments-organizer]', config.organizerName);
  setText(root, '[data-live-tournaments-location]', config.location);
  setText(root, '[data-live-tournaments-schedule]', scheduleText(config));
  setText(root, '[data-live-tournaments-timezone]', config.eventTimezone);
  setText(root, '[data-live-tournaments-verified]', new Date(config.verifiedAt).toISOString().slice(0, 10));
  setLink(root, '[data-live-tournaments-provider-link]', config.providerEventUrl, `Open the official ${config.provider} tournament viewer`);
  setLink(root, '[data-live-tournaments-organizer-link]', config.organizerUrl, `Visit ${config.organizerName}`);
  fallback.href = config.providerEventUrl;
  retry.addEventListener('click', createFrame);
  createFrame();
  return Object.freeze({ get state() { return featuredTournamentStatus(config, now, availability); }, retry: () => { createFrame(); return true; } });
}

if (typeof document !== 'undefined') initializeLiveTournaments();
