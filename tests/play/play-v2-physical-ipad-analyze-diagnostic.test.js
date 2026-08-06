import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PLAY_V2_PHYSICAL_IPAD_ANALYZE_DIAGNOSTIC as contract,
    resolvePlayV2PhysicalIpadAnalyzeDiagnostic as resolve } from '../../js/play/play-v2-physical-ipad-analyze-diagnostic-gate.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.0.0 is volatile and exact-route only', () => {
    const window = { location: { pathname: contract.canonicalRoute, search: '', hash: '' } };
    vm.runInNewContext(read('js/play/play-v2-physical-ipad-analyze-diagnostic-policy.js'), { window });
    const policy = window.CaissaPlayV2PhysicalIpadAnalyzeDiagnosticPolicy;
    assert.equal(policy.contractId, contract.contractId);
    assert.equal(policy.capacity, 512);
    assert.equal(policy.persistence, 'prohibited');
    assert.equal(policy.transport, 'prohibited');
    assert.equal(policy.isAuthorizedLocation(window.location), true);
    assert.equal(policy.isAuthorizedLocation({ ...window.location, hash: '#attempt' }), false);
});

test('iPad Analyze diagnostic requires both process gates and fails closed', () => {
    const allowed = { CAISSA_PLAY_V2_BETA_STAGE: 'internal', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' };
    assert.equal(resolve(contract.canonicalRoute, '', allowed).authorized, true);
    for (const environment of [{}, { CAISSA_PLAY_V2_BETA_STAGE: 'disabled', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'invite-only', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'public-beta', CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'internal' }]) assert.equal(resolve(contract.canonicalRoute, '', environment).authorized, false);
    for (const [path, search] of [[`${contract.canonicalRoute}/`, ''], [`${contract.canonicalRoute}/child`, ''],
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
