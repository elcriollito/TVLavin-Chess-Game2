import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { CaissaBoardAdapter } from '../board/caissa-board-adapter.js';
import { PgnAnalysisEngine } from '../pgn-replayer/pgn-engine.js';
import {
  OpeningStudy, sanTokens, buildRepertoire, readRepertoires,
  storeRepertoire, newTrainingSession, advanceOpponent, attemptTrainingMove
} from './model.js';
import { loadWikibook } from './wikibook.js';

const $=id=>document.getElementById(id);
const study=new OpeningStudy();
const state={
  tab:'analysis',orientation:'white',training:null,activeRepertoire:null,
  ecoRows:[],gameCollections:[],games:[],selectedCollection:null,selectedGame:null,
  gameSubtab:'games',openingSubtab:'eco',repertoires:readRepertoires(),
  opening:{name:'Starting position',eco:''},engine:null,engineOn:false,engineLines:[],
  autoWiki:true,lockTab:false,wikiAbort:null,wikiTimer:null,wikiSerial:0
};
const board=new CaissaBoardAdapter($('ot-board'),{
  position:study.fen,orientation:'white',animation:false,interactive:true,
  tapPolicy:'native',dragPolicy:'all',label:'CAISSA Opening Trainer study board'
});
const activeFen=()=>state.tab==='practice'&&state.training?state.training.game.fen():study.fen;
const activePly=()=>state.tab==='practice'&&state.training?state.training.ply:study.ply;
const activeHistory=()=>state.tab==='practice'&&state.training
  ?state.training.path.slice(0,state.training.ply).map(x=>x.san):study.gameHistory();
