import test from 'node:test';
import assert from 'node:assert/strict';
import { streamAccountExport } from '../api/_lib/account-export-stream.js';

const owner = '10000000-0000-4000-8000-000000000001';
const binding = '20000000-0000-4000-8000-000000000001';
const generatedAt = new Date('2026-10-18T20:00:00.000Z');
const scannerPublicSections = new Set([
    'scannerPublicScans',
    'scannerPublicFeedback',
    'scannerPublicCertifications',
    'scannerPublicReviewEvents'
]);
const scannerLegacySections = new Set([
    'scannerScans', 'scannerFeedback', 'scannerFailures', 'scannerCorrections'
]);
const supplementalSections = new Set([
    ...scannerLegacySections, 'playerAlbumEntitlements', 'identityEnrollmentDecisions'
]);

test('export preserves the v1 contract while every database response stays bounded below 4.5 MB', async () => {
    const attempts = Array.from({ length: 5000 }, (_, index) => ({
        id: `attempt-${String(index).padStart(5, '0')}`,
        payload: 'A'.repeat(1024)
    }));
    const scannerPublicRows = {
        scannerPublicScans: Array.from({ length: 2 }, (_, index) => ({
            scan_id: `scan-public-${index + 1}`,
            snapshot: { boundedPayload: 'S'.repeat(1_400_000) }
        })),
        scannerPublicFeedback: [{ feedback_id: 'feedback-public-1', payload: { feedbackType: 'SCAN_FAILURE' } }],
        scannerPublicCertifications: [{ id: 1, scope: 'submittedFeedback', action: 'HOLD' }],
        scannerPublicReviewEvents: [{ id: 2, scope: 'submittedFeedback', eventType: 'HELD' }]
    };
    const openingRows = Array.from({ length: 10 }, (_, index) => ({
        id: `opening-${index + 1}`,
        lines: [{ boundedPayload: 'O'.repeat(330_000) }]
    }));
    const supplementalRows = {
        scannerScans: [{ scan_id: 'legacy-scan-1' }],
        scannerFeedback: [{ feedback_id: 'legacy-feedback-1' }],
        scannerFailures: [{ feedback_id: 'legacy-failure-1' }],
        scannerCorrections: [{ feedback_id: 'legacy-feedback-1', square: 'e4' }],
        playerAlbumEntitlements: [{ albumId: 'fixture-album', creditCost: 1 }],
        identityEnrollmentDecisions: [{ decision: 'APPROVED_NEW', reason: 'owner approved' }]
    };
    const calls = [];
    const db = { async rpc(name, args) {
        assert.equal(name, args.p_section === 'openingRepertoires'
            ? 'export_caissa_opening_repertoire_data_page'
            : scannerPublicSections.has(args.p_section)
                ? 'export_caissa_scanner_public_data_page'
                : supplementalSections.has(args.p_section)
                    ? 'export_caissa_account_supplemental_data_page'
                    : 'export_caissa_account_data_page');
        assert.equal(args.p_user_id, owner);
        assert.equal(args.p_binding_id, binding);
        assert.equal(args.p_snapshot_at, generatedAt.toISOString());
        assert.ok(args.p_limit >= 1 && args.p_limit <= 100);
        calls.push(args);
        if (args.p_section === 'account') return { data: [{ data: { id: owner, email: null } }], error: null };
        if (args.p_section === 'puzzleAttempts') {
            return { data: attempts.slice(args.p_offset, args.p_offset + args.p_limit).map(data => ({ data })), error: null };
        }
        if (['onlineGameCount', 'billingRecordCount'].includes(args.p_section)) {
            return { data: [{ data: 0 }], error: null };
        }
        if (args.p_section === 'openingRepertoires') {
            return { data: openingRows.slice(args.p_offset, args.p_offset + args.p_limit).map(data => ({ data })), error: null };
        }
        if (supplementalSections.has(args.p_section)) {
            return { data: supplementalRows[args.p_section]
                .slice(args.p_offset, args.p_offset + args.p_limit).map(data => ({ data })), error: null };
        }
        if (scannerPublicSections.has(args.p_section)) {
            return { data: scannerPublicRows[args.p_section]
                .slice(args.p_offset, args.p_offset + args.p_limit).map(data => ({ data })), error: null };
        }
        return { data: [], error: null };
    } };
    const observed = { bytes: 0, writes: 0, headers: {}, ended: false, chunks: [] };
    const res = response(observed);

    await streamAccountExport({ res, db, userId: owner, bindingId: binding, now: () => generatedAt });

    const serialized = observed.chunks.join('');
    const payload = JSON.parse(serialized);
    assert.ok(observed.bytes > 4.5 * 1024 * 1024);
    assert.equal(payload.schemaVersion, 'caissa.account-export.v1');
    assert.equal(payload.generatedAt, generatedAt.toISOString());
    assert.deepEqual(payload.account, { id: owner, email: null });
    assert.equal(payload.puzzleTraining.attempts.length, 5000);
    assert.deepEqual(payload.library, { positions: [], collections: [] });
    assert.deepEqual(payload.openingTrainer.repertoires, openingRows);
    assert.deepEqual(payload.identitySecurity.enrollmentDecisions, supplementalRows.identityEnrollmentDecisions);
    assert.deepEqual(payload.scanner, {
        scans: supplementalRows.scannerScans,
        feedback: supplementalRows.scannerFeedback,
        failures: supplementalRows.scannerFailures,
        corrections: supplementalRows.scannerCorrections,
        publicScans: scannerPublicRows.scannerPublicScans,
        publicFeedback: scannerPublicRows.scannerPublicFeedback,
        certifications: scannerPublicRows.scannerPublicCertifications,
        reviewEvents: scannerPublicRows.scannerPublicReviewEvents
    });
    assert.deepEqual(payload.online, { profile: null, ratings: [], gameCount: 0 });
    assert.match(payload.insights.contentNotice, /third-party data/);
    assert.equal(payload.economy.billingRecordCount, 0);
    assert.deepEqual(payload.economy.playerAlbumEntitlements, supplementalRows.playerAlbumEntitlements);
    assert.equal(res.statusCode, 200);
    assert.equal(observed.ended, true);
    assert.equal(observed.headers['X-CAISSA-Export-Schema'], 'caissa.account-export.v1');
    assert.ok(calls.filter(call => call.p_section === 'puzzleAttempts').length >= 51);
    assert.ok(calls.every(call => call.p_limit <= 100));
    assert.ok(calls.filter(call => scannerPublicSections.has(call.p_section)).every(call => call.p_limit <= 2));
    assert.ok(calls.filter(call => scannerLegacySections.has(call.p_section)).every(call => call.p_limit <= 2));
    assert.ok(calls.filter(call => call.p_section === 'openingRepertoires').every(call => call.p_limit <= 10));
    assert.ok(Buffer.byteLength(JSON.stringify(scannerPublicRows.scannerPublicScans)) < 4.5 * 1024 * 1024);
    assert.ok(Buffer.byteLength(JSON.stringify(openingRows)) < 4.5 * 1024 * 1024);
});

