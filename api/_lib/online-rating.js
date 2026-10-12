export const RATING_POLICY = Object.freeze({
    algorithm: 'caissa-elo-v1',
    initialRating: 1500,
    provisionalGames: 20,
    provisionalK: 40,
    establishedK: 24,
    minimumRating: 100,
    maximumRating: 4000,
    abortedRated: false
});

export function calculateRatingPair(white, black, result, policy = RATING_POLICY) {
    if (!['1-0', '0-1', '1/2-1/2'].includes(result)) throw new TypeError('Unsupported rated result.');
    const whiteState = normalizePlayer(white, policy);
    const blackState = normalizePlayer(black, policy);
    const whiteScore = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
    const blackScore = 1 - whiteScore;
    const whiteExpected = expected(whiteState.rating, blackState.rating);
    const blackExpected = expected(blackState.rating, whiteState.rating);
    const whiteDelta = Math.round(kFor(whiteState, policy) * (whiteScore - whiteExpected));
    const blackDelta = Math.round(kFor(blackState, policy) * (blackScore - blackExpected));
    return Object.freeze({
        algorithm: policy.algorithm,
        white: outcome(whiteState, whiteDelta, policy),
        black: outcome(blackState, blackDelta, policy)
    });
}

function normalizePlayer(player, policy) {
    const rating = Number.isInteger(player?.rating) ? player.rating : policy.initialRating;
    const games = Number.isInteger(player?.games) && player.games >= 0 ? player.games : 0;
    return Object.freeze({ rating, games });
}

function expected(rating, opponentRating) {
    return 1 / (1 + (10 ** ((opponentRating - rating) / 400)));
}

function kFor(player, policy) {
    return player.games < policy.provisionalGames ? policy.provisionalK : policy.establishedK;
}

function outcome(player, delta, policy) {
    const after = Math.max(policy.minimumRating, Math.min(policy.maximumRating, player.rating + delta));
    return Object.freeze({ before: player.rating, after, delta: after - player.rating, games: player.games + 1 });
}
