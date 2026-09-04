import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const files = ['js/play/play-v2-coach-boundary.js', 'js/play/native-coach/coach-assistance-policy.js', 'js/play/native-coach/coach-configuration.js',
    'js/play/native-coach/coach-assistance-sanitizer.js', 'js/play/native-coach/coach-assistance.js', 'js/play/native-coach/coach-panel.js'];
function loadCore() {
    const window = {}; const context = vm.createContext({ window, globalThis: window, Object });
    for (const file of files.slice(0, 5)) new vm.Script(read(file)).runInContext(context);
    return window;
}

test('PlayV2CoachBoundary@1.0.0 freezes every required ownership and prohibition', () => {
    const boundary = loadCore().CaissaPlayV2CoachBoundary;
    assert.equal(boundary.contractId, 'PlayV2CoachBoundary@1.0.0');
    assert.deepEqual(JSON.parse(JSON.stringify(boundary)), {
        schemaVersion: '1.0.0', contractId: 'PlayV2CoachBoundary@1.0.0', primaryPurpose: 'assisted-play',
        gameLifecycleOwner: 'certified-Games-lifecycle', primaryBoardCount: 1, clockOwner: 'existing-single-owner',
        opponentOwner: 'existing-local-owner', assistanceOwner: 'isolated-play-v2-coach', academyDependency: 'prohibited',
        lessonDependency: 'prohibited', curriculumDependency: 'prohibited', endgameTrainingDependency: 'prohibited',
        guidedReplayDependency: 'prohibited', knowledgeUnitDependency: 'prohibited', trainingMemorySurface: 'prohibited',
        trainingMemoryWrites: 'prohibited', masterySurface: 'prohibited', masteryWrites: 'prohibited',
        recommendationEngine: 'prohibited', mentorDependency: 'prohibited', hiddenAnswerExposure: 'prohibited',
        automaticBestMove: 'prohibited', autoplay: 'prohibited', ficsDependency: 'prohibited', analyticsTransport: 'disabled',
        publicReady: false, assistanceCertification: 'locally-assistance-certified', observableEvents: [
            'game-start', 'user-turn', 'candidate-user-move', 'committed-user-move', 'clock-state', 'terminal-state']
    });
    assert.equal(Object.isFrozen(boundary), true);
});

test('configuration is compact, fixed, validated, and has no invented options', () => {
    const configuration = loadCore().CaissaNativeCoachConfiguration;
    assert.deepEqual([...configuration.levels], ['light', 'standard', 'more-help']);
    assert.deepEqual([...configuration.focuses], ['balanced', 'tactics', 'safety', 'time-awareness']);
    assert.deepEqual([...configuration.timings], ['on-request']);
    assert.equal(configuration.validate(configuration.defaults).valid, true);
    assert.equal(configuration.validate({ ...configuration.defaults, level: 'show-best-move' }).valid, false);
});

test('assistance observes only bounded events and cannot commit or retain hidden answers', () => {
    const assistance = loadCore().CaissaNativeCoachAssistance.create();
    assert.equal(assistance.observe({ type: 'committed-user-move', bestMove: 'e2e4' }).reasonCode, 'RAW_OUTPUT_REJECTED');
    assert.equal(assistance.observe({ type: 'opponent-future-move' }).ok, false);
    assert.equal(assistance.inspect().moveCommits, 0); assert.equal(assistance.inspect().hiddenAnswers, 0);
});

test('native resource group is isolated while educational Coach remains standalone', () => {
    const registry = read('js/play/performance/play-load-registry.js');
    const nativeBlock = registry.match(/'native-coach-stack':[\s\S]*?\r?\n\s*}\),\r?\n/)[0];
    assert.doesNotMatch(nativeBlock, /js\/play\/coach\/|academy|mentor|guided|knowledge|memory|mastery|recommend|endgame/i);
    assert.match(registry, /'coach-stack'/); assert.match(registry, /endgame-knowledge-map/);
});

test('static runtime owns no board, Worker, engine, clock, lifecycle, storage, transport, or move commit', () => {
    const source = files.slice(2).map(read).join('\n');
    assert.doesNotMatch(source, /new\s+Worker|createBoard|Chessboard\s*\(|CaissaClockService\.(?:create|configure)|CaissaGameLifecycle\.(?:create|sync)|\.move\s*\(|commitMove|fetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/i);
    assert.doesNotMatch(source, /Academy|Knowledge Unit|Training Memory|Guided Replay|Mentor|FICS/i);
});

test('Play Coach presentation uses the original Caissa portrait without a redundant inner title', () => {
    const panel = read('js/play/native-coach/coach-panel.js');
    const asset = fs.readFileSync(new URL('../../assets/play/caissa-coach-goddess.png', import.meta.url));
    assert.match(panel, /aria-label': 'Play Coach setup'/);
    assert.doesNotMatch(panel, /textContent = 'Play Coach'/);
    assert.match(panel, /Caissa, goddess of chess/);
    assert.match(panel, /caissa-coach-goddess\.png/);
    assert.doesNotMatch(panel, /Coach · Internal|locally certified|bounded assistance|Game setup/i);
    assert.ok(asset.length > 10000 && asset.length < 150000);
    assert.equal(asset.subarray(1, 4).toString(), 'PNG');
});
