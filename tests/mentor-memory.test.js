import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Chess } from '../assets/vendor/chess.js/chess-1.4.0.esm.js';
import { createMemoryTraining, MEMORY_POSITIONS, MEMORY_LEVELS, memoryPositionInfo, chooseMemoryPosition, memoryPlacement } from '../js/mentor/mentor-memory.js';
const placement = fen => { const game=new Chess(fen), value={};game.board().flat().filter(Boolean).forEach(piece=>value[piece.square]=piece.color+piece.type.toUpperCase());return value; };
function answer(memory,id,{mode='challenge',subset=null}={}) {
    assert.equal(memory.start(id,mode),true);memory.hide();
    const target=placement(MEMORY_POSITIONS.find(item=>item.id===id).fen);
    const entries=Object.entries(target);(subset===null?entries:entries.slice(0,subset)).forEach(([square,code])=>memory.place(square,code));return memory.check();
}
test('all memory exercises are legal significant positions and placement encoding roundtrips',()=>{
    for(const exercise of MEMORY_POSITIONS){const game=new Chess(exercise.fen);assert.ok(game.board().flat().filter(Boolean).length>=3);
        assert.equal(memoryPlacement(placement(exercise.fen)),exercise.fen.split(' ')[0]);assert.ok(Object.isFrozen(exercise));}
});
test('observe/hide/answer requires stage ownership and records a unique scored attempt once',()=>{
    const memory=createMemoryTraining();assert.equal(memory.check(),null);memory.start('opposition-a','challenge');
    assert.equal(memory.place('e5','wK'),false);assert.equal(memory.check(),null);assert.equal(memory.hide(),true);
    for(const [square,code] of Object.entries(placement(MEMORY_POSITIONS[0].fen)))memory.place(square,code);
    const result=memory.check();assert.equal(result.accuracy,1);assert.equal(result.scored,true);assert.equal(memory.read().score,55);
    assert.equal(memory.check(),null);assert.equal(memory.read().scoredAttempts,1);assert.ok(Object.isFrozen(result.feedback[0]));
    memory.stop();const retry=answer(memory,'opposition-a');assert.equal(retry.scored,false);assert.equal(memory.read().score,55);
});
test('practice and abandoned observation remove fresh challenge eligibility without farming score',()=>{
    const memory=createMemoryTraining();memory.start('opposition-a','practice');memory.stop();
    assert.equal(answer(memory,'opposition-a').scored,false);assert.equal(memory.read().score,50);
    memory.start('opposition-b','challenge');memory.stop();assert.equal(answer(memory,'opposition-b').scored,false);
    assert.equal(memory.read().scoredAttempts,0);
});
test('wrong, missing and extra pieces receive textual feedback and cannot inflate accuracy',()=>{
    const memory=createMemoryTraining();memory.start('opposition-a');memory.hide();
    memory.place('e7','bK');memory.place('e5','wQ');memory.place('a1','wP');
    assert.equal(memory.place('z9','wP'),false);assert.equal(memory.place('a2','invalid'),false);
    const result=memory.check();assert.equal(result.accuracy,.25);
    assert.match(result.feedback.find(item=>item.square==='e5').explanation,/expected White king; you placed White queen/);
    assert.match(result.feedback.find(item=>item.square==='e4').explanation,/expected White pawn; you placed empty/);
    assert.match(result.feedback.find(item=>item.square==='a1').explanation,/expected empty/);
});
test('single error produces no coaching diagnosis; gradual suggestion requires real comparable evidence',()=>{
    const memory=createMemoryTraining();answer(memory,'opposition-a',{subset:0});assert.equal(memory.read().notification,null);
    answer(memory,'opposition-b',{subset:0});answer(memory,'opposition-c',{subset:0});
    assert.equal(memory.read().notification.kind,'finding');assert.match(memory.read().notification.message,/3 comparable scored rounds/);
    memory.acknowledge();assert.equal(memory.read().notification.unread,false);
    answer(memory,'opposition-a',{mode:'practice'});assert.equal(memory.read().notification.unread,false);
    const strong=createMemoryTraining();['opposition-a','opposition-b','opposition-c'].forEach(id=>answer(strong,id));
    const next=strong.read().notification;assert.equal(next.kind,'idea');assert.equal(next.level,'beginner');assert.equal(next.pieceCount,3);assert.match(next.message,/new position at this level/);
});
test('similar-performance question requires six comparable first exposures across three session boundaries',()=>{
    const memory=createMemoryTraining();const ids=MEMORY_POSITIONS.slice(0,6).map(item=>item.id);
    ids.forEach(id=>answer(memory,id,{subset:2}));assert.equal(memory.read().notification,null);
    const several=createMemoryTraining();ids.forEach((id,index)=>{if(index===2||index===4)several.newSession();answer(several,id,{subset:2});});
    assert.equal(several.read().notification.kind,'question');assert.match(several.read().notification.message,/not a health assessment/);
});
test('logout/reset invalidates a hidden stale attempt and clears owner-scoped results',()=>{
    const memory=createMemoryTraining({ownerId:'a'});memory.start('opposition-a','challenge');memory.hide();memory.reset('b');
    assert.equal(memory.check(),null);assert.equal(memory.read().ownerId,'b');assert.equal(memory.read().score,50);assert.equal(memory.read().results.length,0);
    const result=answer(memory,'opposition-a');assert.match(result.id,/^b:/);assert.equal(result.scored,true);
});
test('memory view is a single shared board presentation and contains no chess/engine/network authority',()=>{
    const view=fs.readFileSync(new URL('../js/mentor/mentor-memory-view.js',import.meta.url),'utf8');
    assert.doesNotMatch(view,/new Chess|new Worker|fetch\(|localStorage|\.move\(|Chessboard\(/);
    assert.match(view,/board\.on\('squareTap'/);assert.match(view,/restoreStudy\(\)/);
    const page=fs.readFileSync(new URL('../js/mentor/mentor-page.js',import.meta.url),'utf8');
    assert.match(page,/if \(tab.id !== 'tab-learn'\) memoryTraining.stop\(\)/);
    assert.match(page,/if \(memoryTraining.isActive\(\)\) return/);
});

test('piece-count levels are disjoint, include under-eight beginners and cap actual started 32-piece positions',()=>{
    assert.deepEqual(MEMORY_LEVELS.map(level=>[level.min,level.max]),[[3,7],[8,12],[13,17],[18,22],[23,27],[28,32]]);
    const seen=new Set();for(const level of MEMORY_LEVELS)for(let count=level.min;count<=level.max;count++){assert.equal(seen.has(count),false);seen.add(count);}assert.equal(seen.size,30);
    assert.equal(memoryPositionInfo(new Chess().fen()),null);
    const game=new Chess();game.move('e4');const max=memoryPositionInfo(game.fen());assert.equal(max.pieceCount,32);assert.equal(max.level,'master');assert.equal(max.densityScore,100);
    assert.equal(memoryPositionInfo(MEMORY_POSITIONS[0].fen).densityScore,0);
    assert.equal(memoryPositionInfo('invalid'),null);
});
test('random selection filters actual piece count, excludes immediate repetitions and never silently lowers level',()=>{
    const first=chooseMemoryPosition(MEMORY_POSITIONS,'beginner',null,()=>0),last=chooseMemoryPosition(MEMORY_POSITIONS,'beginner',null,()=>.99);
    assert.notEqual(first.fen,last.fen);assert.notEqual(chooseMemoryPosition(MEMORY_POSITIONS,'beginner',first.fen,()=>0).fen,first.fen);
    assert.equal(chooseMemoryPosition([first],'beginner',first.fen),null);
    assert.equal(chooseMemoryPosition(MEMORY_POSITIONS,'master'),null);
});
test('Retry is available only after failure, observes the identical FEN unscored, and gets a fresh attempt ID',()=>{
    const memory=createMemoryTraining();memory.start('opposition-a','challenge');assert.equal(memory.retry(),false);memory.hide();memory.check();
    const old=memory.read(),score=old.score;assert.equal(memory.retry(),true);assert.equal(memory.read().phase,'observe');assert.equal(memory.read().exercise.fen,old.exercise.fen);
    assert.notEqual(memory.read().attemptId,old.attemptId);assert.equal(memory.read().mode,'practice');assert.equal(memory.read().score,score);
    memory.hide();for(const[square,code]of Object.entries(placement(old.exercise.fen)))memory.place(square,code);memory.check();assert.equal(memory.retry(),false);
});
test('first exposure is tracked by placement, so changing source or IDs cannot farm the provisional index',()=>{
    const memory=createMemoryTraining(),fen=MEMORY_POSITIONS[0].fen;memory.startPosition(fen,{id:'source-a',source:'full-catalog'},'challenge');memory.hide();memory.check();memory.stop();
    memory.startPosition(fen,{id:'source-b',source:'curated-fallback'},'challenge');assert.equal(memory.read().mode,'practice');
    assert.equal(memory.startPosition(new Chess().fen()),false);
});
