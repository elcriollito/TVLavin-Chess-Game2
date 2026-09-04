(function (global) {
    'use strict';

    const routePattern = /^\/support\/?$/;
    const hostedButtonId = 'CV3QSCB3RPGVL';
    const publicClientId = 'AXI9ufE0S2cbFXEi71kHRu9MaQbN01UYPuQidJxjE_t00Yk6NdSr0joXht4Z3NNvw6pjZSCqG-p99FZS';
    const sdkId = 'caissa-paypal-hosted-buttons-sdk';
    const containerSelector = `#paypal-container-${hostedButtonId}`;
    const sdkUrl = new URL('https://www.paypal.com/sdk/js');
    sdkUrl.searchParams.set('client-id', publicClientId);
    sdkUrl.searchParams.set('components', 'hosted-buttons');
    sdkUrl.searchParams.set('currency', 'USD');

    const i18n = global.CaissaI18n;
    const status = document.getElementById('paypal-support-status');
    const region = document.getElementById('paypal-support-region');
    const container = document.querySelector(containerSelector);
    const metaDescription = document.querySelector('meta[name="description"]');
    let state = 'loading';
    let renderStarted = false;
    let timeoutId = 0;

    function translate(key, fallback) {
        return i18n && typeof i18n.t === 'function' ? i18n.t(key) : fallback;
    }

    function localizeFirstPartyState() {
        document.title = translate('support.metaTitle', 'Support CAISSA | CAISSA Chess');
        if (metaDescription) {
            metaDescription.content = translate(
                'support.metaDescription',
                'Make an optional contribution through PayPal to support the continued development and maintenance of CAISSA Chess.'
            );
        }
        if (!status) return;
        if (state === 'loading') status.textContent = translate('support.loading', 'Loading PayPal…');
        if (state === 'unavailable') status.textContent = translate('support.unavailable', 'PayPal is temporarily unavailable. Please try again later.');
    }

    function setState(nextState) {
        state = nextState;
        if (nextState !== 'loading') global.clearTimeout(timeoutId);
        if (region) region.dataset.paypalState = nextState;
        if (status) {
            status.hidden = nextState === 'ready';
            status.setAttribute('aria-live', nextState === 'unavailable' ? 'assertive' : 'polite');
        }
        localizeFirstPartyState();
    }

    function failClosed() {
        global.clearTimeout(timeoutId);
        setState('unavailable');
    }

    function renderHostedButton() {
        if (renderStarted) return;
        renderStarted = true;
        const hostedButtons = global.paypal && global.paypal.HostedButtons;
        if (!hostedButtons || !container) {
            failClosed();
            return;
        }

        try {
            const result = hostedButtons({ hostedButtonId }).render(containerSelector);
            Promise.resolve(result).then(() => {
                if (container.childElementCount > 0) setState('ready');
                else failClosed();
            }).catch(failClosed);
        } catch (_error) {
            failClosed();
        }
    }

    function loadSdk() {
        if (!routePattern.test(global.location.pathname) || !container || !region || !status) {
            failClosed();
            return;
        }
        const existing = document.getElementById(sdkId);
        if (existing) {
            if (global.paypal && global.paypal.HostedButtons) renderHostedButton();
            else existing.addEventListener('load', renderHostedButton, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = sdkId;
        script.src = sdkUrl.toString();
        script.async = true;
        script.dataset.sdkIntegrationSource = 'button-factory';
        script.addEventListener('load', renderHostedButton, { once: true });
        script.addEventListener('error', failClosed, { once: true });
        document.head.appendChild(script);
        timeoutId = global.setTimeout(failClosed, 20000);
    }

    setState('loading');
    if (i18n && typeof i18n.subscribe === 'function') i18n.subscribe(localizeFirstPartyState);
    loadSdk();
}(window));