test('export aborts before an RPC beyond the aggregate request budget', async () => {
    const calls = [];
    const db = { async rpc(_name, args) {
        calls.push(args.p_section);
        if (['account', 'publicIdentity'].includes(args.p_section)) {
            return { data: [{ data: { id: owner } }], error: null };
        }
        return {
            data: Array.from({ length: args.p_limit }, (_, index) => ({ data: { index } })),
            error: null
        };
    } };
    const observed = { bytes: 0, writes: 0, headers: {}, ended: false, chunks: [] };

    await assert.rejects(streamAccountExport({
        res: response(observed),
        db,
        userId: owner,
        bindingId: binding,
        now: () => generatedAt,
        workLimits: { rpcCalls: 3, rows: 1_000, bodyBytes: 1_000_000 }
    }), error => error.code === 'CAISSA_ACCOUNT_EXPORT_WORK_BUDGET_EXCEEDED');

    assert.deepEqual(calls, ['account', 'publicIdentity', 'identityEnrollmentDecisions']);
    assert.equal(observed.ended, false);
    assert.equal(observed.destroyed?.code, 'CAISSA_ACCOUNT_EXPORT_WORK_BUDGET_EXCEEDED');
});

test('export rejects an aggregate row overflow before writing the offending page', async () => {
    const calls = [];
    const db = { async rpc(_name, args) {
        calls.push(args.p_section);
        return { data: [{ data: args.p_section === 'account'
            ? { id: owner } : { blockedSection: args.p_section } }], error: null };
    } };
    const observed = { bytes: 0, writes: 0, headers: {}, ended: false, chunks: [] };

    await assert.rejects(streamAccountExport({
        res: response(observed),
        db,
        userId: owner,
        bindingId: binding,
        now: () => generatedAt,
        workLimits: { rpcCalls: 10, rows: 1, bodyBytes: 1_000_000 }
    }), error => error.code === 'CAISSA_ACCOUNT_EXPORT_WORK_BUDGET_EXCEEDED');

    assert.deepEqual(calls, ['account', 'publicIdentity']);
    assert.equal(observed.chunks.join('').includes('publicIdentity'), true);
    assert.equal(observed.chunks.join('').includes('blockedSection'), false);
    assert.equal(observed.ended, false);
});

