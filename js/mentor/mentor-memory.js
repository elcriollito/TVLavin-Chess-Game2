import { validateFen, DEFAULT_POSITION } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
// Memory Training domain state only. Reconstructed placement is a draft, never
// a chess move, PGN variation, puzzle rating, clinical score or engine verdict.
export const MEMORY_POSITIONS = Object.freeze([
    { id: 'opposition-a', title: 'Kings and a supported pawn', pattern: 'King activity', fen: '8/4k3/8/4K3/4P3/8/8/8 w - - 0 1' },
    { id: 'opposition-b', title: 'A queenside pawn ending', pattern: 'King activity', fen: '8/2k5/8/2K5/2P5/8/8/8 w - - 0 1' },
    { id: 'opposition-c', title: 'A kingside pawn ending', pattern: 'King activity', fen: '8/6k1/8/6K1/6P1/8/8/8 w - - 0 1' },
    { id: 'opposition-d', title: 'The king leads the pawn', pattern: 'King activity', fen: '8/3k4/8/3K4/3P4/8/8/8 w - - 0 1' },
    { id: 'opposition-e', title: 'King beside the pawn', pattern: 'King activity', fen: '8/5k2/8/5K2/4P3/8/8/8 w - - 0 1' },
    { id: 'opposition-f', title: 'A central pawn ending', pattern: 'King activity', fen: '8/2k5/8/2K5/3P4/8/8/8 w - - 0 1' },
    { id: 'opposition-plus', title: 'A king with two supported pawns', pattern: 'King activity', fen: '8/4k3/8/4K3/3PP3/8/8/8 w - - 0 1' },
    { id: 'fork-a', title: 'A knight near two targets', pattern: 'Knight fork', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1' },
    { id: 'fork-b', title: 'The knight gives check', pattern: 'Knight fork', fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 1 1' },
    { id: 'shield-a', title: 'A compact king shelter', pattern: 'Pawn shelter', fen: '6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1' }
].map(item => Object.freeze(item)));

export const MEMORY_LEVELS = Object.freeze([
    {id:'beginner',label:'Beginner',min:3,max:7},
    {id:'elementary',label:'Elementary',min:8,max:12},
    {id:'intermediate',label:'Intermediate',min:13,max:17},
    {id:'advanced',label:'Advanced',min:18,max:22},
    {id:'expert',label:'Expert',min:23,max:27},
    {id:'master',label:'Master',min:28,max:32}
].map(Object.freeze));
export function memoryPositionInfo(fen) {
    if (typeof fen!=='string' || !validateFen(fen).ok) return null;
    const placement=fen.split(' ')[0];
    const pieceCount=(placement.match(/[kqrbnp]/gi)||[]).length;
    const level=MEMORY_LEVELS.find(item=>pieceCount>=item.min&&pieceCount<=item.max);
    if(!level || placement===DEFAULT_POSITION.split(' ')[0]) return null;
    return Object.freeze({pieceCount,level:level.id,densityScore:Math.round(100*(pieceCount-3)/29),placement});
}
export function chooseMemoryPosition(candidates,levelId,previousFen=null,random=Math.random) {
    const previous=previousFen?.split(' ')[0], unique=new Map();
    for(const candidate of candidates){const info=memoryPositionInfo(candidate.fen);
        if(info?.level===levelId && info.placement!==previous && !unique.has(info.placement))unique.set(info.placement,candidate);
    }
    const pool=[...unique.values()];if(!pool.length)return null;
    const draw=Number(random());const index=Math.floor(Math.max(0,Math.min(.999999999,Number.isFinite(draw)?draw:0))*pool.length);
    return pool[index];
}

const codes = new Set(['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP']);
const names = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const freeze = value => Object.freeze(value);
function piecesFromFen(fen) {
    const result = {};
    fen.split(' ')[0].split('/').forEach((row, rank) => { let file = 0;
        for (const token of row) { if (/\d/.test(token)) file += Number(token); else {
            result[`${'abcdefgh'[file++]}${8-rank}`] = `${token === token.toUpperCase() ? 'w' : 'b'}${token.toUpperCase()}`;
        } }
    }); return result;
}
export function memoryPlacement(pieces) {
    return Array.from({length:8}, (_, rank) => { let empty = 0, row = '';
        for (let file=0; file<8; file++) { const code = pieces[`${'abcdefgh'[file]}${8-rank}`];
            if (!code) empty++; else { if (empty) { row+=empty;empty=0; } row += code[0] === 'w' ? code[1] : code[1].toLowerCase(); }
        } return row + (empty || ''); }).join('/');
}
export function createMemoryTraining({ ownerId = 'guest' } = {}) {
    let owner=ownerId, sequence=0, session=1, active=null, results=[], score=50, notification=null;
    const seen = new Set();
    const read = () => freeze({ ownerId:owner, phase:active?.phase || 'idle', exercise:active?.exercise || null,
        mode:active?.mode || null, attemptId:active?.id || null, draft:freeze({...active?.draft}),
        result:active?.result || null, score, scoredAttempts:results.filter(item=>item.scored).length,
        practiceAttempts:results.filter(item=>!item.scored).length, results:freeze([...results]), notification });
    function begin(exercise,mode) {
        if ((active && active.phase!=='result') || !['practice','challenge'].includes(mode) || !memoryPositionInfo(exercise?.fen)) return false;
        const identity=exercise.fen.split(' ')[0];
        const actualMode=mode==='challenge'&&!seen.has(identity)?'challenge':'practice';
        seen.add(identity);
        active={sessionId:session,id:`${owner}:${++sequence}`,exercise:Object.freeze({...exercise}),mode:actualMode,phase:'observe',draft:{},result:null};return true;
    }
    function recommend() {
        const scored=results.filter(item=>item.scored), last=scored.at(-1);
        if (!last) return;
        const comparable=scored.filter(item=>item.pieceCount===last.pieceCount && item.pattern===last.pattern).slice(-6);
        if (comparable.length < 3) return;
        const average=comparable.reduce((sum,item)=>sum+item.accuracy,0)/comparable.length;
        let kind=null, message='', target=last.exerciseId;
        const level=MEMORY_LEVELS.find(item=>last.pieceCount>=item.min&&last.pieceCount<=item.max);
        if (comparable.length >= 6 && new Set(comparable.map(item=>item.sessionId)).size >= 3 && Math.max(...comparable.map(x=>x.accuracy))-Math.min(...comparable.map(x=>x.accuracy)) <= .1 && average >= .5 && average < .85) {
            kind='question';message=`Your last ${comparable.length} comparable scored rounds had similar recall accuracy. Would you like to change just the position while keeping the same piece-count level? This is a practice suggestion, not a health assessment.`;
        } else if (average<.5) {
            kind='finding';message=`Across ${comparable.length} comparable scored rounds, immediate recall accuracy averaged ${Math.round(average*100)}%. Let’s practise at this same piece-count level with no time limit before adding difficulty.`;
        } else if (average>=.85) {
            kind='idea';
            message=`Across ${comparable.length} comparable scored rounds, immediate recall accuracy averaged ${Math.round(average*100)}%. You could try a new position at this level in untimed practice.`;
        }
        if (kind) notification=freeze({ id:`memory-${owner}-${last.id}`, kind, message, exerciseId:target, level:level.id, pieceCount:last.pieceCount, unread:true });
    }
    return freeze({
        read,
        start(exerciseId,mode='practice') {
            return begin(MEMORY_POSITIONS.find(item=>item.id===exerciseId),mode);
        },
        startPosition(fen,{id='study-position',source='opening-study',level=null,pattern='Position memory'}={},mode='practice') {
            const info=memoryPositionInfo(fen);if(!info || (level&&info.level!==level))return false;
            return begin({id,title:'Memory position',pattern,source,fen},mode);
        },
        startRandom(levelId,mode='practice',random=Math.random) {
            const choice=chooseMemoryPosition(MEMORY_POSITIONS,levelId,active?.exercise.fen,random);
            return choice ? begin({...choice,source:'authored-local'},mode) : false;
        },
        retry() {
            if(active?.phase!=='result' || active.result.accuracy===1)return false;
            const target=active.exercise;active=null;return begin(target,'practice');
        },
        hide() { if (active?.phase!=='observe') return false;active.phase='reconstruct';return true; },
        place(square,code) {
            if (active?.phase!=='reconstruct' || !/^[a-h][1-8]$/.test(square) || (code!==null && !codes.has(code))) return false;
            if (code===null) delete active.draft[square]; else active.draft[square]=code;return true;
        },
        check() {
            if (active?.phase!=='reconstruct') return null;
            const expected=piecesFromFen(active.exercise.fen), squares=new Set([...Object.keys(expected),...Object.keys(active.draft)]);
            const feedback=[...squares].sort().map(square=>{const actual=active.draft[square] || null, target=expected[square] || null;
                const ok=actual===target;const label=code=>code ? `${code[0]==='w'?'White':'Black'} ${names[code[1]]}` : 'empty';
                return freeze({square,ok,expected:target,actual,explanation:ok ? `${square}: ${label(target)} correctly recalled.` : `${square}: expected ${label(target)}; you placed ${label(actual)}.`});
            });
            const correct=feedback.filter(item=>item.ok && item.expected).length;
            const accuracy=correct / squares.size, scored=active.mode==='challenge';
            const result=freeze({id:active.id,sessionId:active.sessionId,exerciseId:active.exercise.id,pattern:active.exercise.pattern,pieceCount:Object.keys(expected).length,
                accuracy,correct,scored,feedback:freeze(feedback)});
            if (scored) score=Math.max(0,Math.min(100,score+Math.round((accuracy-.5)*10)));
            results.push(result);if(results.length>100)results.shift();
            active.phase='result';active.result=result;if(scored)recommend();return result;
        },
        acknowledge() { if(notification)notification=freeze({...notification,unread:false});return notification; },
        stop() { active=null; },
        newSession() { active=null;session++; },
        reset(nextOwner='guest') {owner=nextOwner;sequence=0;session=1;active=null;results=[];score=50;notification=null;seen.clear();}
    });
}
