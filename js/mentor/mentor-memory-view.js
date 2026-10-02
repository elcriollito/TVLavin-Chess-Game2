import { createMemoryTraining, MEMORY_POSITIONS, memoryPlacement } from './mentor-memory.js';

// A thin temporary presentation over the existing board adapter. The study
// game, cursor, PGN, engine cache and Mentor draft are never rewritten here.
export function mountMemoryTraining({ board, restoreStudy, onStart, onNotification, document: documentRef=globalThis.document }) {
    const document=documentRef;
    const $=id=>document.getElementById(id), memory=createMemoryTraining();
    let chosen='wK', active=false;
    let previousControls = new Map();
    const select=$('memory-exercise');
    MEMORY_POSITIONS.forEach(exercise=>{const option=document.createElement('option');option.value=exercise.id;option.textContent=`${exercise.title} · ${exercise.pattern}`;select.append(option);});
    const pieceLabels={K:'King',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
    const controls=['study-engine','game-first','game-previous','game-next','game-last','practice','repeat','game-review'];
    function render() {
        const state=memory.read();
        $('memory-palette').hidden=state.phase!=='reconstruct';
        $('memory-start').hidden=active;
        $('memory-hide').hidden=state.phase!=='observe';
        $('memory-check').hidden=state.phase!=='reconstruct';
        $('memory-return').hidden=!active;
        select.disabled=$('memory-mode').disabled=active;
        if(state.phase==='observe')$('memory-state').textContent=`Observe ${state.exercise.title}. ${state.mode==='challenge'?'A first-exposure local scored challenge.':'Unscored practice; repeat exposures cannot raise the index.'} Take your time.`;
        if(state.phase==='reconstruct')$('memory-state').textContent='Select a piece below, then click or use the keyboard to choose its square on the board. Erase removes a placement. You can place pieces freely.';
        if(state.phase==='result')$('memory-state').textContent=`${state.result.accuracy===1?'✓ Correct reconstruction':'Review the differences'} · ${Math.round(state.result.accuracy*100)}% immediate recall. ${state.result.scored?'Recorded once in the provisional local index.':'Practice does not change the index.'}`;
        if(state.phase==='idle')$('memory-state').textContent='Choose a position to begin. Your study position is restored.';
        $('memory-feedback').replaceChildren();
        for(const item of state.result?.feedback || []){const row=document.createElement('li');row.className=item.ok?'memory-correct':'memory-error';row.textContent=`${item.ok?'✓':'✗'} ${item.explanation}`;$('memory-feedback').append(row);}
        $('memory-progress').textContent=`Memory index: ${state.score}/100 · Provisional, local to this page · ${state.scoredAttempts} scored / ${state.practiceAttempts} practice attempts. Separate from Puzzle Elo.`;
        const attempts=state.results;
        const average=attempts.length?Math.round(attempts.reduce((sum,item)=>sum+item.accuracy,0)/attempts.length*100):null;
        $('memory-metrics').textContent=`${average===null?'No checked attempts yet.':`${average}% mean immediate recall across ${attempts.length} checked attempts, including practice. ${new Set(attempts.map(item=>item.pattern)).size} patterns sampled.`} Delayed retention is not measured. Progress resets on reload or account change.`;
        if(active) for(const id of controls)$(id).disabled=true;
        if(active){board.setInteractive(state.phase==='reconstruct');board.clearSelection();
            const fen=state.phase==='observe'||state.phase==='result'?state.exercise.fen:memoryPlacement(state.draft);
            board.setPosition(fen,{animate:false});
        }
    }
    function stop() {
        if(!active)return;
        active=false;memory.stop();board.setInteractive(true);
        for(const [id,disabled] of previousControls)$(id).disabled=disabled;
        previousControls.clear();render();restoreStudy();
    }
    for(const color of ['w','b'])for(const type of ['K','Q','R','B','N','P']){
        const code=color+type, button=document.createElement('button');button.type='button';button.textContent=`${color==='w'?'White':'Black'} ${pieceLabels[type]}`;
        button.setAttribute('aria-pressed',String(chosen===code));button.dataset.memoryPiece=code;
        button.addEventListener('click',()=>{chosen=code;document.querySelectorAll('[data-memory-piece]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.memoryPiece===chosen)));});$('memory-palette').append(button);
    }
    const erase=document.createElement('button');erase.type='button';erase.textContent='Erase square';erase.dataset.memoryPiece='erase';erase.setAttribute('aria-pressed','false');
    erase.addEventListener('click',()=>{chosen=null;document.querySelectorAll('[data-memory-piece]').forEach(node=>node.setAttribute('aria-pressed',String(node===erase)));});$('memory-palette').append(erase);
    board.on('squareTap',square=>{if(!active||memory.read().phase!=='reconstruct')return;
        memory.place(square,chosen);board.setPosition(memoryPlacement(memory.read().draft),{animate:false});
        // Renderer retains its trusted gesture controller. No game move is submitted.
        queueMicrotask(()=>board.clearSelection());
    });
    $('memory-start').addEventListener('click',()=>{
        previousControls = new Map(controls.map(id=>[id,$(id).disabled]));
        if(!onStart())return;
        if(memory.start(select.value,$('memory-mode').value)){active=true;render();}
    });
    $('memory-hide').addEventListener('click',()=>{memory.hide();render();});
    $('memory-check').addEventListener('click',()=>{const result=memory.check();if(!result)return;render();onNotification(memory.read().notification);});
    $('memory-return').addEventListener('click',stop);
    render();
    return Object.freeze({ isActive:()=>active, stop, read:memory.read,
        startRecommendation(id){stop();if(MEMORY_POSITIONS.some(item=>item.id===id))select.value=id;$('memory-mode').value='practice';$('memory-start').click();},
        acknowledge:memory.acknowledge,
        reset(owner){stop();memory.reset(owner || 'guest');render();},
        newSession(){stop();memory.newSession();render();}
    });
}
