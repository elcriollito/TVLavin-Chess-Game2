import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const source = read('js/caissa-onboarding.js');
const styles = read('css/caissa-onboarding.css');

test('global onboarding retains one canonical completion key and shared close path', () => {
    assert.match(source, /STORAGE_KEY:\s*'caissa_onboarding_completed'/);
    assert.match(source, /skip\(\)[\s\S]*this\.complete\(\)/);
    assert.match(source, /complete\(\)[\s\S]*localStorage\.setItem\(this\.STORAGE_KEY, 'true'\)[\s\S]*this\.close\(\)/);
    assert.match(source, /event\.key === 'Escape'[\s\S]*this\.skip\(\)/);
});

test('global onboarding declares a named modal and owns focus containment and restoration', () => {
    assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="onboardingTitle"/);
    assert.match(source, /id="onboardingTitle" class="onboarding-title"/);
    assert.match(source, /disableBackground\(modal\)/);
    assert.match(source, /element\.inert = true/);
    assert.match(source, /event\.key !== 'Tab'/);
    assert.match(source, /previous\.focus\(\)/);
    assert.match(source, /document\.getElementById\('onboardingNext'\)\?\.focus\(\)/);
});

test('onboarding focus treatment is visible and reduced-motion safe', () => {
    assert.match(styles, /\.onboarding-content :is\(button, a\):focus-visible/);
    assert.match(styles, /outline:\s*2px solid/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(styles, /\.onboarding-footer \.btn[\s\S]{0,260}transition:\s*all/);
});

test('canonical and Classic documents load the versioned owner while generated Play excludes it', () => {
    for (const path of ['index.html', 'yahoo-classic.html']) {
        const html = read(path);
        assert.equal((html.match(/css\/caissa-onboarding\.css\?v=1\.1\.0/g) || []).length, 1, path);
        assert.equal((html.match(/js\/caissa-onboarding\.js\?v=1\.1\.0/g) || []).length, 1, path);
    }
    for (const path of ['play-v2.html', 'play-v2-public-beta.html']) {
        assert.doesNotMatch(read(path), /caissa-onboarding/i, path);
    }
});
