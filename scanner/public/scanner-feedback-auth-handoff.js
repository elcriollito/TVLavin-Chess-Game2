(function (global) {
  'use strict';

  const STORAGE_KEY = 'caissa:scanner:feedback-auth-handoff:v1';
  const VERSION = 'caissa-scanner-feedback-auth-handoff/1';
  const RETURN_PATH = '/scanner?feedback_return=1';
  const MAX_AGE_MS = 20 * 60 * 1000;
  const MAX_SERIALIZED_BYTES = 192 * 1024;

  function jsonClone(value) {
    if (value === null || value === undefined) return null;
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_SERIALIZED_BYTES) throw new Error('feedback-handoff-too-large');
    return JSON.parse(serialized);
  }

  function validString(value, maximum) {
    return typeof value === 'string' && value.length > 0 && value.length <= maximum;
  }

  function createDraft(input, now = Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const shareResults = input.shareResults === true;
    const shareImage = input.shareImage === true;
    if (!shareResults && !shareImage) return null;
    if (!validString(input.reviewedFen, 160) || !validString(input.feedbackType, 64)) return null;
    if (!input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot)) return null;
    const draft = {
      version: VERSION,
      createdAt: now,
      reviewedFen: input.reviewedFen,
      feedbackType: input.feedbackType,
      continueToAnalysis: input.continueToAnalysis === true,
      shareResults,
      shareImage,
      captureType: validString(input.captureType, 64) ? input.captureType : null,
      snapshot: jsonClone(input.snapshot),
      orientationInference: jsonClone(input.orientationInference),
      orientationCorrectionApplied: input.orientationCorrectionApplied === true,
      userOrientationOverride: input.userOrientationOverride === true,
      selectedCanonicalOrientation: ['white-bottom', 'black-bottom'].includes(input.selectedCanonicalOrientation)
        ? input.selectedCanonicalOrientation : 'white-bottom',
      ownerUserId: validString(input.ownerUserId, 256) ? input.ownerUserId : null,
      photoReselectionRequired: shareImage
    };
    const serialized = JSON.stringify(draft);
    if (serialized.length > MAX_SERIALIZED_BYTES) throw new Error('feedback-handoff-too-large');
    return Object.freeze(draft);
  }

  function validDraft(value, now = Date.now()) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && value.version === VERSION
      && Number.isFinite(value.createdAt)
      && value.createdAt <= now
      && now - value.createdAt <= MAX_AGE_MS
      && validString(value.reviewedFen, 160)
      && validString(value.feedbackType, 64)
      && (value.shareResults === true || value.shareImage === true)
      && value.snapshot && typeof value.snapshot === 'object' && !Array.isArray(value.snapshot)
      && (value.ownerUserId === null || validString(value.ownerUserId, 256))
      && ['white-bottom', 'black-bottom'].includes(value.selectedCanonicalOrientation));
  }

  function save(storage, draft) {
    if (!storage || !validDraft(draft)) return false;
    const serialized = JSON.stringify(draft);
    if (serialized.length > MAX_SERIALIZED_BYTES) return false;
    storage.setItem(STORAGE_KEY, serialized);
    return true;
  }

  function load(storage, now = Date.now()) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw || raw.length > MAX_SERIALIZED_BYTES) {
        if (raw) storage.removeItem(STORAGE_KEY);
        return null;
      }
      const draft = JSON.parse(raw);
      if (!validDraft(draft, now)) {
        storage.removeItem(STORAGE_KEY);
        return null;
      }
      return Object.freeze(draft);
    } catch (_) {
      try { storage.removeItem(STORAGE_KEY); } catch {}
      return null;
    }
  }

  function clear(storage) {
    try { storage?.removeItem(STORAGE_KEY); return true; }
    catch (_) { return false; }
  }

  function returnPath(redirects) {
    return redirects?.sanitizeInternalRedirect?.(RETURN_PATH, '/scanner') || '/scanner';
  }

  function signInPath(redirects) {
    return '/signin?redirect_url=' + encodeURIComponent(returnPath(redirects));
  }

  global.CaissaScannerFeedbackAuthHandoff = Object.freeze({
    STORAGE_KEY,
    VERSION,
    MAX_AGE_MS,
    createDraft,
    validDraft,
    save,
    load,
    clear,
    returnPath,
    signInPath
  });
})(window);
