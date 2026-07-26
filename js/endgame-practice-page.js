import {
  fetchPrivateRunOperationalConfig, resolveEndgamePracticeAvailability
} from './endgame-trainer/v2/private-run-operational-config.js';

const COPY=Object.freeze({
  unreleased:['Not released','Limited Preview','This experience is not available yet. We are preparing the first set of guided endgame exercises.','No account is required. No progress is saved.'],
  'internal-preview':['Internal preview enabled','Limited Preview','A private technical preview is available in this environment.','No progress is saved.'],
  'limited-preview':['Available','Limited Preview','Five guided endgame exercises are available in this limited preview.','No account is required. No progress is saved.'],
  'runtime-disabled':['Temporarily unavailable','Temporarily unavailable','The preview cannot be started right now.','No progress was created or saved.'],
  maintenance:['Temporarily unavailable','Temporarily unavailable','This preview is undergoing maintenance.','No progress was created or saved.'],
  paused:['Preview paused','Preview paused','This limited preview is currently paused.','No progress was created or saved.'],
  'configuration-failure':['Unavailable','We could not verify this preview','This is a technical issue. No session was started.','No progress was created or saved.']
});

export function renderEndgamePracticeAvailability(doc,config){
  const result=resolveEndgamePracticeAvailability(config),copy=COPY[result.state]||COPY['configuration-failure'];
  ['[data-status-label]','[data-status-title]','[data-status-message]','[data-status-progress]']
    .forEach((selector,index)=>{doc.querySelector(selector).textContent=copy[index];});
  doc.querySelector('[data-start]').hidden=!result.canStart;
  doc.querySelector('[data-retry]').hidden=result.state!=='configuration-failure';
  return result;
}

export async function refreshEndgamePracticeAvailability(doc=document,fetchImpl=fetch){
  const config=await fetchPrivateRunOperationalConfig({fetchImpl});
  return renderEndgamePracticeAvailability(doc,config);
}

if(typeof document!=='undefined'){
  const retry=document.querySelector('[data-retry]');
  retry?.addEventListener('click',()=>refreshEndgamePracticeAvailability());
  void refreshEndgamePracticeAvailability();
}
