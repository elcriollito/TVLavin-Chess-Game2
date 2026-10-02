import { createMemoryTraining, MEMORY_LEVELS, memoryPositionInfo, memoryPlacement } from './mentor-memory.js';
import { createMemoryCatalog } from './mentor-memory-catalog.js';

// Temporary presentation over the existing board. Study Chess/PGN, cursor,
// engine evidence and Mentor draft are restored, never copied or replaced.
export function mountMemoryTraining({ board, restoreStudy, onStart, onNotification,
    onContextChange=()=>{}, isTrainingVisible=()=>true, document:documentRef=globalThis.document, catalog=createMemoryCatalog() }) {
    const document=documentRef, $=id=>document.getElementById(id), memory=createMemoryTraining();
    let chosen='wK', active=false, context='position', loading=false, generation=0, controller=null;
    let previousControls=new Map(), previousFen=null;
    const levelSelect=$('memory-exercise');
    MEMORY_LEVELS.forEach(level=>{const option=document.createElement('option');option.value=level.id;option.textContent=`${level.label} · ${level.min}–${level.max} pieces`;levelSelect.append(option);});
    const names={K:'King',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
    const controls=['study-engine','game-first','game-previous','game-next','game-last','repeat','game-review'];
    const trainingTabs=['position','opening','lesson'].map(key=>$( `training-${key}-tab`));
    function render() {
        const state=memory.read(), result=state.result;
        $('memory-panel').hidden=context!=='position';$('memory-footer').hidden=context!=='position'||!isTrainingVisible();
        $('memory-start').hidden=context!=='position'||!isTrainingVisible();$('memory-start').disabled=active||loading;
        $('memory-palette').hidden=state.phase!=='reconstruct';
        $('memory-hide').hidden=state.phase!=='observe';
        $('memory-check').hidden=state.phase!=='reconstruct';
        $('memory-retry').hidden=state.phase!=='result';$('memory-retry').disabled=result?.accuracy===1;
        $('memory-next').hidden=state.phase!=='result';$('memory-next').disabled=result?.accuracy!==1;
        levelSelect.disabled=active||loading;$('memory-mode').disabled=active||loading;
        $('repeat').hidden=context!=='lesson';
        $('practice').hidden=context!=='lesson'&&!active;
        $('practice').textContent=active?'Return to lesson':'Try it yourself';$('practice').disabled=false;
        const destination=active?$('memory-footer'):$('learn-footer');
        if ($('practice').parentElement!==destination)destination.append($('practice'));
        $('learn-footer').hidden=context!=='lesson';
        if(state.phase==='observe'){
            const info=memoryPositionInfo(state.exercise.fen);
            $('memory-state').textContent=`Observe the position. ${info.pieceCount} pieces · Piece load ${info.densityScore}/100. ${state.mode==='challenge'?'First-exposure scored challenge.':'Unscored practice.'} No timer. Source: ${state.exercise.source==='curated-fallback'?'Puzzles curated fallback':'Puzzles catalog'}.`;
        }
        if(state.phase==='reconstruct')$('memory-state').textContent='Choose a piece icon, then click a square or use board keyboard controls to place it. Use Erase to remove a piece.';
        if(state.phase==='result')$('memory-state').textContent=`${result.accuracy===1?'✓ Correct reconstruction':'✗ Review the differences'} · ${Math.round(result.accuracy*100)}% immediate recall. ${result.scored?'Recorded once.':'Unscored practice.'} `;
        if(state.phase==='idle'&&!loading)$('memory-state').textContent='Choose a level, then press Memory. Puzzle selection is filtered by actual piece count, not puzzle Elo.';
        if(loading)$('memory-state').textContent='Finding a puzzle position at this piece-count level…';
        $('memory-feedback').replaceChildren();
        for(const item of result?.feedback||[]){const row=document.createElement('li');row.className=item.ok?'memory-correct':'memory-error';row.textContent=`${item.ok?'✓':'✗'} ${item.explanation}`;$('memory-feedback').append(row);}
        $('memory-progress').textContent=`Memory index: ${state.score}/100 · Provisional, session only · ${state.scoredAttempts} scored / ${state.practiceAttempts} practice attempts. Separate from Puzzle Elo.`;
        const attempts=state.results, average=attempts.length?Math.round(attempts.reduce((sum,item)=>sum+item.accuracy,0)/attempts.length*100):null;
        $('memory-metrics').textContent=`${average===null?'No checked attempts yet.':`${average}% mean immediate recall across ${attempts.length} checked attempts, including practice.`} Piece load is a piece-count measure, not Elo or a calibrated memory rating. Delayed retention is not measured. Reload/account change resets progress.`;
        if(active){for(const id of controls)$(id).disabled=true;
            board.setInteractive(state.phase==='reconstruct');board.clearSelection();
            board.setPosition(state.phase==='observe'||state.phase==='result'?state.exercise.fen:memoryPlacement(state.draft),{animate:false});
        }
    }
    function stop(){const wasLoading=loading;generation++;controller?.abort();controller=null;loading=false;
        const wasActive=active;active=false;memory.stop();
        if(wasActive){board.setInteractive(true);for(const [id,disabled]of previousControls)$(id).disabled=disabled;previousControls.clear();}
        render();if(wasActive||wasLoading)restoreStudy();
    }
    function selectContext(next){stop();onContextChange(next);context=next;
        trainingTabs.forEach(tab=>{const key=tab.id.replace('training-','').replace('-tab',''), selected=key===context;
            tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(`training-${key}-body`).hidden=!selected;
        });render();
    }
    trainingTabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectContext(['position','opening','lesson'][index]));
        tab.addEventListener('keydown',event=>{const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
            if(next!==null){event.preventDefault();selectContext(['position','opening','lesson'][next]);trainingTabs[next].focus();}
        });
    });
    for(const color of ['w','b'])for(const type of ['K','Q','R','B','N','P']){
        const code=color+type,button=document.createElement('button'),label=`${color==='w'?'White':'Black'} ${names[type]}`;
        button.type='button';button.style.gridRow=color==='w'?'1':'2';button.style.gridColumn=String(['K','Q','R','B','N','P'].indexOf(type)+1);button.setAttribute('aria-label',label);button.title=label;button.dataset.memoryPiece=code;button.setAttribute('aria-pressed',String(chosen===code));
        const image=document.createElement('img');image.src=`/img/chesspieces/wikipedia/${code}.png`;image.alt=label;image.width=40;image.height=40;button.append(image);
        button.addEventListener('click',()=>{chosen=code;document.querySelectorAll('[data-memory-piece]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.memoryPiece===chosen)));});$('memory-palette').append(button);
    }
    const erase=document.createElement('button');erase.type='button';erase.textContent='Erase';erase.style.gridRow='3';erase.style.gridColumn='1 / -1';erase.setAttribute('aria-label','Erase square');erase.title='Erase square';erase.dataset.memoryPiece='erase';erase.setAttribute('aria-pressed','false');
    erase.addEventListener('click',()=>{chosen=null;document.querySelectorAll('[data-memory-piece]').forEach(node=>node.setAttribute('aria-pressed',String(node===erase)));});$('memory-palette').append(erase);
    board.on('squareTap',square=>{if(!active||memory.read().phase!=='reconstruct')return;
        memory.place(square,chosen);board.setPosition(memoryPlacement(memory.read().draft),{animate:false});queueMicrotask(()=>board.clearSelection());
    });
    async function startNext(){
        if(loading||context!=='position')return false;
        if(active&&memory.read().phase!=='result')return false;
        if(!active)previousControls=new Map(controls.map(id=>[id,$(id).disabled]));
        if(!onStart())return false;
        const token=++generation;controller=new AbortController();loading=true;render();
        try{
            const level=MEMORY_LEVELS.find(item=>item.id===levelSelect.value)||MEMORY_LEVELS[0];
            const candidate=await catalog.next(level,{signal:controller.signal,excludedPlacements:new Set(previousFen?[previousFen.split(' ')[0]]:[])});
            if(token!==generation)return false;
            if(!candidate){loading=false;if(!active)restoreStudy();render();$('memory-state').textContent='No matching position found in this bounded puzzle sample. Try another level or try again; this does not mean the full catalog is exhausted.';return false;}
            if(!onStart()){loading=false;if(!active)restoreStudy();render();$('memory-state').textContent='Finish the current Mentor reply before starting Memory Training.';return false;}
            const info=memoryPositionInfo(candidate.fen);
            if(!info||info.level!==level.id)throw new Error('The returned position does not match this level.');
            const started=memory.startPosition(candidate.fen,{id:candidate.id,source:candidate.source,level:level.id},$('memory-mode').value||'practice');
            if(!started)throw new Error('Finish the current exercise before starting another.');
            previousFen=candidate.fen;active=true;loading=false;render();return true;
        }catch(error){if(token!==generation)return false;loading=false;if(!active)restoreStudy();render();$('memory-state').textContent=`Memory position unavailable: ${error.message}`;return false;}
        finally{if(token===generation){loading=false;controller=null;}}
    }
    $('memory-start').addEventListener('click',startNext);
    $('memory-hide').addEventListener('click',()=>{memory.hide();render();});
    $('memory-check').addEventListener('click',()=>{const result=memory.check();if(result){render();onNotification(memory.read().notification);}});
    $('memory-retry').addEventListener('click',()=>{if(memory.retry()){render();}});
    $('memory-next').addEventListener('click',()=>{if(memory.read().result?.accuracy===1&&context==='position')return startNext();});
    levelSelect.addEventListener('change',()=>{if(loading)stop();});
    render();
    return Object.freeze({isActive:()=>active,isLoading:()=>loading,context:()=>context,stop,read:memory.read,
        startRecommendation(recommendation){selectContext('position');if(MEMORY_LEVELS.some(level=>level.id===recommendation?.level))levelSelect.value=recommendation.level;$('memory-mode').value='practice';return startNext();},
        acknowledge:memory.acknowledge,selectContext,
        reset(owner){stop();memory.reset(owner||'guest');catalog.clear?.();previousFen=null;render();},newSession(){stop();memory.newSession();render();}
    });
}
