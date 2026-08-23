(function () {
    'use strict';

    const state = { loaded: false, loading: null, credits: 0, commerceEnabled: false, owned: new Set() };
    const dialog = document.querySelector('[data-pgn-unlock-dialog]');
    const title = dialog?.querySelector('[data-pgn-unlock-title]');
    const copy = dialog?.querySelector('[data-pgn-unlock-copy]');
    const balance = dialog?.querySelector('[data-pgn-unlock-balance]');
    const confirmButton = dialog?.querySelector('[data-pgn-unlock-confirm]');
    const actionLink = dialog?.querySelector('[data-pgn-unlock-link]');

    function auth() { return window.CAISSA_AUTH || null; }

    async function waitForAuthRuntime() {
        for (let attempt = 0; attempt < 80 && !auth(); attempt += 1) {
            await new Promise(resolve => window.setTimeout(resolve, 100));
        }
        if (auth()?.whenReady) await auth().whenReady();
        return auth();
    }

    async function token() {
        const current = await waitForAuthRuntime();
        return current?.isSignedIn ? current.getToken?.() : null;
    }

    function announce() {
        document.dispatchEvent(new CustomEvent('caissa:pgn-entitlements-changed', {
            detail: { credits: state.credits, commerceEnabled: state.commerceEnabled, ownedAlbumIds: [...state.owned] }
        }));
    }

    async function refresh(force = false) {
        if (state.loaded && !force) return state;
        if (state.loading) return state.loading;
        state.loading = (async () => {
            const bearer = await token();
            if (!bearer) {
                state.loaded = true;
                state.credits = 0;
                state.commerceEnabled = false;
                state.owned = new Set();
                announce();
                return state;
            }
            const response = await fetch('/api/pgn/entitlements', {
                headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
                credentials: 'same-origin', cache: 'no-store'
            });
            if (!response.ok) throw new Error('Album ownership is temporarily unavailable.');
            const data = await response.json();
            state.loaded = true;
            state.credits = Number(data.credits || 0);
            state.commerceEnabled = data.commerceEnabled === true;
            state.owned = new Set(Array.isArray(data.ownedAlbumIds) ? data.ownedAlbumIds : []);
            announce();
            return state;
        })();
        try { return await state.loading; }
        finally { state.loading = null; }
    }

    function showDialog(options) {
        if (!dialog) return Promise.resolve(false);
        title.textContent = options.title;
        copy.textContent = options.copy;
        balance.textContent = options.balance || '';
        balance.hidden = !options.balance;
        confirmButton.hidden = !options.confirm;
        confirmButton.textContent = options.confirm || '';
        actionLink.hidden = !options.link;
        if (options.link) {
            actionLink.href = options.link.href;
            actionLink.textContent = options.link.label;
        }
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                confirmButton.removeEventListener('click', accept);
                dialog.removeEventListener('close', cancel);
                resolve(value);
            };
            const accept = () => { finish(true); dialog.close(); };
            const cancel = () => finish(false);
            confirmButton.addEventListener('click', accept, { once: true });
            dialog.addEventListener('close', cancel, { once: true });
            dialog.showModal();
        });
    }

    async function ensureOwned(album) {
        const currentAuth = await waitForAuthRuntime();
        if (!currentAuth?.isSignedIn) {
            await showDialog({
                title: 'Register to unlock player albums',
                copy: `${album.title} is a permanent CAISSA account collection. Create a free account before using credits.`,
                link: { href: '/signup?redirect_url=%2Fpgn-replayer', label: 'Create a CAISSA account' }
            });
            return false;
        }
        try { await refresh(); }
        catch (error) {
            await showDialog({ title: 'Album ownership unavailable', copy: error.message });
            return false;
        }
        if (state.owned.has(album.id)) return true;
        if (!state.commerceEnabled) {
            await showDialog({
                title: 'Player album sales are paused',
                copy: 'The protected catalog and Credit Store are in Preview. Paid player-album delivery will open only after commerce certification.'
            });
            return false;
        }
        if (state.credits < 1) {
            await showDialog({
                title: 'More credits needed',
                copy: `${album.title} costs 1 credit and stays owned by this CAISSA account.`,
                balance: `Current balance: ${state.credits} credits`,
                link: { href: '/store', label: 'Open Credit Store' }
            });
            return false;
        }
        const approved = await showDialog({
            title: `Unlock ${album.title}?`,
            copy: 'This permanently adds the player collection to your CAISSA account.',
            balance: `Current balance: ${state.credits} credits · Cost: 1 credit`,
            confirm: 'Unlock for 1 credit'
        });
        if (!approved) return false;

        const bearer = await token();
        const response = await fetch('/api/pgn/unlock', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${bearer}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': crypto.randomUUID()
            },
            credentials: 'same-origin', cache: 'no-store',
            body: JSON.stringify({ albumId: album.id })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 402) state.credits = Number(data.credits || 0);
            await showDialog({
                title: response.status === 402 ? 'More credits needed' : 'Album could not be unlocked',
                copy: data.error || 'Please try again later.',
                balance: response.status === 402 ? `Current balance: ${state.credits} credits` : '',
                link: response.status === 402 ? { href: '/store', label: 'Open Credit Store' } : null
            });
            return false;
        }
        state.owned.add(album.id);
        state.credits = Number(data.credits || 0);
        announce();
        return true;
    }

    async function fetchAlbum(album) {
        if (!album?.id || !(await ensureOwned(album))) return null;
        const bearer = await token();
        const response = await fetch(`/api/pgn/player?album=${encodeURIComponent(album.id)}`, {
            headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/x-chess-pgn,text/plain' },
            credentials: 'same-origin', cache: 'no-store'
        });
        if (!response.ok) throw new Error('The protected collection is temporarily unavailable.');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('This collection exceeds the 10 MiB safety limit.');
        return bytes;
    }

    window.CaissaPgnEntitlements = Object.freeze({
        refresh,
        fetchAlbum,
        isOwned: albumId => state.owned.has(albumId),
        getCredits: () => state.credits,
        isCommerceEnabled: () => state.commerceEnabled
    });

    window.addEventListener('caissa-auth-change', () => {
        state.loaded = false;
        refresh(true).catch(() => {});
    });
    waitForAuthRuntime().then(() => refresh()).catch(() => {});
}());
