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

test('export preserves the v1 contract while every database response stays bounded below 4.5 MB', async () => {
    const attempts = Array.from({ length: 5000 }, (_, index) => ({
        id: `attempt-${String(index).padStart(5, '0')}`,
        payload: 'A'.repeat(1024)
    }));
    const scannerPublicRows = {
        scannerPublicScans: [{ scan_id: 'scan-public-1' }],
        scannerPublicFeedback: [{ feedback_id: 'feedback-public-1', payload: { feedbackType: 'SCAN_FAILURE' } }],
        scannerPublicCertifications: [{ id: 1, scope: 'submittedFeedback', action: 'HOLD' }],
        scannerPublicReviewEvents: [{ id: 2, scope: 'submittedFeedback', eventType: 'HELD' }]
    };
    const calls = [];
    const db = { async rpc(name, args) {
        assert.equal(name, scannerPublicSections.has(args.p_section)
            ? 'export_caissa_scanner_public_data_page'
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
        if (scannerPublicSections.has(args.p_section)) {
            return { data: scannerPublicRows[args.p_section].map(data => ({ data })), error: null };
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
    assert.deepEqual(payload.scanner, {
        scans: [],
        publicScans: scannerPublicRows.scannerPublicScans,
        publicFeedback: scannerPublicRows.scannerPublicFeedback,
        certifications: scannerPublicRows.scannerPublicCertifications,
        reviewEvents: scannerPublicRows.scannerPublicReviewEvents
    });
    assert.deepEqual(payload.online, { profile: null, ratings: [], gameCount: 0 });
    assert.equal(payload.economy.billingRecordCount, 0);
    assert.equal(res.statusCode, 200);
    assert.equal(observed.ended, true);
    assert.equal(observed.headers['X-CAISSA-Export-Schema'], 'caissa.account-export.v1');
    assert.ok(calls.filter(call => call.p_section === 'puzzleAttempts').length >= 51);
    assert.ok(calls.every(call => call.p_limit <= 100));
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
        end() { observed.ended = true; }
    };
}
