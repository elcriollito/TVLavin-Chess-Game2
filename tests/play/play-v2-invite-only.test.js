import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlayBetaService } from '../../api/_lib/play-beta-service.js';
import { PLAY_BETA, hashSecret, parseBetaPath } from '../../api/_lib/play-beta-policy.js';

const env = { CAISSA_PLAY_V2_BETA_STAGE: 'invite-only', CAISSA_PLAY_V2_SESSION_SECRET: 'test-session-secret-not-production', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only' };
const response = () => ({ statusCode: 200, headers: {}, body: null, setHeader(k,v){this.headers[k]=v;}, status(v){this.statusCode=v;return this;}, json(v){this.body=v;return this;}, send(v){this.body=v;return this;} });
const request = (method, url, body = null, cookie = '') => ({ method, url, body, headers: { host: 'caissa.test', origin: 'https://caissa.test', cookie, 'content-type': 'application/json' } });

function storeFixture() {
    const invites = new Map(), sessions = new Map(), feedback = []; let enabled = true;
    return {
        seed(token, coach = false) { invites.set(hashSecret(token), { remaining: 3, coach }); },
        setEnabled(value) { enabled = value; }, feedback,
        async redeem({p_invite_hash,p_session_hash,p_now,p_absolute_seconds}) { const invite=invites.get(p_invite_hash); if(!enabled||!invite||invite.remaining<1)return {authorized:false,reason_code:'INVITE_INVALID'}; invite.remaining--; sessions.set(p_session_hash,{coach:invite.coach,revoked:false}); return {authorized:true,expires_at:new Date(Date.parse(p_now)+p_absolute_seconds*1000).toISOString()}; },
        async session({p_session_hash}) { const value=sessions.get(p_session_hash); return value&&!value.revoked&&enabled?{authorized:true,program_enabled:true,coach_enabled:value.coach,session_id:'00000000-0000-4000-8000-000000000001',expires_at:'2099-01-01T00:00:00Z'}:{authorized:false,program_enabled:enabled,reason_code:enabled?'SESSION_INVALID':'BETA_DISABLED'}; },
        async revokeSession(hash) { const value=sessions.get(hash); if(value)value.revoked=true; return !!value; },
        async feedback(input) { feedback.push(input); return {accepted:true,reference:'ABC123'}; }
    };
}

test('policy freezes authorized values and public beta remains closed', async () => {
    assert.equal(PLAY_BETA.requiredStage, 'invite-only'); assert.equal(PLAY_BETA.maxRedemptions, 3);
    assert.equal(PLAY_BETA.feedbackRetentionDays, 90); assert.equal(parseBetaPath('/play/beta/players'), null);
    const contractSource=fs.readFileSync(new URL('../../js/play/play-v2-invite-policy.js',import.meta.url),'utf8');
    assert.match(contractSource,/publicBeta: 'disabled'/); assert.match(contractSource,/clarity: 'disabled'/);
    const html=fs.readFileSync(new URL('../../play-v2.html',import.meta.url),'utf8');
    assert.doesNotMatch(html,/caissa-clarity\.js|clarity\.ms|\/api\/public-auth-config/i);
    assert.match(html,/play-v2-invite-client\.js/); assert.match(html,/play-v2-invite-feedback\.css/);
});

test('missing configuration, public-beta and cross-origin redemption fail closed', async () => {
    const store=storeFixture(),token='Z'.repeat(43);store.seed(token);
    for(const closedEnv of [{},{...env,CAISSA_PLAY_V2_BETA_STAGE:'public-beta'},{...env,CAISSA_PLAY_V2_SESSION_SECRET:''}]){
        const res=response();await createPlayBetaService({store,env:closedEnv}).redeem(request('POST','/api/play-beta/redeem',{token}),res);assert.equal(res.statusCode,404);
    }
    const req=request('POST','/api/play-beta/redeem',{token});req.headers.origin='https://attacker.invalid';const res=response();
    await createPlayBetaService({store,env}).redeem(req,res);assert.equal(res.statusCode,403);
});

test('write APIs require bounded JSON and store failures remain non-enumerable', async () => {
    const token='Y'.repeat(43), store=storeFixture(); store.seed(token);
    const service=createPlayBetaService({store,env});
    const wrong=request('POST','/api/play-beta/redeem',{token}); wrong.headers['content-type']='text/plain';
    const wrongRes=response(); await service.redeem(wrong,wrongRes); assert.equal(wrongRes.statusCode,415);
    const huge=request('POST','/api/play-beta/redeem',{token}); huge.headers['content-length']='9000';
    const hugeRes=response(); await service.redeem(huge,hugeRes); assert.equal(hugeRes.statusCode,413);
    const unavailable=createPlayBetaService({store:{...store,async redeem(){throw new Error('database detail');}},env});
    const unavailableRes=response(); await unavailable.redeem(request('POST','/api/play-beta/redeem',{token}),unavailableRes);
    assert.equal(unavailableRes.statusCode,503); assert.deepEqual(unavailableRes.body,{error:'SERVICE_UNAVAILABLE'});
});

test('redeem creates hardened cookie, enforces three redemptions and rejects replay beyond limit', async () => {
    const token='A'.repeat(43), store=storeFixture(); store.seed(token);
    const service=createPlayBetaService({store,env,now:()=>1000});
    for(let i=0;i<3;i++){const res=response();await service.redeem(request('POST','/api/play-beta/redeem',{token}),res);assert.equal(res.statusCode,200);assert.match(res.headers['Set-Cookie'],/^__Host-caissa_play_beta=.*Secure; HttpOnly; SameSite=Strict$/);}
    const denied=response();await service.redeem(request('POST','/api/play-beta/redeem',{token}),denied);assert.equal(denied.statusCode,404);
});

test('session, capability, kill switch and logout are durable-store owned', async () => {
    const token='B'.repeat(43),store=storeFixture();store.seed(token,true);const service=createPlayBetaService({store,env,now:()=>1000});
    const redeemed=response();await service.redeem(request('POST','/api/play-beta/redeem',{token}),redeemed);
    const raw=decodeURIComponent(/__Host-caissa_play_beta=([^;]+)/.exec(redeemed.headers['Set-Cookie'])[1]);const cookie=`${PLAY_BETA.cookieName}=${raw}`;
    assert.equal((await service.authorizeEntry(request('GET','/play/beta/coach',null,cookie))).authorized,true);
    store.setEnabled(false);assert.equal((await service.authorizeEntry(request('GET','/play/beta',null,cookie))).authorized,false);
    store.setEnabled(true);const out=response();await service.logout(request('POST','/api/play-beta/logout',{},cookie),out);assert.match(out.headers['Set-Cookie'],/Max-Age=0/);
    assert.equal((await service.authorizeEntry(request('GET','/play/beta',null,cookie))).authorized,false);
});

test('route/session matrix cannot manufacture authorization', async () => {
    const token='M'.repeat(43), store=storeFixture(); store.seed(token,false);
    const service=createPlayBetaService({store,env,now:()=>1000});
    for (const path of ['/play/beta','/play/beta/games','/play/beta/bots','/play/beta/coach'])
        assert.equal((await service.authorizeEntry(request('GET',path))).authorized,false,`no cookie ${path}`);
    for (const cookie of [`${PLAY_BETA.cookieName}=short`,`${PLAY_BETA.cookieName}=%E0%A4%A`])
        assert.equal((await service.authorizeEntry(request('GET','/play/beta',null,cookie))).authorized,false,cookie);
    const redeemed=response(); await service.redeem(request('POST','/api/play-beta/redeem',{token}),redeemed);
    const raw=decodeURIComponent(/__Host-caissa_play_beta=([^;]+)/.exec(redeemed.headers['Set-Cookie'])[1]);
    const cookie=`${PLAY_BETA.cookieName}=${raw}`;
    for (const path of ['/play/beta','/play/beta/games','/play/beta/bots'])
        assert.equal((await service.authorizeEntry(request('GET',path,null,cookie))).authorized,true,path);
    assert.deepEqual(await service.authorizeEntry(request('GET','/play/beta/coach',null,cookie)),
        {authorized:false,reasonCode:'CAPABILITY_REQUIRED'});
    for (const path of ['/play/beta/players','/play/beta/unknown','/play-v2.html','/play/beta/qa/promotion','/play/beta/qa/ipad-analyze-diagnostic'])
        assert.equal((await service.authorizeEntry(request('GET',path,null,cookie))).authorized,false,path);
    for (const stage of ['disabled','internal','public-beta'])
        assert.equal((await createPlayBetaService({store,env:{...env,CAISSA_PLAY_V2_BETA_STAGE:stage}}).authorizeEntry(request('GET','/play/beta',null,cookie))).authorized,false,stage);
    assert.equal((await service.authorizeEntry(request('GET','/play/beta?token=fabricated#invite=fabricated',null,cookie))).authorized,true);
});

test('historical automatic feedback endpoint is unconditionally fail-closed', async () => {
    const store=storeFixture(),service=createPlayBetaService({store,env});
    for(const method of ['GET','POST']){const denied=response();await service.feedback(request(method,'/api/play-beta/feedback',{comment:'ordinary text'}),denied);assert.equal(denied.statusCode,404);assert.deepEqual(denied.body,{error:'FEEDBACK_TRANSPORT_DISABLED'});}
    assert.doesNotMatch(fs.readFileSync(new URL('../../api/_lib/play-beta-service.js',import.meta.url),'utf8'),/data\(\)\.feedback/);
});

test('SQL owners serialize redemption and feedback limits and expose RPCs only to service_role', () => {
    const sql=fs.readFileSync(new URL('../../supabase/migrations/20260808_play_v2_invite_only.sql',import.meta.url),'utf8');
    assert.match(sql,/begin;[\s\S]*commit;/);
    assert.match(sql,/beta_invites where token_hash=p_invite_hash for update/);
    assert.match(sql,/beta_sessions where session_hash=p_session_hash and revoked_at is null for update/);
    assert.match(sql,/if v_count>=5 then raise exception 'ACTIVE_INVITE_LIMIT_REACHED'/);
    assert.match(sql,/delete from public\.beta_feedback where delete_after<=p_now/);
    assert.match(sql,/revoke all on function public\.submit_play_beta_feedback[\s\S]* from public/);
    assert.match(sql,/grant execute on function[\s\S]* to service_role;/);
    assert.doesNotMatch(sql,/grant execute on function[\s\S]* to (?:anon|authenticated)/);
});

test('routing and migration remain fail closed and contain no identity or raw-IP columns', () => {
    const vercel=JSON.parse(fs.readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
    assert.ok(vercel.rewrites.some(x=>x.source==='/play-v2.html'&&x.destination==='/play-v2-unavailable.html'));
    assert.equal(vercel.rewrites.some(x=>x.has?.some(h=>h.key==='simplified')),false);
    assert.ok(vercel.rewrites.some(x=>x.source==='/play/beta/:path*'&&x.destination==='/play-v2-unavailable.html'));
    assert.ok(vercel.rewrites.some(x=>x.source==='/supabase/:path*'&&x.destination==='/play-v2-unavailable.html'));
    const sql=fs.readFileSync(new URL('../../supabase/migrations/20260808_play_v2_invite_only.sql',import.meta.url),'utf8');
    assert.match(sql,/enable row level security/g);assert.doesNotMatch(sql,/\b(email|ip_address|fingerprint|pgn|fen|moves|cookie)\b/i);
});

test('administration is local-only, confirmation-gated, and never accepts an invite token in argv', () => {
    const source=fs.readFileSync(new URL('../../scripts/play-beta-admin.mjs',import.meta.url),'utf8');
    assert.match(source,/readFileSync\(0, 'utf8'\)/);
    assert.match(source,/destructive\.has\(command\) && !flag\('confirm'\)/);
    assert.match(source,/command-line tokens are prohibited/);
    assert.doesNotMatch(source,/--token TOKEN/);
    const endpoints=fs.readdirSync(new URL('../../api/play-beta/',import.meta.url));
    assert.deepEqual(endpoints.sort(),['entry.js','feedback.js','logout.js','redeem.js','session.js','status.js']);
});
