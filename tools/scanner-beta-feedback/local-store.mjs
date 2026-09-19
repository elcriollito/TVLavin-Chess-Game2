import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

const EMPTY = Object.freeze({ schemaVersion: 'caissa-scanner-beta-local-store/2', scans: [], feedback: [], failures: [] });

async function readState(path) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (value?.schemaVersion === 'caissa-scanner-beta-local-store/1'
        && Array.isArray(value.scans) && Array.isArray(value.feedback)) {
      return { ...value, schemaVersion: EMPTY.schemaVersion, failures: [] };
    }
    if (value?.schemaVersion !== EMPTY.schemaVersion || !Array.isArray(value.scans)
        || !Array.isArray(value.feedback) || !Array.isArray(value.failures)) {
      throw new Error('LOCAL_STORE_CORRUPT');
    }
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY);
    throw error;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}

export function defaultScannerBetaRoot(repoRoot = process.cwd()) {
  return resolve(repoRoot, '..', 'caissa_scanner_beta_feedback_v0_1');
}

export function createScannerBetaLocalStore({ root = defaultScannerBetaRoot(), statePath = null } = {}) {
  root = resolve(root);
  statePath ||= join(root, 'feedback-store.json');
  let serial = Promise.resolve();
  const mutate = (operation) => {
    const result = serial.then(async () => {
      const state = await readState(statePath);
      const value = await operation(state);
      await atomicWrite(statePath, state);
      return value;
    });
    serial = result.catch(() => {});
    return result;
  };
  return Object.freeze({
    root,
    statePath,
    async putScan({ snapshot, snapshotHash, metadata }) {
      return mutate((state) => {
        const prior = state.scans.find((item) => item.scanId === snapshot.scanId);
        if (prior) {
          if (prior.snapshotHash !== snapshotHash) throw new Error('SNAPSHOT_IMMUTABLE_CONFLICT');
          return { duplicate: true };
        }
        state.scans.push({ scanId: snapshot.scanId, snapshotHash, snapshot, metadata,
          imageStorageReference: metadata?.imageStorageReference || null, createdAt: snapshot.timestamp });
        return { duplicate: false };
      });
    },
    async getScan(scanId) {
      const state = await readState(statePath);
      return state.scans.find((item) => item.scanId === scanId) || null;
    },
    async putFeedback({ feedback, payloadHash }) {
      return mutate((state) => {
        const prior = state.feedback.find((item) => item.feedbackId === feedback.feedbackId);
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new Error('FEEDBACK_ID_CONFLICT');
          return { duplicate: true };
        }
        const forScan = state.feedback.find((item) => item.feedback.scanId === feedback.scanId);
        if (forScan) {
          if (forScan.payloadHash === payloadHash) return { duplicate: true };
          throw new Error('SCAN_FEEDBACK_CONFLICT');
        }
        state.feedback.push({ feedbackId: feedback.feedbackId, payloadHash, feedback });
        return { duplicate: false };
      });
    },
    async putFailure({ failure, payloadHash }) {
      return mutate((state) => {
        const prior = state.failures.find((item) => item.feedbackId === failure.feedbackId || item.scanId === failure.scanId);
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new Error('SCAN_FAILURE_ID_CONFLICT');
          return { duplicate: true };
        }
        state.failures.push({ feedbackId: failure.feedbackId, scanId: failure.scanId, payloadHash, failure });
        return { duplicate: false };
      });
    },
    async putImage({ imageHash, bytes, contentType }) {
      const extension = contentType === 'image/png' ? '.png' : contentType === 'image/webp' ? '.webp' : '.jpg';
      if (!['.png', '.webp', '.jpg'].includes(extname(`x${extension}`))) throw new Error('IMAGE_TYPE_INVALID');
      const directory = join(root, 'images', imageHash.slice(0, 2));
      const path = join(directory, `${imageHash}${extension}`);
      await mkdir(directory, { recursive: true });
      try { await writeFile(path, bytes, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return `external-file://${imageHash.slice(0, 2)}/${imageHash}${extension}`;
    },
    async allFeedback() {
      const state = await readState(statePath);
      return [...state.feedback.map((item) => item.feedback), ...state.failures.map((item) => item.failure)];
    },
    async state() { return readState(statePath); }
  });
}
