export function projectOnlineClock(game, now = Date.now()) {
    const white = Math.max(0, Number(game?.white_time_ms || 0));
    const black = Math.max(0, Number(game?.black_time_ms || 0));
    if (!game || game.status !== 'active' || !game.clock_started_at) {
        return Object.freeze({ whiteMs: white, blackMs: black, running: null });
    }
    const anchor = Date.parse(game.clock_started_at);
    const elapsed = Number.isFinite(anchor) ? Math.max(0, now - anchor) : 0;
    return Object.freeze({
        whiteMs: game.turn === 'white' ? Math.max(0, white - elapsed) : white,
        blackMs: game.turn === 'black' ? Math.max(0, black - elapsed) : black,
        running: game.turn
    });
}

export function formatClock(ms) {
    const safe = Math.max(0, Math.ceil(Number(ms || 0)));
    if (safe < 20_000) return `${Math.floor(safe / 1000)}.${Math.floor((safe % 1000) / 100)}`;
    const seconds = Math.ceil(safe / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
