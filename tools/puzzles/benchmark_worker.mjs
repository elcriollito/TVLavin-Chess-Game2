#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
    argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = argumentsMap.get('--url');
const output = argumentsMap.get('--output');
const iterations = Number(argumentsMap.get('--iterations') || 15);
const token = process.env.CAISSA_PUZZLE_WORKER_TOKEN;
if (!baseUrl || !output || !token || !Number.isInteger(iterations) || iterations < 2 || iterations > 100) {
    throw new Error('usage: CAISSA_PUZZLE_WORKER_TOKEN=... node benchmark_worker.mjs --url URL --output FILE [--iterations 15]');
}

const scenarios = [
    { name: 'fork', query: { themes: 'fork', minRating: '1700', maxRating: '1900', quality: 'standard', limit: '12' } },
    { name: 'equality', query: { themes: 'equality', minRating: '1700', maxRating: '2100', quality: 'relaxed', limit: '12' } },
    { name: 'sicilian', query: { openings: 'Sicilian_Defense', minRating: '1700', maxRating: '1900', quality: 'standard', limit: '12' } },
];

const percentile = (values, fraction) => {
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

const summary = values => ({
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
});

async function request(query) {
    const url = new URL('/v1/select', baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const started = performance.now();
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const elapsed = performance.now() - started;
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}: ${await response.text()}`);
    const body = await response.json();
    if (!Array.isArray(body.puzzles) || !body.internalMetrics) throw new Error('invalid Worker measurement response');
    return { elapsed, body };
}

const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    iterations,
    sourceVersion: null,
    scenarios: {},
};

for (const scenario of scenarios) {
    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
        const sample = await request(scenario.query);
        report.sourceVersion ||= sample.body.sourceVersion;
        samples.push({
            httpMs: Number(sample.elapsed.toFixed(3)),
            puzzles: sample.body.puzzles.length,
            ...sample.body.internalMetrics,
        });
    }
    const first = await request(scenario.query);
    const second = first.body.cursor
        ? await request({ ...scenario.query, cursor: first.body.cursor })
        : null;
    const firstIds = new Set(first.body.puzzles.map(puzzle => puzzle.puzzle_id));
    const overlap = second ? second.body.puzzles.filter(puzzle => firstIds.has(puzzle.puzzle_id)).length : 0;
    if (overlap) throw new Error(`${scenario.name} cursor pages overlap by ${overlap} puzzle(s)`);
    if (samples.some(sample => sample.rowsWritten !== 0)) throw new Error(`${scenario.name} selection wrote to D1`);
    report.scenarios[scenario.name] = {
        query: scenario.query,
        httpMs: summary(samples.map(sample => sample.httpMs)),
        workerWallMs: summary(samples.map(sample => sample.workerWallMs)),
        d1DurationMs: summary(samples.map(sample => sample.d1DurationMs)),
        rowsRead: summary(samples.map(sample => sample.rowsRead)),
        rowsWritten: 0,
        queryCount: summary(samples.map(sample => sample.queryCount)),
        returnedPuzzles: summary(samples.map(sample => sample.puzzles)),
        regions: [...new Set(samples.flatMap(sample => sample.regions || []))],
        pagination: {
            firstPage: first.body.puzzles.length,
            secondPage: second?.body.puzzles.length || 0,
            overlap,
            secondPageRowsRead: second?.body.internalMetrics.rowsRead ?? null,
        },
    };
}

await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
