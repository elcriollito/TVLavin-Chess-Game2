const DAY_MS = 86_400_000;
const OFFICIAL_OR_RECURRING_FIELDS = Object.freeze([
    'recurrence', 'repeat', 'seriesId', 'seriesKind', 'source', 'official', 'officialSeries',
    'slug', 'frequencyUnit', 'interval', 'weekdays', 'firstDate', 'localTime', 'timeZone',
    'generationLeadDays', 'leadDays', 'endMode', 'endDate', 'occurrenceCount', 'enabled'
]);

export const DAILY_MOVE_CONTROLS = Object.freeze([1, 3, 5, 7]);
export const DAILY_DEFAULTS = Object.freeze({
    daysPerMove: 7,
    groupSize: 4,
    capacity: 16,
    qualifiersPerGroup: 2,
    minimumPlayers: 4,
    maximumGroupSize: 6,
    maximumConcurrentGamesPerPlayer: 10
});

export function isDailyEnabled(rollout, env = {}) {
    return (rollout === 'preview' || rollout === 'production')
        && env.CAISSA_ONLINE_TOURNAMENTS === '1'
        && env.CAISSA_ONLINE_DAILY === '1';
}

export function validateDailyCreation(payload, now = Date.now()) {
    if (hasAny(payload, [
        'timeControlId', 'durationMinutes', 'lateJoin', 'pool', 'baseMs', 'incrementMs',
        ...OFFICIAL_OR_RECURRING_FIELDS
    ])) {
        return failure('INVALID_DAILY_FIELDS');
    }
    if (Object.hasOwn(payload || {}, 'registrationClosesAt')) {
        return failure('DAILY_REGISTRATION_MANAGED');
    }
    const name = String(payload?.name || '').trim();
    const description = String(payload?.description || '').trim();
    const daysPerMove = Number(payload?.daysPerMove ?? DAILY_DEFAULTS.daysPerMove);
    const groupSize = Number(payload?.groupSize ?? DAILY_DEFAULTS.groupSize);
    const capacity = Number(payload?.capacity ?? DAILY_DEFAULTS.capacity);
    const qualifiersPerGroup = Number(payload?.qualifiersPerGroup ?? DAILY_DEFAULTS.qualifiersPerGroup);
    const rated = payload?.rated === true;
    const startsAt = Date.parse(payload?.startsAt || '');

    if (name.length < 3 || name.length > 80 || /[<>\u0000-\u001f\u007f]/u.test(name)) {
        return failure('INVALID_TOURNAMENT_NAME');
    }
    if (description.length > 500 || /[<>\u0000-\u001f\u007f]/u.test(description)) {
        return failure('INVALID_TOURNAMENT_DESCRIPTION');
    }
    if (!DAILY_MOVE_CONTROLS.includes(daysPerMove)) return failure('INVALID_DAILY_MOVE_CONTROL');
    if (!Number.isSafeInteger(groupSize) || groupSize < 3 || groupSize > DAILY_DEFAULTS.maximumGroupSize) {
        return failure('INVALID_DAILY_GROUP_SIZE');
    }
    if (!Number.isSafeInteger(capacity) || capacity < 4 || capacity > 100) {
        return failure('INVALID_TOURNAMENT_CAPACITY');
    }
    if (groupSize > capacity) return failure('DAILY_GROUP_EXCEEDS_CAPACITY');
    if (![1, 2].includes(qualifiersPerGroup) || qualifiersPerGroup >= groupSize) {
        return failure('INVALID_DAILY_ADVANCEMENT');
    }
    if (!Number.isFinite(startsAt) || startsAt < now + 60_000 || startsAt > now + (366 * DAY_MS)) {
        return failure('INVALID_TOURNAMENT_START');
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            name,
            description,
            daysPerMove,
            groupSize,
            capacity,
            qualifiersPerGroup,
            rated,
            startsAt: new Date(startsAt).toISOString(),
            registrationClosesAt: new Date(startsAt).toISOString()
        })
    });
}

function hasAny(payload, keys) {
    return payload && typeof payload === 'object' && keys.some(key => Object.hasOwn(payload, key));
}

export function nextDailyDeadline(now, daysPerMove) {
    const timestamp = Number(now instanceof Date ? now.getTime() : now);
    const days = Number(daysPerMove);
    if (!Number.isFinite(timestamp) || !DAILY_MOVE_CONTROLS.includes(days)) {
        throw new TypeError('A valid Daily clock is required.');
    }
    return new Date(timestamp + (days * DAY_MS)).toISOString();
}

