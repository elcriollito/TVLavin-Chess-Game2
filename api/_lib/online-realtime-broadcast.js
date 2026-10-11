const BROADCAST_TIMEOUT_MS = 5_000;

export async function sendOnlineGameBroadcast(options = {}) {
    const env = options.env || process.env;
    const baseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) return { delivered: false, reason: 'not-configured' };

    const gameId = String(options.gameId || '');
    const version = Number(options.version);
    if (!/^[0-9a-f-]{36}$/i.test(gameId) || !Number.isSafeInteger(version) || version < 1) {
        throw new Error('ONLINE_REALTIME_BROADCAST_INVALID');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || BROADCAST_TIMEOUT_MS);
    try {
        const response = await (options.fetchImpl || fetch)(
            `${String(baseUrl).replace(/\/+$/, '')}/realtime/v1/api/broadcast`,
            {
                method: 'POST',
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [{
                        topic: `online-game:${gameId}`,
                        event: 'UPDATE',
                        payload: {
                            gameId,
                            version,
                            eventType: String(options.eventType || 'game.snapshot'),
                            correlationId: String(options.correlationId || '')
                        },
                        private: true
                    }]
                }),
                signal: controller.signal
            }
        );
        if (response.status !== 202) throw new Error(`ONLINE_REALTIME_BROADCAST_HTTP_${response.status}`);
        return { delivered: true };
    } finally {
        clearTimeout(timer);
    }
}
