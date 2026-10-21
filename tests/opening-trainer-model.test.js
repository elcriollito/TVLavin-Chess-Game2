import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import {
  OpeningStudy, REPERTOIRE_KEY, sanTokens, wikibookTitle, buildRepertoire,
  isRepertoire, readRepertoires, storeRepertoire,
  newTrainingSession, advanceOpponent, attemptTrainingMove
} from '../js/opening-trainer/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here,'..');

function createStudy(moves = ['e4','c5','Nf3','d6']) {
  const study = new OpeningStudy();
  for (const san of moves) assert.equal(study.move(san).ok,true,'valid SAN '+san);
  return study;
}
function mockStorage() {
  const m=new Map();
  return {
    getItem:k=>m.get(k)||null,
    setItem:(k,v)=>m.set(k,v),
    removeItem:k=>m.delete(k),
    keys:()=>[...m.keys()]
  };
}

test('sanTokens reads the canonical ECO history without numbering',()=>{
  assert.deepEqual(sanTokens('1. e4 c5 2. Nf3 d6 3. d4 cxd4'),['e4','c5','Nf3','d6','d4','cxd4']);
  assert.deepEqual(sanTokens('1. e4 e5 2. Nf3 Nc6 1-0'),['e4','e5','Nf3','Nc6']);
});

test('WikiBook titles use Wikibooks SAN path segments',()=>{
  assert.equal(wikibookTitle([]),null);
  assert.equal(wikibookTitle(['e4','c5']),'Chess_Opening_Theory/1._e4/1...c5');
  assert.equal(wikibookTitle(['e4','e5','Nf3','Nc6']), 'Chess_Opening_Theory/1._e4/1...e5/2._Nf3/2...Nc6');
});

test('single analysis session preserves exact legal FEN and 2 branches',()=>{
  const study=createStudy(['e4','c5','Nf3']);
  const fenBefore=study.fen;
  const original=study.cursor;
  assert.equal(study.move('e5').ok,false,'illegal black pawn move when White to move');
  assert.equal(study.fen,fenBefore);
  assert.equal(study.navigate('previous'),true);
  const node=study.cursor;
  assert.equal(study.move('Nc3').ok,true,'fork from 1.e4 c5');
  assert.equal(study.nodes.get(node).children.length,2);
  assert.equal(study.leaves().length,2);
  assert.equal(study.focus(original),true);
  assert.equal(study.gameHistory().join(' '),'e4 c5 Nf3');
  assert.equal(study.navigate('first'),true);
  assert.equal(study.gameHistory().length,0);
  assert.equal(study.move('e4').ok,true,'existing move re-used');
  assert.equal(study.nodes.get('root').children.length,1);
  assert.equal(study.navigate('last'),true,'selected preferred child navigation follows fork');
});

test('Saving chosen line stores legal UCI moves and chosen color locally',()=>{
  const study=createStudy();
  const rep=buildRepertoire(study,{name:'My Sicilian',eco:'B20',side:'black'});
  assert.equal(rep.side,'black');
  assert.equal(rep.paths.length,1);
  assert.deepEqual(rep.paths[0].map(m=>m.uci),['e2e4','c7c5','g1f3','d7d6']);
  assert.equal(isRepertoire(rep),true);
  const storage=mockStorage();
  assert.equal(storeRepertoire(rep,storage).ok,true);
  assert.equal(readRepertoires(storage).length,1);
  assert.deepEqual(storage.keys(),[REPERTOIRE_KEY]);
  assert.equal(readRepertoires({getItem(){throw Error('disabled');}}).length,0);
  assert.equal(storeRepertoire(rep,{setItem(){throw Error('disabled');},getItem(){return null;}}).ok,false);
});

test('Practice Black: CAISSA moves White, user must recall saved Black moves',()=>{
  const rep=buildRepertoire(createStudy(),{name:'Sicilian',side:'black'});
  const training=newTrainingSession(rep);
  advanceOpponent(training);
  assert.equal(training.ply,1);
  assert.equal(training.game.fen().split(' ')[1],'b');
  const before=training.game.fen();
  const alternate=attemptTrainingMove(training,{from:'e7',to:'e5'});
  assert.equal(alternate.ok,false);
  assert.match(alternate.reason,/saved line/);
  assert.equal(training.game.fen(),before);
  assert.equal(training.misses,1);
  const expected=attemptTrainingMove(training,{from:'c7',to:'c5'});
  assert.equal(expected.ok,true);
  assert.equal(training.ply,3,'automatic White 2.Nf3 after correct Black 1...c5');
  assert.equal(training.game.history().join(' '),'e4 c5 Nf3');
  assert.equal(attemptTrainingMove(training,{from:'d7',to:'d6'}).done,true);
});

test('Practice White: CAISSA replies with saved Black moves, without revealing future answer',()=>{
  const rep=buildRepertoire(createStudy(),{name:'Sicilian',side:'white'});
  const training=newTrainingSession(rep);
  advanceOpponent(training);
  assert.equal(training.ply,0);
  assert.equal(attemptTrainingMove(training,{from:'e2',to:'e4'}).ok,true);
  assert.equal(training.ply,2,'CAISSA replies 1...c5');
  assert.equal(attemptTrainingMove(training,{from:'g1',to:'f3'}).done,true,'CAISSA replies with ...d6 then finishes');
  assert.equal(training.game.history().join(' '),'e4 c5 Nf3 d6');
});

test('Saved training never trusts injected FEN and rejects illegal stored UCI',()=>{
  const rep=buildRepertoire(createStudy(['e4']),{name:'test',side:'white'});
  rep.paths[0][0].fen='fake malicious FEN';
  const training=newTrainingSession(rep);
  assert.equal(training.path[0].fen,new Chess().move('e4')&&createStudy(['e4']).fen);
  rep.paths[0][0].uci='e2e5'; // UCI shape valid but chess legality invalid
  assert.throws(()=>newTrainingSession(rep),/illegal continuation/);
});

test('Page shell follows five tabs + one fixed FOOT and reused product owners',()=>{
  const html=fs.readFileSync(path.join(root,'opening-trainer.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'css/opening-trainer.css'),'utf8');
  const js=fs.readFileSync(path.join(root,'js/opening-trainer/page.js'),'utf8');
  const tabs=[...html.matchAll(/data-ot-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(tabs,['analysis','practice','games','opening','wikibook']);
  for(const id of ['ot-board','ot-engine-score','ot-engine-line','ot-flip','ot-engine-toggle','ot-first','ot-prev','ot-next','ot-last','ot-save','ot-save-train','ot-practice-replay']) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.ok(css.includes('flex: 1 1 auto; min-height: 0; overflow-y: auto'), 'scroll owner BODY');
  assert.ok(css.includes('.ot-panel-foot-wrap { flex: none'), 'FOOT stays pinned');
  assert.match(js,/CaissaBoardAdapter/);
  assert.match(js,/PgnAnalysisEngine/);
  assert.match(js,/board\.drawArrow/);
  assert.match(js,/loadWikibook/);
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.ok(vercel.rewrites.some(r=>r.source==='/opening-trainer'&&r.destination==='/opening-trainer.html'));
});

test('WikiBook input remains text-only and carries required provenance',()=>{
  const src=fs.readFileSync(path.join(root,'js/opening-trainer/wikibook.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'opening-trainer.html'),'utf8');
  assert.doesNotMatch(src,/\.innerHTML\s*=/);
  assert.match(src,/textContent/);
  assert.match(html,/en\.wikibooks\.org\/wiki\/Chess_Opening_Theory/);
  assert.match(html,/creativecommons\.org\/licenses\/by-sa/);
});