export function buildDailyGroups(participants, groupSize = DAILY_DEFAULTS.groupSize) {
    if (!Number.isSafeInteger(groupSize) || groupSize < 3 || groupSize > DAILY_DEFAULTS.maximumGroupSize) {
        throw new TypeError('Daily group size must be between 3 and 6.');
    }
    const seeded = [...(participants || [])]
        .filter(player => player?.id)
        .sort((a, b) => Number(b.rating || 1500) - Number(a.rating || 1500)
            || Date.parse(a.joinedAt || '') - Date.parse(b.joinedAt || '')
            || String(a.id).localeCompare(String(b.id)));
    if (seeded.length < 2) return Object.freeze([]);
    const groupCount = Math.ceil(seeded.length / groupSize);
    const groups = Array.from({ length: groupCount }, (_, index) => ({
        number: index + 1,
        members: []
    }));
    seeded.forEach((player, index) => {
        const band = Math.floor(index / groupCount);
        const offset = index % groupCount;
        const groupIndex = band % 2 === 0 ? offset : groupCount - 1 - offset;
        groups[groupIndex].members.push(Object.freeze({ ...player, seed: index + 1 }));
    });
    return Object.freeze(groups.map(group => Object.freeze({
        number: group.number,
        members: Object.freeze(group.members)
    })));
}

export function buildDoubleRoundRobinPairings(group) {
    const members = [...(group?.members || [])];
    if (members.length < 2 || members.length > DAILY_DEFAULTS.maximumGroupSize) {
        throw new TypeError('A Daily group must contain between 2 and 6 players.');
    }
    const pairings = [];
    let board = 1;
    for (let left = 0; left < members.length; left += 1) {
        for (let right = left + 1; right < members.length; right += 1) {
            const a = members[left];
            const b = members[right];
            pairings.push(Object.freeze({
                board: board++, leg: 1, whiteUserId: a.id, blackUserId: b.id
            }));
            pairings.push(Object.freeze({
                board: board++, leg: 2, whiteUserId: b.id, blackUserId: a.id
            }));
        }
    }
    const perPlayer = (members.length - 1) * 2;
    if (perPlayer > DAILY_DEFAULTS.maximumConcurrentGamesPerPlayer) {
        throw new RangeError('Daily group exceeds the concurrent game limit.');
    }
    return Object.freeze(pairings);
}

export function calculateDailyStandings(members, games) {
    const rows = new Map((members || []).map(member => [member.id, {
        id: member.id,
        displayName: member.displayName,
        seed: Number(member.seed || Number.MAX_SAFE_INTEGER),
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        played: 0,
        sonnebornBerger: 0
    }]));
    const completeGames = [...(games || [])].filter(game => game?.id
        && ['1-0', '0-1', '1/2-1/2'].includes(game.result));
    const seen = new Set();
    for (const game of completeGames) {
        if (seen.has(game.id)) continue;
        seen.add(game.id);
        const white = rows.get(game.whiteUserId);
        const black = rows.get(game.blackUserId);
        if (!white || !black) continue;
        const whiteScore = game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : 0.5;
        const blackScore = 1 - whiteScore;
        applyScore(white, whiteScore);
        applyScore(black, blackScore);
    }
    for (const game of completeGames) {
        const white = rows.get(game.whiteUserId);
        const black = rows.get(game.blackUserId);
        if (!white || !black) continue;
        const whiteScore = game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : 0.5;
        white.sonnebornBerger += whiteScore * black.points;
        black.sonnebornBerger += (1 - whiteScore) * white.points;
    }
    return Object.freeze([...rows.values()]
        .sort((a, b) => b.points - a.points
            || b.sonnebornBerger - a.sonnebornBerger
            || b.wins - a.wins
            || a.seed - b.seed
            || String(a.id).localeCompare(String(b.id)))
        .map((row, index) => Object.freeze({ ...row, rank: index + 1 })));
}

export function selectDailyQualifiers(standings, count = DAILY_DEFAULTS.qualifiersPerGroup) {
    if (!Number.isSafeInteger(count) || count < 1) throw new TypeError('Qualifier count is required.');
    return Object.freeze([...(standings || [])].slice(0, count).map(row => row.id));
}

export function adjudicateDailyDeadline(game, now = Date.now()) {
    if (!game || game.status !== 'active' || game.pool !== 'daily') return null;
    const deadline = Date.parse(game.move_deadline_at || '');
    if (!Number.isFinite(deadline) || Number(now) < deadline) return null;
    if (game.turn === 'white') {
        return Object.freeze({
            result: game.black_can_mate === false ? '1/2-1/2' : '0-1',
            termination: 'timeout'
        });
    }
    return Object.freeze({
        result: game.white_can_mate === false ? '1/2-1/2' : '1-0',
        termination: 'timeout'
    });
}

function applyScore(row, score) {
    row.points += score;
    row.played += 1;
    row.wins += score === 1 ? 1 : 0;
    row.draws += score === 0.5 ? 1 : 0;
    row.losses += score === 0 ? 1 : 0;
}

function failure(code) {
    return Object.freeze({ ok: false, code });
}