test('export rejects a body overflow before writing bytes beyond the ceiling', async () => {
    const db = { async rpc(_name, args) {
        if (args.p_section === 'account') {
            return { data: [{ data: { payload: 'A'.repeat(2_000) } }], error: null };
        }
        return { data: [], error: null };
    } };
    const observed = { bytes: 0, writes: 0, headers: {}, ended: false, chunks: [] };
    const bodyBytes = 256;

    await assert.rejects(streamAccountExport({
        res: response(observed),
        db,
        userId: owner,
        bindingId: binding,
        now: () => generatedAt,
        workLimits: { rpcCalls: 10, rows: 10, bodyBytes }
    }), error => error.code === 'CAISSA_ACCOUNT_EXPORT_WORK_BUDGET_EXCEEDED');

    assert.ok(observed.bytes <= bodyBytes);
    assert.equal(observed.chunks.join('').includes('A'.repeat(100)), false);
    assert.equal(observed.ended, false);
});

test('export fails closed before headers when the first owner-scoped page is rejected', async () => {
    const res = {
        headersSent: false,
        status() { throw new Error('status must not be called'); },
        setHeader() { throw new Error('headers must not be set'); },
        write() { throw new Error('body must not be written'); }
    };
    await assert.rejects(streamAccountExport({
        res,
        db: { rpc: async () => ({ data: null, error: { code: 'synthetic' } }) },
        userId: owner,
        bindingId: binding,
        now: () => generatedAt
    }), error => error.code === 'CAISSA_ACCOUNT_EXPORT_UPSTREAM_FAILED');
});

test('export honors response backpressure without duplicating a page', async () => {
    const observed = { bytes: 0, writes: 0, headers: {}, ended: false, chunks: [], drains: 0 };
    const res = response(observed, { backpressureOnce: true });
    const db = { async rpc(_name, args) {
        if (args.p_section === 'account') return { data: [{ data: { id: owner } }], error: null };
        if (['onlineGameCount', 'billingRecordCount'].includes(args.p_section)) return { data: [{ data: 0 }], error: null };
        return { data: [], error: null };
    } };
    await streamAccountExport({ res, db, userId: owner, bindingId: binding, now: () => generatedAt });
    assert.equal(JSON.parse(observed.chunks.join('')).account.id, owner);
    assert.equal(observed.drains, 1);
});

function response(observed, { backpressureOnce = false } = {}) {
    let blocked = backpressureOnce;
    return {
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { observed.headers[name] = value; },
        write(value) {
            const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
            observed.chunks.push(text);
            observed.bytes += Buffer.byteLength(text);
            observed.writes += 1;
            if (blocked) { blocked = false; return false; }
            return true;
        },
        once(event, callback) {
            if (event === 'drain') {
                observed.drains += 1;
                queueMicrotask(callback);
            }
            return this;
        },
        end() { observed.ended = true; },
        destroy(error) { observed.destroyed = error || true; }
    };
}
