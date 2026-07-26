import { ChessRulesFacade } from '../chess-rules-facade.js';
import { computeCompatibilityFingerprint } from './curated-pool-validator.js';
import { sha256Digest } from './curated-pool-integrity.js';

export const PILOT_DESCRIPTOR = Object.freeze({
  pilotId: 'kp-coordinate-support-promote', pilotVersion: '1.0.0',
  url: '/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json',
  contentFingerprint: 'epilot-fnv1a32-f5f5df1f',
  contentDigest: 'sha256-076a58b2983d66d7f8035ebfb2b52946cb88e92c444cb59bafc9c140455117c6'
});
export const STOP_PROMOTION_PILOT_DESCRIPTOR = Object.freeze({
  pilotId: 'rule-square-a-pawn-catch-stop-promotion', pilotVersion: '1.0.0',
  url: '/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json',
  contentFingerprint: 'epilot-fnv1a32-52fddf30',
  contentDigest: 'sha256-d0e482faf45c08a10db2d98f0328a2639292107c6ecf68ac56adf00505745f22'
});
const DESCRIPTORS = new Map([
  [`${PILOT_DESCRIPTOR.pilotId}@${PILOT_DESCRIPTOR.pilotVersion}`, PILOT_DESCRIPTOR],
  [`${STOP_PROMOTION_PILOT_DESCRIPTOR.pilotId}@${STOP_PROMOTION_PILOT_DESCRIPTOR.pilotVersion}`, STOP_PROMOTION_PILOT_DESCRIPTOR]
]);
const OBJECTIVES = new Set(['promote@1.0.0', 'stop-promotion@1.0.0']);
const TERMINAL = new Set(['objective-success','objective-failure','technical-unavailable','item-abandoned','item-error']);
const clone = value => structuredClone(value);

export function shouldActivateMultiMovePilot(search = '') {
  const params = new URLSearchParams(search);
  const selector = params.get('pilot');
  return params.get('trainerV2') === '1' && params.get('multiMovePilot') === '1' &&
    !params.has('endgameRun') &&
    (!selector || DESCRIPTORS.has(selector)) &&
    !['studyUnit','release','activity','reviewFrom'].some(key => params.has(key));
}

export function resolveMultiMovePilotDescriptor(search = '') {
  const selector = new URLSearchParams(search).get('pilot');
  return selector ? DESCRIPTORS.get(selector) ?? null : PILOT_DESCRIPTOR;
}

export async function loadMultiMovePilot({ fetchImpl = fetch, cryptoImpl = globalThis.crypto, search = '' } = {}) {
  const descriptor = resolveMultiMovePilotDescriptor(search);
  if (!descriptor) throw new Error('pilot-not-allowed');
  const response = await fetchImpl(descriptor.url);
  if (!response.ok) throw new Error('pilot-unavailable');
  const artifact = await response.json();
  const { contentFingerprint, contentDigest, ...base } = artifact;
  if (artifact.pilotId !== descriptor.pilotId || artifact.pilotVersion !== descriptor.pilotVersion ||
      contentFingerprint !== descriptor.contentFingerprint ||
      contentDigest !== descriptor.contentDigest ||
      computeCompatibilityFingerprint(base).replace('epool-', 'epilot-') !== contentFingerprint ||
      await sha256Digest(base, cryptoImpl) !== contentDigest ||
      artifact.opponentPolicy?.runtimeNetworkRequired !== false ||
      artifact.branches?.length !== 2 ||
      !OBJECTIVES.has(`${artifact.objective?.id}@${artifact.objective?.version}`)) throw new Error('pilot-integrity-failure');
  return Object.freeze(clone(artifact));
}

