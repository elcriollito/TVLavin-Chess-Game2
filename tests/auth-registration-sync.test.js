import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import syncHandler from '../api/user/sync.js';

function response() {
  return { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; }, end() { return this; }, setHeader(k,v) { this.headers[k]=v; } };
}

function userDb(result = { clerk_id:'subject', email:'verified@example.test', role:'member', is_premium:false, credits:0 }) {
  const calls=[];
  return { calls, from(name) { assert.equal(name,'users'); return { upsert(data, options) { calls.push({data,options}); return { select() { return { single: async()=>({data:result,error:null}) }; } }; } }; } };
}

async function invoke(db, body={ role:'admin', credits:999, isPremium:true, email:'forged@example.test' }) {
  const res=response();
  await syncHandler({ method:'POST', headers:{}, body }, res, {
    verifyAuth: async()=>({authenticated:true,userId:'subject',email:'verified@example.test'}), getSupabase:()=>db
  });
  return res;
}

test('first authenticated sync provisions only verified identity fields with database defaults', async()=>{
  const db=userDb(); const res=await invoke(db);
  assert.equal(res.statusCode,200);
  assert.deepEqual(db.calls[0].options,{onConflict:'clerk_id',ignoreDuplicates:false});
  assert.equal(db.calls[0].data.clerk_id,'subject');
  assert.equal(db.calls[0].data.email,'verified@example.test');
  assert.equal('credits' in db.calls[0].data,false);
  assert.equal('role' in db.calls[0].data,false);
  assert.equal('is_premium' in db.calls[0].data,false);
  assert.equal(JSON.stringify(db.calls[0].data).includes('forged'),false);
});

test('repeated and concurrent syncs retain the same conflict identity', async()=>{
  const db=userDb(); await Promise.all([invoke(db),invoke(db),invoke(db)]);
  assert.equal(db.calls.length,3);
  assert.ok(db.calls.every(call=>call.options.onConflict==='clerk_id' && call.data.clerk_id==='subject'));
});

test('missing session is denied before database access', async()=>{
  let accessed=false; const res=response();
  await syncHandler({method:'POST',headers:{},body:{}},res,{verifyAuth:async()=>({authenticated:false}),getSupabase:()=>{accessed=true;}});
  assert.equal(res.statusCode,401); assert.equal(accessed,false);
});

test('database failure is recoverable and does not leak details', async()=>{
  const db={from(){return{upsert(){return{select(){return{single:async()=>({data:null,error:new Error('secret db detail')})}}}}}}};
  const res=await invoke(db); assert.equal(res.statusCode,503); assert.equal(res.body.recoverable,true); assert.doesNotMatch(JSON.stringify(res.body),/secret/);
});

test('auth completion is bounded, retryable, and registration redirects through it',()=>{
  const completion=fs.readFileSync('js/auth-complete.js','utf8');
  const signup=fs.readFileSync('js/signup-page.js','utf8');
  const signin=fs.readFileSync('js/signin-page.js','utf8');
  assert.match(completion,/MAX_ATTEMPTS = 3/);
  assert.match(completion,/fetch\('\/api\/user\/sync'/);
  assert.match(completion,/retry\.focus\(\)/);
  assert.match(signup,/afterSignUpUrl: getCompletionUrl\(\)/);
  assert.match(signin,/afterSignInUrl: getCompletionUrl\(\)/);
});

test('Clerk verification appearance covers visible, focus, error, disabled and responsive states',()=>{
  const signup=fs.readFileSync('js/signup-page.js','utf8');
  const css=fs.readFileSync('css/caissa-auth.css','utf8');
  for(const token of ['otpCodeFieldInput','focus-visible','aria-invalid','disabled','formResendCodeLink','formFieldErrorText']) assert.match(signup,new RegExp(token));
  assert.match(css,/@media \(max-width: 480px\)/);
});
