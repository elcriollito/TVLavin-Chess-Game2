/**
 * CAISSA Sign In Page
 *
 * Initializes Clerk Sign In component and handles redirect after success.
 */

(function() {
    'use strict';

    // Get redirect URL from query params
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('redirect_url') || '/';
    }

    // Initialize Clerk Sign In
    async function initSignIn() {
        const config = window.CAISSA_AUTH_CONFIG;
        const container = document.getElementById('clerk-sign-in');

        if (!container) {
            console.error('Sign In: Container not found');
            return;
        }

        if (window.CAISSA_AUTH_CONFIG_READY) {
            try {
                await window.CAISSA_AUTH_CONFIG_READY;
            } catch (error) {
                console.warn('Sign In: Public auth config could not be loaded', error.message);
            }
        }

        // Check if key is configured before waiting for the Clerk SDK.
        const publishableKey = config?.CLERK_PUBLISHABLE_KEY;
        if (!publishableKey || publishableKey === 'pk_test_REPLACE_WITH_YOUR_KEY') {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9aa0a6;">
                    <i class="fas fa-key" style="font-size: 48px; color: #ffc107; margin-bottom: 16px;"></i>
                    <p style="margin: 0 0 12px;">Sign in is not configured yet.</p>
                    <p style="margin: 0; font-size: 12px;">Set the Clerk publishable key in production environment settings.</p>
                </div>
            `;
            return;
        }

        // Wait for Clerk to be available
        const waitForClerk = () => {
            return new Promise((resolve) => {
                if (typeof window.Clerk !== 'undefined') {
                    resolve(window.Clerk);
                    return;
                }

                const interval = setInterval(() => {
                    if (typeof window.Clerk !== 'undefined') {
                        clearInterval(interval);
                        resolve(window.Clerk);
                    }
                }, 100);

                // Timeout after 15 seconds
                setTimeout(() => {
                    clearInterval(interval);
                    resolve(null);
                }, 15000);
            });
        };

        const Clerk = await waitForClerk();

        if (!Clerk) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9aa0a6;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #f44336; margin-bottom: 16px;"></i>
                    <p style="margin: 0;">Unable to load authentication. Please refresh the page.</p>
                </div>
            `;
            return;
        }

        try {
            // Load Clerk with publishable key
            await Clerk.load({
                publishableKey: publishableKey
            });

            // Check if already signed in
            if (Clerk.user) {
                window.location.href = getRedirectUrl();
                return;
            }

            // Mount Sign In component
            Clerk.mountSignIn(container, {
                afterSignInUrl: getRedirectUrl(),
                afterSignUpUrl: getRedirectUrl(),
                signUpUrl: '/signup',
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
            console.error('Sign In: Initialization failed', error);
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
        document.addEventListener('DOMContentLoaded', initSignIn);
    } else {
        initSignIn();
    }

})();
