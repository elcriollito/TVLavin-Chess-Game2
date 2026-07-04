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

    function getClerkDomain(publishableKey) {
        try {
            return atob(publishableKey.split('_')[2]).slice(0, -1);
        } catch (error) {
            throw new Error('Invalid Clerk publishable key');
        }
    }

    function loadScript(src, attributes = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.src = src;
            Object.entries(attributes).forEach(([key, value]) => {
                script.setAttribute(key, value);
            });
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
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
            await loadScript(`https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`);
            await loadScript(`https://${clerkDomain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
                'data-clerk-publishable-key': publishableKey
            });
            return window.Clerk;
        })();

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
                ui: { ClerkUI: window.__internal_ClerkUICtor }
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
                            fontWeight: '700',
                            '&:hover': {
                                backgroundColor: '#3dbdb5'
                            }
                        },
                        socialButtonsBlockButton: {
                            backgroundColor: '#f8fafc',
                            border: '1px solid rgba(255, 255, 255, 0.85)',
                            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
                            color: '#0b0f1a',
                            fontWeight: '700',
                            minHeight: '46px',
                            '&:hover': {
                                backgroundColor: '#ffffff',
                                borderColor: '#4ecdc4'
                            }
                        },
                        socialButtonsBlockButtonText: {
                            color: '#0b0f1a',
                            fontWeight: '700'
                        },
                        dividerLine: {
                            backgroundColor: 'rgba(255, 255, 255, 0.22)'
                        },
                        dividerText: {
                            color: '#d7dde8',
                            fontSize: '12px',
                            fontWeight: '700',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase'
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
