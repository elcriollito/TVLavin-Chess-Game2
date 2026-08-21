(function () {
    'use strict';

    function loadScriptOnce(src, readyTest) {
        if (readyTest()) return Promise.resolve();
        const pathname = new URL(src, window.location.href).pathname;
        const existing = Array.from(document.scripts).find((script) => new URL(script.src, window.location.href).pathname === pathname);
        if (existing) return new Promise((resolve) => existing.addEventListener('load', resolve, { once: true }));
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', reject, { once: true });
            document.head.appendChild(script);
        });
    }

    async function start() {
        if (!document.querySelector('link[data-caissa-auth-runtime]')) {
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = '/css/caissa-auth.css?v=1.0.1';
            stylesheet.dataset.caissaAuthRuntime = 'styles';
            document.head.appendChild(stylesheet);
        }
        try {
            await loadScriptOnce('/js/auth-config.js?v=1.0.5', () => Boolean(window.CAISSA_CONFIG));
            await loadScriptOnce('/js/caissa-auth.js?v=1.0.4', () => Boolean(window.CAISSA_AUTH));
            await loadScriptOnce('/js/caissa-access.js?v=1.0.3', () => Boolean(window.CAISSA_ACCESS));
            await loadScriptOnce('/js/caissa-ui-auth.js?v=1.0.3', () => Boolean(window.CaissaUIAuth));
            window.CaissaUIAuth?.init?.();
        } catch (error) {
            console.warn('CAISSA sidebar auth runtime unavailable; anonymous navigation remains available.');
        }
    }

    start();
})();
