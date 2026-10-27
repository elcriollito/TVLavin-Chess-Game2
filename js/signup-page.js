/**
 * CAISSA invitation-first registration candidate.
 *
 * This client never loads Clerk and cannot create an account. It first sends
 * only birth month/year to the same-origin eligibility endpoint. Only after a
 * successful server decision can it send an email to request a restricted
 * Clerk invitation. Production remains on the pause screen unless the server
 * release gate is explicitly enabled.
 */
(function () {
    'use strict';

    const byId = id => document.getElementById(id);

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
            byId('registrationInvitationForm').hidden = false;
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

    async function submitInvitation(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        let emailAddress = byId('registrationEmail').value.trim();
        button.disabled = true;
        showStatus('Preparing your secure invitation…');
        try {
            const { response } = await postJson('/api/auth/registration/invitation', { emailAddress });
            emailAddress = '';
            form.reset();
            if (!response.ok) {
                showStatus('The invitation could not be prepared. Start again later.', 'error');
                form.hidden = true;
                return;
            }
            form.hidden = true;
            byId('registrationCandidateComplete').hidden = false;
            showStatus('Check your email for the time-limited account invitation.', 'success');
        } catch (_) {
            showStatus('The invitation could not be prepared. Start again later.', 'error');
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
        populateMonthsAndYears();
        pause.hidden = true;
        candidate.hidden = false;
        byId('registrationEligibilityForm')?.addEventListener('submit', submitEligibility);
        byId('registrationInvitationForm')?.addEventListener('submit', submitInvitation);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
