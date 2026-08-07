import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PLAY_V2_PHYSICAL_IPAD_ANALYZE_DIAGNOSTIC as contract,
    resolvePlayV2PhysicalIpadAnalyzeDiagnostic as resolve } from '../../js/play/play-v2-physical-ipad-analyze-diagnostic-gate.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.1.0 is volatile and allowlisted-route only', () => {
    const window = { location: { pathname: contract.canonicalRoute, search: '', hash: '' } };
    vm.runInNewContext(read('js/play/play-v2-physical-ipad-analyze-diagnostic-policy.js'), { window });
    const policy = window.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy;
    assert.equal(policy.contractId, contract.contractId);
    assert.equal(policy.capacity, 512);
    assert.equal(policy.requiredEvidenceGenerationCapacity, 16);
    assert.equal(policy.persistence, 'prohibited');
    assert.equal(policy.transport, 'prohibited');
    assert.equal(policy.isAuthorizedLocation(window.location), true);
    for (const mode of ['games', 'bots', 'coach']) {
        const pathname = policy.modeRoutes[mode];
        assert.equal(policy.resolveMode({ pathname }), mode);
        assert.equal(policy.isAuthorizedLocation({ pathname, search: '', hash: '' }), true);
    }
    assert.equal(policy.isAuthorizedLocation({ pathname: `${contract.canonicalRoute}/players`, search: '', hash: '' }), false);
    assert.equal(policy.isAuthorizedLocation({ ...window.location, hash: '#attempt' }), false);
});

test('iPad Analyze diagnostic requires both process gates and fails closed', () => {
    const allowed = { CAISSA_PLAY_V2_BETA_STAGE: 'internal', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' };
    assert.equal(resolve(contract.canonicalRoute, '', allowed).authorized, true);
    assert.equal(resolve(contract.modeRoutes.bots, '', allowed).mode, 'bots');
    assert.equal(resolve(contract.modeRoutes.coach, '', allowed).mode, 'coach');
    for (const environment of [{}, { CAISSA_PLAY_V2_BETA_STAGE: 'disabled', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'invite-only', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'public-beta', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'internal' }]) assert.equal(resolve(contract.canonicalRoute, '', environment).authorized, false);
    for (const [path, search] of [[`${contract.canonicalRoute}/`, ''], [`${contract.canonicalRoute}/child`, ''],
        [`${contract.canonicalRoute}/players`, ''],
        [contract.canonicalRoute, '?attempt=1'], [`/${contract.entryDocument}`, '']]) {
        const result = resolve(path, search, allowed); assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
});

test('diagnostic source has no persistence, transport, identity, or chess record capture', () => {
    const source = read('js/play/play-v2-physical-ipad-analyze-diagnostic.js');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/i);
    assert.doesNotMatch(source, /\bfen\b|\bpgn\b|moveHistory|playerName|userId|ssid|thumbprint|certificate/i);
    for (const path of ['play-v2.html', 'index.html', 'js/caissa-primary-navigation.js', 'public/sitemap.xml'])
        assert.doesNotMatch(read(path), /ipad-analyze-diagnostic/i, path);
    assert.match(read('play-v2-ipad-analyze-diagnostic.html'), /data-caissa-ipad-analyze-diagnostic="internal"/);
    assert.doesNotMatch(read('scripts/build-public-release.mjs'), /play-v2-ipad-analyze-diagnostic\.html/);
});

test('diagnostic reliability owns bounded evidence, atomic verdicts, eviction accounting, and applicable geometry', () => {
    const source = read('js/play/play-v2-physical-ipad-analyze-diagnostic.js');
    for (const marker of ['requiredEvidence', 'recordsDropped', 'firstRetainedSequence', 'lastRetainedSequence',
        'verdictSequence', 'verdictElapsedMs', 'geometryApplicability', 'BOARD_MATERIAL_STRIP']) assert.match(source, new RegExp(marker));
    assert.match(source, /requiredEvidence\.clear\(\)/);
    assert.match(source, /records\.length > capacity/);
    assert.match(source, /applyVerdict\(exportSnapshot\(\)\)/);
    assert.match(source, /Math\.max\([\s\S]*2 \/ Math\.max[\s\S]*0\.01/);
    assert.doesNotMatch(source, /new Date|Date\.now|toISOString/);
});

test('diagnostic route owner preserves Games, Bots, and Coach without admitting Classic or Players', () => {
    const shell = read('js/play/simplified-play-shell.js');
    const routes = read('js/play/play-route-controller.js');
    assert.match(shell, /getModeTarget/);
    assert.match(routes, /ipad-analyze-diagnostic/);
    assert.match(routes, /metadata: \{ requestedModeAvailable: true, betaEntry: true, ipadAnalyzeDiagnostic: true \}/);
    assert.doesNotMatch(contract.modeRoutes.games, /players|classic/i);
});
