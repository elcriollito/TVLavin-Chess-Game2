import { ChessRulesFacade } from '../chess-rules-facade.js';
import { EndgameBoardView } from '../endgame-board-view.js';
import { loadMultiMovePilot, MultiMovePilotController } from './multi-move-pilot.js';
let mounted;
const text = (root, selector, value) => { const node = root.querySelector(selector); if (node) node.textContent = value; };
const action = (root, name, show) => { const node = root.querySelector(`[data-v2-action="${name}"]`); if (node) node.hidden = !show; };
const present = (root, phase, feedback = '') => {
  const primary = phase === 'item-configured' ? 'start' : ['objective-success','objective-failure','technical-unavailable','item-error'].includes(phase) ? 'retry' : '';
  root.querySelectorAll('[data-v2-action]').forEach(node => {
    if (node.hidden) delete node.dataset.actionPriority;
    else node.dataset.actionPriority = node.dataset.v2Action === primary ? 'primary' : 'secondary';
  });
  const output=root.querySelector('[data-v2-feedback]');
  if(output) output.dataset.tone=phase==='objective-success'?'success':phase==='authored-concept-miss'?'instruction':
    ['objective-failure','technical-unavailable','item-error'].includes(phase)?'technical':feedback?'instruction':'neutral';
};
export function mountMultiMovePilotPage({ document: doc = globalThis.document, window: win = globalThis } = {}) {
  if (mounted) return mounted;
  const root = doc.querySelector('[data-endgame-trainer-page]'), element = root.querySelector('[data-board]');
  const abort = new AbortController(); root.classList.add('is-v2','is-multi-move-pilot');
  root.querySelector('[data-endgame-v2-shell]').hidden = false;
  root.querySelectorAll('[data-v2-score],[data-v2-streak],[data-v2-time]').forEach(node => node.closest('span').hidden = true);
  text(root, '#endgame-v2-title', 'Multi-Move Technical Pilot');
  text(root, '.endgame-v2__disclosure', 'Local technical practice. This hidden pilot is not saved and has no competitive score.');
  text(root, '[data-v2-objective]', 'Promote the e-pawn');
  text(root, '[data-v2-item-label]', 'Ready · White to move');
  const currentMode=root.querySelector('[data-v2-mode="quick-challenge"]');
  if(currentMode){currentMode.dataset.v2Mode='multi-move-pilot';currentMode.setAttribute('aria-current','true');
    text(currentMode,'strong','Multi-Move Pilot');text(currentMode,'span','Promote with king coordination');text(currentMode,'em','Current hidden mode');}
  const start = root.querySelector('[data-v2-action="start"]'); start.textContent = 'Start Pilot';
  action(root,'skip',false); action(root,'continue',false); action(root,'retry',false); action(root,'abandon',false);
  let controller;
  const board = new EndgameBoardView({ element, rulesFactory: fen => fen ? ChessRulesFacade.fromFen(fen) : new ChessRulesFacade(),
    onMove: intent => controller?.submitMove(intent) ?? false,
    onError: () => text(root,'[data-v2-feedback]','That move could not be submitted.'),
    options: { label: 'Multi-Move Technical Pilot board' } }).initialize();
  board.setInteractive(false);
  const render = state => {
    if (board.getPosition() !== state.fen) board.setPosition(state.fen, state.lastMove);
    const learner = state.phase === 'learner-turn';
    board.setInteractive(learner);
    text(root,'[data-v2-progress]',`${state.ply} / 12`);
    text(root,'[data-v2-item-label]',`${state.result ? 'Pilot complete' : learner ? 'White to move' : 'Pilot in progress'} · ${state.history.length} plies`);
    text(root,'[data-v2-feedback]',state.feedback);
    action(root,'start',state.phase === 'item-configured');
    action(root,'hint',learner);
    action(root,'retry',['objective-success','objective-failure','technical-unavailable','item-error'].includes(state.phase));
    action(root,'abandon',!['item-configured','item-abandoned'].includes(state.phase));
    present(root,state.phase,state.feedback);
    const summary=root.querySelector('[data-v2-summary]'); summary.hidden=!['objective-success','objective-failure'].includes(state.phase);
    if(!summary.hidden){text(root,'#v2-summary-title',state.result==='objective-failure'?'Objective not completed':'Promotion complete');
      summary.querySelector('dl').hidden=true; text(root,'.endgame-v2__summary > p',state.result?.replaceAll('-',' '));}
    root.dataset.state=`pilot-${state.phase}`;
  };
  start.addEventListener('click',async()=>{start.disabled=true;try{const artifact=await loadMultiMovePilot({fetchImpl:win.fetch.bind(win)});controller=new MultiMovePilotController({artifact,onChange:render,
      delay:()=>new Promise(resolve=>win.setTimeout(resolve,win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:180))});
    mounted.controller=controller;render(controller.getState());await controller.start();}catch{text(root,'[data-v2-feedback]','The pilot is technically unavailable.');root.dataset.state='pilot-technical-unavailable';present(root,'technical-unavailable','The pilot is technically unavailable.');}finally{start.disabled=false;}},{signal:abort.signal});
  root.querySelector('[data-v2-action="hint"]').addEventListener('click',()=>controller?.hint(),{signal:abort.signal});
  root.querySelector('[data-v2-action="retry"]').addEventListener('click',()=>controller?.retry(),{signal:abort.signal});
  root.querySelector('[data-v2-action="abandon"]').addEventListener('click',()=>{controller?.abandon();win.location.assign('/endgame-trainer?trainerV2=1');},{signal:abort.signal});
  const dialog=root.querySelector('[data-v2-modes-dialog]'),modeList=dialog?.querySelector('[data-v2-mode-list]');
  let opener;
  const close=()=>{if(dialog?.open)dialog.close();};
  root.querySelector('[data-v2-open-modes]')?.addEventListener('click',event=>{opener=event.currentTarget;modeList.hidden=false;dialog.querySelector('[data-v2-leave-confirm]').hidden=true;dialog.showModal();dialog.querySelector('[data-v2-close-modes]').focus();},{signal:abort.signal});
  dialog?.querySelector('[data-v2-close-modes]')?.addEventListener('click',close,{signal:abort.signal});
  dialog?.addEventListener('close',()=>opener?.focus(),{signal:abort.signal});
  dialog?.addEventListener('click',event=>{if(event.target===dialog)close();},{signal:abort.signal});
  modeList?.addEventListener('click',event=>{const mode=event.target.closest?.('[data-v2-mode]');if(!mode)return;
    if(mode.dataset.v2Mode==='multi-move-pilot'){close();return;}const href=mode.dataset.v2Href;if(href)win.location.assign(href);},{signal:abort.signal});
  present(root,'item-configured');
  mounted={root,board,controller,abort}; return mounted;
}
export function unmountMultiMovePilotPage(){if(!mounted)return false;mounted.abort.abort();mounted.controller?.abandon();mounted.board.dispose();mounted=null;return true;}
