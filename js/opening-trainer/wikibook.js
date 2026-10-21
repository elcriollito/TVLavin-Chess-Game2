import { wikibookTitle } from './model.js';

const API='https://en.wikibooks.org/w/api.php';
export const WIKIBOOK_LICENSE_URL='https://creativecommons.org/licenses/by-sa/4.0/';
const cache=new Map();
const MAX_CACHE=40;
const MAX_HTML=240000;

function pageUrl(title) {
  return 'https://en.wikibooks.org/wiki/' + title.split('/').map(encodeURIComponent).join('/');
}
function safeBlocks(html) {
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const main=parsed.querySelector('.mw-parser-output');
  if (!main) return [];
  const lines=[];
  const elements=main.querySelectorAll('h2,h3,p');
  for (const el of elements) {
    if (el.closest('table,aside,nav,.mw-collapsible,.metadata,.thumb,.reflist')) continue;
    for (const ref of el.querySelectorAll('sup,.mw-editsection,.reference,.noprint')) ref.remove();
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if (!text || text.length<12) continue;
    if (/^(?:References|External links|See also|Theory table|Notes)$/i.test(text)) continue;
    lines.push({kind:/^H[23]$/.test(el.tagName)?'heading':'paragraph',text:text.slice(0,3000)});
    if (lines.length>=24) break;
  }
  return lines;
}
async function exactLookup(history,{signal}={}) {
  const title=wikibookTitle(history);
  if (!title) return {status:'missing',exact:false,blocks:[]};
  const previous=cache.get(title);
  if (previous) return previous;
  const qs=new URLSearchParams({action:'parse',format:'json',formatversion:'2',prop:'text',page:title,origin:'*',disableeditsection:'1'});
  const response=await fetch(API+'?'+qs,{mode:'cors',credentials:'omit',signal,headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error('WikiBook is not reachable right now.');
  const content=await response.text();
  if (content.length>MAX_HTML) throw new Error('This WikiBook article is too large to display.');
  const json=JSON.parse(content);
  let result;
  if (json.error || !json.parse?.text) {
    result={status:'missing',exact:false,title,url:pageUrl(title),blocks:[]};
  } else {
    const blocks=safeBlocks(json.parse.text);
    result=blocks.length
      ? {status:'found',exact:true,title,url:pageUrl(title),blocks}
      : {status:'missing',exact:false,title,url:pageUrl(title),blocks:[]};
  }
  cache.set(title,result);
  if (cache.size>MAX_CACHE) cache.delete(cache.keys().next().value);
  return result;
}

/**
 * Exact SAN path first; any older article is prominently labeled as BACKGROUND
 * and never misrepresented as a theory match for the displayed board position.
 */
export async function loadWikibook(history,{signal,allowAncestor=false}={}) {
  const path=(history||[]).slice(0,120);
  const exact=await exactLookup(path,{signal});
  if (exact.status==='found'||!allowAncestor) return exact;
  for (let depth=path.length-1;depth>=Math.max(1,path.length-4);depth--) {
    if (signal?.aborted) throw new DOMException('Cancelled','AbortError');
    const candidate=await exactLookup(path.slice(0,depth),{signal});
    if(candidate.status==='found') {
      return {...candidate,exact:false,backgroundPlies:path.length-depth};
    }
  }
  return exact;
}
