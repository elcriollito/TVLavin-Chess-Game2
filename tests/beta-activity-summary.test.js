import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BETA_ACTIVITY_TARGET, emptyBetaActivitySummary, getBetaActivitySummary,
  normalizeBetaActivitySummary, reachedBetaMilestone
} from '../api/_lib/beta-activity-summary.js';
import { createScannerBetaLocalStore } from '../tools/scanner-beta-feedback/local-store.mjs';

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const timestamp = '2026-09-19T14:00:00.000Z';

function scan(scanId) {
  return { userId: userA, snapshot: { scanId, timestamp }, snapshotHash: scanId.padEnd(64, 'A'), metadata: {} };
}

function feedback(scanId, feedbackId, feedbackType, userId = userA) {
  return { userId, feedback: { scanId, feedbackId, feedbackType, createdAt: timestamp },
    payloadHash: feedbackId.padEnd(64, 'B') };
}

test('zero submissions produce the canonical 0 / 100 empty state', async () => {
  const raw = emptyBetaActivitySummary('scanner');
  assert.equal(raw.completed, 0);
  assert.equal(raw.target, 100);
  const summary = await getBetaActivitySummary(userA, 'scanner', async () => ({ ...raw }));
  assert.equal(summary.completedAllTime, 0);
  assert.equal(summary.milestone, null);
});

test('canonical aggregation counts every final disposition, attempts, pending work, and retries once per user', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caissa-beta-activity-'));
  try {
    const store = createScannerBetaLocalStore({ root });
    for (const scanId of ['scan-1', 'scan-2', 'scan-3', 'scan-4', 'scan-5']) {
      await store.putScan(scan(scanId));
    }
    const confirmed = feedback('scan-1', 'feedback-1', 'CONFIRMED_CORRECT');
    await store.putFeedback(confirmed);
    assert.deepEqual(await store.putFeedback(confirmed), { duplicate: true });
    await store.putFeedback(feedback('scan-2', 'feedback-2', 'PIECE_CORRECTION'));
    await store.putFeedback(feedback('scan-3', 'feedback-3', 'LOCALIZATION_FAILURE'));
    const failure = { userId: userA, failure: { scanId: 'scan-4', feedbackId: 'feedback-4',
      feedbackType: 'SCAN_FAILURE', createdAt: timestamp }, payloadHash: 'failure-4'.padEnd(64, 'C') };
    await store.putFailure(failure);
    assert.deepEqual(await store.putFailure(failure), { duplicate: true });

    await store.putScan({ ...scan('other-scan'), userId: userB });
    await store.putFeedback(feedback('other-scan', 'other-feedback', 'CONFIRMED_CORRECT', userB));

    const summary = normalizeBetaActivitySummary('scanner',
      await store.getBetaActivitySummary(userA, new Date('2026-09-19T18:00:00Z')));
    assert.deepEqual({ attempted: summary.attempted, completed: summary.completed,
      confirmedCorrect: summary.confirmedCorrect, corrected: summary.corrected,
      localizationFailures: summary.localizationFailures, scanFailures: summary.scanFailures,
      pending: summary.pending }, { attempted: 5, completed: 4, confirmedCorrect: 1, corrected: 1,
      localizationFailures: 1, scanFailures: 1, pending: 1 });
    assert.equal(summary.completedToday, 4);
    assert.equal(summary.completedThisWeek, 4);
    assert.equal(summary.completedAllTime, 4);

    const isolated = normalizeBetaActivitySummary('scanner',
      await store.getBetaActivitySummary(userB, new Date('2026-09-19T18:00:00Z')));
    assert.equal(isolated.attempted, 1);
    assert.equal(isolated.completed, 1);
    assert.equal(isolated.confirmedCorrect, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('milestones resolve exactly at 30, 50, and 100 completed submissions', () => {
  assert.equal(BETA_ACTIVITY_TARGET, 100);
  assert.equal(reachedBetaMilestone(29), null);
  assert.equal(reachedBetaMilestone(30)?.label, 'Minimum useful checkpoint reached');
  assert.equal(reachedBetaMilestone(50)?.label, 'Strong initial field sample');
  assert.equal(reachedBetaMilestone(100)?.label, 'Recommended first certification target reached');
  assert.equal(reachedBetaMilestone(120)?.value, 100);
});

test('summary normalization rejects inconsistent or non-canonical counts', () => {
  assert.throws(() => normalizeBetaActivitySummary('scanner', { completed: 1, completedAllTime: 1 }),
    /BETA_ACTIVITY_TOTAL_MISMATCH/);
  assert.throws(() => normalizeBetaActivitySummary('scanner', { attempted: -1 }), /BETA_ACTIVITY_COUNT_INVALID/);
});
