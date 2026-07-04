/**
 * CAISSA Sign Up Page
 *
 * Initializes Clerk Sign Up component and handles redirect after success.
 */

(function() {
    'use strict';

    let clerkLoadPromise = null;

    // Get redirect URL from query params
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('redirect_url') || '/';
    }

    function loadClerkSdk(publishableKey) {
        if (typeof window.Clerk !== 'undefined') return Promise.resolve(window.Clerk);
        if (clerkLoadPromise) return clerkLoadPromise;

        clerkLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.dataset.clerkPublishableKey = publishableKey;
            script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
            script.onload = () => resolve(window.Clerk);
            script.onerror = () => reject(new Error('Clerk SDK failed to load'));
            document.head.appendChild(script);
        });

        return clerkLoadPromise;
    }

    // Initialize Clerk Sign Up
    async function initSignUp() {
        const config = window.CAISSA_AUTH_CONFIG;
        const container = document.getElementById('clerk-sign-up');

        if (!container) {
            console.error('Sign Up: Container not found');
            return;
        }

        if (window.CAISSA_AUTH_CONFIG_READY) {
            try {
                await window.CAISSA_AUTH_CONFIG_READY;
            } catch (error) {
                console.warn('Sign Up: Public auth config could not be loaded', error.message);
            }
        }

        // Check if key is configured before waiting for the Clerk SDK.
        const publishableKey = config?.CLERK_PUBLISHABLE_KEY;
        if (!publishableKey || publishableKey === 'pk_test_REPLACE_WITH_YOUR_KEY') {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9aa0a6;">
                    <i class="fas fa-key" style="font-size: 48px; color: #ffc107; margin-bottom: 16px;"></i>
                    <p style="margin: 0 0 12px;">Registration is not configured yet.</p>
                    <p style="margin: 0; font-size: 12px;">Set the Clerk publishable key in production environment settings.</p>
                </div>
            `;
            return;
        }

        try {
            const Clerk = await loadClerkSdk(publishableKey);
            if (!Clerk) throw new Error('Clerk SDK unavailable');

            // Load Clerk with publishable key
            await Clerk.load({
                publishableKey: publishableKey
            });

            // Check if already signed in
            if (Clerk.user) {
                window.location.href = getRedirectUrl();
                return;
            }

            // Mount Sign Up component
            Clerk.mountSignUp(container, {
                afterSignInUrl: getRedirectUrl(),
                afterSignUpUrl: getRedirectUrl(),
                signInUrl: '/signin',
                appearance: {
                    variables: {
                        colorPrimary: '#4ecdc4',
                        colorBackground: '#141923',
                        colorInputBackground: '#1a2030',
                        colorInputText: '#e8eaed',
                        colorTextSecondary: '#9aa0a6',
                        borderRadius: '8px'
                    },
                    elements: {
                        card: {
                            backgroundColor: 'transparent',
                            boxShadow: 'none'
                        },
                        formButtonPrimary: {
                            backgroundColor: '#4ecdc4',
                            color: '#0b0f1a',
                            '&:hover': {
                                backgroundColor: '#3dbdb5'
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Sign Up: Initialization failed', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9aa0a6;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 16px;"></i>
                    <p style="margin: 0;">Authentication error. Please try again later.</p>
                </div>
            `;
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSignUp);
    } else {
        initSignUp();
    }

})();
