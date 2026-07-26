import { computeCompatibilityFingerprint } from './curated-pool-validator.js';
import { sha256Digest } from './curated-pool-integrity.js';
import { loadMultiMovePilot, MultiMovePilotController } from './multi-move-pilot.js';

export const ENDGAME_RUN_DESCRIPTOR = Object.freeze({
  runId: 'endgame-run-technical-two-item',
  runVersion: '1.0.0',
  url: '/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json',
  contentFingerprint: 'erun-fnv1a32-1a41792e',
  contentDigest: 'sha256-2c9166f00b04c6c7fcf8540c9388bfe9d1b27d56f21d17b7beead5c549724229'
});
const EXPECTED_ITEMS = Object.freeze([
  'kp-coordinate-support-promote@1.0.0',
  'rule-square-a-pawn-catch-stop-promotion@1.0.0'
]);
const ITEM_TERMINAL = new Set(['objective-success','objective-failure','technical-unavailable','item-error']);
const clone = value => structuredClone(value);

export function shouldActivateEndgameRun(search = '') {
  const params = new URLSearchParams(search);
  return params.get('trainerV2') === '1' && params.get('multiMovePilot') === '1' &&
    params.get('endgameRun') === '1' && !params.has('pilot') &&
    !['studyUnit','release','activity','reviewFrom','run','runId','fen','objective','items'].some(key => params.has(key));
}

export async function loadEndgameRun({ fetchImpl = fetch, cryptoImpl = globalThis.crypto } = {}) {
  const response = await fetchImpl(ENDGAME_RUN_DESCRIPTOR.url);
  if (!response.ok) throw new Error('run-unavailable');
  const artifact = await response.json();
  const { contentFingerprint, contentDigest, ...base } = artifact;
  const items = artifact.items?.map(item => `${item.itemId}@${item.itemVersion}`);
  if (artifact.runId !== ENDGAME_RUN_DESCRIPTOR.runId || artifact.runVersion !== ENDGAME_RUN_DESCRIPTOR.runVersion ||
      contentFingerprint !== ENDGAME_RUN_DESCRIPTOR.contentFingerprint || contentDigest !== ENDGAME_RUN_DESCRIPTOR.contentDigest ||
      computeCompatibilityFingerprint(base).replace('epool-', 'erun-') !== contentFingerprint ||
      await sha256Digest(base, cryptoImpl) !== contentDigest ||
      JSON.stringify(items) !== JSON.stringify(EXPECTED_ITEMS) || artifact.itemCount !== 2 ||
      artifact.orderPolicy !== 'fixed' || artifact.localOnly !== true || artifact.persistence !== 'none')
    throw new Error('run-integrity-failure');
  return Object.freeze(clone(artifact));
}

