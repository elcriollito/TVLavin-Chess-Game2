export async function createOnlineRealtime(config, options = {}) {
    if (!config?.url || !config?.publishableKey || !options.gameId) return null;
    let client = null;
    let channel = null;
    let closed = false;
    let closePromise = null;
    let refreshTail = Promise.resolve();
    let newestBroadcastVersion = 0;
    const isCurrent = () => !closed && options.isCurrent?.() !== false;
    const changeQueue = createOnlineResyncQueue(async message => {
        if (isCurrent()) await options.onChange?.(message);
    });

    try {
        const createClient = options.createClient
            || (await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.93.1/+esm')).createClient;
        client = createClient(config.url, config.publishableKey, {
            accessToken: async () => {
                const token = await options.getToken?.();
                return isCurrent() && typeof token === 'string' && token ? token : null;
            },
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        // Keep callback mode: realtime-js 2.93.1 re-reads accessToken on heartbeat
        // and reconnect only when setAuth is called without an explicit token.
        await client.realtime.setAuth();
        if (!isCurrent()) {
            client.realtime.disconnect?.();
            return null;
        }

        channel = client.channel(`online-game:${options.gameId}`, { config: { private: true } });
        channel.on('broadcast', { event: '*' }, payload => {
            const version = broadcastVersion(payload);
            if (version && version <= newestBroadcastVersion) return;
            if (version) newestBroadcastVersion = version;
            if (isCurrent()) {
                void changeQueue.request(payload).catch(error => {
                    if (isCurrent()) options.onStatus?.('FALLBACK', error);
                });
            }
        });
        channel.subscribe((status, error) => {
            if (isCurrent()) options.onStatus?.(status, error);
        });

        return Object.freeze({
            async refreshAuth() {
                if (!isCurrent()) return false;
                const refresh = refreshTail.then(async () => {
                    if (!isCurrent()) return false;
                    await client.realtime.setAuth();
                    return isCurrent();
                });
                refreshTail = refresh.catch(() => false);
                try {
                    return await refresh;
                } catch (error) {
                    if (isCurrent()) options.onStatus?.('FALLBACK', error);
                    return false;
                }
            },
            async close() {
                if (closePromise) return closePromise;
                closed = true;
                changeQueue.close();
                closePromise = (async () => {
                    if (channel) await client.removeChannel(channel);
                    client.realtime.disconnect?.();
                })();
                return closePromise;
            }
        });
    } catch (error) {
        closed = true;
        changeQueue.close();
        if (channel && client) await client.removeChannel(channel).catch(() => {});
        client?.realtime?.disconnect?.();
        options.onStatus?.('FALLBACK', error);
        return null;
    }
}

export function createOnlineResyncQueue(run) {
    if (typeof run !== 'function') throw new TypeError('ONLINE_RESYNC_RUN_REQUIRED');
    let active = null;
    let queued = null;
    let closed = false;

    function request(value) {
        if (closed) return Promise.resolve(false);
        if (active) {
            queued = value;
            return active;
        }

        active = (async () => {
            let current = value;
            while (!closed && current !== null) {
                queued = null;
                await run(current);
                current = queued;
            }
            return !closed;
        })().finally(() => {
            active = null;
            if (!closed && queued !== null) void request(queued);
        });
        return active;
    }

    return Object.freeze({
        request,
        close() {
            closed = true;
            queued = null;
        }
    });
}

function broadcastVersion(message) {
    const payload = message?.payload || {};
    const candidate = Number(payload.version ?? payload.record?.version);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}
