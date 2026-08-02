import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('automation catalog separates current acceptance from historical characterization', () => {
    const catalog = read('docs/architecture/PLAY_V2_AUTOMATION_OWNER_CATALOG.md');
    for (const owner of ['Contracts', 'Routes and gate', 'Games', 'Bots', 'Coach', 'PostGame, Analyze, Mentor and exits',
        'Players', 'Responsive and mobile', 'Accessibility', 'Classic and Legacy', 'Physical-QA preparation'])
        assert.match(catalog, new RegExp(`\\| ${owner.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} \\|`), owner);
    assert.match(catalog, /Historical characterization/);
    assert.match(catalog, /NOT PHYSICALLY TESTED/);
    assert.doesNotMatch(catalog, /\.skip|retry masking|catch-and-ignore/i);
});

test('historical mobile assumptions are executable metadata, not a hidden Playwright skip', () => {
    const source = read('tests/browser/historical/play-simplified-shell-mobile.characterization.js');
    assert.match(source, /PlayV2HistoricalMobileShell@1\.0\.0/);
    assert.match(source, /currentAcceptanceOwner: false/);
    assert.match(source, /\/play\/games\?simplified=1/);
    assert.doesNotMatch(source, /test\s*\(|test\.skip|describe\.skip/);
});

test('current mobile owner uses canonical beta and current mode and Worker contracts', () => {
    const source = read('tests/browser/play-simplified-shell-mobile.spec.js');
    assert.match(source, /\/play\/beta/);
    assert.match(source, /Coach · Internal/);
    assert.match(source, /workersCreated\)\)\.toBe\(0\)/);
    assert.match(source, /workersCreated\)\)\.toBe\(1\)/);
    assert.doesNotMatch(source, /\/play\/games\?simplified=1|e4.*e5/s);
});
