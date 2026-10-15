import { createPublicIdentityApi } from './public-identity-api.js';
import { publicIdentityDisplay, validatePublicNickname } from './public-nickname-policy.js';

let controller = null;

export async function openPublicIdentityAccount(options = {}) {
    ensureStylesheet();
    if (!controller) controller = createDialogController();
    await controller.open(options.auth || globalThis.CAISSA_AUTH, options.opener || document.activeElement);
}

function createDialogController() {
    const dialog = document.createElement('dialog');
    dialog.className = 'caissa-public-identity-dialog';
    dialog.setAttribute('aria-labelledby', 'caissa-public-identity-title');
    dialog.innerHTML = `
      <div class="public-identity-shell">
        <header class="public-identity-head">
          <div><p class="public-identity-kicker">MY ACCOUNT</p><h2 id="caissa-public-identity-title">Account & identity</h2></div>
          <button class="public-identity-close" type="button" aria-label="Close account settings">×</button>
        </header>
        <div class="public-identity-content" aria-live="off">
          <section class="private-account-section" aria-labelledby="private-account-title">
            <div class="identity-section-copy"><p>PRIVATE ACCOUNT INFORMATION</p><h3 id="private-account-title">Only you can see this</h3></div>
            <dl class="private-account-data">
              <div><dt>Full name</dt><dd data-private-full-name>—</dd></div>
              <div><dt>Email</dt><dd data-private-email>—</dd></div>
            </dl>
            <p class="identity-privacy-note">Used for your private CAISSA account. It is never used as your public chess name.</p>
          </section>
          <section class="public-chess-section" aria-labelledby="public-chess-title">
            <div class="identity-section-copy"><p>PUBLIC CHESS IDENTITY</p><h3 id="public-chess-title">What other players see</h3></div>
            <div class="identity-preview" aria-label="Public player card preview">
              <span aria-hidden="true">♟</span><strong data-public-preview>Loading…</strong><small>CAISSA player</small>
            </div>
            <form class="public-identity-form" novalidate>
              <label for="public-nickname-input">Public nickname</label>
              <div class="public-nickname-control">
                <input id="public-nickname-input" name="nickname" type="text" minlength="3" maxlength="40"
                  autocomplete="off" spellcheck="false" aria-describedby="public-nickname-help public-nickname-status">
                <button type="button" data-check-nickname>Check</button>
              </div>
              <p id="public-nickname-help" class="identity-field-help">3–24 visible characters. Letters from one writing system, numbers, spaces, periods, apostrophes, underscores and hyphens.</p>
              <p id="public-nickname-status" class="identity-form-status" role="status"></p>
              <div class="identity-alias-row"><span>Safe fallback alias</span><code data-fallback-alias>—</code></div>
              <p class="identity-history-note">New games save the public name active when the game begins. Changing it does not rewrite completed games.</p>
              <div class="public-identity-actions">
                <button type="button" data-use-fallback>Use fallback alias</button>
                <button type="submit" class="public-identity-save">Save public identity</button>
              </div>
            </form>
          </section>
        </div>
        <footer class="public-identity-foot"><span data-unsaved hidden>Unsaved changes</span><span>Private by default · Public by choice</span></footer>
      </div>`;
    document.body.appendChild(dialog);

    const api = createPublicIdentityApi();
    const input = dialog.querySelector('#public-nickname-input');
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('[role=status]');
    const save = dialog.querySelector('.public-identity-save');
    const check = dialog.querySelector('[data-check-nickname]');
    const fallbackButton = dialog.querySelector('[data-use-fallback]');
    const unsaved = dialog.querySelector('[data-unsaved]');
    let identity = null;
    let opener = null;
    let requestEpoch = 0;
    let validationEpoch = 0;
    let operationEpoch = 0;
    let owner = null;

    dialog.querySelector('.public-identity-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        requestEpoch += 1;
        validationEpoch += 1;
        operationEpoch += 1;
        opener?.focus?.();
    });
    input.addEventListener('input', () => {
        validationEpoch += 1;
        const checked = validatePublicNickname(input.value, { allowEmpty: true });
        unsaved.hidden = comparable(input.value) === comparable(identity?.nickname || '');
        renderPreview(checked.ok ? checked.value : input.value || identity?.fallbackAlias || 'CAISSA Player');
        setStatus(checked.ok ? 'Changes are not public until saved.' : checked.message, checked.ok ? 'neutral' : 'error');
    });
    check.addEventListener('click', () => void checkAvailability());
    fallbackButton.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        void saveIdentity();
    });
    window.addEventListener('caissa-auth-change', event => {
        const next = event.detail;
        if (!next?.isSignedIn || (owner && next.userId && next.userId !== owner)) {
            requestEpoch += 1;
            validationEpoch += 1;
            operationEpoch += 1;
            if (globalThis.CAISSA_AUTH) globalThis.CAISSA_AUTH.publicIdentity = null;
            if (dialog.open) dialog.close();
        }
    });

    async function open(auth, source) {
        if (!auth?.isSignedIn) return;
        opener = source;
        owner = auth.userId || null;
        operationEpoch += 1;
        dialog.querySelector('[data-private-full-name]').textContent = auth.fullName || 'Not provided';
        dialog.querySelector('[data-private-email]').textContent = auth.email || 'Not provided';
        identity = null;
        input.value = '';
        input.disabled = true;
        save.disabled = true;
        check.disabled = true;
        fallbackButton.disabled = true;
        unsaved.hidden = true;
        setStatus('Loading public identity…', 'loading');
        if (!dialog.open) dialog.showModal();
        const epoch = ++requestEpoch;
        try {
            const payload = await api.load();
            if (epoch !== requestEpoch || !dialog.open) return;
            identity = payload.identity;
            input.value = identity.nickname || '';
            dialog.querySelector('[data-fallback-alias]').textContent = identity.fallbackAlias;
            renderPreview(publicIdentityDisplay(identity));
            setStatus(identity.nickname ? 'This nickname is public.' : 'Your safe fallback alias is public.', 'success');
        } catch (error) {
            if (epoch !== requestEpoch) return;
            setStatus(error.message, 'error');
        } finally {
            if (epoch === requestEpoch && identity) {
                input.disabled = false;
                save.disabled = false;
                check.disabled = false;
                fallbackButton.disabled = false;
                input.focus();
            }
        }
    }

    async function checkAvailability() {
        const checked = validatePublicNickname(input.value);
        if (!checked.ok) return setStatus(checked.message, 'error');
        const epoch = ++validationEpoch;
        const operation = ++operationEpoch;
        setBusy(true);
        setStatus('Checking availability…', 'loading');
        try {
            const result = await api.check(checked.value);
            if (epoch !== validationEpoch || operation !== operationEpoch || !dialog.open
                || comparable(input.value) !== checked.value) return;
            setStatus(result.available ? `${result.normalizedNickname} is available.` : 'That nickname is unavailable.', result.available ? 'success' : 'error');
        } catch (error) {
            if (epoch === validationEpoch && operation === operationEpoch && dialog.open) {
                setStatus(error.message, 'error');
            }
        } finally {
            if (epoch === validationEpoch && operation === operationEpoch && dialog.open) setBusy(false);
        }
    }

    async function saveIdentity() {
        const checked = validatePublicNickname(input.value, { allowEmpty: true });
        if (!checked.ok) return setStatus(checked.message, 'error');
        const operation = ++operationEpoch;
        const expectedOwner = owner;
        setBusy(true);
        setStatus('Saving…', 'loading');
        try {
            const result = await api.update(checked.value, identity.version);
            if (operation !== operationEpoch || !dialog.open
                || globalThis.CAISSA_AUTH?.userId !== expectedOwner) return;
            identity = result.identity;
            input.value = identity.nickname || '';
            dialog.querySelector('[data-fallback-alias]').textContent = identity.fallbackAlias;
            renderPreview(publicIdentityDisplay(identity));
            unsaved.hidden = true;
            setStatus('Public identity saved.', 'success');
            globalThis.CAISSA_AUTH.publicIdentity = identity;
            window.dispatchEvent(new CustomEvent('caissa-public-identity-change', { detail: identity }));
        } catch (error) {
            if (operation === operationEpoch && dialog.open) setStatus(error.message, 'error');
        } finally {
            if (operation === operationEpoch && dialog.open) setBusy(false);
        }
    }

    function setBusy(busy) {
        input.disabled = busy;
        save.disabled = busy;
        check.disabled = busy;
        fallbackButton.disabled = busy;
        input.setAttribute('aria-busy', String(busy));
    }
    function setStatus(message, state) {
        status.textContent = message || '';
        status.dataset.state = state;
    }
    function renderPreview(value) {
        dialog.querySelector('[data-public-preview]').textContent = String(value || 'CAISSA Player');
    }
    return { open };
}

function ensureStylesheet() {
    if (document.querySelector('link[data-caissa-public-identity]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/public-identity.css?v=1.0.0';
    link.dataset.caissaPublicIdentity = 'true';
    document.head.appendChild(link);
}

function comparable(value) {
    return String(value || '').trim().replace(/\s+/gu, ' ').normalize('NFC');
}
