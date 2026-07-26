import { computeCompatibilityFingerprint, stableStringify } from './curated-pool-validator.js';
import { sha256Digest } from './curated-pool-integrity.js';
import { loadMultiMovePilot, MultiMovePilotController } from './multi-move-pilot.js';
import { PRIVATE_FIVE_ITEM_RUN_BASE } from './private-five-item-run-manifest.js';

export const PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR = Object.freeze({
  runId: 'five-item-private-endgame-run',
  runVersion: '1.0.0',
  contentFingerprint: 'eprivrun-fnv1a32-c4aafa8e',
  contentDigest: 'sha256-f50657b6f20b7f5bfd819ff9c32a84a0bf5e46ce6b4068dbb2fdea1f711e0fb9',
  canonicalByteLength: 2862
});
const MODE_KEYS = ['objectiveArtifact','endgameRun','privateEndgameRun'];
const ALLOWED_KEYS = new Set(['trainerV2','multiMovePilot','privateEndgameRun']);
const TERMINAL = new Set(['objective-success','objective-failure','technical-unavailable','item-error']);
const clone = value => structuredClone(value);
const itemKey = item => `${item.artifactId}@${item.artifactVersion}`;
const resolverSearch = Object.freeze({
  'kp-coordinate-support-promote@1.0.0': '',
  'rule-square-a-pawn-catch-stop-promotion@1.0.0': '?pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0',
  'convert-material-advantage@1.0.0': '?objectiveArtifact=convert-material-advantage@1.0.0',
  'hold-draw@1.0.0': '?objectiveArtifact=hold-draw@1.0.0',
  'activate-king@1.0.0': '?objectiveArtifact=activate-king@1.0.0'
});

export function shouldActivatePrivateFiveItemRun(search = '') {
  const params = new URLSearchParams(search);
  const modes = MODE_KEYS.filter(key => params.has(key)).length;
  return params.get('trainerV2') === '1' && params.get('multiMovePilot') === '1' &&
    (params.has('privateEndgameRun') || modes > 1) &&
    !['studyUnit','release','activity','reviewFrom'].some(key => params.has(key));
}

export function validatePrivateFiveItemRunSearch(search = '') {
  const params = new URLSearchParams(search);
  if ([...params.keys()].some(key => !ALLOWED_KEYS.has(key))) throw new Error('private-run-flags-invalid');
  if ([...ALLOWED_KEYS].some(key => params.getAll(key).length !== 1)) throw new Error('private-run-flags-invalid');
  if (params.get('trainerV2') !== '1' || params.get('multiMovePilot') !== '1' ||
      params.get('privateEndgameRun') !== 'five-item') throw new Error('private-run-flags-invalid');
  return true;
}

export async function validatePrivateFiveItemRunManifest(base, cryptoImpl = globalThis.crypto) {
  const expected = PRIVATE_FIVE_ITEM_RUN_BASE.orderedItems.map(itemKey);
  const actual = base?.orderedItems?.map(itemKey);
  if (base?.runId !== PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.runId ||
      base?.runVersion !== PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.runVersion ||
      base?.itemCount !== 5 || base?.orderedItems?.length !== 5 ||
      new Set(actual ?? []).size !== 5 || JSON.stringify(actual) !== JSON.stringify(expected) ||
      base?.persistencePolicy !== 'none' || base?.analyticsPolicy !== 'disabled' ||
      base?.runtimeEligibility !== 'private-flag-only' ||
      base?.completionPolicy !== 'all-five-items-must-reach-approved-success' ||
      computeCompatibilityFingerprint(base).replace('epool-', 'eprivrun-') !== PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.contentFingerprint ||
      await sha256Digest(base, cryptoImpl) !== PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.contentDigest ||
      new TextEncoder().encode(stableStringify(base)).byteLength !== PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.canonicalByteLength)
    throw new Error('private-run-integrity-failure');
  return true;
}

export async function loadPrivateFiveItemRun({
  fetchImpl = fetch, cryptoImpl = globalThis.crypto, search = ''
} = {}) {
  validatePrivateFiveItemRunSearch(search);
  const base = clone(PRIVATE_FIVE_ITEM_RUN_BASE);
  await validatePrivateFiveItemRunManifest(base, cryptoImpl);
  const artifacts = await Promise.all(base.orderedItems.map(async binding => {
    const selector = resolverSearch[itemKey(binding)];
    if (selector === undefined) throw new Error('private-run-item-not-allowed');
    const artifact = await loadMultiMovePilot({ fetchImpl, cryptoImpl, search: selector });
    const actualFingerprint = artifact.contentFingerprint ??
      computeCompatibilityFingerprint(artifact).replace('epool-', 'eobjective-');
    const actualDigest = artifact.contentDigest ?? await sha256Digest(artifact, cryptoImpl);
    if (artifact.pilotId !== binding.artifactId || artifact.pilotVersion !== binding.artifactVersion ||
        actualFingerprint !== binding.fingerprint || actualDigest !== binding.sha256 ||
        artifact.opponentPolicy?.runtimeNetworkRequired !== false ||
        (binding.approvalDigest && artifact.humanApprovalBinding?.digest !== binding.approvalDigest))
      throw new Error('private-run-item-integrity-failure');
    return artifact;
  }));
  return Object.freeze({ manifest: Object.freeze(base), artifacts: Object.freeze(artifacts) });
}

