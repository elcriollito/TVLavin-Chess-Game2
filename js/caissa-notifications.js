/**
 * CAISSA Unified Notification System
 *
 * Provides a single, consistent toast notification API for the entire app.
 * Stacks up to 3 toasts. Auto-dismisses. Supports success, error, warn, info.
 * Exposes window.CaissaNotify for global access.
 */

(function() {
    'use strict';

    const MAX_TOASTS = 3;
    const DURATIONS = { success: 3000, error: 4000, warn: 4000, info: 3000 };
    const ICONS = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warn: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    let _container = null;

    function _ensureContainer() {
        if (_container) return _container;

        _container = document.createElement('div');
        _container.id = 'caissa-notify';
        _container.className = 'caissa-notify-container';
        _container.setAttribute('aria-live', 'polite');
        _container.setAttribute('aria-atomic', 'false');
        document.body.appendChild(_container);

        return _container;
    }

    function _show(message, type) {
        const container = _ensureContainer();

        // Enforce max toast limit
        while (container.children.length >= MAX_TOASTS) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement('div');
        toast.className = `caissa-toast caissa-toast--${type}`;
        toast.setAttribute('role', 'alert');

        const icon = ICONS[type] || ICONS.info;
        toast.innerHTML = `<i class="fas ${icon} caissa-toast-icon"></i><span class="caissa-toast-msg">${_escapeHtml(message)}</span>`;

        container.appendChild(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('caissa-toast--visible');
        });

        // Auto-dismiss
        const duration = DURATIONS[type] || 3000;
        setTimeout(() => {
            toast.classList.remove('caissa-toast--visible');
            toast.classList.add('caissa-toast--exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    window.CaissaNotify = {
        success: function(msg) { _show(msg, 'success'); },
        error:   function(msg) { _show(msg, 'error'); },
        warn:    function(msg) { _show(msg, 'warn'); },
        info:    function(msg) { _show(msg, 'info'); }
    };

})();
