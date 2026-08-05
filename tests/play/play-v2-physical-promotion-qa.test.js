import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PLAY_V2_PHYSICAL_PROMOTION_QA, resolvePlayV2PhysicalPromotionQA } from '../../js/play/play-v2-physical-promotion-qa-gate.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PlayV2PhysicalPromotionQAPolicy@1.0.0 is fixed, allowlisted, and non-persistent', () => {
    const window = { location: { pathname: '/play/beta/qa/promotion', search: '', hash: '' } };
    vm.runInNewContext(read('js/play/play-v2-physical-promotion-qa-policy.js'), { window });
    const policy = window.CaissaPlayV2PhysicalPromotionQAPolicy;
    assert.equal(policy.contractId, 'PlayV2PhysicalPromotionQAPolicy@1.0.0');
    assert.equal(policy.listCases().length, 8);
    assert.deepEqual([...new Set(policy.listCases().map(item => `${item.color}:${item.piece}`))].sort(),
        ['black:b', 'black:n', 'black:q', 'black:r', 'white:b', 'white:n', 'white:q', 'white:r']);
    assert.equal(policy.listCases().some(item => 'position' in item), false);
    assert.equal(policy.persistence, 'prohibited');
    assert.equal(policy.arbitraryPositionInput, 'prohibited');
});

test('physical promotion route requires the exact double gate and fails closed', () => {
    const path = PLAY_V2_PHYSICAL_PROMOTION_QA.canonicalRoute;
    const allowed = { CAISSA_PLAY_V2_BETA_STAGE: 'internal', CAISSA_PLAY_V2_PHYSICAL_QA: 'promotion' };
    assert.equal(resolvePlayV2PhysicalPromotionQA(path, '', allowed).authorized, true);
    for (const environment of [{},
        { CAISSA_PLAY_V2_BETA_STAGE: 'disabled', CAISSA_PLAY_V2_PHYSICAL_QA: 'promotion' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'invite-only', CAISSA_PLAY_V2_PHYSICAL_QA: 'promotion' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'public-beta', CAISSA_PLAY_V2_PHYSICAL_QA: 'promotion' },
        { CAISSA_PLAY_V2_BETA_STAGE: 'internal' }]) {
        assert.equal(resolvePlayV2PhysicalPromotionQA(path, '', environment).authorized, false);
    }
    for (const [candidate, search] of [[`${path}/`, ''], [`${path}/denied`, ''], [path, '?fen=x'],
        ['/play-v2-promotion-qa.html', '']]) {
        const result = resolvePlayV2PhysicalPromotionQA(candidate, search, allowed);
        assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
});

test('QA resources do not enter normal Play v2 or public discovery surfaces', () => {
    for (const path of ['play-v2.html', 'index.html', 'js/caissa-primary-navigation.js', 'public/sitemap.xml', 'public/robots.txt'])
        assert.doesNotMatch(read(path), /physical-promotion-qa|\/play\/beta\/qa\/promotion/i, path);
    const qa = read('play-v2-promotion-qa.html');
    assert.match(qa, /data-caissa-physical-promotion-qa="internal"/);
    assert.match(qa, /play-v2-physical-promotion-qa-policy\.js/);
    const harnessSources = read('js/play/play-v2-physical-promotion-qa-policy.js')
        + read('js/play/play-v2-physical-promotion-qa-boot.js')
        + read('js/play/play-v2-physical-promotion-qa-harness.js');
    assert.doesNotMatch(harnessSources, /localStorage|sessionStorage|document\.cookie|fetch\(|WebSocket/i);
    assert.doesNotMatch(read('js/play/play-v2-physical-promotion-qa-harness.js'), /createElement\(['"]input|contenteditable/i);
});

test('public release allowlist and hosting keep the harness unavailable', () => {
    assert.doesNotMatch(read('scripts/build-public-release.mjs'), /play-v2-promotion-qa\.html/);
    const vercel = JSON.parse(read('vercel.json'));
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play-v2-promotion-qa.html'
        && rule.destination === '/play-v2-unavailable.html'));
});