export class EndgameRunController {
  #fetch; #crypto; #delay; #onChange; #generation = 0; #itemController = null; #artifacts = [];
  #state = {
    runSessionSchemaVersion: '1.0.0', runId: ENDGAME_RUN_DESCRIPTOR.runId, runVersion: ENDGAME_RUN_DESCRIPTOR.runVersion,
    status: 'run-configured', generation: 0, currentItemIndex: 0, itemCount: 2, orderedItemIds: [...EXPECTED_ITEMS],
    itemResults: [], itemState: null, summary: null, started: false, completed: false, abandoned: false,
    technicalUnavailable: false
  };
  constructor({ fetchImpl = fetch, cryptoImpl = globalThis.crypto, delay = async () => {}, onChange = () => {} } = {}) {
    this.#fetch = fetchImpl; this.#crypto = cryptoImpl; this.#delay = delay; this.#onChange = onChange;
  }
  getState() { return Object.freeze(clone(this.#state)); }
  getItemController() { return this.#itemController; }
  #commit(patch) { this.#state = { ...this.#state, ...patch, generation: this.#generation }; this.#onChange(this.getState()); }
  async load() {
    if (this.#state.status !== 'run-configured') return false;
    const generation = ++this.#generation;
    this.#commit({ status: 'run-loading' });
    try {
      const run = await loadEndgameRun({ fetchImpl: this.#fetch, cryptoImpl: this.#crypto });
      const [promote, stop] = await Promise.all([
        loadMultiMovePilot({ fetchImpl: this.#fetch, cryptoImpl: this.#crypto }),
        loadMultiMovePilot({ fetchImpl: this.#fetch, cryptoImpl: this.#crypto,
          search: '?pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0' })
      ]);
      if (generation !== this.#generation) return false;
      this.#artifacts = [promote, stop];
      this.#commit({ status: 'run-ready', run, technicalUnavailable: false });
      return true;
    } catch {
      if (generation === this.#generation) this.#commit({
        status: 'run-technical-unavailable', technicalUnavailable: true, itemState: null
      });
      return false;
    }
  }
  async start() {
    if (this.#state.status !== 'run-ready') return false;
    this.#commit({ status: 'run-starting', started: true });
    return this.#activateItem(0);
  }
  async #activateItem(index) {
    const generation = this.#generation;
    const artifact = this.#artifacts[index];
    if (!artifact) return false;
    this.#itemController?.abandon();
    this.#itemController = new MultiMovePilotController({
      artifact, delay: this.#delay,
      onChange: itemState => {
        if (generation !== this.#generation || index !== this.#state.currentItemIndex) return;
        const terminal = ITEM_TERMINAL.has(itemState.phase);
        this.#commit({ status: terminal ? 'run-item-complete' : 'run-item-active', itemState });
      }
    });
    this.#commit({ status: 'run-transitioning', currentItemIndex: index, itemState: this.#itemController.getState() });
    await this.#itemController.start();
    return generation === this.#generation;
  }
  async submitMove(intent) { return this.#state.status === 'run-item-active' ? this.#itemController?.submitMove(intent) ?? false : false; }
  hint() { return this.#state.status === 'run-item-active' ? this.#itemController?.hint() ?? false : false; }
  retryItem() {
    if (this.#state.status !== 'run-item-complete') return false;
    const result = this.#itemController?.retry() ?? false;
    if (result) this.#commit({ status: 'run-item-active', itemState: this.#itemController.getState() });
    return result;
  }
  async continue() {
    if (this.#state.status !== 'run-item-complete') return false;
    const item = this.#state.itemState;
    const artifact = this.#artifacts[this.#state.currentItemIndex];
    const record = {
      itemId: `${artifact.pilotId}@${artifact.pilotVersion}`, objectiveId: `${artifact.objective.id}@${artifact.objective.version}`,
      outcome: item.result, hintsUsed: item.hintStage, independentEligible: item.independentEligible,
      completed: true, terminalReason: item.phase, moveCount: item.history.length
    };
    const itemResults = [...this.#state.itemResults, record];
    this.#commit({ status: 'run-item-feedback', itemResults });
    if (this.#state.currentItemIndex + 1 < this.#state.itemCount) return this.#activateItem(this.#state.currentItemIndex + 1);
    const count = outcome => itemResults.filter(item => item.outcome === outcome).length;
    const summary = {
      itemCount: itemResults.length,
      independentSuccessCount: count('independent-success'),
      hintAssistedSuccessCount: count('hint-assisted-success'),
      objectiveFailureCount: count('objective-failure'),
      objectiveMissWhileDrawingCount: count('objective-miss-while-drawing'),
      technicalUnavailableCount: count('technical-unavailable'),
      items: itemResults
    };
    this.#itemController = null;
    this.#commit({ status: 'run-summary', summary, completed: true, itemState: null });
    return true;
  }
  async retryRun() {
    if (this.#state.status !== 'run-summary') return false;
    ++this.#generation;
    this.#commit({ status: 'run-retrying', currentItemIndex: 0, itemResults: [], summary: null,
      completed: false, abandoned: false, technicalUnavailable: false });
    return this.#activateItem(0);
  }
  exit() {
    if (['run-abandoned','run-summary'].includes(this.#state.status) && this.#state.abandoned) return false;
    ++this.#generation; this.#itemController?.abandon(); this.#itemController = null; this.#artifacts = [];
    this.#commit({ status: 'run-abandoned', itemResults: [], itemState: null, summary: null, abandoned: true });
    return true;
  }
  dispose() { return this.exit(); }
}
