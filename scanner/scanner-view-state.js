(function (global) {
  'use strict';

  // CAISSA SCANNER VISUAL FREEZE: Phase 2C physically certified.
  // Preserve the four exclusive public views; see docs/CAISSA_SCANNER_VISUAL_FREEZE.md.
  const STATES = Object.freeze({
    CAPTURE: 'capture',
    READING: 'reading',
    REVIEW_EDIT: 'review_edit',
    WORKSPACE: 'workspace'
  });
  const ALLOWED = Object.freeze({
    [STATES.CAPTURE]: Object.freeze([STATES.READING]),
    [STATES.READING]: Object.freeze([STATES.CAPTURE, STATES.REVIEW_EDIT, STATES.WORKSPACE]),
    [STATES.REVIEW_EDIT]: Object.freeze([STATES.CAPTURE, STATES.WORKSPACE]),
    [STATES.WORKSPACE]: Object.freeze([STATES.CAPTURE, STATES.READING, STATES.REVIEW_EDIT])
  });
  let view = STATES.CAPTURE;
  let context = Object.freeze({ reason: 'initial-entry' });
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({ view, context });
  }

  function emit() {
    const value = snapshot();
    listeners.forEach((listener) => listener(value));
    return value;
  }

  function transition(next, details = {}) {
    if (!Object.values(STATES).includes(next)) return false;
    if (next !== view && !ALLOWED[view].includes(next)) return false;
    view = next;
    context = Object.freeze({ ...details });
    return emit();
  }

  function reset(details = { reason: 'reset' }) {
    view = STATES.CAPTURE;
    context = Object.freeze({ ...details });
    return emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  global.CaissaScannerViewState = Object.freeze({ STATES, snapshot, transition, reset, subscribe });
})(window);
