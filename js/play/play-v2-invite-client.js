(function installInviteClient(root, document) {
    'use strict';
    if (document.body?.dataset.caissaPlayV2Entry !== 'invite-only') return;
    const state = { csrf: null, timer: null, disposed: false };
    const mode = () => /^\/play\/beta\/(games|bots|coach)$/.exec(root.location.pathname)?.[1] || 'games';
    const request = async (path, options = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try { return await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, ...options }); }
        finally { clearTimeout(timeout); }
    };
    function teardown() {
        if (state.disposed) return;
        state.disposed = true; clearInterval(state.timer);
        try { root.CaissaClockService?.stop?.('invite-access-closed'); root.CaissaClockService?.dispose?.(); } catch (_) {}
        try { root.CaissaEngineRequestIsolation?.cancelSession?.(); root.CaissaEngineRequestIsolation?.dispose?.(); } catch (_) {}
        try { root.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit'); } catch (_) {}
        try { root.CaissaGameLifecycle?.dispose?.(); } catch (_) {}
        try { root.App?.boardAdapter?.dispose?.(); } catch (_) {}
        try { root.CaissaSimplifiedPlayShellInstance?.dispose?.(); } catch (_) {}
        document.dispatchEvent(new CustomEvent('caissa:play-v2-beta-disabled'));
        root.location.replace('/play/beta');
    }
    async function heartbeat() {
        try { const response = await request('/api/play-beta/status'); const value = response.ok ? await response.json() : null;
            if (!response.ok || value?.enabled !== true) teardown(); }
        catch (_) { teardown(); }
    }
    async function session() {
        const response = await request('/api/play-beta/session');
        if (!response.ok) return teardown();
        const value = await response.json();
        if (value?.authorized !== true || typeof value.csrf !== 'string' || value.csrf.length < 32) return teardown();
        state.csrf = value.csrf;
    }
    function field(label, node) { const wrap = document.createElement('label'); const text = document.createElement('span'); text.textContent = label; wrap.append(text, node); return wrap; }
    function feedback() {
        const launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'caissa-beta-feedback-launcher'; launcher.textContent = 'Send Beta Feedback';
        const dialog = document.createElement('dialog'); dialog.className = 'caissa-beta-feedback'; dialog.setAttribute('aria-labelledby', 'caissaBetaFeedbackTitle');
        const form = document.createElement('form'); form.method = 'dialog'; form.innerHTML = '<h2 id="caissaBetaFeedbackTitle">Send Beta Feedback</h2><p>Send only what you choose. Do not include a game record, moves, identity, account information, or secrets.</p>';
        const category = document.createElement('select'); category.required = true;
        for (const value of ['Bug','Confusing','Visual','Suggestion','Other']) category.add(new Option(value, value));
        const comment = document.createElement('textarea'); comment.required = true; comment.maxLength = 2000; comment.rows = 5;
        const steps = document.createElement('textarea'); steps.maxLength = 2000; steps.rows = 3;
        const device = document.createElement('input'); device.maxLength = 160; device.autocomplete = 'off';
        const consent = document.createElement('input'); consent.type = 'checkbox'; consent.required = true;
        const consentLabel = field('I consent to sending this feedback for private beta review.', consent);
        const status = document.createElement('p'); status.role = 'status'; status.setAttribute('aria-live', 'polite');
        const actions = document.createElement('div'); actions.className = 'caissa-beta-feedback__actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
        const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send feedback'; actions.append(cancel, send);
        form.append(field('Category', category), field('Comment', comment), field('Steps to reproduce (optional)', steps), field('Device and browser (optional)', device), consentLabel, status, actions); dialog.append(form);
        launcher.addEventListener('click', async () => { if (!state.csrf) await session(); if (!state.disposed) dialog.showModal(); });
        cancel.addEventListener('click', () => dialog.close());
        form.addEventListener('submit', async event => {
            event.preventDefault(); send.disabled = true; status.textContent = 'Sending…';
            const payload = { category: category.value, comment: comment.value, steps: steps.value, device: device.value, consent: consent.checked, mode: mode() };
            try {
                const response = await request('/api/play-beta/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CAISSA-Beta-CSRF': state.csrf }, body: JSON.stringify(payload) });
                const result = await response.json();
                if (!response.ok) { status.textContent = result.error === 'RATE_LIMITED' ? 'Feedback limit reached. Try again later.' : 'Feedback could not be sent.'; return; }
                status.textContent = `Thank you. Reference ${result.reference}.`; form.reset();
            } catch (_) { status.textContent = 'Feedback could not be sent.'; }
            finally { send.disabled = false; }
        });
        document.body.append(launcher, dialog);
    }
    session().then(() => { if (!state.disposed) { feedback(); state.timer = setInterval(heartbeat, 45_000); } }).catch(teardown);
})(window, document);