export class PrivateFiveItemRunController {
  #fetch; #crypto; #delay; #onChange; #generation = 0; #artifacts = []; #itemController = null;
  #state = {
    runSessionSchemaVersion: '1.0.0', runId: PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.runId,
    runVersion: PRIVATE_FIVE_ITEM_RUN_DESCRIPTOR.runVersion, status: 'idle', currentItemIndex: 0,
    itemCount: 5, completedItemIndexes: [], itemState: null, manifest: null, runStarted: false,
    runCompleted: false, runIndependentSuccessEligible: true, technicalUnavailable: false, summary: null
  };
  constructor({ fetchImpl = fetch, cryptoImpl = globalThis.crypto, delay = async () => {}, onChange = () => {} } = {}) {
    this.#fetch = fetchImpl; this.#crypto = cryptoImpl; this.#delay = delay; this.#onChange = onChange;
  }
  getState() { return Object.freeze(clone(this.#state)); }
  getItemController() { return this.#itemController; }
  getCurrentArtifact() { return this.#artifacts[this.#state.currentItemIndex] ? Object.freeze(clone(this.#artifacts[this.#state.currentItemIndex])) : null; }
  #commit(patch) { this.#state = { ...this.#state, ...patch }; this.#onChange(this.getState()); }
  async load(search) {
    if (this.#state.status !== 'idle') return false;
    const generation = ++this.#generation; this.#commit({ status: 'loading' });
    try {
      const loaded = await loadPrivateFiveItemRun({ fetchImpl: this.#fetch, cryptoImpl: this.#crypto, search });
      if (generation !== this.#generation) return false;
      this.#artifacts = [...loaded.artifacts];
      this.#commit({ status: 'ready', manifest: loaded.manifest, technicalUnavailable: false });
      return true;
    } catch {
      if (generation === this.#generation) this.#commit({ status: 'technical-unavailable', technicalUnavailable: true });
      return false;
    }
  }
  async start() {
    if (this.#state.status !== 'ready') return false;
    this.#commit({ runStarted: true });
    return this.#activateItem(0);
  }
  async #activateItem(index) {
    const generation = this.#generation, artifact = this.#artifacts[index];
    if (!artifact) return false;
    this.#itemController?.abandon();
    this.#itemController = new MultiMovePilotController({
      artifact, delay: this.#delay,
      onChange: itemState => {
        if (generation !== this.#generation || index !== this.#state.currentItemIndex) return;
        const success = itemState.phase === 'objective-success';
        const unavailable = itemState.phase === 'technical-unavailable';
        const failed = ['objective-failure','item-error'].includes(itemState.phase);
        this.#commit({ status: success ? 'item-success' : unavailable ? 'technical-unavailable' : failed ? 'item-terminal' : 'active',
          itemState, technicalUnavailable: unavailable,
          runIndependentSuccessEligible: this.#state.runIndependentSuccessEligible && itemState.independentEligible });
      }
    });
    this.#commit({ status: 'active', currentItemIndex: index, itemState: this.#itemController.getState(), technicalUnavailable: false });
    await this.#itemController.start();
    return generation === this.#generation;
  }
  submitMove(intent) { return this.#state.status === 'active' ? this.#itemController?.submitMove(intent) ?? false : false; }
  hint() {
    if (this.#state.status !== 'active') return false;
    const result = this.#itemController?.hint() ?? false;
    if (result) this.#commit({ runIndependentSuccessEligible:
      this.#state.runIndependentSuccessEligible && this.#itemController.getState().independentEligible });
    return result;
  }
  async continue() {
    if (this.#state.status !== 'item-success') return false;
    const completed = [...this.#state.completedItemIndexes, this.#state.currentItemIndex];
    if (completed.length === 5) {
      const items = this.#state.manifest.orderedItems.map((item,index) => ({ title: item.title, completed: completed.includes(index) }));
      this.#itemController = null;
      this.#commit({ status: 'run-success', completedItemIndexes: completed, runCompleted: true, itemState: null,
        summary: { completed: 5, itemCount: 5, independentCompletion: this.#state.runIndependentSuccessEligible, items } });
      return true;
    }
    this.#commit({ completedItemIndexes: completed });
    return this.#activateItem(this.#state.currentItemIndex + 1);
  }
  retryCurrent() {
    if (!['item-success','item-terminal','technical-unavailable'].includes(this.#state.status)) return false;
    if (this.#state.status === 'technical-unavailable') return this.#activateItem(this.#state.currentItemIndex);
    const result = this.#itemController?.retry() ?? false;
    if (result) this.#commit({ status: 'active', itemState: this.#itemController.getState(), technicalUnavailable: false });
    return result;
  }
  async retryTechnical(search) {
    if (this.#state.status !== 'technical-unavailable') return false;
    if (this.#artifacts.length) return this.#activateItem(this.#state.currentItemIndex);
    this.#state = { ...this.#state, status: 'idle', technicalUnavailable: false };
    return this.load(search);
  }
  async restart() {
    if (!this.#state.runStarted) return false;
    ++this.#generation;
    this.#commit({ status: 'restarting', currentItemIndex: 0, completedItemIndexes: [], itemState: null,
      runCompleted: false, runIndependentSuccessEligible: true, technicalUnavailable: false, summary: null });
    return this.#activateItem(0);
  }
  exit() {
    ++this.#generation; this.#itemController?.abandon(); this.#itemController = null; this.#artifacts = [];
    this.#commit({ status: 'aborted', completedItemIndexes: [], itemState: null, summary: null, runCompleted: false });
    return true;
  }
}
