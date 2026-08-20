import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import publicConfigHandler, { isValidClerkPublishableKey } from '../api/public-auth-config.js';

const validKey = 'pk_test_c3ludGhldGljLmNsZXJrLmFjY291bnRzLmRldiQ';

function loadAuth({ resolveConfig, key = validKey }) {
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  let appended = 0, loadCalls = 0, listeners = 0;
  const Clerk = { user:null, session:null, load:async options=>{ loadCalls++; assert.equal(options.publishableKey,key); }, addListener:()=>{listeners++;} };
  const window = {
    CAISSA_AUTH_CONFIG:{CLERK_PUBLISHABLE_KEY:'pk_test_REPLACE_WITH_YOUR_KEY',STORAGE_KEYS:{USER_PROFILE:'profiles',AUTH_STATE:'state'}},
    CAISSA_AUTH_CONFIG_UTILS:{isValidClerkPublishableKey}, CAISSA_AUTH_CONFIG_READY:ready,
    addEventListener(){}, dispatchEvent(){}, location:{pathname:'/',search:'',hash:'',href:''}
  };
  const document = { readyState:'complete', createElement:()=>({dataset:{}}), head:{appendChild(script){appended++; window.Clerk=Clerk; queueMicrotask(()=>script.onload());}} };
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  vm.runInContext(fs.readFileSync('js/caissa-auth.js','utf8'),vm.createContext({window,document,localStorage,CustomEvent:class{},Promise,console,queueMicrotask}));
  if(resolveConfig){window.CAISSA_AUTH_CONFIG.CLERK_PUBLISHABLE_KEY=key; resolveReady(window.CAISSA_AUTH_CONFIG);}
  else resolveReady(window.CAISSA_AUTH_CONFIG);
  return {window, counts:()=>({appended,loadCalls,listeners})};
}

test('slow config prevents Clerk construction until valid config resolves', async()=>{
  let resolveReady; const ready=new Promise(resolve=>{resolveReady=resolve;}); let appended=0;
  const window={CAISSA_AUTH_CONFIG:{CLERK_PUBLISHABLE_KEY:'pk_test_REPLACE_WITH_YOUR_KEY'},CAISSA_AUTH_CONFIG_UTILS:{isValidClerkPublishableKey},CAISSA_AUTH_CONFIG_READY:ready,addEventListener(){},dispatchEvent(){}};
  const document={readyState:'complete',createElement:()=>({dataset:{}}),head:{appendChild(){appended++;}}};
  vm.runInContext(fs.readFileSync('js/caissa-auth.js','utf8'),vm.createContext({window,document,localStorage:{},CustomEvent:class{},Promise,console}));
  await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(appended,0);
  window.CAISSA_AUTH_CONFIG.CLERK_PUBLISHABLE_KEY=validKey; resolveReady();
});

test('missing and malformed config never construct Clerk', async()=>{
  for(const key of ['', 'pk_test_bad!', 'pk_live_short']) { const run=loadAuth({resolveConfig:false,key}); run.window.CAISSA_AUTH_CONFIG.CLERK_PUBLISHABLE_KEY=key; await new Promise(r=>setTimeout(r,0)); assert.equal(run.counts().appended,0); }
});

test('valid config initializes exactly one owned Clerk instance', async()=>{
  const run=loadAuth({resolveConfig:true}); await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(run.counts(),{appended:1,loadCalls:1,listeners:1});
});

test('no HTML page preconstructs Clerk without resolved configuration',()=>{
  for(const file of ['about.html','library.html','roadmap.html','premium.html']) {
    const source=fs.readFileSync(file,'utf8'); assert.doesNotMatch(source,/clerk\.browser\.js|data-clerk-publishable-key/,file);
    assert.match(source,/caissa-auth\.js/,file);
  }
});

test('public endpoint rejects malformed key candidates',()=>{
  assert.equal(isValidClerkPublishableKey(validKey),true);
  for(const value of ['', 'pk_test_bad!', 'pk_live_short', ['sk', 'test', 'never_public'].join('_')]) assert.equal(isValidClerkPublishableKey(value),false);
});

test('global CSP adds only Clerk-required blob worker while Play stays self-only',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const global=config.headers.find(item=>item.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value;
  assert.match(global,/worker-src 'self' blob:/); assert.doesNotMatch(global,/worker-src[^;]*\*/);
  for(const source of ['/play','/play/:path*']) {
    const value=config.headers.find(item=>item.source===source).headers.find(h=>h.key==='Content-Security-Policy').value;
    assert.match(value,/worker-src 'self';/); assert.doesNotMatch(value,/worker-src[^;]*blob:/);
  }
});
