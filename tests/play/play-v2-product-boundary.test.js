import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

async function loadContract() {
    const context = vm.createContext({ globalThis: null, window: null, URL, location: { origin: 'https://caissa.test' } });
    context.globalThis = context; context.window = context;
    new vm.Script(await read('js/play/play-v2-product-boundary.js')).runInContext(context);
    return context.CaissaPlayV2ProductBoundary;
}

test('PlayV2ProductBoundary@1.0.0 declares the immutable playing-only policy', async () => {
    const api = await loadContract();
    assert.equal(api.contractId, 'PlayV2ProductBoundary@1.0.0');
    assert.deepEqual({ ...api.policy }, {
        primaryPurpose: 'play', academySurface: 'prohibited', classes: 'prohibited', lessons: 'prohibited',
        courses: 'prohibited', curriculum: 'prohibited', endgameTrainer: 'prohibited',
        endgameLibrary: 'prohibited', knowledgeUnits: 'prohibited', guidedReplay: 'prohibited',
        masterySurface: 'prohibited', masteryWrites: 'prohibited', trainingMemorySurface: 'prohibited',
        trainingMemoryWrites: 'prohibited', trainingRecommendations: 'prohibited',
        educationalPromotions: 'prohibited', coachRuntime: 'allowed-internal-assistance-pending', mentorRuntime: 'allowed-internal-review-only',
        analyzeHandoff: 'external-post-game', mentorFutureBoundary: 'optional-review-only', playersRuntime: 'blocked'
    });
    assert(Object.isFrozen(api)); assert(Object.isFrozen(api.policy));
});

test('resource, route, action, DOM, and network guards fail closed on educational ownership', async () => {
    const api = await loadContract();
    for (const input of [
        { type: 'dynamic-group', value: 'coach-stack' }, { type: 'dynamic-group', value: 'mentor-analysis' },
        { type: 'script', value: 'js/mentor/mentor-foundation.js?v=1.1.0' },
        { type: 'style', value: 'css/mentor-guided-replay.css?v=1.0.0' },
        { type: 'route', value: '/play/mentor?simplified=1' },
        { type: 'dom', value: 'Recommended lesson card' },
        { type: 'network', value: 'https://academy.example/resource', baseOrigin: 'https://caissa.test' }
    ]) assert.equal(api.authorize(input).allowed, false, JSON.stringify(input));
    for (const input of [
        { type: 'dynamic-group', value: 'bots-stack' }, { type: 'dynamic-group', value: 'native-coach-stack' }, { type: 'dynamic-group', value: 'native-mentor-review' }, { type: 'dynamic-group', value: 'analyze-deep' },
        { type: 'script', value: 'js/play/post-game-core.js?v=1.0.0' },
        { type: 'route', value: '/play/games?simplified=1' }, { type: 'route', value: '/play/coach?simplified=1' }, { type: 'action', value: 'analyze' }, { type: 'action', value: 'mentor-review' },
        { type: 'dom', value: 'Result Rematch New Game Save PGN Analyze' },
        { type: 'network', value: 'https://caissa.test/js/play/bots-panel.js', baseOrigin: 'https://caissa.test' }
    ]) assert.equal(api.authorize(input).allowed, true, JSON.stringify(input));
});

test('generated Play v2 entry excludes educational resources and DOM while standalone owners remain', async () => {
    const [play, legacy, core, registry] = await Promise.all([
        read('play-v2.html'), read('index.html'), read('js/play/post-game-core.js'), read('js/play/performance/play-load-registry.js')
    ]);
    assert.match(play, /play-v2-product-boundary\.js/); assert.match(play, /post-game-core\.js/);
    const resources=(play.match(/<(?:script|link)\b[^>]*>/gi)||[]).filter(value=>/(?:academy|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|js\/play\/coach\/)/i.test(value));
    const allowedMentorShellResources = /(?:play-v2-mentor-review-boundary\.js|mentor-context-contract\.js|mentor-floating-shell\.(?:js|css))/i;
    assert.deepEqual(resources.filter(value=>!allowedMentorShellResources.test(value)),[]);
    assert.doesNotMatch(play, /(?:mentor-ai|mentor-prompts|mentor-foundation|mentor-guided-replay)\.js/i);
    assert.match(play, /play-v2-coach-boundary\.js/);
    assert.doesNotMatch(play, /id="academySection"|data-section="academy"/i);
    assert.doesNotMatch(core, /Academy|classes|lesson|curriculum|Guided Replay|Knowledge Unit/i);
    assert.match(core, /trainingMemoryWrites:\s*0/); assert.match(core, /masteryWrites:\s*0/);
    assert.match(legacy, /id="academySection"/); assert.match(legacy, /post-game-experience\.js/);
    assert.match(registry, /'coach-stack'/); assert.match(registry, /'mentor-guided-replay'/);
});

test('boundary implementation adds no persistence, transport, identity, answer, or runtime owner', async () => {
    const source = await read('js/play/play-v2-product-boundary.js');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\s*\(|WebSocket|sendBeacon|XMLHttpRequest|postMessage|new\s+Worker|createElement|appendChild/i);
});
