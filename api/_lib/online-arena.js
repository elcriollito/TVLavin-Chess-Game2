const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ARENA_TIME_CONTROLS = Object.freeze([
    Object.freeze({ id: 'bullet-1-0', label: '1+0', pool: 'bullet', baseMs: 60_000, incrementMs: 0 }),
    Object.freeze({ id: 'bullet-1-1', label: '1+1', pool: 'bullet', baseMs: 60_000, incrementMs: 1_000 }),
    Object.freeze({ id: 'blitz-3-0', label: '3+0', pool: 'blitz', baseMs: 180_000, incrementMs: 0 }),
    Object.freeze({ id: 'blitz-3-2', label: '3+2', pool: 'blitz', baseMs: 180_000, incrementMs: 2_000 }),
    Object.freeze({ id: 'blitz-5-0', label: '5+0', pool: 'blitz', baseMs: 300_000, incrementMs: 0 }),
    Object.freeze({ id: 'blitz-5-5', label: '5+5', pool: 'blitz', baseMs: 300_000, incrementMs: 5_000 }),
    Object.freeze({ id: 'rapid-10-0', label: '10+0', pool: 'rapid', baseMs: 600_000, incrementMs: 0 }),
    Object.freeze({ id: 'rapid-10-5', label: '10+5', pool: 'rapid', baseMs: 600_000, incrementMs: 5_000 })
]);

const CONTROL_BY_ID = new Map(ARENA_TIME_CONTROLS.map(control => [control.id, control]));

export function validateArenaTournamentId(payload) {
    const tournamentId = String(payload?.tournamentId || '');
    return UUID.test(tournamentId)
        ? Object.freeze({ ok: true, value: Object.freeze({ tournamentId }) })
        : failure('INVALID_TOURNAMENT_ID');
}

export function validateArenaCreation(payload, now = Date.now()) {
    const name = String(payload?.name || '').trim();
    const control = CONTROL_BY_ID.get(String(payload?.timeControlId || 'blitz-3-2'));
    const durationMinutes = Number(payload?.durationMinutes ?? 15);
    const capacity = Number(payload?.capacity ?? 16);
    const lateJoin = payload?.lateJoin === true;
    const startsAt = Date.parse(payload?.startsAt || new Date(now + 60_000).toISOString());
    if (name.length < 3 || name.length > 80 || /[<>\u0000-\u001f\u007f]/u.test(name)) {
        return failure('INVALID_TOURNAMENT_NAME');
    }
    if (!control) return failure('INVALID_TOURNAMENT_TIME_CONTROL');
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
        return failure('INVALID_TOURNAMENT_DURATION');
    }
    if (!Number.isSafeInteger(capacity) || capacity < 4 || capacity > 64) {
        return failure('INVALID_TOURNAMENT_CAPACITY');
    }
    if (!Number.isFinite(startsAt) || startsAt < now - 30_000 || startsAt > now + (31 * 24 * 60 * 60 * 1000)) {
        return failure('INVALID_TOURNAMENT_START');
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            name,
            control: Object.freeze({ ...control }),
            durationMinutes,
            capacity,
            lateJoin,
            startsAt: new Date(startsAt).toISOString()
        })
    });
}

export function isArenaEnabled(rollout, env = {}) {
    return rollout !== 'off'
        && rollout !== 'production'
        && env.CAISSA_ONLINE_TOURNAMENTS === '1'
        && env.CAISSA_ONLINE_ARENA === '1';
}

export function arenaSubjectSet(value) {
    return new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean));
}

export function planArenaPairings(waitingPlayers) {
    const remaining = [...(Array.isArray(waitingPlayers) ? waitingPlayers : [])]
        .filter(player => player?.id && player.state === 'waiting')
        .sort(compareWaiting);
    const pairings = [];
    while (remaining.length >= 2) {
        const first = remaining.shift();
        const opponentIndex = bestOpponentIndex(first, remaining);
        const second = remaining.splice(opponentIndex, 1)[0];
        pairings.push(assignArenaColors(first, second));
    }
    return Object.freeze(pairings.map(pairing => Object.freeze(pairing)));
}

export function assignArenaColors(a, b) {
    const aBalance = Number(a?.colorBalance || 0);
    const bBalance = Number(b?.colorBalance || 0);
    const aWhiteCost = Math.abs(aBalance + 1) + Math.abs(bBalance - 1);
    const bWhiteCost = Math.abs(aBalance - 1) + Math.abs(bBalance + 1);
    const aIsWhite = aWhiteCost < bWhiteCost
        || (aWhiteCost === bWhiteCost && String(a.id).localeCompare(String(b.id)) <= 0);
    return {
        whiteUserId: aIsWhite ? a.id : b.id,
        blackUserId: aIsWhite ? b.id : a.id
    };
}

function bestOpponentIndex(player, candidates) {
    return candidates.map((candidate, index) => ({ candidate, index }))
        .sort((left, right) => compareOpponent(player, left.candidate, right.candidate))[0].index;
}

function compareOpponent(player, a, b) {
    const aRematch = a.id === player.lastOpponentId ? 1 : 0;
    const bRematch = b.id === player.lastOpponentId ? 1 : 0;
    return aRematch - bRematch
        || Math.abs(Number(a.rating || 1500) - Number(player.rating || 1500))
            - Math.abs(Number(b.rating || 1500) - Number(player.rating || 1500))
        || compareWaiting(a, b);
}

function compareWaiting(a, b) {
    const aWait = Date.parse(a.waitingSince || a.joinedAt || '') || 0;
    const bWait = Date.parse(b.waitingSince || b.joinedAt || '') || 0;
    return aWait - bWait || String(a.id).localeCompare(String(b.id));
}

function failure(code) {
    return Object.freeze({ ok: false, code });
}
