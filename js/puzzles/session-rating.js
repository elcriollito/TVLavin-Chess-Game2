// A short-lived practice estimate, never an account rating or Lichess rating.
export function createSessionRating(initial = 1800) {
    return { rating: initial, solved: 0, failed: 0, last: null };
}

export function recordOutcome(progress, puzzleRating, outcome) {
    if (!['solved', 'failed'].includes(outcome)) return progress;
    const expected = 1 / (1 + 10 ** ((puzzleRating - progress.rating) / 400));
    const change = Math.round(24 * ((outcome === 'solved' ? 1 : 0) - expected));
    return {
        rating: Math.max(100, progress.rating + change),
        solved: progress.solved + (outcome === 'solved' ? 1 : 0),
        failed: progress.failed + (outcome === 'failed' ? 1 : 0),
        last: { outcome, puzzleRating, change }
    };
}
