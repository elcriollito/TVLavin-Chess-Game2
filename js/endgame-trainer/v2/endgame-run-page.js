import { ChessRulesFacade } from '../chess-rules-facade.js';
import { EndgameBoardView } from '../endgame-board-view.js';
import { EndgameRunController } from './endgame-run.js';

let mounted;
const text = (root, selector, value) => { const node = root.querySelector(selector); if (node) node.textContent = value; };
const action = (root, name, show, label) => {
  const node = root.querySelector(`[data-v2-action="${name}"]`);
  if (node) { node.hidden = !show; if (label) node.textContent = label; }
};
const terminal = state => state.status === 'run-item-complete';

export function mountEndgameRunPage({ document: doc = globalThis.document, window: win = globalThis } = {}) {
  if (mounted) return mounted;
  const root = doc.querySelector('[data-endgame-trainer-page]'), element = root.querySelector('[data-board]');
  const abort = new AbortController();
  root.classList.add('is-v2','is-multi-move-pilot','is-endgame-run');
  root.querySelector('[data-endgame-v2-shell]').hidden = false;
  root.querySelectorAll('[data-v2-score],[data-v2-streak],[data-v2-time]').forEach(node => {
    const metric = node.closest('span'); metric.hidden = true; metric.style.display = 'none';
  });
  text(root, '#endgame-v2-title', 'Endgame Run');
  text(root, '.endgame-v2__disclosure', 'Local technical session. Two verified objectives; no results are saved.');
  text(root, '[data-v2-objective]', 'Two-item technical run');
  root.querySelector('[data-v2-objective]')?.setAttribute('tabindex', '-1');
  text(root, '[data-v2-item-label]', 'Run loading · 2 fixed items');
  const modesButton = root.querySelector('[data-v2-open-modes]');
  if (modesButton) { modesButton.hidden = true; modesButton.style.display = 'none'; }
  action(root,'skip',false); action(root,'continue',false); action(root,'retry',false);
  action(root,'abandon',true,'Exit Run'); action(root,'hint',false); action(root,'start',false,'Start Run');
  const summary = root.querySelector('[data-v2-summary]'); summary.hidden = true;
  const legacySummaryActions = summary.querySelector(':scope > div');
  if (legacySummaryActions) { legacySummaryActions.hidden = true; legacySummaryActions.style.display = 'none'; }
  const summaryLabels = summary.querySelectorAll('dt');
  ['Items completed','Successful objectives','Independent successes','Hint-assisted successes',
    'Objective misses while drawing','Technical unavailable','Objective failures','Result scope','Timer']
    .forEach((label,index) => { if (summaryLabels[index]) summaryLabels[index].textContent = label; });
  let controller;
  const board = new EndgameBoardView({
    element, rulesFactory: fen => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
    onMove: intent => controller?.submitMove(intent) ?? false,
    onError: () => text(root,'[data-v2-feedback]','That move could not be submitted.'),
    options: { label: 'Endgame Run board' }
  }).initialize();
  board.setInteractive(false);

  const render = state => {
    const item = state.itemState;
    if (item?.fen && board.getPosition() !== item.fen) board.setPosition(item.fen, item.lastMove);
    board.setInteractive(state.status === 'run-item-active' && item?.phase === 'learner-turn');
    const artifact = controller?.getItemController()?.getState ? state.currentItemIndex : null;
    const labels = ['Promote the e-pawn','Stop the a-pawn'];
    const label = labels[state.currentItemIndex] ?? 'Two-item technical run';
    if (item) text(root,'[data-v2-objective]',label);
    text(root,'[data-v2-progress]',state.status === 'run-summary' ? '2 / 2' : `${state.currentItemIndex + 1} / 2`);
    text(root,'[data-v2-item-label]',state.status === 'run-summary' ? 'Run complete · 2 items' :
      `Item ${state.currentItemIndex + 1} of 2 · ${item?.phase === 'learner-turn' ? 'White to move' : state.status.replaceAll('-',' ')}`);
    const neutralUnavailable = state.status === 'run-technical-unavailable';
    const feedback = neutralUnavailable ? 'The run could not be verified. This is not learner failure.' :
      state.status === 'run-ready' ? 'Two verified technical objectives are ready in fixed order.' :
      state.status === 'run-summary' ? 'Run complete. Results existed only for this local session.' :
      item?.feedback ?? 'Loading the verified run.';
    text(root,'[data-v2-feedback]',feedback);
    action(root,'start',state.status === 'run-ready','Start Run');
    action(root,'hint',state.status === 'run-item-active' && item?.phase === 'learner-turn','Hint');
    action(root,'continue',terminal(state),item?.result === 'technical-unavailable' ? 'Skip Technical Item' : 'Continue');
    action(root,'retry',terminal(state) || state.status === 'run-summary',
      state.status === 'run-summary' ? 'Retry Run' : 'Retry Item');
    action(root,'abandon',true,'Exit Run');
    summary.hidden = state.status !== 'run-summary';
    if (!summary.hidden) {
      const s = state.summary;
      text(root,'#v2-summary-title','Run complete');
      summary.querySelector('dl').hidden = false;
      const values = [
        ['[data-v2-summary-completed]',s.itemCount],
        ['[data-v2-summary-successful]',s.independentSuccessCount + s.hintAssistedSuccessCount],
        ['[data-v2-summary-independent]',s.independentSuccessCount],
        ['[data-v2-summary-assisted]',s.hintAssistedSuccessCount],
        ['[data-v2-summary-skipped]',s.objectiveMissWhileDrawingCount],
        ['[data-v2-summary-unavailable]',s.technicalUnavailableCount],
        ['[data-v2-summary-score]',s.objectiveFailureCount],
        ['[data-v2-summary-streak]','Local only'],
        ['[data-v2-summary-time]','Not recorded']
      ];
      values.forEach(([selector,value]) => text(root,selector,String(value)));
      text(root,'.endgame-v2__summary > p',s.items.map((item,index)=>`Item ${index + 1}: ${item.outcome.replaceAll('-',' ')}`).join(' · '));
      summary.setAttribute('aria-live','polite');
    }
    root.dataset.state = state.status;
  };
  controller = new EndgameRunController({
    fetchImpl: win.fetch.bind(win), onChange: render,
    delay: () => new Promise(resolve => win.setTimeout(resolve,win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180))
  });
  mounted = { root, board, controller, abort };
  render(controller.getState());
  controller.load();
  root.querySelector('[data-v2-action="start"]').addEventListener('click',()=>controller.start(),{signal:abort.signal});
  root.querySelector('[data-v2-action="hint"]').addEventListener('click',()=>controller.hint(),{signal:abort.signal});
  root.querySelector('[data-v2-action="continue"]').addEventListener('click',async()=>{
    const previous = controller.getState().currentItemIndex;
    if (await controller.continue() && controller.getState().currentItemIndex !== previous)
      root.querySelector('[data-v2-objective]')?.focus();
  },{signal:abort.signal});
  root.querySelector('[data-v2-action="retry"]').addEventListener('click',()=>{
    controller.getState().status === 'run-summary' ? controller.retryRun() : controller.retryItem();
  },{signal:abort.signal});
  root.querySelector('[data-v2-action="abandon"]').addEventListener('click',()=>{
    controller.exit(); win.location.assign('/endgame-trainer?trainerV2=1');
  },{signal:abort.signal});
  return mounted;
}

export function unmountEndgameRunPage() {
  if (!mounted) return false;
  mounted.abort.abort(); mounted.controller.dispose(); mounted.board.dispose(); mounted = null;
  return true;
}
