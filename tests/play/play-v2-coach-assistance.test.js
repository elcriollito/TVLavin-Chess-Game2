import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
import { VERSION, corpus } from './coach/play-v2-coach-assistance-corpus.js';
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const files = ['js/play/play-v2-coach-boundary.js', 'js/play/native-coach/coach-assistance-policy.js', 'js/play/native-coach/coach-configuration.js',
    'js/play/native-coach/coach-assistance-sanitizer.js', 'js/play/native-coach/coach-assistance.js'];
function load() { const window = {}; const context = vm.createContext({ window, globalThis: window, Object, Set, Date }); files.forEach(file => new vm.Script(read(file)).runInContext(context)); return window; }
const plain = value => JSON.parse(JSON.stringify(value));
test('PlayV2CoachAssistancePolicy@1.0.0 declares the complete immutable safety contract', () => {
    const p = load().CaissaPlayV2CoachAssistancePolicy; assert.equal(p.contractId, 'PlayV2CoachAssistancePolicy@1.0.0'); assert.equal(Object.isFrozen(p), true);
    for (const key of ['userMoveCommit','automaticMoveExecution','unrestrictedBestMove','principalVariationDisplay','exactEngineLine','futureOpponentMoveLeak','hiddenAnswerLogging','academyDependency','trainingMemoryWrites','masteryWrites']) assert.equal(p[key], 'prohibited');
    assert.deepEqual([...p.timings], ['on-request']); assert.deepEqual(Object.keys(p.levels), ['light','standard','more-help']);
});
test('sanitizer strips the UI boundary to an allowlist and rejects raw answer shapes', () => { const w = load(); const safe = { eventId:'1',generation:1,turnId:'1',type:'user-turn',category:'king-safety',severity:'high',confidence:'high',timing:'on-request',messageKey:'KING_SAFETY',requested:true };
    assert.equal(w.CaissaNativeCoachAssistanceSanitizer.sanitize(safe).ok, true); for (const key of ['bestMove','candidateMoves','pv','mateSequence','rawCommand','futureFen','evaluation']) assert.equal(w.CaissaNativeCoachAssistanceSanitizer.sanitize({ ...safe, [key]:'secret' }).reasonCode, 'RAW_OUTPUT_REJECTED'); });
test('versioned synthetic corpus has complete provenance and deterministic allowed/suppressed outcomes', () => { assert.equal(VERSION, 'PlayV2CoachAssistanceCorpus@1.0.0'); assert.equal(corpus.length, 12); for (const item of corpus) {
    for (const key of ['fen','sideToMove','event','configuration','allowedCategory','prohibitedDisclosure','suppressionExpectation','provenance']) assert.ok(Object.hasOwn(item,key), `${item.id}:${key}`);
    const w = load(); let now = 100000; const a = w.CaissaNativeCoachAssistance.create({ now:()=>now }); a.configure(item.configuration); const generation = a.inspect().generation;
    const outcome = a.observe({ eventId:item.id,generation,turnId:item.id,openingPly:8,messageKey: ({'king-safety':'KING_SAFETY','forcing-moves':'FORCING_MOVES','vulnerable-piece':'VULNERABLE_PIECE','opponent-threat':'OPPONENT_THREAT','low-time':'LOW_TIME','material-change':'MATERIAL_CHANGE'})[item.event.category], ...item.event });
    assert.equal(outcome.ok, !item.suppressionExpectation, item.id); if (item.suppressionExpectation) assert.equal(outcome.reasonCode,item.suppressionExpectation,item.id); else assert.equal(outcome.presentation.category,item.allowedCategory,item.id);
    const metrics = a.inspect(); assert.deepEqual([metrics.moveCommits,metrics.bestMovePvDisclosures,metrics.hiddenAnswers,metrics.staleMessages,metrics.duplicateMessages,metrics.terminalMessages,metrics.trainingMemoryWrites,metrics.masteryWrites],[0,0,0,0,0,0,0,0]);
} });
test('frequency, duplicate, promotion, opponent, terminal and stale suppression are bounded', () => { const w=load(); let now=100000; const a=w.CaissaNativeCoachAssistance.create({now:()=>now}); const g=a.inspect().generation;
    const input=(turn,category='opponent-threat',extra={})=>({eventId:turn,generation:g,turnId:turn,type:'user-turn',category,severity:'high',confidence:'high',timing:'on-request',messageKey:category==='king-safety'?'KING_SAFETY':'OPPONENT_THREAT',requested:true,openingPly:8,...extra});
    assert.equal(a.observe(input('1')).ok,true); assert.equal(a.observe(input('1','king-safety')).reasonCode,'TURN_LIMIT'); now+=30000; assert.equal(a.observe(input('2')).reasonCode,'DUPLICATE_CATEGORY');
    assert.equal(a.observe(input('3','king-safety',{promotionPending:true})).reasonCode,'PROMOTION_SUPPRESSED'); assert.equal(a.observe(input('4','king-safety',{opponentWorking:true})).reasonCode,'OPPONENT_WORK_SUPPRESSED');
    a.teardown(); assert.equal(a.observe(input('5','king-safety')).reasonCode,'STALE_ASSISTANCE'); });
test('presentation source has no engine call, move commit, storage, network, or raw answer rendering', () => { const source=read('js/play/native-coach/coach-panel.js'); assert.doesNotMatch(source,/getBestMove|\.move\s*\(|fetch\s*\(|WebSocket|localStorage|sessionStorage|principalVariation|candidateMoves/); });
test('finite human review packet contains every message and all seven pending dimensions', () => { const w=load(); const packet=JSON.parse(read('docs/architecture/evidence/PLAY_V2_COACH_ASSISTANCE_REVIEW_PACKET.json'));
    assert.equal(packet.status,'pending'); assert.equal(packet.reviewer,null); assert.deepEqual(packet.dimensions,['clarity','tone','chess-correctness','answer-leakage','interruption-risk','accessibility','translation-readiness']);
    assert.deepEqual(packet.messages.map(item=>item.key).sort(),Object.keys(w.CaissaPlayV2CoachAssistancePolicy.messages).sort()); assert(packet.messages.every(item=>item.review==='pending'&&item.context&&item.text)); });
