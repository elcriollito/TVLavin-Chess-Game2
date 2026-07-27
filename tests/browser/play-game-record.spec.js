import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import {
    instrumentPlay, loadPosition, openPlay, playMove, snapshot as legacySnapshot, startGame
} from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('GameRecord API builds idle and one-move records from compatibility', async ({ page }) => {
    await openPlay(page);
    const idle = await page.evaluate(() => window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' }));
    expect(idle).toMatchObject({ schemaVersion: '1.0.0', status: 'idle', source: 'local-play' });
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const moved = await page.evaluate(() => window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' }));
    expect(moved.status).toBe('in-progress');
    expect(moved.moves.history.map(move => move.san)).toEqual(['e4']);
    expect(moved.notation.pgn).toContain('1. e4');
});

test('record captures deterministic engine reply without owning engine state', async ({ page }) => {
    await openPlay(page);
    await page.evaluate(() => {
        window.__caissaPlayHarness.configure({ autoReply: true, bestMove: 'e7e5', cp: 75, delayMs: 5 });
        window.App.useOpeningBook = false;
        window.newGame({ mode: 'engine', color: 'white', timeControl: 0 });
    });
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() =>
        window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' }).moves.count
    )).toBe(2);
    const proof = await page.evaluate(() => {
        const before = window.__caissaPlayHarness.snapshot();
        const record = window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' });
        const after = window.__caissaPlayHarness.snapshot();
        return { before, after, record };
    });
    expect(proof.record.moves.history.map(move => move.san)).toEqual(['e4', 'e5']);
    expect(proof.record).toMatchObject({
        mode: 'human-vs-engine',
        opponent: { type: 'engine' }
    });
    expect(proof.after).toEqual(proof.before);
});

test('record captures checkmate and exposes custom-FEN PGN mismatch', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    const record = await page.evaluate(() => window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' }));
    expect(record).toMatchObject({
        status: 'completed',
        result: { value: '1-0', termination: 'checkmate', winner: 'white', complete: true },
        notation: { pgnResultToken: null, hasResultMismatch: true }
    });
    expect(record.diagnostics.map(item => item.code)).toContain('PGN_RESULT_MISMATCH');
});

test('record and compatibility snapshot stay detached and immutable', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const isolation = await page.evaluate(() => {
        const snapshot = window.CaissaPlayCompatibility.getSnapshot();
        const record = window.CaissaGameRecord.buildFromSnapshot(snapshot, { capturedAt: '2026-07-27T12:00:00.000Z' });
        try { record.moves.history.push({ san: 'h4' }); } catch (_) {}
        return {
            recordFrozen: Object.isFrozen(record) && Object.isFrozen(record.moves.history),
            snapshotFrozen: Object.isFrozen(snapshot) && Object.isFrozen(snapshot.position.moveHistory),
            detached: record.moves.history !== snapshot.position.moveHistory,
            recordMoves: record.moves.count,
            snapshotMoves: snapshot.position.moveHistory.length,
            legacyMoves: window.CaissaPlayCompatibility.getMoveHistory().length
        };
    });
    expect(isolation).toEqual({
        recordFrozen: true, snapshotFrozen: true, detached: true,
        recordMoves: 1, snapshotMoves: 1, legacyMoves: 1
    });
});

test('build, validate, serialize, parse, and repeat create no runtime resources or side effects', async ({ page }) => {
    await openPlay(page);
    await startGame(page, { timeControl: 0 });
    await playMove(page, 'e2', 'e4');
    const proof = await page.evaluate(() => {
        const compatibilityIdentity = window.CaissaPlayCompatibility;
        const beforeHarness = window.__caissaPlayHarness.snapshot();
        const beforeStorage = JSON.stringify(Object.entries(localStorage).sort());
        const beforeFen = window.CaissaPlayCompatibility.getCurrentFen();
        const beforePgn = window.CaissaPlayCompatibility.getCurrentPgn();
        const beforeClock = window.CaissaPlayCompatibility.getClockSnapshot();
        const beforeNodes = document.querySelectorAll('*').length;
        const beforeCommands = beforeHarness.workerMessages.length;
        const records = [];
        for (let index = 0; index < 5; index += 1)
            records.push(window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' }));
        const validation = window.CaissaGameRecord.validate(records[0]);
        const serialized = window.CaissaGameRecord.serialize(records[0]);
        const parsed = window.CaissaGameRecord.parse(serialized.value);
        const afterHarness = window.__caissaPlayHarness.snapshot();
        return {
            sameCompatibility: compatibilityIdentity === window.CaissaPlayCompatibility,
            beforeHarness,
            afterHarness,
            sameStorage: beforeStorage === JSON.stringify(Object.entries(localStorage).sort()),
            sameFen: beforeFen === window.CaissaPlayCompatibility.getCurrentFen(),
            samePgn: beforePgn === window.CaissaPlayCompatibility.getCurrentPgn(),
            sameClock: JSON.stringify(beforeClock) === JSON.stringify(window.CaissaPlayCompatibility.getClockSnapshot()),
            sameNodes: beforeNodes === document.querySelectorAll('*').length,
            sameEngineCommands: beforeCommands === afterHarness.workerMessages.length,
            sameRecordIds: new Set(records.map(record => record.recordId)).size === 1,
            valid: validation.valid,
            parsed: parsed.ok
        };
    });
    expect(proof.sameCompatibility).toBe(true);
    expect(proof.afterHarness).toEqual(proof.beforeHarness);
    expect(proof).toMatchObject({
        sameStorage: true, sameFen: true, samePgn: true, sameClock: true,
        sameNodes: true, sameEngineCommands: true, sameRecordIds: true,
        valid: true, parsed: true
    });
});
