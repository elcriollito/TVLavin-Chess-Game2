import { ChessRulesFacade } from '../chess-rules-facade.js';
import { EndgameBoardView } from '../endgame-board-view.js';
import { PrivateFiveItemRunController } from './private-five-item-run.js';

let mounted;
const EXPERIENCE = Object.freeze([
  { title: 'Promote the Pawn', mission: 'Guide your passed pawn safely to promotion.' },
  { title: 'Stop the Pawn', mission: 'Catch the enemy pawn before it can promote.' },
  { title: 'Trade to Simplify', mission: 'Use the favorable pawn exchange, then activate your king.' },
  { title: 'Hold the Draw', mission: 'Keep the position balanced and protect the draw.' },
  { title: 'Activate the King', mission: 'Bring your king closer to the important squares.' }
]);
const text = (root, selector, value) => { const node = root.querySelector(selector); if (node && node.textContent !== value) node.textContent = value; };
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
const installPrivateStyles = doc => {
  if (doc.querySelector('[data-private-run-styles]')) return;
  const style=doc.createElement('style'); style.dataset.privateRunStyles='';
  style.textContent=`
.is-private-five-item-run .endgame-v2__objective{gap:.35rem}
.is-private-five-item-run [data-private-run-mission],.is-private-five-item-run [data-private-run-turn],.is-private-five-item-run [data-private-run-independence],.is-private-five-item-run [data-private-hint-progress]{margin:0}
.is-private-five-item-run [data-private-run-turn]{font-weight:800}
.is-private-five-item-run .endgame-v2__independence,.is-private-five-item-run [data-private-hint-progress]{color:var(--v2-muted);font-size:.92rem}
.is-private-five-item-run .endgame-v2__feedback-panel{grid-area:feedback;border-left:4px solid var(--v2-primary);padding:.8rem 1rem;background:#627fda12;border-radius:.45rem}
.is-private-five-item-run .endgame-v2__feedback-panel h3,.is-private-five-item-run .endgame-v2__feedback-panel p{margin:0 0 .35rem}
.is-private-five-item-run .endgame-v2__artifact-feedback{font-size:.9rem;color:var(--v2-muted)}
.is-private-five-item-run .endgame-v2__summary [data-private-run-summary-actions]{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}
.endgame-v2__decision-dialog{width:min(32rem,calc(100vw - 2rem));max-height:calc(100dvh - 1rem);overflow:auto;border:0;border-radius:.75rem;padding:1.25rem;color:#17213a}
.endgame-v2__decision-dialog::backdrop{background:rgba(0,0,0,.68)}
.endgame-v2__decision-dialog h2{margin-top:0}.endgame-v2__decision-dialog div{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.6rem}.endgame-v2__decision-dialog button{min-height:44px}
@media(max-width:680px){.endgame-v2__decision-dialog div{display:grid}.endgame-v2__decision-dialog{padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left))}}
@media(prefers-reduced-motion:reduce){.is-private-five-item-run *,.endgame-v2__decision-dialog *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}}`;
  doc.head.appendChild(style);
};
const add = (doc, parent, tag, dataset, before = null) => {
  let node = parent.querySelector(`[data-${dataset.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}]`);
  if (!node) { node = doc.createElement(tag); node.dataset[dataset] = ''; parent.insertBefore(node, before); }
  return node;
};
const progressExists = state => state.runStarted && (
  state.completedItemIndexes.length > 0 || state.currentItemIndex > 0 ||
  (state.itemState?.history?.length ?? 0) > 0 || (state.itemState?.hintStage ?? 0) > 0 ||
  !state.runIndependentSuccessEligible
);
const humanFeedback = (state, artifact) => {
  const exact = state.itemState?.feedback ?? '';
  if (state.status === 'ready') return ['Ready to begin', 'Five exercises are ready in a fixed order.', exact];
  if (state.status === 'technical-unavailable') return ['We could not verify this position', 'This is a technical issue, not a chess mistake. Your completed exercises in this session remain available in memory.', exact || 'The current exercise is technically unavailable.'];
  if (state.status === 'item-success') return ['Exercise complete', state.currentItemIndex === 4 ? 'The final exercise is complete.' : 'Your progress is safe for this run. Continue when ready.', exact];
  if (state.status === 'run-success') return ['Run complete', 'You completed all five exercises.', ''];
  if (state.itemState?.phase === 'opponent-moving' || state.itemState?.phase === 'opponent-evaluating') return ['Black is moving…', 'Please wait for the authored reply.', exact];
  if (state.status === 'item-terminal') return ['The result changed', 'This move gives up the win or the draw. Retry the position when ready.', exact];
  const feedback = artifact?.feedback ?? {};
  const lastMove=state.itemState?.history?.at?.(-1);
  if (lastMove?.side === 'black' && exact.startsWith(feedback.opponent ?? '\0'))
    return ['Good move', `Black played ${lastMove.san}. White to move. You are still following the lesson route.`, exact];
  if (exact && exact === feedback.acceptedAlternative) return ['Also winning', 'This move is sound, but the exercise follows a different route.', exact];
  if (exact && exact === feedback.objectiveMissResultPreserved) return ['Result preserved', 'The position is still winning or drawn, but the lesson objective was not completed.', exact];
  if (exact && exact === feedback.conceptMiss) return ['Still playable', 'The result is preserved, but this move leaves the lesson route.', exact];
  if (state.itemState?.hintStage === 3) return ['Move revealed', 'Independent-success eligibility has been removed for this run.', exact];
  return ['Your turn', 'Choose a move that supports the mission above.', exact];
};

