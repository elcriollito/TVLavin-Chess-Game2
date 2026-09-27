import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

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
    assert.equal(manifest.localCatalog.bytes, 2_046_775_296);
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

test('the limited beta and ChessBase Tactics routes remain intact during catalog staging', () => {
    const config = JSON.parse(read('../vercel.json'));
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles' && rule.destination === '/puzzles.html'));
    assert.ok(config.rewrites.some(rule => rule.source === '/puzzles/chessbase-tactics' && rule.destination === '/tactics.html'));
    const brief = read('../docs/product/CAISSA_PUZZLES_1_0_WORK.md');
    assert.match(brief, /1,404-puzzle build is a limited beta/);
    assert.match(brief, /does not claim an account rating/);
});
