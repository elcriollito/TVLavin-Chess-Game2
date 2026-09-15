import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
    injectPlayGameplayPreviewMarker,
    resolvePlayGameplayDeploymentConfig,
    resolvePlayGameplayPreviewConfig
} from '../../api/_lib/play-gameplay-preview-config.js';
import middleware from '../../middleware.js';

const ROOT = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, ROOT), 'utf8');
const manifest = JSON.parse(read('tests/fixtures/engine18/engine18-003-preview.json'));

function registryWithAdapter() {
    const created = [];
    class EngineAdapter {
        constructor(config) { Object.assign(this, config); created.push(config); }
    }
    const window = { EngineAdapter };
    vm.runInNewContext(read('js/engine-registry.js'), { window, console }, { filename: 'js/engine-registry.js' });
    return { registry: window.EngineRegistry, created };
}

const previewGates = Object.freeze({
    CAISSA_PLAY_SF18_GAMEPLAY: true,
    activationId: 'ENGINE18-003',
    deploymentEnvironment: 'preview'
});

test('preview config requires exact Vercel preview environment and exact true value', () => {
    const cases = [
        [{}, false],
        [{ VERCEL_ENV: 'production', CAISSA_PLAY_SF18_GAMEPLAY: 'true' }, false],
        [{ VERCEL_ENV: 'preview' }, false],
        [{ VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: true }, false],
        [{ VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: 'TRUE' }, false],
        [{ VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: ' true ' }, false],
        [{ VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: 'true' }, true]
    ];
    for (const [environment, expected] of cases) {
        const config = resolvePlayGameplayPreviewConfig(environment);
        assert.equal(config.enabled, expected);
        assert.equal(config.providerKey, expected ? manifest.roles.game : manifest.activation.productionDefault);
    }
});
const productionGates = Object.freeze({
    CAISSA_PLAY_SF18_GAMEPLAY: true,
    activationId: 'ENGINE18-003C',
    deploymentEnvironment: 'production'
});

test('production release config activates only the authorized Vercel production target', () => {
    const production = resolvePlayGameplayDeploymentConfig({ VERCEL_ENV: 'production' });
    assert.deepEqual(production, {
        schemaVersion: '1.1.0',
        activationId: 'ENGINE18-003C',
        deploymentEnvironment: 'production',
        enabled: true,
        providerKey: 'stockfish-18-gameplay',
        reasonCode: 'ENGINE18_003C_PRODUCTION_RELEASED'
    });
    assert.equal(resolvePlayGameplayDeploymentConfig({}).enabled, false);
    assert.equal(resolvePlayGameplayDeploymentConfig({ VERCEL_ENV: 'development' }).enabled, false);
    assert.equal(resolvePlayGameplayDeploymentConfig({
        VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: 'true'
    }).activationId, 'ENGINE18-003');
});

test('preview marker injection is enabled-only, deterministic, and contains no configuration input', () => {
    const html = '<!doctype html><html><head><title>Play</title></head><body></body></html>';
    const off = resolvePlayGameplayPreviewConfig({ VERCEL_ENV: 'production', CAISSA_PLAY_SF18_GAMEPLAY: 'true' });
    assert.equal(injectPlayGameplayPreviewMarker(html, off), html);
    const on = resolvePlayGameplayPreviewConfig({ VERCEL_ENV: 'preview', CAISSA_PLAY_SF18_GAMEPLAY: 'true' });
    const injected = injectPlayGameplayPreviewMarker(html, on);
    assert.match(injected, /name="caissa-play-gameplay-provider" content="stockfish-18-gameplay"/);
    assert.match(injected, /data-activation-id="ENGINE18-003" data-deployment-environment="preview"/);
    assert.equal((injected.match(/caissa-play-gameplay-provider/g) || []).length, 1);

    const production = injectPlayGameplayPreviewMarker(html,
        resolvePlayGameplayDeploymentConfig({ VERCEL_ENV: 'production' }));
    assert.match(production, /data-activation-id="ENGINE18-003C" data-deployment-environment="production"/);
});

