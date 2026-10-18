import { createPublicIdentityApi } from './public-identity-api.js';
import { createAccountControlApi } from './account-control-api.js';
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
          <section class="data-privacy-section" aria-labelledby="data-privacy-title">
            <div class="identity-section-copy"><p>DATA &amp; PRIVACY</p><h3 id="data-privacy-title">Control your CAISSA account</h3></div>
            <p class="identity-privacy-note">Private actions always use your verified session. CAISSA never accepts an email, nickname or user ID as the target.</p>
            <div class="account-control-summary" data-account-summary hidden>
              <span><strong data-account-games>0</strong> shared games retained</span>
              <span><strong data-account-training>0</strong> training records</span>
              <span><strong data-account-entitlements>0</strong> active entitlements</span>
            </div>
            <p class="account-control-status" data-account-control-status role="status">Checking availability...</p>
            <div class="account-control-reauth" data-account-reauth hidden>
              <p>For your protection, sign in again before exporting, resetting or deleting data.</p>
              <button type="button" data-account-sign-in-again>Sign in again</button>
            </div>
            <div class="account-control-grid" data-account-controls hidden>
              <article class="account-control-card">
                <h4>Download my data</h4>
                <p>Download a private JSON copy of your verified CAISSA records. Shared-player details are excluded.</p>
                <button type="button" data-account-export>Download my data</button>
              </article>
              <article class="account-control-card">
                <h4>Reset my chess progress</h4>
                <p>Reset selected training metrics. Login, nickname, credits, entitlements and Online rating stay unchanged.</p>
                <button type="button" data-account-reset-start>Reset my chess progress</button>
                <form class="account-control-confirm" data-account-reset-confirm hidden>
                  <label>Type <strong>RESET</strong> to confirm
                    <input name="confirmation" autocomplete="off" spellcheck="false" maxlength="5">
                  </label>
                  <div><button type="button" data-account-cancel>Cancel</button><button type="submit" class="account-control-danger">Confirm reset</button></div>
                </form>
              </article>
              <article class="account-control-card account-control-card-danger">
                <h4>Delete my CAISSA account</h4>
                <p>Delete your login and removable profile data. Shared games and required economic evidence are retained safely.</p>
                <button type="button" data-account-delete-start>Delete my CAISSA account</button>
                <p class="account-control-review" data-account-delete-review hidden>Deletion needs secure manual review because this account has an ownership hold or active entitlement.</p>
                <form class="account-control-confirm" data-account-delete-confirm hidden>
                  <label>Type <strong>DELETE</strong> to confirm
                    <input name="confirmation" autocomplete="off" spellcheck="false" maxlength="6">
                  </label>
                  <div><button type="button" data-account-cancel>Cancel</button><button type="submit" class="account-control-danger">Delete account</button></div>
                </form>
              </article>
            </div>
            <p class="identity-history-note">Encrypted backups and legally required billing evidence follow their own retention schedules. Re-registering later creates a new Clerk subject and a new CAISSA UUID; old progress is never restored by email or nickname.</p>
          </section>
        </div>
        <footer class="public-identity-foot"><span data-unsaved hidden>Unsaved changes</span><span>Private by default · Public by choice</span></footer>
      </div>`;
    document.body.appendChild(dialog);

    const api = createPublicIdentityApi();
    const accountApi = createAccountControlApi();
    const input = dialog.querySelector('#public-nickname-input');
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('[role=status]');
    const save = dialog.querySelector('.public-identity-save');
    const check = dialog.querySelector('[data-check-nickname]');
    const fallbackButton = dialog.querySelector('[data-use-fallback]');
    const unsaved = dialog.querySelector('[data-unsaved]');
    const accountStatus = dialog.querySelector('[data-account-control-status]');
    const accountControls = dialog.querySelector('[data-account-controls]');
    const accountReauth = dialog.querySelector('[data-account-reauth]');
    const resetConfirm = dialog.querySelector('[data-account-reset-confirm]');
    const deleteConfirm = dialog.querySelector('[data-account-delete-confirm]');
    let identity = null;
    let opener = null;
    let requestEpoch = 0;
    let validationEpoch = 0;
    let operationEpoch = 0;
    let owner = null;
    let accountSummary = null;
    let accountEpoch = 0;
    let accountBusy = false;

    dialog.querySelector('.public-identity-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
        requestEpoch += 1;
        validationEpoch += 1;
        operationEpoch += 1;
        accountEpoch += 1;
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
    dialog.querySelector('[data-account-export]').addEventListener('click', () => void exportAccount());
    dialog.querySelector('[data-account-reset-start]').addEventListener('click', () => openConfirmation(resetConfirm));
    dialog.querySelector('[data-account-delete-start]').addEventListener('click', () => openConfirmation(deleteConfirm));
    dialog.querySelectorAll('[data-account-cancel]').forEach(button => button.addEventListener('click', () => closeConfirmations()));
    resetConfirm.addEventListener('submit', event => { event.preventDefault(); void resetProgress(); });
    deleteConfirm.addEventListener('submit', event => { event.preventDefault(); void deleteAccount(); });
    dialog.querySelector('[data-account-sign-in-again]').addEventListener('click', async () => {
        const returnTo = `${location.pathname}${location.search}${location.hash}`;
        await globalThis.CAISSA_AUTH?.signOut?.();
        globalThis.CAISSA_AUTH?.redirectToSignIn?.(returnTo);
    });
    window.addEventListener('caissa-auth-change', event => {
        const next = event.detail;
        if (!next?.isSignedIn || (owner && next.userId && next.userId !== owner)) {
            requestEpoch += 1;
            validationEpoch += 1;
            operationEpoch += 1;
            accountEpoch += 1;
            if (globalThis.CAISSA_AUTH) globalThis.CAISSA_AUTH.publicIdentity = null;
            if (dialog.open) dialog.close();
        }
    });

    async function open(auth, source) {
        if (!auth?.isSignedIn) return;
        opener = source;
        owner = auth.userId || null;
        accountEpoch += 1;
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
        resetAccountControls();
        void loadAccountControls(accountEpoch);
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

    async function loadAccountControls(epoch) {
        try {
            const payload = await accountApi.summary();
            if (epoch !== accountEpoch || !dialog.open) return;
            accountSummary = payload;
            const counts = payload.summary?.counts || {};
            dialog.querySelector('[data-account-games]').textContent = String(counts.onlineGames || 0);
            dialog.querySelector('[data-account-training]').textContent = String((counts.puzzleProgress || 0) + (counts.puzzleAttempts || 0));
            dialog.querySelector('[data-account-entitlements]').textContent = String(counts.activeEntitlements || 0);
            dialog.querySelector('[data-account-summary]').hidden = false;
            if (!payload.backendReady) throw new Error('Account controls are not ready.');
            accountReauth.hidden = !payload.requiresReauthentication;
            accountControls.hidden = payload.requiresReauthentication;
            const caps = payload.summary?.capabilities || {};
            dialog.querySelector('[data-account-export]').disabled = !caps.export;
            dialog.querySelector('[data-account-reset-start]').disabled = !caps.progressReset;
            dialog.querySelector('[data-account-delete-start]').disabled = !caps.accountDeletion;
            dialog.querySelector('[data-account-delete-review]').hidden = !payload.summary?.manualReviewRequired;
            accountStatus.textContent = payload.requiresReauthentication
                ? 'Recent sign-in required.'
                : payload.summary?.manualReviewRequired
                    ? 'Some actions require secure manual review.'
                    : 'Account controls are ready.';
            accountStatus.dataset.state = payload.summary?.manualReviewRequired ? 'warning' : 'ready';
        } catch (error) {
            if (epoch !== accountEpoch || !dialog.open) return;
            accountControls.hidden = true;
            accountReauth.hidden = true;
            accountStatus.textContent = error.message || 'Account controls are temporarily unavailable.';
            accountStatus.dataset.state = 'error';
        }
    }

    async function exportAccount() {
        if (accountBusy) return;
        setAccountBusy(true, 'Preparing your private download...');
        try {
            await accountApi.exportData();
            accountStatus.textContent = 'Your private download is ready.';
            accountStatus.dataset.state = 'ready';
        } catch (error) { handleAccountError(error); }
        finally { setAccountBusy(false); }
    }

    async function resetProgress() {
        if (accountBusy) return;
        const input = resetConfirm.elements.confirmation;
        if (input.value !== 'RESET') return setAccountError('Type RESET exactly to continue.');
        setAccountBusy(true, 'Resetting selected training progress...');
        try {
            const prepared = await accountApi.prepareReset('RESET');
            const completed = await accountApi.confirmReset(prepared);
            const removed = completed.result?.puzzleAttemptsDeleted || 0;
            closeConfirmations();
            await loadAccountControls(accountEpoch);
            accountStatus.textContent = `Training progress reset. ${removed} attempts removed.`;
            accountStatus.dataset.state = 'ready';
        } catch (error) { handleAccountError(error); }
        finally { setAccountBusy(false); }
    }

    async function deleteAccount() {
        if (accountBusy) return;
        const input = deleteConfirm.elements.confirmation;
        if (input.value !== 'DELETE') return setAccountError('Type DELETE exactly to continue.');
        setAccountBusy(true, 'Deleting your CAISSA account...');
        try {
            const prepared = await accountApi.prepareDeletion('DELETE');
            await accountApi.confirmDeletion(prepared);
            accountStatus.textContent = 'Your CAISSA account has been deleted.';
            accountStatus.dataset.state = 'ready';
            closeConfirmations();
            await globalThis.CAISSA_AUTH?.signOut?.();
            setTimeout(() => { location.href = '/'; }, 250);
        } catch (error) { handleAccountError(error); }
        finally { setAccountBusy(false); }
    }

    function openConfirmation(target) {
        if (accountBusy) return;
        closeConfirmations();
        target.hidden = false;
        target.elements.confirmation.value = '';
        target.elements.confirmation.focus();
    }

    function closeConfirmations() {
        resetConfirm.hidden = true;
        deleteConfirm.hidden = true;
        resetConfirm.elements.confirmation.value = '';
        deleteConfirm.elements.confirmation.value = '';
    }

    function resetAccountControls() {
        accountSummary = null;
        accountBusy = false;
        accountControls.hidden = true;
        accountReauth.hidden = true;
        dialog.querySelector('[data-account-summary]').hidden = true;
        closeConfirmations();
        accountStatus.textContent = 'Checking availability...';
        accountStatus.dataset.state = 'loading';
    }

    function setAccountBusy(busy, message) {
        accountBusy = busy;
        dialog.querySelectorAll('[data-account-controls] button, [data-account-controls] input').forEach(control => { control.disabled = busy; });
        if (message) {
            accountStatus.textContent = message;
            accountStatus.dataset.state = 'loading';
        }
        if (!busy && accountSummary) {
            const caps = accountSummary.summary?.capabilities || {};
            dialog.querySelector('[data-account-export]').disabled = !caps.export;
            dialog.querySelector('[data-account-reset-start]').disabled = !caps.progressReset;
            dialog.querySelector('[data-account-delete-start]').disabled = !caps.accountDeletion;
        }
    }

    function handleAccountError(error) {
        if (error?.code === 'REVERIFICATION_REQUIRED') {
            accountControls.hidden = true;
            accountReauth.hidden = false;
        }
        setAccountError(error?.message || 'Account controls are temporarily unavailable.');
    }

    function setAccountError(message) {
        accountStatus.textContent = message;
        accountStatus.dataset.state = 'error';
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
