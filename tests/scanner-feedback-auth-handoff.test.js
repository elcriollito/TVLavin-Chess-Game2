import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

function loadHandoff() {
  const window = {};
  vm.runInNewContext(read('scanner/public/scanner-feedback-auth-handoff.js'), { window, Date, JSON, Object });
  return window.CaissaScannerFeedbackAuthHandoff;
}

function storage() {
  const values = new Map();
  return {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); }
  };
}

function input(overrides = {}) {
  return {
    reviewedFen: '8/8/8/3k4/8/4K3/8/8 w - - 0 1',
    feedbackType: 'AUTO',
    continueToAnalysis: true,
    shareResults: true,
    shareImage: false,
    captureType: 'gallery',
    snapshot: { scanId: 'scan-1', imageHash: 'a'.repeat(64), predictedFEN: '8/8/8/3k4/8/4K3/8/8 w - - 0 1' },
    orientationInference: { recommendedOrientation: 'white-bottom' },
    selectedCanonicalOrientation: 'white-bottom',
    ...overrides
  };
}

test('handoff keeps only reviewed state and explicit choices for a short same-tab return', () => {
  const handoff = loadHandoff();
  const session = storage();
  const now = Date.now();
  const draft = handoff.createDraft({
    ...input({ shareImage: true }),
    sourceFile: { name: 'private.png' },
    photoBytes: 'data:image/png;base64,secret',
    accessToken: 'secret-token'
  }, now);
  assert.equal(handoff.save(session, draft), true);
  const serialized = session.getItem(handoff.STORAGE_KEY);
  assert.doesNotMatch(serialized, /private\.png|data:image|secret-token|photoBytes|sourceFile|accessToken/);
  const restored = handoff.load(session, now + 1);
  assert.equal(restored.reviewedFen, input().reviewedFen);
  assert.equal(restored.shareResults, true);
  assert.equal(restored.shareImage, true);
  assert.equal(restored.photoReselectionRequired, true);
});

test('handoff expires, rejects empty consent, and removes malformed storage', () => {
  const handoff = loadHandoff();
  assert.equal(handoff.createDraft(input({ shareResults: false, shareImage: false })), null);
  const session = storage();
  const draft = handoff.createDraft(input(), 5_000);
  handoff.save(session, draft);
  assert.equal(handoff.load(session, 5_000 + handoff.MAX_AGE_MS + 1), null);
  session.setItem(handoff.STORAGE_KEY, '{not-json');
  assert.equal(handoff.load(session), null);
  assert.equal(session.getItem(handoff.STORAGE_KEY), null);
});

test('return destination is fixed, internal, and cannot carry tokens or hostile origins', () => {
  const handoff = loadHandoff();
  const redirects = {
    sanitizeInternalRedirect(value, fallback) {
      return value.startsWith('/') && !value.startsWith('//') ? value : fallback;
    }
  };
  assert.equal(handoff.returnPath(redirects), '/scanner?feedback_return=1');
  const signIn = handoff.signInPath(redirects);
  assert.equal(signIn, '/signin?redirect_url=%2Fscanner%3Ffeedback_return%3D1');
  assert.doesNotMatch(signIn, /token|https?:|%2F%2F/i);
});

test('protected contribution requests use bearer auth while recognition remains public', () => {
  const client = read('scanner/public/scanner-public-client.js');
  assert.match(client, /Authorization: 'Bearer ' \+ token/);
  assert.match(client, /persistFeedbackScan[\s\S]*authenticated: true/);
  assert.match(client, /image-consent[\s\S]*authenticated: true/);
  assert.match(client, /scanner\/public\/feedback[\s\S]*authenticated: true/);
  assert.match(client, /recognizeCanonicalBoard[\s\S]*jsonRequest\('\/api\/scanner\/public\/recognize', \{ body: request, signal/);
});

test('scanner restores reviewed state but requires a new post-auth confirmation', () => {
  const app = read('scanner/scanner-app.js');
  assert.match(app, /restoreFeedbackHandoff\(\)/);
  assert.match(app, /selectedSourceFile = null/);
  assert.match(app, /Reselect the original photo/);
  assert.match(app, /Review them and confirm again before anything is submitted/);
  assert.match(app, /if \(feedbackNeedsReauthentication \|\| auth\?\.isSignedIn !== true\) \{\s*beginFeedbackSignIn\(\);\s*return;/);
});
