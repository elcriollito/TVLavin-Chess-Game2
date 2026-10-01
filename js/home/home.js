((global) => {
  'use strict';

  const tools = Object.freeze({
    play: Object.freeze(['Play', '/play']),
    puzzles: Object.freeze(['Puzzles', '/puzzles']),
    analyze: Object.freeze(['Analyze', '/analyze']),
    openings: Object.freeze(['Openings', '/opening-database']),
    endgames: Object.freeze(['Endgames', '/endgame-tablebase']),
    arena: Object.freeze(['Engine Arena', '/arena']),
    tv: Object.freeze(['Chess TV', '/spectator-tv'])
  });
  const recentKey = 'caissa.home.recent-tools.v1';

  function classifyAuth(auth) {
    if (!auth || auth.isLoaded !== true || auth.status === 'loading') return 'loading';
    if (auth.status === 'unavailable') return 'error';
    return auth.isSignedIn === true && auth.userId ? 'signed-in' : 'guest';
  }

  function normalizePuzzleProgress(payload) {
    const progress = payload?.progress;
    if (!progress || typeof progress !== 'object') return Object.freeze({ state: 'error' });
    const rating = Number(progress.rating);
    const solved = Number(progress.solved);
    const failed = Number(progress.failed);
    if (!Number.isFinite(rating) || !Number.isInteger(solved) || solved < 0
        || !Number.isInteger(failed) || failed < 0) {
      return Object.freeze({ state: 'error' });
    }
    const attempts = solved + failed;
    if (attempts === 0) return Object.freeze({ state: 'empty', solved, failed, attempts });
    return Object.freeze({ state: 'ready', rating: Math.round(rating), solved, failed, attempts });
  }

  global.CaissaHomeContract = Object.freeze({ classifyAuth, normalizePuzzleProgress, tools });
  if (!global.document) return;

  const document = global.document;
  const topbarAccount = document.getElementById('topbar-account');
  const accountPanel = document.getElementById('account-panel');
  const accountContent = document.getElementById('account-content');
  const settingsDialog = document.getElementById('home-settings');
  let accountRequest = 0;
  let progressModulePromise = null;
  let currentAuth = null;
  let recent = [];
  let settingsTrigger = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendLink(parent, { href, className = '', text, icon = '', label = '' }) {
    const link = element('a', className);
    link.href = href;
    if (label) link.setAttribute('aria-label', label);
    if (icon) {
      const image = element('i', icon);
      image.setAttribute('aria-hidden', 'true');
      link.append(image);
    }
    link.append(element('span', '', text));
    parent.append(link);
    return link;
  }

  function returnPath() {
    const location = global.location;
    const path = `${location?.pathname || '/'}${location?.search || ''}${location?.hash || ''}`;
    return path.startsWith('/') && !path.startsWith('//') ? path : '/';
  }

  function authHref(kind) {
    return `/${kind}?redirect_url=${encodeURIComponent(returnPath())}`;
  }

  function appendAuthEntryPoints(parent) {
    appendLink(parent, { href: authHref('signin'), className: 'topbar-control', text: 'Sign in' });
    appendLink(parent, { href: authHref('signup'), className: 'button small topbar-control', text: 'Register' });
  }

  function openSettings(trigger) {
    if (!settingsDialog) return;
    settingsTrigger = trigger;
    global.CaissaI18n?.apply?.(settingsDialog);
    if (typeof settingsDialog.showModal === 'function') settingsDialog.showModal();
    else settingsDialog.setAttribute('open', '');
    settingsDialog.querySelector('select, button')?.focus?.();
  }

  function appendSettings(parent) {
    const settings = element('button', 'quiet-button topbar-control settings-control');
    settings.type = 'button';
    settings.setAttribute('aria-label', 'Settings');
    const icon = element('i', 'fa-solid fa-gear');
    icon.setAttribute('aria-hidden', 'true');
    settings.append(icon, element('span', 'control-label', 'Settings'));
    settings.addEventListener('click', () => openSettings(settings));
    parent.append(settings);
    return settings;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'C';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts.at(-1)[0]).toUpperCase();
  }

  function displayName(auth) {
    const explicit = String(auth?.fullName || '').trim();
    if (explicit && explicit.toLowerCase() !== 'user') return explicit;
    const email = String(auth?.email || '').trim();
    return email ? email.split('@')[0] : 'CAISSA player';
  }

  function renderTopbar(auth, state) {
    topbarAccount.replaceChildren();
    if (state === 'loading') {
      topbarAccount.append(element('span', 'account-loading', 'Checking account…'));
      appendAuthEntryPoints(topbarAccount);
      appendSettings(topbarAccount);
      return;
    }
    if (state === 'guest') {
      appendAuthEntryPoints(topbarAccount);
      appendSettings(topbarAccount);
      return;
    }
    if (state === 'error') {
      topbarAccount.append(element('span', 'account-error', 'Account unavailable'));
      const retry = element('button', 'quiet-button', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => global.location.reload());
      topbarAccount.append(retry);
      appendAuthEntryPoints(topbarAccount);
      appendSettings(topbarAccount);
      return;
    }

    appendSettings(topbarAccount);
    const menu = element('details', 'account-menu');
    const account = element('summary', 'account-identity account-trigger');
    account.setAttribute('role', 'button');
    account.setAttribute('aria-label', `Account menu for ${displayName(auth)}`);
    if (auth.imageUrl) {
      const image = element('img', 'account-avatar');
      image.src = auth.imageUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      account.append(image);
    } else {
      account.append(element('span', 'account-avatar account-initials', initials(displayName(auth))));
    }
    account.append(element('span', 'account-name', displayName(auth)));
    const chevron = element('i', 'fa-solid fa-chevron-down account-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    account.append(chevron);

    const panel = element('div', 'account-menu-panel');
    const identity = element('div', 'account-menu-identity');
    identity.append(
      element('strong', '', displayName(auth)),
      element('span', '', auth.email || 'CAISSA account')
    );
    const profile = element('button', 'account-menu-action', 'Profile');
    profile.type = 'button';
    profile.addEventListener('click', async () => {
      menu.removeAttribute('open');
      const openProfile = auth.clerk?.openUserProfile;
      if (typeof openProfile === 'function') await openProfile.call(auth.clerk);
    });
    const signOut = element('button', 'account-menu-action', 'Sign out');
    signOut.type = 'button';
    signOut.addEventListener('click', async () => {
      menu.removeAttribute('open');
      signOut.disabled = true;
      try {
        await auth.signOut?.();
      } finally {
        signOut.disabled = false;
      }
    });
    panel.append(identity, profile, signOut);
    menu.append(account, panel);
    topbarAccount.append(menu);
  }

  function resetAccountContent() {
    accountContent.replaceChildren();
    accountPanel.removeAttribute('data-state');
  }

  function renderAccount(auth, state, progress = null) {
    resetAccountContent();
    accountPanel.dataset.state = progress?.state || state;
    accountPanel.setAttribute('aria-busy', String(state === 'loading' || progress?.state === 'loading'));

    if (state === 'loading') {
      accountContent.append(
        element('div', 'journey-mark account-spinner', '♙'),
        element('h3', '', 'Loading your account…'),
        element('p', '', 'Checking for a CAISSA session.')
      );
      return;
    }
    if (state === 'guest') {
      accountContent.append(
        element('div', 'journey-mark', '♙'),
        element('h3', '', 'Make it your own.'),
        element('p', '', 'Create a free account to save your puzzle training progress.')
      );
      appendLink(accountContent, { href: authHref('signup'), className: 'button', text: 'Create your account' });
      appendLink(accountContent, { href: authHref('signin'), className: 'subtle-link', text: 'Already a member? Sign in' });
      return;
    }
    if (state === 'error') {
      accountContent.append(
        element('div', 'journey-mark account-warning', '!'),
        element('h3', '', 'Account status unavailable.'),
        element('p', '', 'CAISSA could not check your session. You can still try to sign in or create an account.')
      );
      appendLink(accountContent, { href: authHref('signin'), className: 'button', text: 'Sign in' });
      appendLink(accountContent, { href: authHref('signup'), className: 'subtle-link', text: 'Register' });
      return;
    }

    const name = displayName(auth);
    const avatar = element('div', 'journey-mark account-profile');
    if (auth.imageUrl) {
      const image = element('img', '');
      image.src = auth.imageUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      avatar.append(image);
    } else {
      avatar.textContent = initials(name);
    }
    accountContent.append(avatar, element('h3', '', `Welcome back, ${name}.`));

    if (progress?.state === 'loading') {
      accountContent.append(element('p', '', 'Loading your saved puzzle progress…'));
      return;
    }
    if (progress?.state === 'empty') {
      accountContent.append(element('p', '', 'No saved puzzle activity yet. Your first completed puzzle will appear here.'));
      appendLink(accountContent, { href: '/puzzles', className: 'button', text: 'Start training' });
      return;
    }
    if (progress?.state === 'ready') {
      const stats = element('dl', 'account-stats');
      for (const [label, value] of [
        ['Puzzle rating', progress.rating.toLocaleString()],
        ['Solved', progress.solved.toLocaleString()],
        ['Attempted', progress.attempts.toLocaleString()]
      ]) {
        const item = element('div', '');
        item.append(element('dt', '', label), element('dd', '', value));
        stats.append(item);
      }
      accountContent.append(element('p', '', 'Your saved CAISSA puzzle progress.'), stats);
      appendLink(accountContent, { href: '/puzzles', className: 'button', text: 'Continue puzzles' });
      return;
    }

    accountContent.append(
      element('p', '', 'Your account is connected, but saved puzzle progress is unavailable right now.')
    );
    appendLink(accountContent, { href: '/puzzles', className: 'subtle-link', text: 'Open Puzzles' });
  }

  async function loadProgress(auth, request, userId) {
    try {
      progressModulePromise ||= import('/js/puzzles/account-progress-api.js');
      const { loadAccountProgress } = await progressModulePromise;
      const payload = await loadAccountProgress(auth);
      if (request !== accountRequest || classifyAuth(auth) !== 'signed-in' || auth.userId !== userId) return;
      renderAccount(auth, 'signed-in', normalizePuzzleProgress(payload));
    } catch {
      if (request !== accountRequest || classifyAuth(auth) !== 'signed-in' || auth.userId !== userId) return;
      renderAccount(auth, 'signed-in', { state: 'error' });
    }
  }

  function handleAuth(auth) {
    currentAuth = auth;
    const state = classifyAuth(auth);
    const request = ++accountRequest;
    renderTopbar(auth, state);
    if (state !== 'signed-in') {
      renderAccount(auth, state);
      return;
    }
    renderAccount(auth, state, { state: 'loading' });
    void loadProgress(auth, request, auth.userId);
  }

  function refreshRestoredProgress(event) {
    if (!event.persisted || classifyAuth(currentAuth) !== 'signed-in') return;
    handleAuth(currentAuth);
  }

  function readRecent() {
    try {
      const saved = JSON.parse(global.localStorage.getItem(recentKey) || '[]');
      if (Array.isArray(saved)) {
        return [...new Set(saved.filter(id => Object.hasOwn(tools, id)))].slice(0, 4);
      }
    } catch {
      // Optional Home-owned history remains empty when browser storage is unavailable.
    }
    return [];
  }

  function writeRecent() {
    try {
      if (recent.length) global.localStorage.setItem(recentKey, JSON.stringify(recent));
      else global.localStorage.removeItem(recentKey);
    } catch {
      // Optional Home-owned history does not block navigation.
    }
  }

  function renderRecent() {
    const container = document.getElementById('recent-tools');
    container.replaceChildren();
    for (const id of recent) {
      const link = element('a', '', tools[id][0]);
      link.href = tools[id][1];
      link.dataset.tool = id;
      container.append(link);
    }
    document.getElementById('recent').hidden = recent.length === 0;
  }

  function renderAllTools() {
    const host = document.getElementById('all-tools-groups');
    const navigation = global.CaissaPrimaryNavigation;
    if (!host || !Array.isArray(navigation?.inventory?.groups)) return;
    host.replaceChildren();
    navigation.inventory.groups.forEach((group, index) => {
      const section = element('section', 'all-tools-group');
      section.append(element('h3', '', navigation.groupLabels[index] || 'CAISSA tools'));
      const links = element('div', 'all-tools-links');
      group.forEach(item => {
        const link = appendLink(links, {
          href: item.route,
          className: 'all-tools-link',
          text: item.label,
          icon: item.icon,
          label: item.label
        });
        link.dataset.toolId = item.id;
        if (item.id === 'yahooClassic') link.classList.add('desktop-only');
      });
      section.append(links);
      host.append(section);
    });
  }

  function renderBoards() {
    const names = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };
    document.querySelectorAll('[data-fen]').forEach(board => {
      board.replaceChildren();
      board.dataset.fen.split('/').slice(0, 8).forEach((row, rank) => {
        let file = 0;
        for (const token of row) {
          const empty = /^[1-8]$/.test(token);
          const count = empty ? Number(token) : 1;
          for (let index = 0; index < count && file < 8; index += 1) {
            const square = element('span', `square${(rank + file) % 2 ? ' dark' : ''}`);
            if (!empty && names[token.toLowerCase()]) {
              const piece = element('img', '');
              const color = token === token.toUpperCase() ? 'w' : 'b';
              piece.src = `/scanner/recognition/datasets/piece-sets/assets/kosal/original/${color}${names[token.toLowerCase()]}.svg`;
              piece.alt = '';
              piece.draggable = false;
              square.append(piece);
            }
            board.append(square);
            file += 1;
          }
        }
      });
    });
  }

  recent = readRecent();
  renderRecent();
  renderAllTools();
  renderBoards();

  document.addEventListener('click', event => {
    const id = event.target.closest?.('a[data-tool]')?.dataset.tool;
    if (!id || !Object.hasOwn(tools, id)) return;
    recent = [id, ...recent.filter(item => item !== id)].slice(0, 4);
    writeRecent();
    renderRecent();
  });

  document.getElementById('clear-recent')?.addEventListener('click', () => {
    recent = [];
    writeRecent();
    renderRecent();
    const target = document.getElementById('journey-title');
    target.tabIndex = -1;
    target.focus();
  });

  settingsDialog?.addEventListener('close', () => {
    settingsTrigger?.focus?.();
    settingsTrigger = null;
  });
  settingsDialog?.addEventListener('click', event => {
    if (event.target === settingsDialog) settingsDialog.close?.();
  });
  document.addEventListener('click', event => {
    document.querySelectorAll('.account-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.account-menu[open]').forEach(menu => {
      menu.removeAttribute('open');
      menu.querySelector('summary')?.focus?.();
    });
  });

  const auth = global.CAISSA_AUTH;
  if (!auth) {
    handleAuth({ isLoaded: true, status: 'unavailable' });
  } else {
    handleAuth(auth);
    auth.onAuthStateChange?.(handleAuth);
    global.addEventListener('pageshow', refreshRestoredProgress);
  }
})(globalThis);

