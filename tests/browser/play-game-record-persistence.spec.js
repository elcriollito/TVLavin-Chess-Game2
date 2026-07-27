import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import {
    instrumentPlay, loadPosition, openPlay, playMove, startGame
} from '../play/playwright-helpers.js';

const PREFIX = 'caissa:play:game-';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
});

test('persistence API loads passively and ordinary Play writes no persistence keys', async ({ page }) => {
    await openPlay(page);
    const initial = await page.evaluate(prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)), PREFIX);
    expect(initial).toEqual([]);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const proof = await page.evaluate(prefix => {
        const record = window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' });
        return {
            api: Boolean(window.CaissaGameRecordPersistence),
            recordStatus: record.status,
            keys: Object.keys(localStorage).filter(key => key.startsWith(prefix))
        };
    }, PREFIX);
    expect(proof).toEqual({ api: true, recordStatus: 'in-progress', keys: [] });
});

test('completed history requires explicit consent and returns detached records', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    const proof = await page.evaluate(() => {
        const api = window.CaissaGameRecordPersistence;
        const record = window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' });
        const blocked = api.saveCompleted(record);
        const granted = api.setConsent('granted');
        const stored = api.saveCompleted(record);
        const listed = api.listCompleted();
        const detached = listed.value[0] !== record && Object.isFrozen(listed.value[0]);
        return { blocked, granted, stored, listed, detached };
    });
    expect(proof.blocked.status).toBe('consent-required');
    expect(proof.granted.status).toBe('stored');
    expect(proof.stored.status).toBe('stored');
    expect(proof.listed.value).toHaveLength(1);
    expect(proof.detached).toBe(true);
});

test('clearCompleted removes only owned history keys', async ({ page }) => {
    await openPlay(page);
    await page.evaluate(() => localStorage.setItem('caissa:unrelated:test', 'keep'));
    const proof = await page.evaluate(() => {
        const api = window.CaissaGameRecordPersistence;
        localStorage.setItem(api.keys.history, 'corrupt');
        localStorage.setItem(api.keys.historyTemporary, 'partial');
        const cleared = api.clearCompleted();
        return {
            cleared,
            unrelated: localStorage.getItem('caissa:unrelated:test'),
            history: localStorage.getItem(api.keys.history),
            temporary: localStorage.getItem(api.keys.historyTemporary)
        };
    });
    expect(proof).toMatchObject({
        cleared: { ok: true, status: 'cleared' },
        unrelated: 'keep',
        history: null,
        temporary: null
    });
});

test('explicit recovery works, overwrites, and expires without touching history', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const proof = await page.evaluate(() => {
        const record = window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' });
        let now = Date.parse('2026-07-27T12:00:00.000Z');
        const store = window.CaissaGameRecordPersistence.createStore({
            storage: localStorage,
            now: () => now
        });
        const saved = store.saveRecovery(record, { ttlMs: 60_000 });
        const loaded = store.loadRecovery();
        now += 60_001;
        const expired = store.loadRecovery();
        return { saved, loaded, expired };
    });
    expect(proof.saved.status).toBe('stored');
    expect(proof.loaded.value.record.status).toBe('in-progress');
    expect(proof.expired.status).toBe('expired');
});

test('malformed and unavailable storage fail safely without crashing Play', async ({ page }) => {
    await openPlay(page);
    const proof = await page.evaluate(() => {
        const api = window.CaissaGameRecordPersistence;
        localStorage.setItem(api.keys.history, '{');
        const corrupted = api.listCompleted();
        const unavailable = api.createStore({
            storage: {
                getItem() { throw new Error('blocked'); },
                setItem() { throw new Error('blocked'); },
                removeItem() { throw new Error('blocked'); }
            }
        }).getConsent();
        return {
            corrupted,
            unavailable,
            boardAvailable: Boolean(window.App.board),
            fen: window.CaissaPlayCompatibility.getCurrentFen()
        };
    });
    expect(proof.corrupted.status).toBe('corrupted');
    expect(proof.unavailable.status).toBe('unavailable');
    expect(proof.boardAvailable).toBe(true);
    expect(proof.fen).toBeTruthy();
});

test('explicit operations create no runtime resources beyond approved storage keys', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    await playMove(page, 'e2', 'e4');
    const proof = await page.evaluate(prefix => {
        const api = window.CaissaGameRecordPersistence;
        const compatibility = window.CaissaPlayCompatibility;
        const before = window.__caissaPlayHarness.snapshot();
        const beforeNodes = document.querySelectorAll('*').length;
        const beforeFen = compatibility.getCurrentFen();
        const record = window.CaissaGameRecord.buildFromPlay({ capturedAt: '2026-07-27T12:00:00.000Z' });
        api.setConsent('granted');
        api.saveRecovery(record);
        api.inspect();
        const after = window.__caissaPlayHarness.snapshot();
        return {
            before,
            after,
            sameNodes: beforeNodes === document.querySelectorAll('*').length,
            sameFen: beforeFen === compatibility.getCurrentFen(),
            keys: Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()
        };
    }, PREFIX);
    expect(proof.after).toEqual(proof.before);
    expect(proof.sameNodes).toBe(true);
    expect(proof.sameFen).toBe(true);
    expect(proof.keys).toEqual([
        'caissa:play:game-record-consent:v1:guest-local',
        'caissa:play:game-recovery:v1:guest-local'
    ]);
});
