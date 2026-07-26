import {
  fetchPrivateRunOperationalConfig, safeDisabledPrivateRunConfig
} from './private-run-operational-config.js';

let mounted;
const REQUIRED_KEYS=new Set(['trainerV2','multiMovePilot','privateEndgameRun']);
const ALLOWED_KEYS=new Set([...REQUIRED_KEYS,'previewEntry']);
const text=(root,selector,value)=>{const node=root.querySelector(selector);if(node&&node.textContent!==value)node.textContent=value;};

export function validatePrivateRunOperationalSearch(search=''){
  if(typeof search!=='string'||search.length>1024)throw new Error('private-run-selector-invalid');
  const params=new URLSearchParams(search);
  if([...params.keys()].some(key=>!ALLOWED_KEYS.has(key))||
    [...REQUIRED_KEYS].some(key=>params.getAll(key).length!==1)||
    params.getAll('previewEntry').length>1||
    params.get('trainerV2')!=='1'||params.get('multiMovePilot')!=='1'||
    params.get('privateEndgameRun')!=='five-item'||
    (params.has('previewEntry')&&params.get('previewEntry')!=='endgame-practice'))
    throw new Error('private-run-selector-invalid');
  return true;
}

export function mountPrivateFiveItemRunOperationalPage({
  document:doc=globalThis.document,window:win=globalThis
}={}){
  if(mounted)return mounted;
  let robots=doc.querySelector('meta[name="robots"]');
  if(!robots){robots=doc.createElement('meta');robots.name='robots';doc.head.appendChild(robots);}
  robots.content='noindex,nofollow';doc.querySelector('link[rel="canonical"]')?.remove();
  let referrer=doc.querySelector('meta[name="referrer"]');
  if(!referrer){referrer=doc.createElement('meta');referrer.name='referrer';doc.head.appendChild(referrer);}
  referrer.content='no-referrer';
  const root=doc.querySelector('[data-endgame-trainer-page]'),shell=root.querySelector('[data-endgame-v2-shell]');
  const board=root.querySelector('[data-board]'),overlay=root.querySelector('[data-empty-board-overlay]');
  const abort=new AbortController(),panel=doc.createElement('section');
  panel.className='endgame-v2 endgame-v2__operational';panel.dataset.privateOperational='';
  panel.setAttribute('aria-labelledby','private-operational-title');
  panel.innerHTML='<h2 id="private-operational-title" tabindex="-1">Checking availability…</h2><p data-private-operational-message>Checking the private technical run.</p><p data-private-operational-progress>No progress was started or saved.</p><div><a href="/endgame-trainer?trainerV2=1">Return to Endgame Trainer</a><button type="button" data-private-availability-retry>Retry Availability Check</button></div>';
  shell.parentNode.insertBefore(panel,shell);root.classList.add('is-v2','is-private-five-item-run');
  let enabledModule=null;
  const setSurface=available=>{panel.hidden=available;shell.hidden=!available;board.hidden=!available;if(overlay)overlay.hidden=true;};
  const render=(config,{checking=false,hadProgress=false}={})=>{
    setSurface(false);
    const failure=['configuration-invalid','integrity-failure'].includes(config.reasonCode);
    text(panel,'#private-operational-title',checking?'Checking availability…':config.mode==='maintenance'?'Private run temporarily unavailable':failure?'We could not verify this run':'Private run unavailable');
    text(panel,'[data-private-operational-message]',checking?'Checking the private technical run.':config.mode==='maintenance'?'This technical exercise run is undergoing maintenance.':failure?'This is a technical issue.':'This technical exercise run is currently unavailable.');
    text(panel,'[data-private-operational-progress]',hadProgress?'Your completed work was temporary and was not saved.':'No progress was started or saved.');
    panel.querySelector('[data-private-availability-retry]').disabled=checking;
    if(!checking)win.requestAnimationFrame?.(()=>panel.querySelector('h2')?.focus?.());
  };
  const query=()=>fetchPrivateRunOperationalConfig({fetchImpl:win.fetch.bind(win),signal:abort.signal});
  const stopEnabled=()=>{enabledModule?.unmountPrivateFiveItemRunPage?.();enabledModule=null;};
  const block=(config,hadProgress)=>{stopEnabled();render(config,{hadProgress});};
  const activate=async({focusStart=false}={})=>{
    render(safeDisabledPrivateRunConfig(),{checking:true});
    let config;
    try{validatePrivateRunOperationalSearch(win.location?.search??'');config=await query();}
    catch{config=safeDisabledPrivateRunConfig('configuration-invalid');}
    const previewEntry=new URLSearchParams(win.location?.search??'').has('previewEntry');
    if(previewEntry && (!config.previewBoundary?.configurationValid ||
      !['internal-preview','limited-preview'].includes(config.previewBoundary?.mode))){
      render(safeDisabledPrivateRunConfig('configuration-invalid'));return false;
    }
    if(!config.enabled){render(config);return false;}
    enabledModule=await import('./private-five-item-run-enabled-page.js');
    if(abort.signal.aborted)return false;
    setSurface(true);
    const enabledMount=enabledModule.mountPrivateFiveItemRunPage({
      document:doc,window:win,checkAvailability:query,onOperationalUnavailable:block
    });
    await enabledMount.ready;
    if(focusStart)root.querySelector('[data-v2-action="start"]')?.focus?.();
    return true;
  };
  panel.querySelector('[data-private-availability-retry]').addEventListener('click',()=>activate({focusStart:true}),{signal:abort.signal});
  mounted={root,panel,abort,retry:activate,dispose(){abort.abort();stopEnabled();panel.remove();mounted=null;}};
  setSurface(false);void activate({focusStart:true});return mounted;
}

export function unmountPrivateFiveItemRunOperationalPage(){
  if(!mounted)return false;mounted.dispose();return true;
}
