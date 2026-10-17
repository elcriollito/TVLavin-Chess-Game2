(function () {
    'use strict';

    const COPY = Object.freeze({
        en: Object.freeze({
            title: 'Important CAISSA Chess Update',
            message: "We're sorry for the inconvenience. We've refreshed our account system and previous profiles have been reset. Please sign up again to continue using CAISSA and save your progress.",
            action: 'Create a new account'
        }),
        es: Object.freeze({
            title: 'Aviso importante de CAISSA Chess',
            message: 'Lamentamos las molestias. Hemos renovado nuestro sistema de cuentas y los perfiles anteriores fueron reiniciados. Por favor, regístrate nuevamente para seguir disfrutando de CAISSA y guardar tu progreso.',
            action: 'Crear cuenta nueva'
        })
    });

    function selectedCopy() {
        let stored = '';
        try { stored = localStorage.getItem('caissa.locale') || ''; } catch {}
        const language = stored || document.documentElement.lang || navigator.language || 'en';
        return COPY[String(language).toLowerCase().startsWith('es') ? 'es' : 'en'];
    }

    async function render() {
        try { await window.CAISSA_AUTH_CONFIG_READY; } catch { return; }
        if (window.CAISSA_AUTH_CONFIG?.ACCOUNT_SYSTEM?.resetNotice !== true) return;

        const host = document.querySelector('[data-caissa-account-reset-notice]');
        if (!host) return;
        const copy = selectedCopy();
        host.innerHTML = `
          <div class="caissa-account-reset-notice" role="status">
            <div class="caissa-account-reset-notice__copy">
              <strong>${copy.title}</strong>
              <span>${copy.message}</span>
            </div>
            <a href="/signup">${copy.action}</a>
          </div>`;
        host.hidden = false;
        document.body.classList.add('caissa-reset-notice-visible');
        const measure = () => document.documentElement.style.setProperty(
            '--caissa-reset-notice-height',
            `${Math.ceil(host.getBoundingClientRect().height)}px`
        );
        measure();
        if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(host);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
    else void render();
})();
