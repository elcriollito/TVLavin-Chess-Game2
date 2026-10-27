/**
 * CAISSA eligibility-first registration candidate.
 *
 * This client first sends only birth month/year to the same-origin eligibility
 * endpoint. Only after a successful server decision can it send an email to
 * start the restricted Clerk account flow. When Clerk returns an already
 * screened recipient with an application-invitation ticket, this page mounts
 * Clerk's prebuilt SignUp component so Clerk can validate and consume that
 * recipient-bound ticket. Production remains on the pause screen unless the
 * server release gate is explicitly enabled.
 */
(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    let clerkLoadPromise = null;

    function invitationTicket() {
        const params = new URLSearchParams(window.location.search);
        const tickets = params.getAll('__clerk_ticket');
        if (tickets.length !== 1) return '';
        const ticket = tickets[0];
        return ticket.length >= 20 && ticket.length <= 4096 && /^[A-Za-z0-9._~-]+$/.test(ticket) ? ticket : '';
    }

    function getClerkDomain(publishableKey) {
        try {
            const domain = atob(publishableKey.split('_')[2]).slice(0, -1);
            if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid domain');
            return domain;
        } catch (_) {
            throw new Error('Invalid Clerk publishable key');
        }
    }

    function loadScript(src, attributes = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.referrerPolicy = 'no-referrer';
            script.src = src;
            Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
            script.onload = resolve;
            script.onerror = () => reject(new Error('Authentication component unavailable'));
            document.head.appendChild(script);
        });
    }

    function loadClerkSdk(publishableKey) {
        if (typeof window.Clerk !== 'undefined') return Promise.resolve(window.Clerk);
        if (clerkLoadPromise) return clerkLoadPromise;
        clerkLoadPromise = (async () => {
            window.process = window.process || {};
            window.process.env = window.process.env || {};
            window.process.env.CLERK_TELEMETRY_DISABLED = '1';
            const clerkDomain = getClerkDomain(publishableKey);
            await loadScript(`https://${clerkDomain}/npm/@clerk/ui@1.30.1/dist/ui.browser.js`);
            await loadScript(`https://${clerkDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
                'data-clerk-publishable-key': publishableKey
            });
            return window.Clerk;
        })();
        return clerkLoadPromise;
    }

    function completionUrl() {
        const params = new URLSearchParams(window.location.search);
        const destination = window.CAISSA_REDIRECTS?.sanitizeInternalRedirect(params.get('redirect_url'), '/') || '/';
        return '/auth/complete?redirect_url=' + encodeURIComponent(destination);
    }

    async function startInvitationFlow(ticket) {
        const pause = byId('registrationPaused');
        const candidate = byId('registrationCandidate');
        const invitation = byId('registrationInvitation');
        const container = byId('clerk-sign-up');
        const status = byId('registrationInvitationStatus');
        if (!pause || !candidate || !invitation || !container || !ticket) return false;

        pause.hidden = true;
        candidate.hidden = true;
        invitation.hidden = false;
        status.textContent = 'Verifying your secure invitation…';
        try {
            const publishableKey = String(window.CAISSA_AUTH_CONFIG?.CLERK_PUBLISHABLE_KEY || '').trim();
            if (!window.CAISSA_AUTH_CONFIG_UTILS?.isValidClerkPublishableKey?.(publishableKey)) {
                throw new Error('Authentication is not configured');
            }
            const Clerk = await loadClerkSdk(publishableKey);
            if (!Clerk) throw new Error('Authentication component unavailable');
            await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
            if (Clerk.user) {
                window.location.replace(completionUrl());
                return true;
            }
            status.textContent = '';
            Clerk.mountSignUp(container, {
                forceRedirectUrl: completionUrl(),
                signInForceRedirectUrl: completionUrl(),
                signInUrl: '/signin',
                appearance: {
                    variables: {
                        colorPrimary: '#4ecdc4', colorPrimaryForeground: '#0b0f1a',
                        colorBackground: '#141923', colorForeground: '#f3f6fb',
                        colorMutedForeground: '#c2cad7', colorInput: '#202838',
                        colorInputForeground: '#f8fafc', borderRadius: '8px'
                    },
                    elements: {
                        card: { backgroundColor: 'transparent', boxShadow: 'none' },
                        formButtonPrimary: { backgroundColor: '#4ecdc4', color: '#0b0f1a', fontWeight: '700' },
                        socialButtonsBlockButton: { backgroundColor: '#f8fafc', color: '#0b0f1a', fontWeight: '700' },
                        headerTitle: { color: '#f3f6fb' }, headerSubtitle: { color: '#c2cad7' },
                        formFieldLabel: { color: '#dce3ed' }, formFieldInput: { backgroundColor: '#202838', color: '#f8fafc' },
                        footerActionText: { color: '#c2cad7' }, footerActionLink: { color: '#63ddd5', fontWeight: '700' }
                    }
                }
            });
            return true;
        } catch (_) {
            status.textContent = 'This invitation could not be verified. Request a new invitation and try again.';
            status.dataset.kind = 'error';
            return true;
        }
    }

    function showStatus(message, kind = '') {
        const node = byId('registrationCandidateStatus');
        if (!node) return;
        node.textContent = message;
        node.dataset.kind = kind;
    }

    async function postJson(path, body) {
        const response = await fetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let payload = {};
        try { payload = await response.json(); } catch (_) { /* generic failure below */ }
        return { response, payload };
    }

    function populateMonthsAndYears() {
        const month = byId('registrationBirthMonth');
        const year = byId('registrationBirthYear');
        if (!month || !year || month.options.length > 1) return;
        const formatter = new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'long', timeZone: 'UTC' });
        for (let value = 1; value <= 12; value += 1) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = formatter.format(new Date(Date.UTC(2020, value - 1, 1)));
            month.appendChild(option);
        }
        const current = new Date().getUTCFullYear();
        for (let value = current; value >= current - 120; value -= 1) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value);
            year.appendChild(option);
        }
    }

    async function submitEligibility(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        let birthMonth = byId('registrationBirthMonth').value;
        let birthYear = byId('registrationBirthYear').value;
        button.disabled = true;
        showStatus('Checking account availability…');
        try {
            const { response } = await postJson('/api/auth/registration/eligibility', { birthMonth, birthYear });
            birthMonth = '';
            birthYear = '';
            form.reset();
            if (!response.ok) {
                showStatus('Account registration is unavailable.', 'error');
                return;
            }
            form.hidden = true;
            byId('registrationAccountForm').hidden = false;
            byId('registrationEmail').focus();
            showStatus('Continue with your email address.');
        } catch (_) {
            showStatus('Account registration is unavailable.', 'error');
        } finally {
            birthMonth = '';
            birthYear = '';
            button.disabled = false;
        }
    }

    async function submitAccountSetup(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        let emailAddress = byId('registrationEmail').value.trim();
        button.disabled = true;
        showStatus('Preparing secure account setup…');
        try {
            const { response } = await postJson('/api/auth/registration/invitation', { emailAddress });
            emailAddress = '';
            form.reset();
            if (!response.ok) {
                showStatus('Account setup could not be prepared. Start again later.', 'error');
                form.hidden = true;
                return;
            }
            form.hidden = true;
            byId('registrationCandidateComplete').hidden = false;
            showStatus('Check your email to verify your address and finish creating your account.', 'success');
        } catch (_) {
            showStatus('Account setup could not be prepared. Start again later.', 'error');
        } finally {
            emailAddress = '';
            button.disabled = false;
        }
    }

    async function init() {
        const pause = byId('registrationPaused');
        const candidate = byId('registrationCandidate');
        if (!pause || !candidate) return;
        try { await window.CAISSA_AUTH_CONFIG_READY; } catch (_) { return; }
        if (window.CAISSA_AUTH_CONFIG?.REGISTRATION_CANDIDATE?.enabled !== true) return;
        const ticket = invitationTicket();
        if (ticket) {
            await startInvitationFlow(ticket);
            return;
        }
        populateMonthsAndYears();
        pause.hidden = true;
        candidate.hidden = false;
        byId('registrationEligibilityForm')?.addEventListener('submit', submitEligibility);
        byId('registrationAccountForm')?.addEventListener('submit', submitAccountSetup);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