export function mountPrivateFiveItemRunPage({ document: doc = globalThis.document, window: win = globalThis } = {}) {
  if (mounted) return mounted;
  installNoIndex(doc); installPrivateStyles(doc);
  const root = doc.querySelector('[data-endgame-trainer-page]'), element = root.querySelector('[data-board]');
  const abort = new AbortController(), search = win.location?.search ?? '';
  let keyboardInteraction = false, lastFocusKey = '', renderingFallback = false;
  root.addEventListener('keydown', () => { keyboardInteraction = true; }, { signal: abort.signal, capture: true });
  root.addEventListener('pointerdown', () => { keyboardInteraction = false; }, { signal: abort.signal, capture: true });
  root.classList.add('is-v2','is-multi-move-pilot','is-endgame-run','is-private-five-item-run');
  root.querySelector('[data-endgame-v2-shell]').hidden = false;
  root.querySelectorAll('[data-v2-score],[data-v2-streak],[data-v2-time]').forEach(node => {
    const metric = node.closest('span'); metric.hidden = true; metric.style.display = 'none';
  });
  root.querySelector('[data-v2-open-modes]')?.setAttribute('hidden','');
  text(root,'#endgame-v2-title','Private Endgame Run');
  text(root,'.endgame-v2__disclosure','Five exercises. Progress is temporary and is not saved.');
  const objectiveRegion = root.querySelector('.endgame-v2__objective');
  objectiveRegion.removeAttribute('aria-live');
  const title = root.querySelector('[data-v2-objective]'); title.setAttribute('tabindex','-1');
  const mission = add(doc, objectiveRegion, 'p', 'privateRunMission');
  const turn = add(doc, objectiveRegion, 'p', 'privateRunTurn');
  const independence = add(doc, objectiveRegion, 'p', 'privateRunIndependence');
  independence.className = 'endgame-v2__independence';
  const hintProgress = add(doc, objectiveRegion, 'p', 'privateHintProgress');

  const feedbackNode = root.querySelector('[data-v2-feedback]');
  const feedbackPanel = doc.createElement('section');
  feedbackPanel.className = 'endgame-v2__feedback-panel';
  feedbackPanel.dataset.privateFeedbackPanel = '';
  feedbackPanel.setAttribute('role','status'); feedbackPanel.setAttribute('aria-live','polite'); feedbackPanel.setAttribute('aria-atomic','true');
  feedbackNode.parentNode.insertBefore(feedbackPanel, feedbackNode);
  const feedbackStatus = add(doc, feedbackPanel, 'h3', 'privateFeedbackStatus');
  feedbackStatus.setAttribute('tabindex','-1');
  const feedbackExplanation = add(doc, feedbackPanel, 'p', 'privateFeedbackExplanation');
  feedbackNode.removeAttribute('role'); feedbackNode.removeAttribute('aria-live');
  feedbackNode.classList.add('endgame-v2__artifact-feedback');
  feedbackPanel.appendChild(feedbackNode);

  const actions = root.querySelector('.endgame-v2__actions');
  const restartExercise = doc.createElement('button');
  restartExercise.type='button'; restartExercise.dataset.privateAction='restart-exercise'; restartExercise.textContent='Restart Exercise'; restartExercise.hidden=true;
  const tryAgain = doc.createElement('button');
  tryAgain.type='button'; tryAgain.dataset.privateAction='try-again'; tryAgain.textContent='Try Again'; tryAgain.hidden=true;
  actions.append(tryAgain,restartExercise);

  const dialog = doc.createElement('dialog');
  dialog.className='endgame-v2__decision-dialog'; dialog.dataset.privateRunDialog='';
  dialog.innerHTML='<h2 data-private-dialog-title tabindex="-1"></h2><p data-private-dialog-body></p><div><button type="button" data-private-dialog-cancel>Keep Playing</button><button type="button" data-private-dialog-confirm></button></div>';
  root.appendChild(dialog);
  let dialogAction = null, dialogOpener = null;
  const closeDialog = () => { dialog.close(); dialogOpener?.focus?.(); dialogAction=null; };
  dialog.querySelector('[data-private-dialog-cancel]').addEventListener('click',closeDialog,{signal:abort.signal});
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); },{signal:abort.signal});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const focusable=[...dialog.querySelectorAll('button:not([disabled])')];
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(doc.activeElement===first||!focusable.includes(doc.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  },{signal:abort.signal});
  dialog.querySelector('[data-private-dialog-confirm]').addEventListener('click',async()=>{
    const callback=dialogAction; dialog.close(); dialogAction=null; await callback?.();
  },{signal:abort.signal});
  const openDialog = ({ opener, title: heading, body, confirm, cancel='Keep Playing', action: callback }) => {
    dialogOpener=opener; dialogAction=callback;
    text(dialog,'[data-private-dialog-title]',heading); text(dialog,'[data-private-dialog-body]',body);
    text(dialog,'[data-private-dialog-confirm]',confirm); text(dialog,'[data-private-dialog-cancel]',cancel);
    dialog.showModal(); dialog.querySelector('[data-private-dialog-title]').focus();
  };

  const summary = root.querySelector('[data-v2-summary]'); summary.hidden = true;
  summary.querySelector('dl').hidden = true;
  const legacyActions = summary.querySelector(':scope > div');
  if (legacyActions) { legacyActions.hidden = true; legacyActions.style.display = 'none'; }
  let list = summary.querySelector('[data-private-run-summary-list]');
  if (!list) { list = doc.createElement('ol'); list.dataset.privateRunSummaryList = ''; summary.appendChild(list); }
  const summaryNote = add(doc, summary, 'p', 'privateRunSummaryNote');
  const summaryActions = add(doc, summary, 'div', 'privateRunSummaryActions');
  summaryActions.innerHTML='<button type="button" data-private-summary-restart>Restart Run</button><button type="button" data-private-summary-exit>Exit Run</button>';
  action(root,'start',false,'Start Run'); action(root,'hint',false); action(root,'continue',false);
  action(root,'retry',false); action(root,'skip',false,'Restart Run'); action(root,'abandon',true,'Exit Run');

  let controller;
  const board = new EndgameBoardView({
    element, rulesFactory: fen => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
    onMove: intent => controller?.submitMove(intent) ?? false,
    onError: () => controller?.reportTechnicalUnavailable(),
    onAnnouncement: message => { if (message) text(root,'[data-private-feedback-explanation]',message); },
    options: { label: 'Private endgame exercise board. Use arrow keys to move between squares, then Enter or Space to select.' }
  }).initialize();
  board.setInteractive(false);

  const focusOnce = (key, node) => {
    if (!keyboardInteraction || lastFocusKey === key) return;
    lastFocusKey=key; win.requestAnimationFrame?.(()=>node?.focus?.());
  };
  const render = state => {
    const item = state.itemState, artifact = controller?.getCurrentArtifact(), experience = EXPERIENCE[state.currentItemIndex] ?? EXPERIENCE[0];
    const stage=item?.hintStage ?? 0;
    if (item?.fen && board.getPosition() !== item.fen) board.setPosition(item.fen,item.lastMove);
    board.setInteractive(state.status === 'active' && item?.phase === 'learner-turn');
    text(root,'[data-v2-objective]',experience.title);
    text(root,'[data-private-run-mission]',experience.mission);
    const activeColor = item?.fen?.split(' ')[1] === 'b' ? 'Black' : 'White';
    text(root,'[data-private-run-turn]',state.status === 'run-success' ? '' : `${activeColor} to move.`);
    text(root,'[data-private-run-independence]',state.runIndependentSuccessEligible ?
      'Independent completion: Eligible. Independent means completing the full run without revealing an exact move.' :
      'Independent completion: Not eligible. An exact move was revealed; the run can still be completed.');
    text(root,'[data-private-hint-progress]',stage === 0 ? 'Hints available: 3' :
      stage === 1 ? 'Hint 1 of 3 shown. Independent completion remains eligible.' :
      stage === 2 ? 'Hint 2 of 3 shown. Independent completion remains eligible.' :
      'Move shown. Independent completion is no longer available for this run.');
    text(root,'[data-v2-progress]',state.status === 'run-success' ? '5 / 5' : `${state.currentItemIndex + 1} / 5`);
    text(root,'[data-v2-item-label]',state.status === 'run-success' ? 'Run complete · 5 of 5 exercises completed' : `Exercise ${state.currentItemIndex + 1} of 5`);
    const [statusLabel, explanation, exact] = humanFeedback(state,artifact);
    text(root,'[data-private-feedback-status]',statusLabel);
    text(root,'[data-private-feedback-explanation]',explanation);
    text(root,'[data-v2-feedback]',exact);
    feedbackNode.hidden=!exact;
    action(root,'start',state.status === 'ready','Start Run');
    action(root,'hint',state.status === 'active' && item?.phase === 'learner-turn',
      stage === 0 ? 'Get a Hint' : stage === 1 ? 'Hint 2 of 3' : stage === 2 ? 'Show Move' : 'Move Revealed');
    action(root,'continue',state.status === 'item-success',state.currentItemIndex === 4 ? 'View Run Summary' : `Continue to Exercise ${state.currentItemIndex + 2}`);
    action(root,'retry',['item-terminal','technical-unavailable'].includes(state.status),
      state.status === 'technical-unavailable' ? 'Retry Position' : 'Try Again');
    action(root,'skip',state.runStarted && !['aborted','run-success'].includes(state.status),'Restart Run');
    action(root,'abandon',!['aborted','run-success'].includes(state.status),'Exit Run');
    const conceptMiss = ['Still playable','Result preserved','Also winning'].includes(statusLabel);
    tryAgain.hidden=!conceptMiss;
    restartExercise.hidden=!(state.status === 'active' || state.status === 'item-terminal');
    if (state.status === 'item-success' && lastFocusKey !== `success-${state.currentItemIndex}`) {
      lastFocusKey=`success-${state.currentItemIndex}`; win.requestAnimationFrame?.(()=>feedbackStatus.focus());
    }
    if (conceptMiss || state.status === 'item-terminal') focusOnce(`feedback-${state.currentItemIndex}-${item?.feedback}`,feedbackStatus);
    summary.hidden = state.status !== 'run-success';
    if (!summary.hidden) {
      text(root,'#v2-summary-title','Run complete');
      text(root,'.endgame-v2__summary > p',`5 of 5 exercises completed · Independent completion: ${state.summary.independentCompletion ? 'yes' : 'no'}`);
      text(root,'[data-private-run-summary-note]',state.summary.independentCompletion ?
        'Independent completion: Yes. No progress was saved.' :
        'Independent completion: No. An exact move was revealed during the run. No progress was saved.');
      list.replaceChildren(...state.summary.items.map((entry,index) => {
        const li = doc.createElement('li'); li.textContent = `${EXPERIENCE[index].title} — completed`; return li;
      }));
      if(lastFocusKey!=='summary'){lastFocusKey='summary';win.requestAnimationFrame?.(()=>summary.querySelector('h2')?.focus?.());}
    }
    root.dataset.state = `private-run-${state.status}`;
  };
  const showFallback = () => {
    if (renderingFallback) return; renderingFallback=true;
    board.setInteractive(false);
    text(root,'[data-private-feedback-status]','We could not verify this position');
    text(root,'[data-private-feedback-explanation]','This is a technical issue, not a chess mistake. Your completed exercises in this session remain available in memory.');
    text(root,'[data-v2-feedback]','The current exercise is technically unavailable.');
    feedbackNode.hidden=false; action(root,'retry',true,'Retry Position');
  };
  const safeRender = state => { try { render(state); } catch { showFallback(); } };
  const safe = callback => async (...args) => { try { return await callback(...args); } catch { controller?.reportTechnicalUnavailable(); showFallback(); return false; } };
  controller = new PrivateFiveItemRunController({
    fetchImpl: win.fetch.bind(win), onChange: safeRender,
    delay: () => new Promise(resolve => win.setTimeout(resolve,win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180))
  });
  mounted = { root, board, controller, abort };
  safeRender(controller.getState()); safe(()=>controller.load(search))();
  root.querySelector('[data-v2-action="start"]').addEventListener('click',safe(async()=>{ if(await controller.start()) title.focus(); }),{signal:abort.signal});
  root.querySelector('[data-v2-action="hint"]').addEventListener('click',safe(event=>{
    const stage=controller.getState().itemState?.hintStage ?? 0;
    if(stage===2) openDialog({opener:event.currentTarget,title:'Show the move?',body:'This will remove independent-completion eligibility for this run.',confirm:'Show Move',cancel:'Keep Thinking',action:()=>controller.hint()});
    else controller.hint();
  }),{signal:abort.signal});
  root.querySelector('[data-v2-action="continue"]').addEventListener('click',safe(async()=>{ const previous=controller.getState().currentItemIndex; if(await controller.continue()&&controller.getState().currentItemIndex!==previous)title.focus(); }),{signal:abort.signal});
  root.querySelector('[data-v2-action="retry"]').addEventListener('click',safe(()=>controller.getState().status==='technical-unavailable'?controller.retryTechnical(search):controller.retryCurrent()),{signal:abort.signal});
  tryAgain.addEventListener('click',()=>element.querySelector('[tabindex="0"]')?.focus?.(),{signal:abort.signal});
  restartExercise.addEventListener('click',safe(()=>controller.restartCurrent()),{signal:abort.signal});
  const restart = event => {
    const state=controller.getState(), run=()=>controller.restart().then(()=>title.focus());
    if(progressExists(state)) openDialog({opener:event.currentTarget,title:'Restart the full run?',body:'Your current progress through the five exercises will be cleared. Nothing is saved.',confirm:'Restart Run',action:run});
    else safe(run)();
  };
  root.querySelector('[data-v2-action="skip"]').addEventListener('click',restart,{signal:abort.signal});
  const exit = event => {
    const state=controller.getState(), leave=()=>{controller.exit();win.location.assign('/endgame-trainer?trainerV2=1');};
    if(progressExists(state)&&state.status!=='run-success') openDialog({opener:event.currentTarget,title:'Exit this run?',body:'Your current progress will be cleared because this private session is not saved.',confirm:'Exit Run',action:leave});
    else leave();
  };
  root.querySelector('[data-v2-action="abandon"]').addEventListener('click',exit,{signal:abort.signal});
  summary.querySelector('[data-private-summary-restart]').addEventListener('click',restart,{signal:abort.signal});
  summary.querySelector('[data-private-summary-exit]').addEventListener('click',exit,{signal:abort.signal});
  return mounted;
}

export function unmountPrivateFiveItemRunPage() {
  if (!mounted) return false;
  mounted.abort.abort(); mounted.controller.exit(); mounted.board.dispose(); mounted = null; return true;
}
