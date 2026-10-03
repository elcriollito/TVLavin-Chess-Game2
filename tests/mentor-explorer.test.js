import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { hashFen,normalizeFenForHash,normalizeExplorer,createExplorerClient } from '../js/mentor/mentor-explorer.js';
import {createEntryScanner,readOpeningEntry} from '../js/mentor/mentor-openingdb-stream.js';
const fen=new Chess().fen(),hash=hashFen(fen),manifest={activeVersion:'v3_p60',hash:{algo:'sha1',len:16},maxPlies:60},entry={moves:[{uci:'e2e4',san:'WRONG',games:2350205,w:37.3,d:32,l:30.6,avgElo:2333,lastYear:2023},{uci:'d2d4',games:100,w:40,d:30,l:30}]};
const response=payload=>new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}});
test('CAISSA exact SHA1 key matches source and ignores only half/fullmove counters',()=>{
 assert.equal(hash,'66be37feb35e7d6a');assert.equal(hash,createHash('sha1').update(normalizeFenForHash(fen)).digest('hex').slice(0,16));assert.equal(hashFen(fen.replace('0 1','90 42')),hash);assert.notEqual(hashFen(fen.replace(' KQkq ',' - ')),hash);
});
test('actual source percentages stay decimals, are not counts, and sample is only listed continuations',()=>{
 const d=normalizeExplorer(fen,entry,{version:'v3_p60',maxPlies:60});assert.equal(d.moves[0].san,'e4');assert.equal(d.moves[0].white,37.3);assert.equal(d.moves[0].draws,32);assert.equal(d.total,2350305);assert.equal(d.white,undefined);assert.equal(d.rateUnit,'percent');assert.equal(d.coverage,'listed-continuations');assert.ok(Object.isFrozen(d.moves[0]));
 for(const row of [{...entry.moves[0],w:999},{...entry.moves[0],l:0},{...entry.moves[0],uci:'e2e5'},{...entry.moves[0],games:-1}])assert.throws(()=>normalizeExplorer(fen,{moves:[row]}));
 assert.equal(normalizeExplorer(fen,null).matchLevel,'none');
});
test('manifest version controls same-origin shard lookup; exact misses never fall back to relaxed positions',async()=>{
 const urls=[];const c=createExplorerClient({fetchFn:async(url,opts)=>{urls.push(url);assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Authorization,undefined);return response(url.endsWith('manifest.json')?manifest:{[hash]:entry});}});
 const d=await c.load(fen);assert.equal(d.version,'v3_p60');assert.deepEqual(urls,['/openingdb/manifest.json','/openingdb/shards/v3_p60/66.json']);await c.load(fen);assert.equal(urls.length,2);
 const miss=await c.load(fen.replace(' KQkq ',' - '));assert.equal(miss.matchLevel,'none');assert.equal(urls.length,3);assert.ok(urls.every(url=>url.startsWith('/openingdb/')));
});
test('scanner supports fragment boundaries/nested escaped strings and stops at target without whole-shard parse',async()=>{
 const text=JSON.stringify({aaaaaaaaaaaaaaaa:{moves:[],note:'quote " and } brace'},[hash]:{...entry,note:'unicode ♞ and { brace'},bbbbbbbbbbbbbbbb:{moves:[]}});
 for(const size of [1,7,31,4096]){const scan=createEntryScanner(hash);for(let n=0;n<text.length;n+=size)scan.write(text.slice(n,n+size));assert.equal(scan.entry.moves[0].w,37.3);assert.equal(scan.done,true);}
 let reads=0,cancelled=false;const stream={body:{getReader:()=>({read:async()=>{reads++;return {done:false,value:new TextEncoder().encode(`{"${hash}":${JSON.stringify(entry)},`)};},cancel:async()=>{cancelled=true;}})}};assert.equal((await readOpeningEntry(stream,hash)).moves[0].w,37.3);assert.equal(reads,1);assert.equal(cancelled,true);
 const miss=createEntryScanner(hash);miss.write('{"aaaaaaaaaaaaaaaa":{"moves":[]}}');assert.equal(miss.finish(),null);for(const invalid of ['', '<html>error</html>','[]','{\"aaaaaaaaaaaaaaaa\":{}} garbage','{\"aaaaaaaaaaaaaaaa\":{},}']){const scan=createEntryScanner(hash);assert.throws(()=>{scan.write(invalid);scan.finish();});}
 const bad=createEntryScanner(hash);bad.write(`{"${hash}":{`);assert.throws(()=>bad.finish(),/incomplete/);
});
test('cancel/stalled stream reject, not no-coverage; 429 honors long Retry-After without retries',async()=>{
 let done;const c=createExplorerClient({fetchFn:()=>new Promise(r=>done=r),timeoutMs:40});const pending=c.load(fen);c.cancel();await assert.rejects(pending,/cancelled/);done(response(manifest));
 let n=0;const stalled=createExplorerClient({timeoutMs:5,fetchFn:async()=>++n===1?response(manifest):{ok:true,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{}})}}});await assert.rejects(stalled.load(fen),/timed out/);
 let time=100000,calls=0;const limited=createExplorerClient({now:()=>time,fetchFn:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '180'}};}});await assert.rejects(limited.load(fen),/rate limited/);time+=61000;await assert.rejects(limited.load(fen),/rate limited/);assert.equal(calls,1);
});
test('bounded position cache and source contract reject unsupported manifest; no Lichess hostname or fake filters',async()=>{
 let calls=0;const c=createExplorerClient({maxCache:1,fetchFn:async url=>{calls++;return response(url.endsWith('manifest.json')?manifest:{[hash]:entry});}});await c.load(fen);await c.load(fen.replace(' KQkq ',' - '));await c.load(fen);assert.equal(calls,4);c.clear();await c.load(fen);assert.equal(calls,6);
 const bad=createExplorerClient({fetchFn:async()=>response({...manifest,hash:{algo:'fnv',len:16}})});await assert.rejects(bad.load(fen),/unsupported/);
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));assert.ok(!JSON.stringify(config).includes('explorer.lichess.ovh'));const html=fs.readFileSync(new URL('../mentor.html',import.meta.url),'utf8');assert.match(html,/CAISSA Explorer/);assert.doesNotMatch(html,/id="explorer-(?:source|ratings|speeds|since|until)"/);assert.equal((html.match(/id="flip"/g)||[]).length,1);
});

test('production start-position fixture preserves all 20 legal rows and published rounded percentages',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('./fixtures/mentor-openingdb-start.json',import.meta.url),'utf8'));const d=normalizeExplorer(fen,source,{version:'v3_p60',maxPlies:60});assert.equal(d.moves.length,20);assert.equal(d.total,5072955);const e4=d.moves.find(row=>row.uci==='e2e4');assert.equal(e4.total,2350205);assert.equal(e4.white,37.3);assert.equal(e4.draws,32);assert.equal(e4.black,30.6);
});

