(function redeemInvite(root, document) {
    'use strict';
    const status = document.querySelector('[data-beta-entry-status]');
    const back = document.querySelector('[data-beta-entry-return]');
    const finish = message => { status.textContent = message; back.hidden = false; };
    async function run() {
        const raw = String(root.location.hash || '').replace(/^#(?:invite=)?/, '');
        root.history.replaceState(null, '', '/play/beta/invite');
        if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return finish('This invitation is missing or invalid.');
        try {
            const response = await fetch('/api/play-beta/redeem', { method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: raw }) });
            if (!response.ok) return finish('This invitation is unavailable, expired, or already used.');
            const result = await response.json();
            root.location.replace(result.redirect === '/play/beta' ? result.redirect : '/play/beta');
        } catch (_) { finish('CAISSA could not verify the invitation. Try again later.'); }
    }
    run();
})(window, document);