test('role resolver activates SF18 for Preview game only and fails closed for malformed activation', () => {
    const { registry } = registryWithAdapter();
    assert.equal(registry.resolveRoleProvider('game', previewGates).providerKey, manifest.roles.game);
    assert.equal(registry.resolveRoleProvider('game', productionGates).providerKey, manifest.roles.game);
    for (const role of ['coach-active', 'bots']) {
        assert.equal(registry.resolveRoleProvider(role, previewGates).providerKey, manifest.roles[role]);
        assert.equal(registry.resolveRoleProvider(role, productionGates).providerKey, manifest.roles[role]);
    }
    assert.equal(registry.resolveRoleProvider('analyze-review', previewGates).providerKey, 'stockfish-18-lite');
    assert.equal(registry.resolveRoleProvider('manual-analysis', previewGates).providerKey, 'stockfish-18-lite');
    for (const malformed of [undefined, {}, { ...previewGates, activationId: 'ENGINE18-004' },
        { ...previewGates, deploymentEnvironment: 'production' },
        { ...previewGates, CAISSA_PLAY_SF18_GAMEPLAY: 'true' }]) {
        assert.equal(registry.resolveRoleProvider('game', malformed).providerKey, 'legacy-stockfish-2019');
    }
});

test('role engine construction keeps SF18 lazy and conservative while Bots and Coach remain legacy', () => {
    const { registry, created } = registryWithAdapter();
    const game = registry.createRoleEngine('game', {
        featureGates: previewGates, adapterOptions: { autoStart: false, owner: 'native-play-v2' }
    });
    const coach = registry.createRoleEngine('coach-active', {
        featureGates: previewGates, adapterOptions: { autoStart: false, owner: 'native-play-v2' }
    });
    const bots = registry.createRoleEngine('bots', {
        featureGates: previewGates, adapterOptions: { autoStart: false, owner: 'native-play-v2' }
    });
    assert.deepEqual({
        id: game.id, workerPath: game.workerPath, expectedName: game.expectedUci.name,
        options: JSON.parse(JSON.stringify(game.defaultOptions)), autoStart: game.autoStart
    }, {
        id: 'stockfish-18-gameplay',
        workerPath: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
        expectedName: manifest.identity.sf18,
        options: { MultiPV: 1, Hash: 16, Threads: 1 },
        autoStart: false
    });
    for (const legacy of [coach, bots]) {
        assert.equal(legacy.id, 'stockfish');
        assert.equal(legacy.workerPath, '/engine/stockfish-working.js');
    }
    assert.equal(created.length, 3, 'constructing adapters must not construct Workers');
});

test('middleware exposes certified Preview and authorized Production activation', async () => {
    const saved = {
        VERCEL_ENV: process.env.VERCEL_ENV,
        CAISSA_PLAY_SF18_GAMEPLAY: process.env.CAISSA_PLAY_SF18_GAMEPLAY,
        CAISSA_PLAY_V2_BETA_STAGE: process.env.CAISSA_PLAY_V2_BETA_STAGE
    };
    try {
        process.env.CAISSA_PLAY_V2_BETA_STAGE = 'public-beta';
        process.env.VERCEL_ENV = 'production';
        delete process.env.CAISSA_PLAY_SF18_GAMEPLAY;
        const production = await middleware(new Request('https://www.caissa-chess.org/play'));
        assert.equal(production.headers.get('x-caissa-gameplay-provider'), 'stockfish-18-gameplay');
        assert.match(await production.text(), /data-activation-id="ENGINE18-003C"/);

        process.env.VERCEL_ENV = 'preview';
        process.env.CAISSA_PLAY_SF18_GAMEPLAY = 'true';
        const preview = await middleware(new Request('https://preview.caissa.test/play'));
        assert.equal(preview.headers.get('x-caissa-gameplay-provider'), 'stockfish-18-gameplay');
        assert.match(await preview.text(), /data-activation-id="ENGINE18-003"/);
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    }
});

test('App uses role-aware preview routing without changing search, FEN, opening-book, or commit guards', () => {
    const app = read('app.js');
    assert.match(app, /EngineRegistry\.createRoleEngine\(routing\.role/);
    assert.match(app, /activationId === 'ENGINE18-003'/);
    assert.match(app, /activationId === 'ENGINE18-003C'/);
    assert.match(app, /route\?\.mode === 'bots'/);
    assert.match(app, /route\?\.mode === 'coach'/);
    assert.match(app, /App\.engine\?\.terminate\?\.\('gameplay-provider-role-transition'\)/);
    assert.match(app, /const currentFen = App\.game\.fen\(\)/);
    assert.match(app, /acceptEngineIsolationResponse\(isolationRequest/);
    assert.match(app, /App\.game\.fen\(\) !== currentFen/);
    assert.match(app, /const move = App\.game\.move\(\{/);
    assert.match(app, /!activeBot && !targetStrength && App\.useOpeningBook/);
    assert.match(app, /const engineSearch = \{ \.\.\.\(botSearch \|\| \{ movetime: 2000 \}\)/);
    const exit = read('js/play/play-v2-public-beta-ui.js');
    assert.match(exit, /App\?\.engine\?\.terminate\?\.\('official-play-pagehide'\)/);
});
