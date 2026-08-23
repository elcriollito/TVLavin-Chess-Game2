(function () {
    'use strict';
    const root = document.querySelector('[data-credit-store]');
    if (!root) return;
    const balance = root.querySelector('[data-store-balance]');
    const status = root.querySelector('[data-store-status]');
    const account = root.querySelector('[data-store-account]');
    const buttons = [...root.querySelectorAll('[data-store-buy]')];

    function setStatus(copy, tone = '') {
        status.dataset.tone = tone;
        status.querySelector('span').textContent = copy;
    }

    async function waitForAuth() {
        for (let attempt = 0; attempt < 80 && !window.CAISSA_AUTH; attempt += 1) await new Promise(resolve => setTimeout(resolve, 100));
        if (window.CAISSA_AUTH?.whenReady) await window.CAISSA_AUTH.whenReady();
        return window.CAISSA_AUTH;
    }

    async function getToken() { return (await waitForAuth())?.getToken?.() || null; }

    function formatPrice(price) {
        if (!price || !Number.isInteger(price.amount) || !price.currency) return 'Unavailable';
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency.toUpperCase() }).format(price.amount / 100);
    }

    async function loadStore() {
        const auth = await waitForAuth();
        if (!auth?.isSignedIn) {
            balance.textContent = 'Sign in';
            account.hidden = false;
            buttons.forEach(button => { button.disabled = false; button.textContent = 'Sign in to buy'; });
            setStatus('Sign in to see secure checkout availability and your current balance.');
            return;
        }
        account.hidden = true;
        const bearer = await getToken();
        const [walletResponse, offersResponse] = await Promise.all([
            fetch('/api/wallet', { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' }),
            fetch('/api/store/offers', { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' })
        ]);
        if (!walletResponse.ok || !offersResponse.ok) throw new Error('The Credit Store is temporarily unavailable.');
        const wallet = await walletResponse.json();
        const catalog = await offersResponse.json();
        balance.textContent = `${Number(wallet.credits || 0)} credits`;
        for (const offer of catalog.offers || []) {
            const card = root.querySelector(`[data-store-package="${offer.key}"]`);
            const button = root.querySelector(`[data-store-buy="${offer.key}"]`);
            if (!card || !button) continue;
            card.querySelector('[data-store-price]').textContent = formatPrice(offer.price);
            button.disabled = !offer.available;
            button.textContent = offer.available ? 'Buy securely' : 'Not available yet';
        }
        setStatus(catalog.enabled
            ? 'Secure Stripe checkout is available for this registered CAISSA account.'
            : 'The store interface is ready, but checkout remains paused until commerce certification.', catalog.enabled ? 'ready' : '');
    }

    async function buy(packageKey, button) {
        const auth = await waitForAuth();
        if (!auth?.isSignedIn) {
            window.CAISSA_AUTH?.redirectToSignIn?.('/store');
            return;
        }
        button.disabled = true;
        button.textContent = 'Opening checkout…';
        try {
            const bearer = await getToken();
            const response = await fetch('/api/checkout/session', {
                method: 'POST',
                headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'credits', package: packageKey })
            });
            const data = await response.json();
            if (!response.ok || !data.url) throw new Error(data.error || 'Checkout is unavailable.');
            window.location.assign(data.url);
        } catch (error) {
            setStatus(error.message || 'Checkout is temporarily unavailable.', 'error');
            button.disabled = false;
            button.textContent = 'Try again';
        }
    }

    buttons.forEach(button => button.addEventListener('click', () => buy(button.dataset.storeBuy, button)));
    window.addEventListener('caissa-auth-change', () => loadStore().catch(error => setStatus(error.message, 'error')));
    const checkoutState = new URLSearchParams(location.search).get('checkout');
    if (checkoutState === 'success') setStatus('Payment received. Your balance will refresh as soon as Stripe fulfillment completes.', 'ready');
    else if (checkoutState === 'cancelled') setStatus('Checkout was cancelled. No credits were added.');
    loadStore().catch(error => setStatus(error.message, 'error'));
}());
