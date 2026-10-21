import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';

export const REPERTOIRE_KEY = 'caissa.opening-trainer.repertoires.v1';
const STORAGE_LIMIT = 40;
const MAX_PATHS = 64;
const MAX_PLIES = 120;
const START_FEN = new Chess().fen();

export function sanTokens(text) {
  return String(text || '').split(/\s+/)
    .map(token => token.replace(/^\d+\.(?:\.\.)?/, '').trim())
    .filter(token => token && !/^(?:\d+\.{1,3}|1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

export function wikibookTitle(history) {
  const moves = (history || []).map(x => typeof x === 'string' ? x : x.san);
  if (!moves.length || moves.length > MAX_PLIES
      || moves.some(san => !/^[a-hKQRBNO0x=+#\-1-8!?]+$/.test(String(san)))) return null;
  return 'Chess_Opening_Theory/' + moves.map((san, i) =>
    (Math.floor(i / 2) + 1) + (i % 2 ? '...' : '._') + String(san).replace(/0-0/g, 'O-O')
  ).join('/');
}

const clone = value => JSON.parse(JSON.stringify(value));
export class OpeningStudy {
  constructor() { this.chess = new Chess(); this.reset(); }
  reset() {
    this.chess.reset();
    this.nodes = new Map([['root', {
      id:'root', parent:null, san:'', uci:'', fen:START_FEN, ply:0, children:[], preferred:null
    }]]);
    this.cursor = 'root';
    this.nextId = 0;
  }
  get current() { return this.nodes.get(this.cursor); }
  get fen() { return this.current.fen; }
  get ply() { return this.current.ply; }
  path(id = this.cursor) {
    const result = [];
    let node = this.nodes.get(id);
    while (node && node.id !== 'root') {
      result.push(node);
      node = this.nodes.get(node.parent);
    }
    return result.reverse();
  }
  gameHistory() { return this.path().map(n => n.san); }
  move(raw) {
    if (this.ply >= MAX_PLIES) return {ok:false, reason:'Study lines are limited to 120 plies.'};
    this.chess.load(this.fen);
    let move;
    try {
      const request = typeof raw === 'string' ? raw : {
        from:raw.from, to:raw.to, promotion:String(raw.promotion || 'q').toLowerCase()
      };
      move = this.chess.move(request);
    } catch (_) { move = null; }
    if (!move) return {ok:false, reason:'That move is not legal in this position.'};
    const uci = move.from + move.to + (move.promotion || '');
    const parent = this.current;
    const reuse = parent.children.map(id => this.nodes.get(id)).find(node => node.uci === uci);
    if (reuse) {
      parent.preferred = reuse.id;
      this.cursor = reuse.id;
    } else {
      const id = 'm' + (++this.nextId);
      this.nodes.set(id, {
        id, parent:parent.id, san:move.san, uci, fen:this.chess.fen(),
        ply:parent.ply+1, children:[], preferred:null
      });
      parent.children.push(id);
      parent.preferred = id;
      this.cursor = id;
    }
    return {ok:true, move, fen:this.fen};
  }
  focus(id) {
    if (!this.nodes.has(id)) return false;
    this.cursor = id;
    const node = this.current;
    if (node.parent) this.nodes.get(node.parent).preferred = id;
    this.chess.load(node.fen);
    return true;
  }
  navigate(direction) {
    const current = this.current;
    if (direction === 'first') return this.focus('root');
    if (direction === 'previous') return current.parent ? this.focus(current.parent) : false;
    if (direction === 'next') return current.preferred ? this.focus(current.preferred) : false;
    if (direction === 'last') {
      let node = current;
      while (node.preferred) node = this.nodes.get(node.preferred);
      return this.focus(node.id);
    }
    return false;
  }
  leaves(maxPaths = MAX_PATHS) {
    const paths = [];
    const visit = (node, prefix) => {
      if (paths.length >= maxPaths) return;
      if (!node.children.length) { if(prefix.length) paths.push(prefix.map(n=>({san:n.san,uci:n.uci,fen:n.fen}))); return; }
      for (const id of node.children) visit(this.nodes.get(id), [...prefix,this.nodes.get(id)]);
    };
    visit(this.nodes.get('root'), []);
    return paths;
  }
  loadSans(moves) {
    this.reset();
    for (const san of (moves || []).slice(0,MAX_PLIES)) {
      const step = this.move(san);
      if (!step.ok) {this.reset();return false;}
    }
    return true;
  }
}

export function buildRepertoire(study, {name, eco='', side='white', scope='line'} = {}) {
  if (!['white','black'].includes(side)) throw new Error('Choose White or Black.');
  if (!study?.path().length) throw new Error('Explore at least one move before saving.');
  const path = study.path().map(n=>({san:n.san,uci:n.uci,fen:n.fen}));
  const paths = scope === 'branches' ? study.leaves() : [path];
  if (!paths.length) throw new Error('There are no lines to save.');
  const label=String(name||'My opening').trim().slice(0,100) || 'My opening';
  return {
    version:1, id:'rep-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),
    name:label, eco:String(eco||'').slice(0,3), side,
    scope:scope === 'branches'?'branches':'line', paths:clone(paths),
    createdAt:new Date().toISOString()
  };
}

export function isRepertoire(value) {
  return !!value && value.version===1 && typeof value.id==='string'
    && /^[a-z0-9-]{4,80}$/.test(value.id) && typeof value.name==='string'
    && ['white','black'].includes(value.side) && Array.isArray(value.paths)
    && value.paths.length>=1 && value.paths.length<=MAX_PATHS
    && value.paths.every(path=>Array.isArray(path) && path.length>0 && path.length<=MAX_PLIES
      && path.every(move=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move?.uci||'')
        && typeof move?.san==='string' && move.san.length<20));
}

export function readRepertoires(storage) {
  try {
    const safeStorage=storage ?? globalThis.localStorage;
    const text=safeStorage?.getItem(REPERTOIRE_KEY);
    if (!text || text.length>500000) return [];
    const parsed=JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isRepertoire).slice(0,STORAGE_LIMIT) : [];
  } catch (_) {return [];}
}

export function storeRepertoire(repertoire, storage) {
  if (!isRepertoire(repertoire)) return {ok:false,reason:'Invalid repertoire.'};
  try {
    const safeStorage=storage ?? globalThis.localStorage;
    if (!safeStorage) return {ok:false,reason:'Browser storage is not available.'};
    const previous=readRepertoires(safeStorage);
    const updated=[repertoire,...previous.filter(x=>x.id!==repertoire.id)].slice(0,STORAGE_LIMIT);
    safeStorage.setItem(REPERTOIRE_KEY,JSON.stringify(updated));
    return {ok:true,items:updated};
  } catch (_) {
    return {ok:false,reason:'This browser could not save the repertoire.'};
  }
}

export function newTrainingSession(repertoire, pathIndex=0) {
  if (!isRepertoire(repertoire)) throw new Error('Invalid repertoire.');
  const path=repertoire.paths[pathIndex] || repertoire.paths[0];
  const game=new Chess();
  // Reconstruct the position from legal saved UCI moves. Never trust saved FEN values.
  const canonical=[];
  for (const step of path) {
    const uci=step.uci;
    const move=game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
    if (!move) throw new Error('Saved moves contain an illegal continuation.');
    canonical.push({san:move.san,uci,fen:game.fen(),color:move.color});
  }
  game.reset();
  return {game,path:canonical,side:repertoire.side,ply:0,misses:0,hints:0,done:false};
}

export function advanceOpponent(session) {
  while (!session.done && session.ply<session.path.length
      && session.path[session.ply].color !== (session.side==='white'?'w':'b')) {
    const uci=session.path[session.ply].uci;
    session.game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
    session.ply += 1;
  }
  session.done=session.ply>=session.path.length;
  return session;
}

export function attemptTrainingMove(session, attempt) {
  if (!session || session.done) return {ok:false,reason:'Training finished.'};
  const expected=session.path[session.ply];
  if (!expected || expected.color !== (session.side==='white'?'w':'b')) return {ok:false,reason:'CAISSA is to move.'};
  const before=session.game.fen();
  let move=null;
  try {move=session.game.move({
    from:attempt.from,to:attempt.to,promotion:String(attempt.promotion||'q').toLowerCase()
  });} catch (_) {}
  if (!move) return {ok:false,reason:'Illegal move — try again.'};
  const uci=move.from+move.to+(move.promotion||'');
  if (uci!==expected.uci) {
    session.game.load(before);
    session.misses+=1;
    return {ok:false,reason:'Legal move, but not part of the saved line. Try again or ask for a hint.'};
  }
  session.ply+=1;
  advanceOpponent(session);
  return {ok:true,done:session.done,san:move.san};
}
