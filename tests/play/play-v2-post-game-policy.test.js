import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function load() { const window={}; vm.runInNewContext(read('js/play/play-v2-post-game-policy.js'),{window,globalThis:window,Object}); return window.CaissaPlayV2PostGamePolicy; }
const plain = value => JSON.parse(JSON.stringify(value));
const record = (value, termination, color='white', status='completed') => ({ status, player:{color}, result:{ value, termination,
    winner:value==='1-0'?'white':value==='0-1'?'black':null, complete:true } });
test('PlayV2PostGamePolicy@1.1.0 freezes every required ownership and product declaration',()=>{ const p=load(); assert.equal(p.contractId,'PlayV2PostGamePolicy@1.1.0');
    assert.deepEqual(plain(Object.fromEntries(['owner','gameRecordRequired','finalizedRecordRequired','resultFirst','terminationReasonRequired','boardRemainsVisible','clocksStopped','opponentWorkStopped','rematch','newGame','analyze','copyPgn','downloadPgn','localSavePgn','mentor','academy','educationalRecommendations','ratingChange','fictitiousRewards','automaticNavigation','analyticsTransport'].map(k=>[k,p[k]]))),{
        owner:'post-game-core',gameRecordRequired:true,finalizedRecordRequired:true,resultFirst:true,terminationReasonRequired:true,boardRemainsVisible:true,clocksStopped:true,opponentWorkStopped:true,rematch:'allowed',newGame:'allowed',analyze:'external-continuation',copyPgn:'allowed',downloadPgn:'allowed',localSavePgn:'consent-controlled',mentor:'optional-review-only',academy:'prohibited',educationalRecommendations:'prohibited',ratingChange:'prohibited-without-native-rating-authority',fictitiousRewards:'prohibited',automaticNavigation:'prohibited',analyticsTransport:'disabled'});
    assert.equal(p.primaryAction,'analyze'); assert.deepEqual(plain(p.actionOrder),['analyze','rematch','new-game','mentor-review','copy-pgn','download-pgn','save-game']);
    assert.equal(p.history[0].contractId,'PlayV2PostGamePolicy@1.0.0'); assert.equal(p.history[0].primaryAction,'rematch'); assert(Object.isFrozen(p)); });
test('result language is deterministic for both player colors and every supported termination',()=>{ const p=load();
    assert.equal(p.describe(record('1-0','checkmate','white')).title,'You Won'); assert.equal(p.describe(record('1-0','checkmate','black')).title,'You Lost');
    assert.equal(p.describe(record('0-1','resignation','black')).title,'You Won'); assert.equal(p.describe(record('0-1','resignation','white')).title,'You Lost');
    assert.equal(p.describe(record('1/2-1/2','stalemate')).title,'Draw');
    for(const [termination,reason] of Object.entries(p.terminationReasons)) assert.equal(p.describe(record(termination==='aborted'?'1/2-1/2':'1/2-1/2',termination,'white',termination==='aborted'?'aborted':'completed')).reason,reason);
});
test('incomplete and startup-failure shapes never become completed PostGame results',()=>{ const p=load(); assert.equal(p.describe({status:'in-progress',result:{complete:false}}).valid,false); assert.equal(p.describe({status:'aborted',result:{complete:false}}).valid,false); });
test('Play v2 loads exactly one policy before its sole PostGame core while legacy owners remain unchanged',()=>{ const generated=read('play-v2.html');
    assert.equal((generated.match(/play-v2-post-game-policy\.js/g)||[]).length,1); assert.equal((generated.match(/post-game-core\.js/g)||[]).length,1); assert(generated.indexOf('play-v2-post-game-policy.js')<generated.indexOf('post-game-core.js'));
    assert.doesNotMatch(generated,/post-game-experience\.js/); for(const page of ['index.html','yahoo-classic.html']) { const html=read(page); assert.equal((html.match(/post-game-experience\.js/g)||[]).length,1); assert.doesNotMatch(html,/post-game-core|play-v2-post-game-policy/); } });
test('core owns no education, ratings, rewards, analytics, FICS, transport, storage, second board, or Worker construction',()=>{ const source=read('js/play/post-game-core.js');
    assert.doesNotMatch(source,/Academy|Guided Replay|Knowledge Unit|CaissaTrainingMemory|CaissaMastery|rating change|reward|confetti|FICS|fetch\s*\(|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|new\s+Worker|Chessboard\s*\(/i); });
