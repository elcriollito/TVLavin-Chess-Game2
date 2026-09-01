(function () {
    'use strict';
    const PRODUCT_ID = 'caissa-pgn-reader';
    const host = document.getElementById('marketDownloads');

    function setState(message, error = false) {
        host.replaceChildren();
        const state = document.createElement('p');
        state.className = `market-state${error ? ' market-state-error' : ''}`;
        state.textContent = message;
        host.appendChild(state);
        host.setAttribute('aria-busy', 'false');
    }

    async function token() {
        return window.CAISSA_AUTH?.getToken?.() || null;
    }

    async function api(path, options = {}) {
        const bearer = await token();
        if (!bearer) throw new Error('AUTH_REQUIRED');
        const response = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${bearer}`,
                ...(options.headers || {})
            }
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 403 ? 'NOT_AVAILABLE' : 'REQUEST_FAILED');
        return body;
    }

    function renderRelease(release) {
        const card = document.createElement('article');
        card.className = 'market-download-card';
        const title = document.createElement('h2');
        title.textContent = `CAISSA PGN Reader ${release.version}`;
        const metadata = document.createElement('p');
        metadata.className = 'market-download-meta';
        metadata.textContent = `${release.platform} ${release.architecture} · ${release.distribution} · ${release.filename}`;
        const hash = document.createElement('p');
        hash.className = 'market-download-hash';
        hash.textContent = `SHA-256 ${release.sha256}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'market-download-button';
        button.textContent = 'Create temporary download';
        const expiry = document.createElement('p');
        expiry.className = 'market-download-expiry';

        button.addEventListener('click', async () => {
            button.disabled = true;
            expiry.textContent = 'Authorizing download…';
            try {
                const authorized = await api('/api/account/downloads', {
                    method: 'POST',
                    body: JSON.stringify({ productId: PRODUCT_ID, releaseId: release.releaseId })
                });
                expiry.textContent = `Temporary GET expires ${new Date(authorized.expiresAt).toLocaleString()}.`;
                window.location.assign(authorized.downloadUrl);
            } catch {
                expiry.textContent = 'Download is not available.';
                button.disabled = false;
            }
        });

        card.append(title, metadata, hash, button, expiry);
        return card;
    }

    async function initialize() {
        try {
            await window.CAISSA_AUTH?.whenReady?.();
            if (window.CAISSA_AUTH?.isSignedIn !== true) {
                setState('Sign in to view My Downloads.', true);
                return;
            }
            const result = await api(`/api/account/products/${PRODUCT_ID}/releases`, { method: 'GET' });
            host.replaceChildren(...result.releases.map(renderRelease));
            host.setAttribute('aria-busy', 'false');
        } catch (error) {
            setState(error.message === 'NOT_AVAILABLE'
                ? 'No entitled CAISSA PGN Reader releases are available for this account.'
                : 'My Downloads is temporarily unavailable.', true);
        }
    }

    initialize();
})();
