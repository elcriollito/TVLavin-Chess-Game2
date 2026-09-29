import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PuzzleCatalogSource } from '../js/puzzles/catalog-source.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('generated full-count manifest covers every visible folder and subcategory', () => {
    const preview = JSON.parse(read('../public/data/puzzles/lichess-curated-preview.json'));
    const manifest = JSON.parse(read('../public/data/puzzles/lichess-full-counts.json'));
    const expectedKeys = new Set([
        ...Object.keys(preview.categories).map(category => `category:${category}`),
        ...Object.values(preview.categories).flat().map(theme => `theme:${theme}`),
    ]);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.sourceVersion, '2026-09-10');
    assert.equal(manifest.puzzles, 6_100_952);
    assert.equal(Object.keys(preview.categories).length, 9);
    assert.deepEqual(new Set(Object.keys(manifest.counts)), expectedKeys);
    assert.equal(manifest.counts['category:Motifs'].total, 2_145_051);
    assert.equal(manifest.counts['theme:fork'].total, 781_805);
});

test('full catalog category totals and selected rating counts do not use curated beta numbers', async () => {
    const catalog = new PuzzleCatalogSource({ fetchFn: async () => ({ ok: true, json: async () => ({
        schemaVersion: 1, sourceVersion: '2026-09-10', puzzles: 6_100_952,
        counts: {
            'category:Motifs': { total: 2_000_000, ranges: { '1800:normal:standard': 120_000 } },
            'theme:fork': { total: 500_000, ranges: { '1800:normal:standard': 30_000 } },
            'theme:equality': { total: 20_000, ranges: { '1800:normal:relaxed': 2_000 } },
        },
    }) }) });
    assert.equal(await catalog.loadCounts(), true);
    assert.deepEqual(catalog.countFor('Motifs', '', 1800, 'normal'), { total: 2_000_000, matching: 120_000 });
    assert.deepEqual(catalog.countFor('Motifs', 'fork', 1800, 'normal'), { total: 500_000, matching: 30_000 });
    assert.deepEqual(catalog.countFor('Goals', 'equality', 1800, 'normal'), { total: 20_000, matching: 2_000 });
});

test('the full Lichess archive and generated catalogs are excluded from Git and Vercel', () => {
    const gitignore = read('../.gitignore');
    const vercelignore = read('../.vercelignore');
    for (const pattern of ['*.zst', '*.sqlite3']) {
        assert.match(gitignore, new RegExp(pattern.replaceAll('*', '\\*').replaceAll('.', '\\.')));
        assert.match(vercelignore, new RegExp(pattern.replaceAll('*', '\\*').replaceAll('.', '\\.')));
    }
    assert.doesNotMatch(read('../vercel.json'), /lichess_db_puzzle[.]csv/);
});

test('the committed source manifest records the verified official artifact without a machine-specific path', () => {
    const manifest = JSON.parse(read('../docs/product/lichess-puzzle-source-manifest.json'));
    assert.equal(manifest.source.puzzleCount, 6_100_952);
    assert.equal(manifest.source.bytes, 304_429_328);
    assert.equal(manifest.source.sha256, '95fd454bec9efe8f940d5863d5db4c57474f281a865834997bd8cb5d6a149bb9');
    assert.deepEqual(manifest.source.columns, [
        'PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity',
        'NbPlays', 'Themes', 'GameUrl', 'OpeningTags', 'DailyDate',
    ]);
    assert.equal(manifest.source.license, 'CC0');
    assert.equal(manifest.verification.sqliteIntegrityCheck, 'ok');
    assert.equal(manifest.verification.legalMoveSample, 512);
    assert.equal(manifest.verification.qualityRangeLegalMoveSample, 2_048);
    assert.equal(manifest.localCatalog.bytes, 2_166_308_864);
    assert.doesNotMatch(JSON.stringify(manifest), /Users|ALEXANDER|^[A-Za-z]:/);
});

test('the staged PostgreSQL catalog is private, indexed, and does not invent account progress', () => {
    const migration = read('../supabase/migrations/20260927010607_caissa_puzzle_catalog_v1.sql');
    assert.match(migration, /alter table public[.]puzzles enable row level security/i);
    assert.match(migration, /force row level security/i);
    assert.match(migration, /revoke all on public[.]puzzles from public, anon, authenticated/i);
    assert.match(migration, /grant select, insert, update, delete on public[.]puzzles to service_role/i);
    assert.match(migration, /using gin\(themes\)/i);
    assert.match(migration, /using gin\(opening_tags\)/i);
    assert.doesNotMatch(migration, /user_puzzle_rating|account_rating|progress/i);
});

test('rollback and rehearsal artifacts accompany the migration', () => {
    assert.match(read('../supabase/rollback/20260927010607_caissa_puzzle_catalog_v1_rollback.sql'), /drop table if exists public[.]puzzles/i);
    const rehearsal = read('../supabase/rehearsals/20260927010607_caissa_puzzle_catalog_v1_verify.sql');
    assert.match(rehearsal, /information_schema[.]role_table_grants/i);
    assert.match(rehearsal, /explain \(costs off\)/i);
});

test('the selected D1 candidate preserves source provenance and excludes account progress', () => {
    const schema = read('../cloudflare-puzzles-worker/schema.sql');
    const report = read('../docs/research/PUZZLE_CATALOG_INFRASTRUCTURE_2026-09-27.md');
    assert.match(schema, /game_url text not null/i);
    assert.match(schema, /primary key \(pool_key, shuffle_key, puzzle_id\)/i);
    assert.doesNotMatch(schema, /user_id|account_rating|streak|progress/i);
    assert.match(report, /6,100,952 puzzles/);
    assert.match(report, /2\.57 TB/);
    assert.match(report, /Nunca usar\s+`caissa-openingdb`/i);
});

test('the limited beta remains intact and owns the canonical Puzzles route', () => {
    const config = JSON.parse(read('../vercel.json'));
    assert.equal(config.outputDirectory, '.', 'all connected Vercel projects must deploy the repository root');
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles' && rule.destination === '/puzzles.html'));
    assert.ok(config.redirects.some(rule => rule.source === '/puzzles/chessbase-tactics' && rule.destination === '/puzzles' && rule.permanent));
    const brief = read('../docs/product/CAISSA_PUZZLES_1_0_WORK.md');
    assert.match(brief, /1,404-puzzle build is a limited beta/);
    assert.match(brief, /does not claim an account rating/);
});
