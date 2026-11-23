import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PRIME_TIME_TIME_ZONE = 'America/New_York';
export const PRIME_TIME_FIRST_DATE = '2026-11-23';

const controls = Object.freeze({
    'bullet-1-0': Object.freeze({ label: 'Bullet 1+0', pool: 'bullet', baseMs: 60_000, incrementMs: 0 }),
    'bullet-1-1': Object.freeze({ label: 'Bullet 1+1', pool: 'bullet', baseMs: 60_000, incrementMs: 1_000 }),
    'bullet-2-1': Object.freeze({ label: 'Bullet 2+1', pool: 'bullet', baseMs: 120_000, incrementMs: 1_000 }),
    'blitz-3-0': Object.freeze({ label: 'Blitz 3+0', pool: 'blitz', baseMs: 180_000, incrementMs: 0 }),
    'blitz-3-2': Object.freeze({ label: 'Blitz 3+2', pool: 'blitz', baseMs: 180_000, incrementMs: 2_000 }),
    'blitz-5-0': Object.freeze({ label: 'Blitz 5+0', pool: 'blitz', baseMs: 300_000, incrementMs: 0 }),
    'blitz-5-5': Object.freeze({ label: 'Blitz 5+5', pool: 'blitz', baseMs: 300_000, incrementMs: 5_000 }),
    'rapid-10-0': Object.freeze({ label: 'Rapid 10+0', pool: 'rapid', baseMs: 600_000, incrementMs: 0 }),
    'rapid-10-5': Object.freeze({ label: 'Rapid 10+5', pool: 'rapid', baseMs: 600_000, incrementMs: 5_000 })
});

const definition = (controlId, hour, weekdays) => {
    const control = controls[controlId];
    const clock = `${String(hour).padStart(2, '0')}00`;
    const localHour = hour > 12 ? `${hour - 12} PM` : `${hour} PM`;
    return Object.freeze({
        controlId,
        hour,
        weekdays: Object.freeze([...weekdays]),
        slug: `caissa-prime-time-${controlId}-${clock}-s001`,
        title: `CAISSA Prime Time - ${control.label} - ${localHour}`,
        slotId: clock,
        ...control
    });
};

export const PRIME_TIME_SERIES = Object.freeze([
    definition('bullet-1-0', 17, [0, 1, 4]),
    definition('bullet-1-1', 17, [2, 5]),
    definition('bullet-2-1', 17, [3, 6]),
    definition('blitz-3-2', 18, [1, 5]),
    definition('blitz-5-0', 18, [0, 2]),
    definition('blitz-3-0', 18, [3, 6]),
    definition('blitz-5-5', 18, [4]),
    definition('rapid-10-0', 19, [1, 3, 5]),
    definition('rapid-10-5', 19, [0, 2, 4]),
    definition('blitz-5-0', 20, [1, 5]),
    definition('blitz-3-0', 20, [2]),
    definition('blitz-5-5', 20, [3]),
    definition('blitz-3-2', 20, [0, 4]),
    definition('rapid-10-5', 20, [6])
]);

export function createPrimeTimeOperations({ firstDate = PRIME_TIME_FIRST_DATE } = {}) {
    return PRIME_TIME_SERIES.map(series => ({
        eventId: `prime-time-s001:create:${series.controlId}:${series.slotId}:v1`,
        action: 'create',
        payload: {
            actor: 'caissa-ops-owner-approved-prime-time-s001',
            slug: series.slug,
            title: series.title,
            description: 'Official weekly CAISSA Prime Time Arena with a strict 60-minute deadline.',
            timeZone: PRIME_TIME_TIME_ZONE,
            frequencyUnit: 'weekly',
            interval: 1,
            firstDate,
            leadDays: 2,
            pool: series.pool,
            baseMs: series.baseMs,
            incrementMs: series.incrementMs,
            durationMinutes: 60,
            capacity: 64,
            minimumPlayers: 4,
            slots: [{ id: series.slotId, label: series.title, hour: series.hour, minute: 0 }],
            weekdays: [...series.weekdays],
            endMode: 'never',
            rated: false,
            lateJoin: true,
            enabled: false
        }
    }));
}

export function projectedPrimeTimeOccurrences({
    firstDate = PRIME_TIME_FIRST_DATE,
    weeks = 4
} = {}) {
    const start = new Date(`${firstDate}T12:00:00Z`);
    const rows = [];
    for (let offset = 0; offset < weeks * 7; offset += 1) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + offset);
        const weekday = date.getUTCDay();
        const localDate = date.toISOString().slice(0, 10);
        for (const series of PRIME_TIME_SERIES) {
            if (!series.weekdays.includes(weekday)) continue;
            rows.push(Object.freeze({
                localDate,
                weekday,
                hour: series.hour,
                controlId: series.controlId,
                label: series.label,
                seriesSlug: series.slug,
                occurrenceKey: `${series.slug}:${localDate}:${series.slotId}`,
                finishingPolicy: 'abort_at_deadline'
            }));
        }
    }
    return Object.freeze(rows.sort((left, right) => left.localDate.localeCompare(right.localDate)
        || left.hour - right.hour || left.seriesSlug.localeCompare(right.seriesSlug)));
}

export function assertPrimeTimePlan() {
    if (PRIME_TIME_SERIES.length !== 14) throw new Error('Expected 14 grouped series.');
    const weeklyEvents = PRIME_TIME_SERIES.reduce((sum, series) => sum + series.weekdays.length, 0);
    if (weeklyEvents !== 27) throw new Error(`Expected 27 weekly events, received ${weeklyEvents}.`);
    const occupied = new Set();
    for (const series of PRIME_TIME_SERIES) {
        for (const weekday of series.weekdays) {
            const key = `${weekday}:${series.hour}`;
            if (occupied.has(key)) throw new Error(`Duplicate Prime Time slot ${key}.`);
            if (key === '6:19') throw new Error('Saturday 19:00 belongs to Saturdays of Chess.');
            occupied.add(key);
        }
    }
    if (projectedPrimeTimeOccurrences().length !== 108) {
        throw new Error('Expected 108 new occurrences in the four-week projection.');
    }
    return Object.freeze({ groupedSeries: 14, weeklyEvents, fourWeekOccurrences: 108 });
}

async function runDryValidation() {
    const summary = assertPrimeTimePlan();
    const folder = await mkdtemp(join(tmpdir(), 'caissa-prime-time-s001-'));
    const manager = fileURLToPath(new URL('./manage-official-tournament-series.mjs', import.meta.url));
    const validations = [];
    try {
        for (const [index, operation] of createPrimeTimeOperations().entries()) {
            const path = join(folder, `${String(index + 1).padStart(2, '0')}.json`);
            await writeFile(path, `${JSON.stringify(operation, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
            const result = spawnSync(process.execPath, [manager, '--file', path], {
                encoding: 'utf8', windowsHide: true
            });
            if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Validation ${index + 1} failed.`);
            const parsed = JSON.parse(result.stdout);
            validations.push({ slug: operation.payload.slug, valid: parsed.valid === true });
        }
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
    return { ...summary, validations, writesPerformed: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    console.log(JSON.stringify(await runDryValidation(), null, 2));
}
