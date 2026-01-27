/**
 * CAISSA Sign Up Page
 *
 * Initializes Clerk Sign Up component and handles redirect after success.
 */

(function() {
    'use strict';

    // Get redirect URL from query params
    function getRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('redirect_url') || '/';
    }

    // Initialize Clerk Sign Up
    async function initSignUp() {
        const config = window.CAISSA_AUTH_CONFIG;
        const container = document.getElementById('clerk-sign-up');

        if (!container) {
            console.error('Sign Up: Container not found');
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

        // Check if key is configured
        const publishableKey = config?.CLERK_PUBLISHABLE_KEY;
        if (!publishableKey || publishableKey === 'pk_test_REPLACE_WITH_YOUR_KEY') {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9aa0a6;">
                    <i class="fas fa-key" style="font-size: 48px; color: #ffc107; margin-bottom: 16px;"></i>
                    <p style="margin: 0 0 12px;">Clerk is not configured yet.</p>
                    <p style="margin: 0; font-size: 12px;">Set your publishable key in <code>js/auth-config.js</code></p>
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
