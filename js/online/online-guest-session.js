const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.93.1/+esm';
const STORAGE_KEY = 'caissa-online-guest-session-v1';

export async function createOnlineGuestSession(config, options = {}) {
    if (!config?.url || !config?.publishableKey) return null;
    const createClient = options.createClient
        || (await import(SUPABASE_JS_URL)).createClient;
    const storage = options.storage || globalThis.sessionStorage;
    const client = createClient(config.url, config.publishableKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storage,
            storageKey: options.storageKey || STORAGE_KEY
        }
    });
    let closed = false;

    async function current() {
        if (closed) return null;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return guestIdentity(data?.session);
    }

    return Object.freeze({
        async restore() {
            const identity = await current();
            if (identity) return identity;
            const { data } = await client.auth.getSession();
            if (data?.session) await client.auth.signOut({ scope: 'local' });
            return null;
        },
        async start() {
            const restored = await current();
            if (restored) return restored;
            const { data, error } = await client.auth.signInAnonymously({
                options: { data: { source: 'caissa-online' } }
            });
            if (error) throw error;
            const identity = guestIdentity(data?.session);
            if (!identity) throw new Error('ONLINE_GUEST_SESSION_INVALID');
            return identity;
        },
        async getToken() {
            return (await current())?.accessToken || null;
        },
        async end() {
            if (closed) return;
            await client.auth.signOut({ scope: 'local' });
        },
        close() { closed = true; }
    });
}

function guestIdentity(session) {
    const user = session?.user;
    if (!session?.access_token || !user?.id || user.is_anonymous !== true) return null;
    const suffix = String(user.id).replace(/-/g, '').slice(-6).toUpperCase();
    return Object.freeze({
        isLoaded: true,
        isSignedIn: true,
        isGuest: true,
        identityType: 'guest',
        userId: user.id,
        email: null,
        fullName: `Guest-${suffix}`,
        accessToken: session.access_token,
        status: 'guest'
    });
}