function notice(message) { $('ot-notice').textContent=message; }
function setBusyText(id,message){$(id).textContent=message;}
function elt(tag,text,cls) {
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null) node.textContent=String(text);
  if(cls) node.className=cls;
  return node;
}
function buildButton(label,onClick,detail) {
  const b=elt('button',label);
  b.type='button';
  if(detail) b.append(elt('small',detail));
  b.addEventListener('click',onClick);
  return b;
}
function currentPreferredLine() {
  const path=study.path();
  let node=study.current;
  while(node.preferred) {
    node=study.nodes.get(node.preferred);
    if(!node)break;
    path.push(node);
  }
  return path;
}
function renderNotation(root,rows) {
  root.replaceChildren();
  if(!rows?.length) {root.textContent='No moves yet. Move a piece on the board.';return;}
  rows.forEach((node,i)=>{
    if(i%2===0) root.append(elt('span',Math.floor(i/2)+1+'.','ot-move-number'));
    const btn=elt('button',node.san);
    btn.type='button';
    btn.setAttribute('aria-label','Go to move '+(i+1)+': '+node.san);
    if(node.id===study.cursor) btn.setAttribute('aria-current','step');
    btn.addEventListener('click',()=>{study.focus(node.id);onPositionChange();});
    root.append(btn);
    if(!node.parent)return;
    const parent=study.nodes.get(node.parent);
    for(const altId of parent.children.filter(id=>id!==node.id)){
      const alt=study.nodes.get(altId);
      const branch=elt('button','↳ '+alt.san,'ot-variation');
      branch.title='Switch to analyzed variation '+alt.san;
      branch.addEventListener('click',()=>{study.focus(alt.id);onPositionChange();});
      root.append(branch);
    }
  });
}
function openingForPosition(){
  const resolver=window.CaissaEcoOpeningResolver;
  const result=resolver?.resolve?.(study.gameHistory(),state.ecoRows,{ChessConstructor:Chess});
  if(result?.status==='recognized')return {name:result.name,eco:result.eco};
  return study.ply?{name:'Opening study',eco:''}:{name:'Starting position',eco:''};
}
function renderOpeningHeader(){
  state.opening=openingForPosition();
  $('ot-opening-name').textContent=state.opening.name;
  $('ot-opening-eco').textContent=state.opening.eco||'ECO —';
  const color=activeFen().split(' ')[1]==='b'?'Black':'White';
  $('ot-turn').textContent=(state.tab==='practice'&&state.training?'Practice · ':'')+color+' to move';
  $('ot-ply').textContent='Move '+(Math.floor(activePly()/2)+1);
}
function renderFooter(){
  const trainingActive=state.tab==='practice'&&!!state.training;
  const node=study.current;
  $('ot-first').disabled=trainingActive||node.id==='root';
  $('ot-prev').disabled=trainingActive||node.id==='root';
  $('ot-next').disabled=trainingActive||!node.preferred;
  $('ot-last').disabled=trainingActive||!node.preferred;
  $('ot-engine-toggle').setAttribute('aria-pressed',String(state.engineOn));
  board.setInteractive(state.tab!=='games'&&(state.tab!=='practice'||trainingActive));
}
function renderBoard(){
  board.setPosition(activeFen(),{animate:false});
  renderOpeningHeader();
  renderFooter();
  drawSuggestedMove();
}
function setEngineStrip(){
  const score=$('ot-engine-score'),pv=$('ot-engine-line');
  const first=state.engineLines[0];
  if(!state.engineOn) {score.textContent='Engine off';pv.textContent='Turn on Analysis for Stockfish evaluations.';return;}
  if(!first||first.fen!==study.fen) {
    score.textContent=state.engine?.state==='error'?'Engine error':'Stockfish';
    pv.textContent=state.engine?.state==='loading'?'Loading local engine…':'Analyzing this position…';
    return;
  }
  const factor=first.fen.split(' ')[1]==='b'?-1:1;
  if(first.score?.type==='mate') {
    score.textContent='M'+(first.score.value*factor);
  } else {
    const cp=(first.score?.value||0)*factor/100;
    score.textContent=(cp>=0?'+':'')+cp.toFixed(2);
  }
  pv.textContent=(first.san||[]).slice(0,8).join(' ')||'Analyzing…';
}
function drawSuggestedMove(){
  board.clearArrows();
  if(state.tab==='practice'||!state.engineOn||!state.engineLines.length)return;
  const top=state.engineLines[0];
  if(top.fen!==study.fen) return; // block any stale FEN result
  const match=String(top.pv?.[0]||'').match(/^([a-h][1-8])([a-h][1-8])/);
  if(match)board.drawArrow(match[1],match[2],{color:'#42a36d',opacity:.76});
}
function requestEngine(){
  if(!state.engineOn||!state.engine||state.tab==='practice')return;
  state.engineLines=[];
  setEngineStrip();
  board.clearArrows();
  state.engine.analyze(study.fen);
}
function disableEngine(){
  state.engineOn=false;
  state.engineLines=[];
  state.engine?.disable();
  board.clearArrows();
  setEngineStrip();
  renderFooter();
}
async function enableEngine(){
  if(state.engineOn)return;
  state.engineOn=true;
  if(!state.engine)state.engine=new PgnAnalysisEngine({
    moveTimeMs:1050,
    onState:(kind)=>{
      if(kind==='error'){state.engineOn=false;state.engineLines=[];notice('Stockfish could not start. You can retry from Engine.');}
      setEngineStrip();renderFooter();
    },
    onLines:lines=>{
      if(!state.engineOn)return;
      state.engineLines=lines.filter(line=>line.fen===study.fen).slice(0,1);
      setEngineStrip();drawSuggestedMove();
    }
  });
  setEngineStrip();renderFooter();
  try {await state.engine.enable(study.fen);}
  catch(error){
    if(state.engineOn){disableEngine();notice('Local Stockfish is unavailable. Opening study remains usable.');}
  }
}
function renderAnalysis(){
  renderNotation($('ot-analysis-notation'),currentPreferredLine());
  $('ot-save').disabled=study.ply===0;
  $('ot-save-train').disabled=study.ply===0;
}
function renderWiki(article){
  const root=$('ot-wiki-copy'),source=$('ot-wiki-source');
  root.replaceChildren();
  source.href=article?.url||'https://en.wikibooks.org/wiki/Chess_Opening_Theory';
  if(article?.status!=='found'){
    setBusyText('ot-wiki-status','No WikiBook article is available for this exact move sequence. Continue exploring or open the original index.');
    return;
  }
  const summary=article.exact?'Exact article for the current move sequence.':
    'Background theory from '+article.backgroundPlies+' earlier ply/plies — not an exact match for the board position.';
  setBusyText('ot-wiki-status',summary);
  for(const block of article.blocks){
    root.append(elt(block.kind==='heading'?'h3':'p',block.text));
  }
}
function cancelWiki(){
  clearTimeout(state.wikiTimer);
  state.wikiAbort?.abort();
  state.wikiAbort=null;
}
function requestWiki({auto=false}={}){
  cancelWiki();
  if(!activeHistory().length){if(state.tab==='wikibook') renderWiki(null);return;}
  const serial=++state.wikiSerial;
  const history=activeHistory().slice();
  const initialFen=activeFen();
  state.wikiTimer=setTimeout(async()=>{
    const controller=new AbortController();
    state.wikiAbort=controller;
    if(state.tab==='wikibook') {
      $('ot-wiki-copy').replaceChildren();
      setBusyText('ot-wiki-status','Looking for opening theory…');
    }
    try {
      const article=await loadWikibook(history,{
        signal:controller.signal,allowAncestor:state.tab==='wikibook'
      });
      if(serial!==state.wikiSerial||initialFen!==activeFen())return;
      if(state.tab==='wikibook')renderWiki(article);
      else if(auto&&article.exact&&article.status==='found'
        &&state.tab==='analysis'&&state.autoWiki&&!state.lockTab){
        selectTab('wikibook');
        renderWiki(article);
        notice('WikiBook found exact opening theory. Explore the explanation or return to Analysis.');
      }
    }catch(error){
      if(error?.name==='AbortError'||serial!==state.wikiSerial)return;
      if(state.tab==='wikibook'){
        $('ot-wiki-copy').replaceChildren();
        setBusyText('ot-wiki-status','Could not reach WikiBook. The board and saved studies still work offline.');
      }
    }
  },200);
}
function renderEcoList(){
  const list=$('ot-eco-results'),term=$('ot-eco-search').value.trim().toLowerCase();
  list.replaceChildren();
  if(!state.ecoRows.length){$('ot-eco-count').textContent='ECO catalog unavailable.';return;}
  const matches=state.ecoRows.map((row,i)=>({...row,index:i}))
    .filter(row=>(row.code+' '+row.name).toLowerCase().includes(term));
  $('ot-eco-count').textContent=matches.length+' of '+state.ecoRows.length+' ECO openings';
  for(const row of matches.slice(0,30)){
    const btn=buildButton((row.code||'')+' · '+row.name,()=>{
      const sans=sanTokens(row.moves);
      if(!study.loadSans(sans)){notice('This ECO line could not be loaded safely.');return;}
      state.selectedGame=null;
      notice('Loaded '+row.name+'. You can analyze it, read WikiBook, or save this line.');
      onPositionChange({wikiAuto:false});
    },String(row.moves||''));
    list.append(btn);
  }
}
function renderExplorer(){
  const root=$('ot-continuations');root.replaceChildren();
  const resolver=window.CaissaEcoOpeningResolver;
  const played=study.gameHistory().map(s=>resolver?.normalizeSan?.(s)||s);
  const candidates=new Map();
  for(const row of state.ecoRows){
    const moves=resolver?.extractCatalogMoves?.(row)||[];
    if(moves.length<=played.length||!played.every((san,i)=>moves[i]===san))continue;
    const san=sanTokens(row.moves)[played.length];
    if(!san)continue;
    const key=moves[played.length];
    if(!candidates.has(key))candidates.set(key,{san,count:0});
    candidates.get(key).count++;
  }
  const sorted=[...candidates.values()].sort((a,b)=>b.count-a.count).slice(0,18);
  if(!sorted.length){root.append(elt('p','No further ECO catalog continuation for this exact move sequence. Use Analysis to explore freely.','ot-hint'));return;}
  for(const row of sorted){
    root.append(buildButton(row.san,()=>{
      const result=study.move(row.san);
      if(!result.ok){notice('The ECO continuation is not legal here.');return;}
      onPositionChange({wikiAuto:false});
    },row.count+' catalog line(s)'));
  }
}
function renderRepertoires(){
  const root=$('ot-repertoire-list');root.replaceChildren();
  if(!state.repertoires.length){
    root.append(elt('p','No saved openings yet. Explore in Analysis, then choose Save & Train.','ot-hint'));
    return;
  }
  for(const rep of state.repertoires){
    const wrapper=elt('article',null,'ot-repertoire-item');
    wrapper.append(elt('strong',rep.name));
    wrapper.append(elt('small',rep.eco+' · '+rep.paths.length+' saved line(s) · local only'));
    const actions=elt('div',null,'ot-inline-actions');
    for(const side of ['white','black']){
      actions.append(buildButton('Train '+(side==='white'?'White':'Black'),()=>startTraining(rep,side)));
    }
    wrapper.append(actions);root.append(wrapper);
  }
}
function showPracticeStatus(message,tone){
  $('ot-practice-status').textContent=message;
  $('ot-practice-status').dataset.status=tone||'';
  if(state.training)$('ot-practice-score').textContent=
    'Moves recalled: '+state.training.ply+'/'+state.training.path.length+
    ' · Misses: '+state.training.misses+' · Hints: '+state.training.hints;
}
function startTraining(repertoire,side=repertoire.side){
  try{
    const source={...repertoire,side};
    const pathIndex=Math.floor(Math.random()*source.paths.length);
    state.training=newTrainingSession(source,pathIndex);
    state.activeRepertoire=source;
    advanceOpponent(state.training);
    disableEngine(); // no hints from Stockfish while memorizing
    selectTab('practice');
    $('ot-practice-library').hidden=true;
    $('ot-practice-session').hidden=false;
    showPracticeStatus(state.training.done?'Line completed. Replay for another variation.':
      'Your turn with '+(side==='white'?'White':'Black')+'. Recall the next repertoire move.');
    board.clearHighlights();
    renderBoard();notice('Training from memory — no engine suggestions.');
  }catch(error){notice('Could not start this saved line: '+error.message);}
}
function stopTraining(){
  state.training=null;state.activeRepertoire=null;
  $('ot-practice-session').hidden=true;
  $('ot-practice-library').hidden=false;
  board.clearHighlights();
  renderBoard();notice('Practice ended. The Analysis tree has been preserved.');
}
function handleTrainingMove(move) {
  const result=attemptTrainingMove(state.training,move);
  if(!result.ok){showPracticeStatus(result.reason,'wrong');return;}
  board.clearHighlights();
  renderBoard();
  showPracticeStatus(result.done?'Line complete! Well done. Replay or train a different opening.':
    'Correct: '+result.san+'. Now remember the next move.', 'good');
}
function renderGameCategories(){
  const list=$('ot-game-categories');list.replaceChildren();
  if(state.selectedCollection)return;
  const query=$('ot-game-search').value.trim().toLowerCase();
  const rows=state.gameCollections.filter(x=>x.title.toLowerCase().includes(query)).slice(0,22);
  if(!rows.length){
    list.append(elt('p','No matching opening collection. Try a broader opening family.','ot-hint'));return;
  }
  for(const row of rows){
    list.append(buildButton(row.title,()=>loadGameCollection(row),'Opening collection · select to load games'));
  }
}
function splitPgnPage(content){
  return String(content||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
    .split(/(?=^\[Event\s+")/m).map(x=>x.trim())
    .filter(x=>x.startsWith('[Event ')&&x.includes('[White ')&&x.includes('[Black ')).slice(0,10);
}
function titleOfPgn(raw,index){
  const read=name=>{
    const escaped=name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
    const value=raw.match(new RegExp('^\\['+escaped+' "([^"\\n]{0,160})"\\]','m'));
    return value?.[1]||'?';
  };
  return {white:read('White'),black:read('Black'),event:read('Event'),result:read('Result'),index};
}
async function loadGameCollection(row){
  state.selectedCollection=row;
  const list=$('ot-game-results');
  list.replaceChildren();
  $('ot-game-categories').replaceChildren();
  setBusyText('ot-games-message','Loading '+row.title+'…');
  try{
    const file=encodeURIComponent(row.file);
    const response=await fetch('/api/pgn/opening?file='+file+'&page=1');
    if(!response.ok)throw Error('The opening source is unavailable.');
    const size=Number(response.headers.get('content-length')||0);
    if(size>10*1024*1024)throw Error('Game page exceeds the preview limit.');
    const text=await response.text();
    if(text.length>10*1024*1024)throw Error('Game page exceeds the preview limit.');
    state.games=splitPgnPage(text).map((pgn,i)=>({pgn,...titleOfPgn(pgn,i)}));
    if(!state.games.length)throw Error('No readable games found in this collection.');
    setBusyText('ot-games-message',row.title+' · showing '+state.games.length+' preview games from page 1.');
    const back=buildButton('← Change opening collection',()=>{
      state.selectedCollection=null;state.games=[];list.replaceChildren();renderGameCategories();
      setBusyText('ot-games-message','Choose an opening collection.');
    });
    list.append(back);
    for(const game of state.games){
      list.append(buildButton((game.index+1)+'. '+game.white+' — '+game.black,()=>loadHistoricalGame(game),
        game.event+' · '+game.result));
    }
  }catch(error){
    state.selectedCollection=null;state.games=[];
    setBusyText('ot-games-message',error.message||'Game search failed.');
    renderGameCategories();
  }
}
function showGameSubtab(subtab){
  state.gameSubtab=subtab;
  $('ot-games-list').hidden=subtab!=='games';
  $('ot-games-notation').hidden=subtab!=='notation';
  $('ot-games-list-tab').setAttribute('aria-pressed',String(subtab==='games'));
  $('ot-games-notation-tab').setAttribute('aria-pressed',String(subtab==='notation'));
}
function loadHistoricalGame(game){
  try{
    const chess=new Chess();
    chess.loadPgn(game.pgn);
    const moves=chess.history();
    if(!moves.length||!study.loadSans(moves))throw Error('This PGN game could not be loaded.');
    state.selectedGame=game;
    $('ot-game-title').textContent=game.white+' — '+game.black+' · '+game.result;
    showGameSubtab('notation');
    onPositionChange({wikiAuto:false});
    notice('Game loaded. Navigate its notation with the footer below.');
  }catch(error){notice('This game has an invalid or unsupported PGN.');}
}
function onPositionChange({wikiAuto=true}={}){
  renderBoard();
  renderAnalysis();
  renderExplorer();
  if(state.selectedGame)renderNotation($('ot-game-moves'),currentPreferredLine());
  if(state.engineOn&&state.tab!=='practice')requestEngine();
  if(state.tab==='wikibook')requestWiki();
  else if(wikiAuto&&state.tab==='analysis'&&state.autoWiki&&!state.lockTab)requestWiki({auto:true});
}
function selectTab(tab,{focus=false,fromUser=false}={}){
  if(!['analysis','practice','games','opening','wikibook'].includes(tab))return;
  const previous=state.tab;
  state.tab=tab;
  document.querySelectorAll('[data-ot-tab]').forEach(button=>{
    const isActive=button.dataset.otTab===tab;
    button.setAttribute('aria-selected',String(isActive));
    button.tabIndex=isActive?0:-1;
    if(isActive&&focus)button.focus();
  });
  document.querySelectorAll('[data-ot-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.otPanel!==tab;
  });
  if(tab==='games'&&!$('ot-game-search').value.trim()&&state.opening.name!=='Starting position'){
    $('ot-game-search').value=state.opening.name.split(/[,:\-]/)[0].split(/\s+/).slice(0,2).join(' ');
    renderGameCategories();
  }
  $('ot-panel-scroll').scrollTop=0;
  renderBoard();renderAnalysis();
  if(tab==='practice')renderRepertoires();
  if(tab==='opening'){renderEcoList();renderExplorer();}
  if(tab==='wikibook')requestWiki();
  if(tab==='analysis'&&(!state.engineOn)&&fromUser)enableEngine();
  if(tab==='analysis'&&state.engineOn&&previous==='practice')requestEngine();
}
function openSaveDialog(trainAfter){
  if(study.ply===0){notice('Explore a line before saving.');return;}
  $('ot-save-name').value=state.opening.name==='Starting position'?'My Opening':state.opening.name;
  $('ot-save-side').value='white';
  $('ot-save-scope').value=study.leaves().length>1?'branches':'line';
  $('ot-save-error').hidden=true;
  $('ot-save-dialog').dataset.trainAfter=String(trainAfter);
  $('ot-save-dialog').showModal();
  $('ot-save-name').focus();
}
function commitSave(trainAfter){
  try {
    const rep=buildRepertoire(study,{
      name:$('ot-save-name').value,eco:state.opening.eco,
      side:$('ot-save-side').value,scope:$('ot-save-scope').value
    });
    const result=storeRepertoire(rep);
    if(!result.ok)throw Error(result.reason);
    state.repertoires=result.items;
    $('ot-save-dialog').close();
    renderRepertoires();
    if(trainAfter)startTraining(rep);
    else notice('Saved '+rep.name+' in this browser. Choose Practice to memorize it.');
  }catch(error){
    $('ot-save-error').textContent=error.message;
    $('ot-save-error').hidden=false;
  }
}
board.on('moveAttempt',payload=>{
  if(state.tab==='practice'){
    if(state.training)handleTrainingMove(payload);
    else notice('Save and select a repertoire to start Practice.');
    return;
  }
  if(state.tab==='games')return;
  const result=study.move(payload);
  if(!result.ok){notice(result.reason);return;}
  state.selectedGame=null;
  onPositionChange();
});
board.on('dragStart',square=>{
  if(state.tab==='games'||(state.tab==='practice'&&!state.training))return false;
  const color=activeFen().split(' ')[1]==='w'?'white':'black';
  return board.getPieceAt(square)?.color===color;
});
board.on('promotionRequest',()=>{
  const choice=window.prompt('Promote to Q, R, B, or N','Q');
  return /^[QRBN]$/i.test(String(choice||''))?choice.toUpperCase():'Q';
});
const boardColumn=document.querySelector('.ot-board-column');
const panel=document.querySelector('.ot-panel');
function syncPanelHeight(){
  if(window.matchMedia('(max-width:980px)').matches){panel.style.removeProperty('--ot-workspace-height');return;}
  const h=Math.ceil(boardColumn.getBoundingClientRect().height);
  if(h>0)panel.style.setProperty('--ot-workspace-height',h+'px');
}
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(syncPanelHeight).observe(boardColumn);
}
window.addEventListener('resize',syncPanelHeight,{passive:true});
document.querySelectorAll('[data-ot-tab]').forEach((button,index,buttons)=>{
  button.addEventListener('click',()=>selectTab(button.dataset.otTab,{fromUser:true}));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
      (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    selectTab(buttons[next].dataset.otTab,{focus:true,fromUser:true});
  });
});
$('ot-auto-wiki').addEventListener('change',e=>{state.autoWiki=e.target.checked;});
$('ot-lock-tab').addEventListener('change',e=>{state.lockTab=e.target.checked;});
$('ot-save').addEventListener('click',()=>openSaveDialog(false));
$('ot-save-train').addEventListener('click',()=>openSaveDialog(true));
$('ot-confirm-save').addEventListener('click',()=>commitSave(false));
$('ot-confirm-save-train').addEventListener('click',()=>commitSave(true));
$('ot-save-cancel').addEventListener('click',()=>$('ot-save-dialog').close());
$('ot-save-form').addEventListener('submit',event=>event.preventDefault());
$('ot-reset').addEventListener('click',()=>{
  if(state.training)stopTraining();
  study.reset();state.selectedGame=null;onPositionChange({wikiAuto:false});
  notice('New opening study. Move any legal piece to begin.');
});
$('ot-flip').addEventListener('click',()=>{
  state.orientation=state.orientation==='white'?'black':'white';
  board.setOrientation(state.orientation);
});
$('ot-engine-toggle').addEventListener('click',()=>{
  if(state.engineOn)disableEngine();
  else enableEngine();
});
for(const [id,direction] of [['ot-first','first'],['ot-prev','previous'],['ot-next','next'],['ot-last','last']]){
  $(id).addEventListener('click',()=>{
    if(state.tab==='practice'&&state.training)return;
    if(study.navigate(direction))onPositionChange({wikiAuto:false});
  });
}
$('ot-eco-search').addEventListener('input',renderEcoList);
$('ot-eco-mode').addEventListener('click',()=>{
  state.openingSubtab='eco';
  $('ot-eco-content').hidden=false;$('ot-explorer-content').hidden=true;
  $('ot-eco-mode').setAttribute('aria-pressed','true');$('ot-explorer-mode').setAttribute('aria-pressed','false');
});
$('ot-explorer-mode').addEventListener('click',()=>{
  state.openingSubtab='explorer';
  $('ot-eco-content').hidden=true;$('ot-explorer-content').hidden=false;
  $('ot-eco-mode').setAttribute('aria-pressed','false');$('ot-explorer-mode').setAttribute('aria-pressed','true');
  renderExplorer();
});
$('ot-game-search').addEventListener('input',()=>{
  state.selectedCollection=null;state.games=[];$('ot-game-results').replaceChildren();
  renderGameCategories();setBusyText('ot-games-message','Select a matching opening collection.');
});
$('ot-games-list-tab').addEventListener('click',()=>showGameSubtab('games'));
$('ot-games-notation-tab').addEventListener('click',()=>showGameSubtab('notation'));
$('ot-back-games').addEventListener('click',()=>showGameSubtab('games'));
$('ot-practice-hint').addEventListener('click',()=>{
  const session=state.training;
  if(!session||session.done)return;
  const move=session.path[session.ply];
  if(!move)return;
  session.hints++;
  board.highlightSquares([{square:move.uci.slice(0,2),type:'hint'}]);
  showPracticeStatus('Hint: look at the highlighted starting square. Find the continuation.');
});
$('ot-practice-replay').addEventListener('click',()=>{
  if(state.activeRepertoire)startTraining(state.activeRepertoire);
});
$('ot-practice-stop').addEventListener('click',stopTraining);
async function loadEcoCatalog(){
  const resolver=window.CaissaEcoOpeningResolver;
  try{state.ecoRows=await resolver.loadCatalog();}
  catch(_){state.ecoRows=[];}
  renderEcoList();renderExplorer();renderOpeningHeader();
}
async function loadGameCatalog(){
  try{
    const response=await fetch('/api/pgn/opening',{headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('Catalog unavailable');
    const json=await response.json();
    if(!Array.isArray(json.openings)||json.access!=='free')throw Error('Unexpected opening catalog');
    state.gameCollections=json.openings.filter(x=>
      typeof x.title==='string'&&/^[A-Za-z0-9][A-Za-z0-9._()\-]{0,119}\.zip$/.test(x.file));
    renderGameCategories();
  }catch(_){
    setBusyText('ot-games-message','Could not reach the game catalog. Try again later.');
  }
}
window.addEventListener('pagehide',()=>{
  cancelWiki();state.engine?.disable();board.destroy();
});
renderAnalysis();renderRepertoires();renderBoard();syncPanelHeight();
loadEcoCatalog();loadGameCatalog();
enableEngine(); // Analysis is the default tab: start engine lazily on page entry
