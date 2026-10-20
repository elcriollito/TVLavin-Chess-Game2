const SAFE_CODE_MAX_LENGTH = 64;
const SAFE_PASSWORD_MAX_LENGTH = 1024;

export class RecentReauthenticationError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'RecentReauthenticationError';
        this.code = code;
    }
}

export function createRecentReauthenticationFlow(options = {}) {
    const authProvider = options.authProvider || (() => globalThis.CAISSA_AUTH);
    const certifyToken = options.certifyToken;
    let generation = 0;
    let pending = null;
    let busy = false;

    async function begin() {
        if (busy) throw safeError('REVERIFICATION_IN_PROGRESS');
        const operation = ++generation;
        const context = requireContext(authProvider());
        busy = true;
        pending = null;
        try {
            let verification = await context.session.startVerification({ level: 'first_factor' });
            assertCurrent(operation, context);
            if (verification?.status === 'complete') {
                return await certify(operation, context);
            }

            const factor = selectFirstFactor(verification?.supportedFirstFactors);
            if (!factor) throw safeError('REVERIFICATION_METHOD_UNAVAILABLE');
            const strategy = factor.strategy;

            if (strategy === 'email_code' || strategy === 'phone_code') {
                const identifierKey = strategy === 'email_code' ? 'emailAddressId' : 'phoneNumberId';
                const identifier = factor[identifierKey];
                if (typeof identifier !== 'string' || !identifier) {
                    throw safeError('REVERIFICATION_METHOD_UNAVAILABLE');
                }
                const prepared = await verification.prepareFirstFactorVerification({
                    strategy,
                    [identifierKey]: identifier
                });
                assertCurrent(operation, context);
                verification = prepared || verification;
            }

            pending = { operation, context, verification, factor };
            return Object.freeze({
                status: strategy === 'password' ? 'needs_password' : 'needs_code',
                strategy,
                destination: safeDestination(factor.safeIdentifier)
            });
        } catch (error) {
            if (operation === generation) pending = null;
            throw normalizeError(error);
        } finally {
            if (operation === generation) busy = false;
        }
    }

    async function complete(value) {
        if (busy) throw safeError('REVERIFICATION_IN_PROGRESS');
        const active = pending;
        if (!active || active.operation !== generation) {
            throw safeError('REVERIFICATION_NOT_STARTED');
        }
        const secret = String(value || '');
        const strategy = active.factor.strategy;
        const maxLength = strategy === 'password' ? SAFE_PASSWORD_MAX_LENGTH : SAFE_CODE_MAX_LENGTH;
        if (!secret || secret.length > maxLength) throw safeError('REVERIFICATION_INPUT_INVALID');

        busy = true;
        try {
            assertCurrent(active.operation, active.context);
            const result = await active.verification.attemptFirstFactorVerification(
                strategy === 'password'
                    ? { strategy, password: secret }
                    : { strategy, code: secret }
            );
            assertCurrent(active.operation, active.context);
            const verification = result || active.verification;
            if (verification.status !== 'complete') throw safeError('REVERIFICATION_INCOMPLETE');
            pending = null;
            return await certify(active.operation, active.context);
        } catch (error) {
            throw normalizeError(error);
        } finally {
            if (active.operation === generation) busy = false;
        }
    }

    async function certify(operation, context) {
        assertCurrent(operation, context);
        const token = await context.session.getToken({ skipCache: true });
        assertCurrent(operation, context);
        if (typeof token !== 'string' || !token) throw safeError('REVERIFICATION_TOKEN_UNAVAILABLE');
        if (typeof certifyToken !== 'function') throw safeError('REVERIFICATION_CONFIRMATION_UNAVAILABLE');
        const result = await certifyToken(token);
        assertCurrent(operation, context);
        if (!result?.backendReady || result.requiresReauthentication !== false) {
            throw safeError('REVERIFICATION_NOT_CONFIRMED');
        }
        return Object.freeze({ status: 'complete', summary: result });
    }

    function assertCurrent(operation, expected) {
        if (operation !== generation) throw safeError('REVERIFICATION_CANCELED');
        const current = requireContext(authProvider());
        if (current.userId !== expected.userId || current.sessionId !== expected.sessionId) {
            cancel();
            throw safeError('REVERIFICATION_IDENTITY_CHANGED');
        }
    }

    function cancel() {
        generation += 1;
        pending = null;
        busy = false;
    }

    return Object.freeze({ begin, complete, cancel });
}

function requireContext(auth) {
    const session = auth?.clerk?.session;
    const userId = typeof auth?.userId === 'string' ? auth.userId : '';
    const sessionId = typeof session?.id === 'string' ? session.id : '';
    if (!auth?.isSignedIn || !userId || !sessionId
        || typeof session.startVerification !== 'function'
        || typeof session.getToken !== 'function') {
        throw safeError('REVERIFICATION_SESSION_UNAVAILABLE');
    }
    return { userId, sessionId, session };
}

function selectFirstFactor(factors) {
    if (!Array.isArray(factors)) return null;
    const supported = factors.filter(factor => factor && ['email_code', 'phone_code', 'password'].includes(factor.strategy));
    const score = factor => {
        const order = { email_code: 0, phone_code: 1, password: 2 };
        return (factor.primary ? -10 : 0) + order[factor.strategy];
    };
    return supported.sort((left, right) => score(left) - score(right))[0] || null;
}

function safeDestination(value) {
    const destination = String(value || '').replace(/[\r\n\t]/gu, ' ').trim();
    return destination.slice(0, 160);
}

function normalizeError(error) {
    if (error instanceof RecentReauthenticationError) return error;
    if (error?.code === 'REVERIFICATION_REQUIRED') return safeError('REVERIFICATION_NOT_CONFIRMED');
    if (error?.code === 'AUTH_REQUIRED') return safeError('REVERIFICATION_SESSION_UNAVAILABLE');
    return safeError('REVERIFICATION_FAILED');
}

function safeError(code) {
    const messages = {
        REVERIFICATION_IN_PROGRESS: 'Verification is already in progress.',
        REVERIFICATION_NOT_STARTED: 'Start verification again.',
        REVERIFICATION_INPUT_INVALID: 'Enter the verification value and try again.',
        REVERIFICATION_METHOD_UNAVAILABLE: 'No supported verification method is available for this account.',
        REVERIFICATION_SESSION_UNAVAILABLE: 'Your session is no longer available. Sign in and try again.',
        REVERIFICATION_IDENTITY_CHANGED: 'The signed-in account changed. Open Account settings again.',
        REVERIFICATION_CANCELED: 'Verification was canceled.',
        REVERIFICATION_INCOMPLETE: 'Verification was not completed.',
        REVERIFICATION_TOKEN_UNAVAILABLE: 'A refreshed session could not be created.',
        REVERIFICATION_CONFIRMATION_UNAVAILABLE: 'Account controls could not confirm verification.',
        REVERIFICATION_NOT_CONFIRMED: 'The server did not confirm a recent verification.',
        REVERIFICATION_FAILED: 'Verification could not be completed. Try again.'
    };
    return new RecentReauthenticationError(code, messages[code] || messages.REVERIFICATION_FAILED);
}
