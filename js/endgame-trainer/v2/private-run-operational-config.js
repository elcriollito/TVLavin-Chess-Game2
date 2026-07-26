export const PRIVATE_RUN_FEATURE_ID = 'five-item-private-endgame-run';
export const PRIVATE_RUN_CONFIG_SCHEMA_VERSION = '1.0.0';
export const PRIVATE_RUN_AVAILABILITY_URL = '/api/endgame/private-run-availability';
export const PRIVATE_RUN_AVAILABILITY_TIMEOUT_MS = 5000;
export const ENDGAME_PRACTICE_RELEASE_MODES = Object.freeze([
  'unreleased','internal-preview','limited-preview','paused'
]);

export const PRIVATE_RUN_MODES = Object.freeze(['enabled','disabled','maintenance','emergency-disabled']);
export const PRIVATE_RUN_REASON_CODES = Object.freeze([
  'operational','scheduled-maintenance','incident-response','integrity-failure','privacy-review',
  'security-review','deployment-verification','configuration-unavailable','configuration-invalid',
  'manual-emergency-disable'
]);
const PRIVATE_MODE_KEYS = ['objectiveArtifact','endgameRun','privateEndgameRun'];
const RELEASE_MODE_SET = new Set(ENDGAME_PRACTICE_RELEASE_MODES);

export function createEndgamePracticeReleaseBoundary(environment = {}) {
  const raw=environment.CAISSA_ENDGAME_PRACTICE_RELEASE_MODE;
  const defaulted=raw === undefined || raw === '';
  const valid=defaulted || RELEASE_MODE_SET.has(raw);
  return Object.freeze({
    mode: valid && !defaulted ? raw : 'unreleased',
    configurationValid: valid,
    source: 'server-environment',
    safeDefault: 'unreleased'
  });
}

export function validateEndgamePracticeReleaseBoundary(value) {
  if(!value || typeof value !== 'object' || Array.isArray(value) ||
    !RELEASE_MODE_SET.has(value.mode) || typeof value.configurationValid !== 'boolean' ||
    value.source !== 'server-environment' || value.safeDefault !== 'unreleased')
    throw new Error('endgame-practice-boundary-invalid');
  return Object.freeze(structuredClone(value));
}

export function shouldActivatePrivateFiveItemRun(search=''){
  const params=new URLSearchParams(search);
  const modes=PRIVATE_MODE_KEYS.filter(key=>params.has(key)).length;
  return params.get('trainerV2')==='1'&&params.get('multiMovePilot')==='1'&&
    (params.has('privateEndgameRun')||modes>1)&&
    !['studyUnit','release','activity','reviewFrom'].some(key=>params.has(key));
}

const MODE_SET = new Set(PRIVATE_RUN_MODES);
const REASON_SET = new Set(PRIVATE_RUN_REASON_CODES);
const SAFE_COPY = Object.freeze({
  enabled: '',
  disabled: 'This technical exercise run is currently unavailable.',
  maintenance: 'This technical exercise run is undergoing maintenance.',
  'emergency-disabled': 'This technical exercise run is currently unavailable.'
});

export function createPrivateRunOperationalConfig(environment = {}) {
  const rawEnabled=environment.CAISSA_PRIVATE_ENDGAME_RUN_ENABLED;
  const rawMode=environment.CAISSA_PRIVATE_ENDGAME_RUN_MODE;
  const rawReason=environment.CAISSA_PRIVATE_ENDGAME_RUN_REASON;
  const enabledValid=rawEnabled === undefined || rawEnabled === '' || rawEnabled === 'true' || rawEnabled === 'false';
  const modeValid=rawMode === undefined || rawMode === '' || MODE_SET.has(rawMode);
  const reasonValid=rawReason === undefined || rawReason === '' || REASON_SET.has(rawReason);
  const configured=rawEnabled !== undefined && rawEnabled !== '';
  let enabled=rawEnabled === 'true';
  let mode=rawMode || (enabled ? 'enabled' : 'disabled');
  let reasonCode=rawReason || (configured ? (enabled ? 'operational' : 'manual-emergency-disable') : 'configuration-unavailable');
  const coherent=(mode === 'enabled') === enabled;
  if (!enabledValid || !modeValid || !reasonValid || !coherent) {
    enabled=false; mode='disabled'; reasonCode='configuration-invalid';
  }
  return Object.freeze({
    schemaVersion: PRIVATE_RUN_CONFIG_SCHEMA_VERSION,
    featureId: PRIVATE_RUN_FEATURE_ID,
    enabled,
    mode,
    reasonCode,
    userMessage: SAFE_COPY[mode] || SAFE_COPY.disabled,
    effectivePolicy: 'fail-closed-no-cache',
    configurationSource: 'server-environment',
    failClosed: true,
    lastKnownSafeDefault: 'disabled',
    previewBoundary: createEndgamePracticeReleaseBoundary(environment)
  });
}

export function validatePrivateRunOperationalConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schemaVersion !== PRIVATE_RUN_CONFIG_SCHEMA_VERSION ||
      value.featureId !== PRIVATE_RUN_FEATURE_ID || typeof value.enabled !== 'boolean' ||
      !MODE_SET.has(value.mode) || !REASON_SET.has(value.reasonCode) ||
      typeof value.userMessage !== 'string' || value.userMessage.length > 160 ||
      value.effectivePolicy !== 'fail-closed-no-cache' ||
      value.configurationSource !== 'server-environment' ||
      value.failClosed !== true || value.lastKnownSafeDefault !== 'disabled' ||
      ((value.mode === 'enabled') !== value.enabled))
    throw new Error('private-run-configuration-invalid');
  if(value.previewBoundary !== undefined)validateEndgamePracticeReleaseBoundary(value.previewBoundary);
  return Object.freeze(structuredClone(value));
}

export function safeDisabledPrivateRunConfig(reasonCode = 'configuration-unavailable') {
  const previewBoundary=reasonCode==='configuration-invalid'
    ? Object.freeze({mode:'unreleased',configurationValid:false,source:'server-environment',safeDefault:'unreleased'})
    : createEndgamePracticeReleaseBoundary();
  return Object.freeze({
    schemaVersion: PRIVATE_RUN_CONFIG_SCHEMA_VERSION, featureId: PRIVATE_RUN_FEATURE_ID,
    enabled: false, mode: 'disabled',
    reasonCode: REASON_SET.has(reasonCode) ? reasonCode : 'configuration-invalid',
    userMessage: SAFE_COPY.disabled, effectivePolicy: 'fail-closed-no-cache',
    configurationSource: 'server-environment', failClosed: true, lastKnownSafeDefault: 'disabled',
    previewBoundary
  });
}

export function resolveEndgamePracticeAvailability(config) {
  let boundary;
  try{boundary=validateEndgamePracticeReleaseBoundary(config?.previewBoundary);}
  catch{return Object.freeze({state:'configuration-failure',canStart:false});}
  if(!boundary.configurationValid)return Object.freeze({state:'configuration-failure',canStart:false});
  if(boundary.mode==='paused')return Object.freeze({state:'paused',canStart:false});
  if(boundary.mode==='unreleased')return Object.freeze({state:'unreleased',canStart:false});
  if(config.mode==='maintenance')return Object.freeze({state:'maintenance',canStart:false});
  if(!config.enabled)return Object.freeze({state:'runtime-disabled',canStart:false});
  return Object.freeze({state:boundary.mode,canStart:true});
}

export async function fetchPrivateRunOperationalConfig({
  fetchImpl = fetch, timeoutMs = PRIVATE_RUN_AVAILABILITY_TIMEOUT_MS, signal
} = {}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('availability-timeout'),timeoutMs);
  const relay=()=>controller.abort(signal?.reason);
  signal?.addEventListener?.('abort',relay,{once:true});
  try {
    const response=await fetchImpl(PRIVATE_RUN_AVAILABILITY_URL,{
      method:'GET',headers:{Accept:'application/json'},cache:'no-store',credentials:'omit',
      referrerPolicy:'no-referrer',signal:controller.signal
    });
    if(!response?.ok)return safeDisabledPrivateRunConfig('configuration-unavailable');
    let payload;
    try{payload=await response.json();}catch{return safeDisabledPrivateRunConfig('configuration-invalid');}
    try{return validatePrivateRunOperationalConfig(payload);}
    catch{return safeDisabledPrivateRunConfig('configuration-invalid');}
  } catch {
    return safeDisabledPrivateRunConfig('configuration-unavailable');
  } finally {
    clearTimeout(timer); signal?.removeEventListener?.('abort',relay);
  }
}
