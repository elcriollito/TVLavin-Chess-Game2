import { createExplorerClient } from './mentor-explorer.js';
export function mountExplorer({document:doc=globalThis.document,getFen,onMove,onReturn,client=createExplorerClient()}) {
    const $=id=>doc.getElementById(id);let visible=false,revision=0,lastKey=null;
    async function refresh(force=false){if(!visible)return;const fen=getFen();if(!fen)return;
        const key=fen;if(!force&&key===lastKey)return;lastKey=key;const token=++revision;
        $('explorer-rows').replaceChildren();$('explorer-summary').textContent='';$('explorer-status').textContent='Loading CAISSA Opening Database statistics…';$('explorer-opening').textContent='';
        try{const data=await client.load(fen);if(!visible||token!==revision||fen!==getFen())return;
            $('explorer-status').textContent=data.total?'Popularity compares the continuations shown. It is not an engine recommendation.':'No statistics for this position. Database coverage may be limited.';
            $('explorer-opening').textContent=data.opening?`${data.opening.eco} ${data.opening.name}`:data.total?'CAISSA Opening Database · Statistics for this position':'CAISSA Opening Database';
            for(const move of data.moves){const row=doc.createElement('tr'),cell=doc.createElement('td'),button=doc.createElement('button');button.type='button';button.textContent=move.san;button.setAttribute('aria-label',`Explore ${move.san}`);button.addEventListener('click',()=>{if(fen===getFen())onMove(move.uci);});cell.append(button);row.append(cell);
                const popularity=doc.createElement('td');popularity.textContent=`${move.popularity.toFixed(1)}% · ${move.total.toLocaleString()} games`;row.append(popularity);
                const results=doc.createElement('td'),bar=doc.createElement('div');bar.className='explorer-results';bar.setAttribute('aria-label',`White ${move.white}%, draws ${move.draws}%, Black ${move.black}%`);
                for(const [name,count]of [['white',move.white],['draws',move.draws],['black',move.black]]){const part=doc.createElement('span');part.className=`explorer-${name}`;part.style.setProperty('--share',`${count/(move.white+move.draws+move.black)*100}%`);part.title=`${name}: ${count}%`;part.textContent=`${count}%`;bar.append(part);}results.append(bar);row.append(results);$('explorer-rows').append(row);
            }
            $('explorer-summary').textContent=`${data.total.toLocaleString()} games across listed continuations · CAISSA Opening Database · Results are source percentages rounded to one decimal`;
        }catch(error){if(visible&&token===revision){lastKey=null;$('explorer-status').textContent=error.message;}}
    }
    $('explorer-apply').addEventListener('click',()=>refresh(true));$('explorer-return').addEventListener('click',onReturn);
    return Object.freeze({refresh,setVisible(next){visible=next;if(!next){revision++;client.cancel();lastKey=null;}else refresh();},reset(){revision++;client.clear();lastKey=null;$('explorer-rows').replaceChildren();$('explorer-summary').textContent='';},isVisible:()=>visible});
}
