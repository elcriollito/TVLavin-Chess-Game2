/**
 * CAISSA UI Foundation
 *
 * Small, dependency-free DOM helpers for shared Season 4 UI primitives.
 * The module is opt-in: it defines window.CaissaUI but does not alter existing
 * page content unless a caller explicitly renders a component.
 */
(function() {
    'use strict';

    const STATUS_TYPES = new Set([
        'success',
        'info',
        'warning',
        'error',
        'offline',
        'connecting',
        'connected',
        'observing',
        'playing',
        'searching',
        'no-results',
        'empty',
        'disabled',
        'beta'
    ]);

    const BANNER_ICONS = {
        success: 'fa-check-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-exclamation-circle'
    };

    function normalizeType(type, fallback = 'info') {
        const normalized = String(type || '').toLowerCase().trim();
        return STATUS_TYPES.has(normalized) || BANNER_ICONS[normalized]
            ? normalized
            : fallback;
    }

    function appendText(parent, text) {
        if (text === undefined || text === null || text === '') return null;
        parent.appendChild(document.createTextNode(String(text)));
        return parent;
    }

    function createElement(tagName, options = {}) {
        const element = document.createElement(tagName);
        const {
            className,
            text,
            attrs,
            children
        } = options;

        if (className) element.className = className;
        appendText(element, text);

        if (attrs) {
            Object.entries(attrs).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    element.setAttribute(key, String(value));
                }
            });
        }

        if (Array.isArray(children)) {
            children.forEach((child) => {
                if (child) element.appendChild(child);
            });
        }

        return element;
    }

    function render(target, node, options = {}) {
        const container = typeof target === 'string'
            ? document.querySelector(target)
            : target;

        if (!container || !node) return null;
        if (options.replace !== false) container.replaceChildren();
        container.appendChild(node);
        return node;
    }

    function createStatusBadge(options = {}) {
        const type = normalizeType(options.type);
        const label = options.label || type;
        const showDot = options.dot !== false;
        const badge = createElement('span', {
            className: `caissa-ui-badge caissa-ui-badge--${type}`,
            attrs: {
                role: options.role || 'status',
                'aria-label': options.ariaLabel || label,
                title: options.title || label
            }
        });

        if (showDot) {
            badge.appendChild(createElement('span', {
                className: 'caissa-ui-badge__dot',
                attrs: { 'aria-hidden': 'true' }
            }));
        }

        badge.appendChild(createElement('span', {
            className: 'caissa-ui-badge__label',
            text: label
        }));

        return badge;
    }

    function createSpinner(options = {}) {
        const size = options.size ? ` caissa-ui-spinner--${options.size}` : '';
        return createElement('span', {
            className: `caissa-ui-spinner${size}`,
            attrs: {
                role: 'status',
                'aria-label': options.label || 'Loading'
            }
        });
    }

    function createBanner(options = {}) {
        const type = normalizeType(options.type);
        const icon = options.icon || BANNER_ICONS[type] || BANNER_ICONS.info;
        const banner = createElement('div', {
            className: `caissa-ui-banner caissa-ui-banner--${type}`,
            attrs: {
                role: type === 'error' ? 'alert' : 'status',
                'aria-live': type === 'error' ? 'assertive' : 'polite'
            }
        });

        banner.appendChild(createElement('i', {
            className: `fas ${icon} caissa-ui-banner__icon`,
            attrs: { 'aria-hidden': 'true' }
        }));

        const content = createElement('div', { className: 'caissa-ui-banner__content' });
        if (options.title) {
            content.appendChild(createElement('p', {
                className: 'caissa-ui-banner__title',
                text: options.title
            }));
        }
        content.appendChild(createElement('p', {
            className: 'caissa-ui-banner__message',
            text: options.message || ''
        }));
        banner.appendChild(content);

        return banner;
    }

    function createEmptyState(options = {}) {
        const emptyState = createElement('div', {
            className: 'caissa-ui-empty-state',
            attrs: { role: 'status' }
        });

        if (options.icon !== false) {
            emptyState.appendChild(createElement('i', {
                className: `fas ${options.icon || 'fa-chess-board'} caissa-ui-empty-state__icon`,
                attrs: { 'aria-hidden': 'true' }
            }));
        }

        emptyState.appendChild(createElement('p', {
            className: 'caissa-ui-empty-state__title',
            text: options.title || 'Nothing to show yet.'
        }));

        if (options.message) {
            emptyState.appendChild(createElement('p', {
                className: 'caissa-ui-empty-state__message',
                text: options.message
            }));
        }

        if (options.action instanceof HTMLElement) {
            emptyState.appendChild(options.action);
        }

        return emptyState;
    }

    function createPanelHeader(options = {}) {
        const header = createElement('div', { className: 'caissa-ui-panel-header' });
        const titleTag = options.level && /^h[1-6]$/i.test(options.level)
            ? options.level.toLowerCase()
            : 'h3';

        header.appendChild(createElement(titleTag, {
            className: 'caissa-ui-panel-title',
            text: options.title || ''
        }));

        const actions = Array.isArray(options.actions)
            ? options.actions.filter(Boolean)
            : [];

        if (actions.length > 0) {
            header.appendChild(createElement('div', {
                className: 'caissa-ui-panel-actions',
                children: actions
            }));
        }

        return header;
    }

    function applyTooltip(element, text, options = {}) {
        if (!element || !text) return element || null;
        element.classList.add('caissa-ui-tooltip-host');
        element.setAttribute('data-caissa-tooltip', String(text));
        if (options.title !== false && !element.getAttribute('title')) {
            element.setAttribute('title', String(text));
        }
        return element;
    }

    function setButtonLoading(button, loading, options = {}) {
        if (!button) return null;

        if (loading) {
            if (!button.dataset.caissaUiOriginalHtml) {
                button.dataset.caissaUiOriginalHtml = button.innerHTML;
                button.dataset.caissaUiOriginalDisabled = button.disabled ? 'true' : 'false';
                button.dataset.caissaUiOriginalAriaLabel = button.getAttribute('aria-label') || '';
            }
            const label = options.label || button.textContent.trim() || 'Loading';
            const spinner = createSpinner({ size: 'small', label });
            button.replaceChildren(spinner, document.createTextNode(label));
            button.classList.add('caissa-ui-button-loading');
            button.disabled = options.disabled !== false;
            button.setAttribute('aria-busy', 'true');
            button.setAttribute('aria-label', label);
            return button;
        }

        if (button.dataset.caissaUiOriginalHtml) {
            button.innerHTML = button.dataset.caissaUiOriginalHtml;
            button.disabled = button.dataset.caissaUiOriginalDisabled === 'true';
            if (button.dataset.caissaUiOriginalAriaLabel) {
                button.setAttribute('aria-label', button.dataset.caissaUiOriginalAriaLabel);
            } else {
                button.removeAttribute('aria-label');
            }
            delete button.dataset.caissaUiOriginalHtml;
            delete button.dataset.caissaUiOriginalDisabled;
            delete button.dataset.caissaUiOriginalAriaLabel;
        }
        button.classList.remove('caissa-ui-button-loading');
        button.removeAttribute('aria-busy');
        return button;
    }

    window.CaissaUI = Object.freeze({
        createElement,
        render,
        createStatusBadge,
        createSpinner,
        createBanner,
        createEmptyState,
        createPanelHeader,
        applyTooltip,
        setButtonLoading,
        statuses: Object.freeze(Array.from(STATUS_TYPES))
    });
})();