export class MultiMovePilotController {
  #artifact; #onChange; #delay; #generation = 0; #pending = false;
  #state;
  constructor({ artifact, onChange = () => {}, delay = async () => {} } = {}) {
    if (!artifact || !DESCRIPTORS.has(`${artifact.pilotId}@${artifact.pilotVersion}`) ||
        !OBJECTIVES.has(`${artifact.objective?.id}@${artifact.objective?.version}`)) throw new TypeError('invalid-pilot');
    this.#artifact = artifact; this.#onChange = onChange; this.#delay = delay;
    this.#state = this.#fresh('item-configured');
  }
  #fresh(phase) { return { phase, fen: this.#artifact.initialFen, branchId: null, nodeIndex: 0, ply: 0,
    history: [], hintStage: 0, independentEligible: true, feedback: '', result: null, lastMove: null }; }
  getState() { return Object.freeze(clone(this.#state)); }
  #commit(patch) { this.#state = { ...this.#state, ...patch }; this.#onChange(this.getState()); }
  async start() {
    if (this.#state.phase !== 'item-configured') return false;
    this.#commit({ phase: 'item-loading' }); const generation = ++this.#generation;
    await Promise.resolve();
    if (generation !== this.#generation) return false;
    this.#commit({ phase: 'learner-turn', feedback: `White to move. ${this.#artifact.objective.label}.` }); return true;
  }
  async submitMove(intent) {
    if (this.#state.phase !== 'learner-turn' || this.#pending) return false;
    this.#pending = true; const generation = this.#generation;
    try {
      this.#commit({ phase: 'learner-move-validating' });
      const rules = ChessRulesFacade.fromFen(this.#state.fen);
      let played;
      try { played = rules.move({ from: intent.from, to: intent.to, promotion: intent.promotion || undefined }); }
      catch { this.#commit({ phase: 'learner-turn', feedback: 'That move is not legal.' }); return false; }
      const uci = played.lan;
      const approvedBranch = this.#state.branchId
        ? this.#artifact.branches.find(item => item.branchId === this.#state.branchId)
        : this.#artifact.branches.find(item => item.nodes[0].approvedLearnerMove.uci === uci);
      const branch = approvedBranch ?? (!this.#state.branchId ? this.#artifact.branches[0] : null);
      const node = branch?.nodes[this.#state.nodeIndex];
      const classification = node?.deviationClassifications?.[uci];
      if (!node || !classification) {
        this.#commit({ phase: 'technical-unavailable', feedback: this.#artifact.feedback.technical, result: 'technical-unavailable' });
        return false;
      }
      if (classification === 'authored-concept-miss') {
        this.#commit({ phase: 'learner-turn', feedback: this.#artifact.feedback.conceptMiss }); return false;
      }
      if (classification === 'objective-failure') {
        this.#commit({ phase: 'objective-failure', feedback: this.#artifact.feedback.failure, result: 'objective-failure' }); return true;
      }
      if (classification === 'objective-miss-while-drawing') {
        this.#commit({ phase: 'objective-failure', feedback: this.#artifact.feedback.objectiveMissWhileDrawing,
          result: 'objective-miss-while-drawing' }); return true;
      }
      if (!approvedBranch) throw new Error('approved-branch-missing');
      const history = [...this.#state.history, { side: 'white', uci, san: played.san }];
      const learnerFen = rules.fen(), ply = this.#state.ply + 1;
      this.#commit({ phase: 'objective-evaluating', fen: learnerFen, branchId: approvedBranch.branchId, history, ply,
        lastMove: { from: intent.from, to: intent.to, promotion: intent.promotion, flags: played.flags } });
      const objectiveSuccess = this.#artifact.objective.id === 'promote'
        ? uci.endsWith('q')
        : played.captured === 'p';
      if (objectiveSuccess) {
        this.#commit({ phase: 'objective-success', feedback: this.#artifact.feedback.success,
          result: this.#state.independentEligible ? 'independent-success' : 'hint-assisted-success' });
        return true;
      }
      if (ply >= this.#artifact.objective.maximumPly) {
        this.#commit({ phase: 'objective-failure', feedback: this.#artifact.feedback.failure, result: 'objective-failure' }); return true;
      }
      if (!node.opponentReply) throw new Error('opponent-reply-missing');
      this.#commit({ phase: 'opponent-evaluating', feedback: this.#artifact.feedback.progress });
      await this.#delay();
      if (generation !== this.#generation) return false;
      this.#commit({ phase: 'opponent-moving' });
      const opponentRules = ChessRulesFacade.fromFen(learnerFen);
      const reply = opponentRules.move(node.opponentReply.uci);
      if (reply.san !== node.opponentReply.san || opponentRules.fen() !== node.opponentReply.resultingFen)
        throw new Error('opponent-reply-invalid');
      if (this.#artifact.objective.id === 'stop-promotion' && reply.promotion) {
        this.#commit({ phase: 'objective-failure', fen: opponentRules.fen(), ply: ply + 1,
          history: [...history, { side: 'black', uci: reply.lan, san: reply.san }],
          feedback: this.#artifact.feedback.objectiveMissWhileDrawing ?? this.#artifact.feedback.failure,
          result: 'objective-failure', lastMove: { from: reply.from, to: reply.to, promotion: reply.promotion, flags: reply.flags } });
        return true;
      }
      this.#commit({ phase: 'learner-turn', fen: opponentRules.fen(), nodeIndex: this.#state.nodeIndex + 1,
        ply: ply + 1, history: [...history, { side: 'black', uci: reply.lan, san: reply.san }],
        feedback: `${this.#artifact.feedback.opponent} White to move.`,
        lastMove: { from: reply.from, to: reply.to, flags: reply.flags } });
      return true;
    } catch {
      if (generation === this.#generation) this.#commit({ phase: 'technical-unavailable',
        feedback: this.#artifact.feedback.technical, result: 'technical-unavailable' });
      return false;
    } finally { this.#pending = false; }
  }
  hint() {
    if (this.#state.phase !== 'learner-turn') return false;
    const stage = Math.min(3, this.#state.hintStage + 1);
    const branch = this.#state.branchId && this.#artifact.branches.find(item => item.branchId === this.#state.branchId);
    const initialMoves = this.#artifact.branches.map(item => item.firstMove).join(' or ');
    const reveal = stage === 3 ? ` Next move: ${branch?.nodes[this.#state.nodeIndex]?.approvedLearnerMove.san ?? initialMoves}.` : '';
    this.#commit({ hintStage: stage, independentEligible: stage < 3 && this.#state.independentEligible,
      feedback: `${this.#artifact.hints[stage - 1]}${reveal}` }); return true;
  }
  retry() {
    if (!TERMINAL.has(this.#state.phase)) return false;
    this.#generation += 1; this.#pending = false;
    this.#state = this.#fresh('learner-turn'); this.#state.feedback = this.#artifact.feedback.retry;
    this.#onChange(this.getState()); return true;
  }
  abandon() {
    if (TERMINAL.has(this.#state.phase)) return false;
    this.#generation += 1; this.#commit({ phase: 'item-abandoned', result: 'abandoned', feedback: 'Pilot ended.' }); return true;
  }
}
