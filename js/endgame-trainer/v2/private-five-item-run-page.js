import { ChessRulesFacade } from '../chess-rules-facade.js';
import { EndgameBoardView } from '../endgame-board-view.js';
import { PrivateFiveItemRunController } from './private-five-item-run.js';

let mounted;
const text = (root, selector, value) => { const node = root.querySelector(selector); if (node) node.textContent = value; };
const action = (root, name, show, label) => {
  const node = root.querySelector(`[data-v2-action="${name}"]`);
  if (node) { node.hidden = !show; if (label) node.textContent = label; }
};
const installNoIndex = doc => {
  let robots = doc.querySelector('meta[name="robots"]');
  if (!robots) { robots = doc.createElement('meta'); robots.name = 'robots'; doc.head.appendChild(robots); }
  robots.content = 'noindex,nofollow';
  doc.querySelector('link[rel="canonical"]')?.remove();
};

export function mountPrivateFiveItemRunPage({ document: doc = globalThis.document, window: win = globalThis } = {}) {
  if (mounted) return mounted;
  installNoIndex(doc);
  const root = doc.querySelector('[data-endgame-trainer-page]'), element = root.querySelector('[data-board]');
  const abort = new AbortController(), search = win.location?.search ?? '';
  root.classList.add('is-v2','is-multi-move-pilot','is-endgame-run','is-private-five-item-run');
  root.querySelector('[data-endgame-v2-shell]').hidden = false;
  root.querySelectorAll('[data-v2-score],[data-v2-streak],[data-v2-time]').forEach(node => {
    const metric = node.closest('span'); metric.hidden = true; metric.style.display = 'none';
  });
  root.querySelector('[data-v2-open-modes]')?.setAttribute('hidden','');
  text(root,'#endgame-v2-title','Private technical run');
  text(root,'.endgame-v2__disclosure','5 exercises. No saved progress.');
  text(root,'[data-v2-objective]','Five-item private run');
  root.querySelector('[data-v2-objective]')?.setAttribute('tabindex','-1');
  text(root,'[data-v2-item-label]','Run loading · 5 fixed exercises');
  const summary = root.querySelector('[data-v2-summary]'); summary.hidden = true;
  summary.querySelector('dl').hidden = true;
  const legacyActions = summary.querySelector(':scope > div');
  if (legacyActions) { legacyActions.hidden = true; legacyActions.style.display = 'none'; }
  let list = summary.querySelector('[data-private-run-summary-list]');
  if (!list) { list = doc.createElement('ol'); list.dataset.privateRunSummaryList = ''; summary.insertBefore(list, summary.querySelector(':scope > div')); }
  action(root,'start',false,'Start Run'); action(root,'hint',false); action(root,'continue',false);
  action(root,'retry',false); action(root,'skip',false,'Restart Run'); action(root,'abandon',true,'Exit');

  let controller;
  const board = new EndgameBoardView({
    element, rulesFactory: fen => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
    onMove: intent => controller?.submitMove(intent) ?? false,
    onError: () => text(root,'[data-v2-feedback]','That move could not be submitted.'),
    options: { label: 'Private five-item Endgame Run board' }
  }).initialize();
  board.setInteractive(false);

  const render = state => {
    const item = state.itemState, artifact = controller?.getCurrentArtifact();
    if (item?.fen && board.getPosition() !== item.fen) board.setPosition(item.fen,item.lastMove);
    board.setInteractive(state.status === 'active' && item?.phase === 'learner-turn');
    const binding = state.manifest?.orderedItems?.[state.currentItemIndex];
    if (binding) text(root,'[data-v2-objective]',binding.title);
    text(root,'[data-v2-progress]',state.status === 'run-success' ? '5 / 5' : `${state.currentItemIndex + 1} / 5`);
    text(root,'[data-v2-item-label]',state.status === 'run-success' ? 'Run complete · 5 of 5 exercises completed' :
      `Exercise ${state.currentItemIndex + 1} of 5${artifact?.learnerSide ? ` · ${artifact.learnerSide} to move` : ''}`);
    const feedback = state.status === 'ready' ? 'Five approved exercises are ready in fixed order.' :
      state.status === 'technical-unavailable' ? 'The current exercise is technically unavailable. This is not learner failure.' :
      state.status === 'item-success' ? `Exercise complete. Continue to Exercise ${state.currentItemIndex + 2}.` :
      state.status === 'run-success' ? 'Run complete. 5 of 5 exercises completed.' :
      item?.feedback ?? 'Loading the private technical run.';
    text(root,'[data-v2-feedback]',feedback);
    action(root,'start',state.status === 'ready','Start Run');
    action(root,'hint',state.status === 'active' && item?.phase === 'learner-turn','Hint');
    action(root,'continue',state.status === 'item-success',state.currentItemIndex === 4 ? 'Complete Run' : `Continue to Exercise ${state.currentItemIndex + 2}`);
    action(root,'retry',['item-terminal','technical-unavailable'].includes(state.status),
      state.status === 'technical-unavailable' ? 'Retry Current Exercise' : 'Retry');
    action(root,'skip',state.runStarted && !['run-success','aborted'].includes(state.status),'Restart Run');
    action(root,'abandon',state.status !== 'aborted','Exit');
    summary.hidden = state.status !== 'run-success';
    if (!summary.hidden) {
      text(root,'#v2-summary-title','Run complete');
      text(root,'.endgame-v2__summary > p',`5 of 5 exercises completed · Independent completion: ${state.summary.independentCompletion ? 'yes' : 'no'}`);
      list.replaceChildren(...state.summary.items.map(entry => {
        const li = doc.createElement('li'); li.textContent = `${entry.title} — completed`; return li;
      }));
      summary.setAttribute('aria-live','polite');
      summary.querySelector('h2')?.focus?.();
    }
    root.dataset.state = `private-run-${state.status}`;
  };

  controller = new PrivateFiveItemRunController({
    fetchImpl: win.fetch.bind(win), onChange: render,
    delay: () => new Promise(resolve => win.setTimeout(resolve,win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180))
  });
  mounted = { root, board, controller, abort };
  render(controller.getState()); controller.load(search);
  root.querySelector('[data-v2-action="start"]').addEventListener('click',()=>controller.start(),{signal:abort.signal});
  root.querySelector('[data-v2-action="hint"]').addEventListener('click',()=>controller.hint(),{signal:abort.signal});
  root.querySelector('[data-v2-action="continue"]').addEventListener('click',async()=>{
    const previous=controller.getState().currentItemIndex;
    if(await controller.continue() && controller.getState().currentItemIndex!==previous)root.querySelector('[data-v2-objective]')?.focus();
  },{signal:abort.signal});
  root.querySelector('[data-v2-action="retry"]').addEventListener('click',()=>{
    controller.getState().status==='technical-unavailable'?controller.retryTechnical(search):controller.retryCurrent();
  },{signal:abort.signal});
  root.querySelector('[data-v2-action="skip"]').addEventListener('click',()=>controller.restart(),{signal:abort.signal});
  root.querySelector('[data-v2-action="abandon"]').addEventListener('click',()=>{
    controller.exit(); win.location.assign('/endgame-trainer?trainerV2=1');
  },{signal:abort.signal});
  return mounted;
}

export function unmountPrivateFiveItemRunPage() {
  if (!mounted) return false;
  mounted.abort.abort(); mounted.controller.exit(); mounted.board.dispose(); mounted = null; return true;
}
