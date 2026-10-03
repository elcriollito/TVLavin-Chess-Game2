import { readOpeningEntry } from './mentor-openingdb-stream.js';
import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { hashFen,normalizeFenForHash } from './mentor-openingdb-key.js';
export { hashFen,normalizeFenForHash } from './mentor-openingdb-key.js';
const count=n=>{if(!Number.isSafeInteger(n)||n<0)throw new Error('Opening Database counts are invalid.');return n;};
export function normalizeExplorer(fen,entry,{version='',maxPlies=null}={}) {
    new Chess(fen);const raw=entry?.moves;
    if(entry&&(!Array.isArray(raw)||raw.length>100))throw new Error('Opening Database move data is invalid.');
    const seen=new Set(),moves=[];let total=0;
    for(const row of raw||[]){const uci=row?.uci;if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)||seen.has(uci))throw new Error('Opening Database move data is invalid.');
        const games=count(row.games),w=row.w,d=row.d,l=row.l;if(![w,d,l].every(n=>Number.isFinite(n)&&n>=0&&n<=100)||Math.abs(w+d+l-100)>.21)throw new Error('Opening Database result percentages are invalid.');
        const chess=new Chess(fen);let move;try{move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});}catch{}if(!move)throw new Error('Opening Database contains an illegal continuation for this exact position.');
        seen.add(uci);total+=games;if(!Number.isSafeInteger(total))throw new Error('Opening Database counts are too large.');
        moves.push({uci,san:move.san,total:games,white:w,draws:d,black:l,avgElo:Number.isFinite(row.avgElo)?row.avgElo:null,lastYear:Number.isInteger(row.lastYear)?row.lastYear:null});
    }
    moves.sort((a,b)=>b.total-a.total);
    return Object.freeze({total,rateUnit:'percent',opening:null,version,maxPlies,matchLevel:entry?'exact':'none',coverage:'listed-continuations',source:'caissa-opening-database',moves:Object.freeze(moves.map(row=>Object.freeze({...row,popularity:total?row.total/total*100:0})))});
}
export function createExplorerClient({fetchFn=globalThis.fetch,timeoutMs=30000,now=Date.now,maxCache=32,ttl=300000}={}) {
    const cache=new Map();let controller=null,version=0,cooldown=0,manifest=null;
    function cancel(){version++;controller?.abort();controller=null;}
    return Object.freeze({cancel,clear(){cancel();cache.clear();manifest=null;},async load(fen){
        new Chess(fen);cancel();const token=version,key=normalizeFenForHash(fen),hit=cache.get(key);
        if(hit&&now()-hit.at<ttl){cache.delete(key);cache.set(key,hit);return hit.data;}
        if(now()<cooldown)throw new Error('Opening Database is rate limited. Wait before trying again.');
        const local=new AbortController();controller=local;let timer;
        const guard=new Promise((_,reject)=>{local.signal.addEventListener('abort',()=>reject(new Error('Opening Database request cancelled.')),{once:true});timer=setTimeout(()=>{reject(new Error('Opening Database timed out. Try again.'));local.abort();},timeoutMs);});
        async function read(url,hash=null){const response=await fetchFn(url,{signal:local.signal,credentials:'omit',headers:{Accept:'application/json'}});
            if(response.status===429){const header=response.headers?.get('Retry-After'),retry=Number(header),date=Date.parse(header);cooldown=Number.isFinite(retry)&&retry>0?now()+retry*1000:Number.isFinite(date)&&date>now()?date:now()+60000;throw new Error('Opening Database is rate limited. Wait before trying again.');}
            if(!response.ok)throw new Error(`Opening Database unavailable (HTTP ${response.status}).`);
            const payload=hash?await readOpeningEntry(response,hash,{signal:local.signal}):await response.json();if(token!==version||local.signal.aborted)throw new Error('Opening Database request cancelled.');return payload;
        }
        try{const work=(async()=>{
            if(!manifest||now()-manifest.at>=ttl){const payload=await read('/openingdb/manifest.json');
                if(!/^v[0-9]+(?:_[a-zA-Z0-9]+)?$/.test(payload?.activeVersion)||payload.hash?.algo!=='sha1'||payload.hash?.len!==16)throw new Error('Opening Database manifest is unsupported.');
                manifest={at:now(),data:payload};cache.clear();
            }
            const meta=manifest.data,hash=hashFen(key),url=`/openingdb/shards/${meta.activeVersion}/${hash.slice(0,2)}.json`;
            const entry=await read(url,hash);
            return normalizeExplorer(fen,entry,{version:meta.activeVersion,maxPlies:Number.isInteger(meta.maxPlies)?meta.maxPlies:null});
        })();
        const data=await Promise.race([work,guard]);if(token!==version)throw new Error('Opening Database request cancelled.');cache.set(key,{at:now(),data});while(cache.size>maxCache)cache.delete(cache.keys().next().value);return data;
        }finally{clearTimeout(timer);if(controller===local)controller=null;}
    }});
}
