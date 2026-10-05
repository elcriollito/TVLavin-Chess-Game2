export async function createOnlineRealtime(config, options = {}) {
    if (!config?.url || !config?.publishableKey || !options.gameId) return null;
    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.93.1/+esm');
        const client = createClient(config.url, config.publishableKey, {
            accessToken: async () => options.getToken?.() || null,
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const channel = client.channel(`online-game:${options.gameId}`, { config: { private: true } });
        channel.on('broadcast', { event: '*' }, payload => options.onChange?.(payload));
        channel.subscribe(status => options.onStatus?.(status));
        return Object.freeze({
            async close() {
                await client.removeChannel(channel);
            }
        });
    } catch (error) {
        options.onStatus?.('FALLBACK', error);
        return null;
    }
}
