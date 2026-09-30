import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('css/analyze-v2-shell.css');
const analyze = read('js/analyze-section.js');
const page = read('index.html');

test('approved FICS typography remains intact while the main Analyzer adopts the readable scale', () => {
    assert.match(css, /#analyzeSection\[data-caissa-analyze-source="fics"\][\s\S]*font-size:\s*18px/);
    assert.match(css, /\.caissa-analyze-v2__notation\s*\{[\s\S]*font-size:\s*18px[\s\S]*line-height:\s*25px/);
    assert.match(css, /\.move-num\s*\{[\s\S]*font-size:\s*16px[\s\S]*font-weight:\s*600/);
    assert.match(css, /move-white, \.move-black\)[\s\S]*font-weight:\s*600[\s\S]*line-height:\s*25px[\s\S]*letter-spacing:\s*0\.01em/);
    assert.match(css, /"Segoe UI", Tahoma, Geneva, Verdana, sans-serif/);
    assert.match(analyze, /handoffSource === 'fics'/);
});

test('typography lab and selector are removed from the product document', () => {
    assert.doesNotMatch(css, /caissa-fics-typography-lab|data-caissa-fics-move-size|data-caissa-fics-move-weight/);
    assert.doesNotMatch(page, /fics-analysis-typography-lab\.js|fics-analysis-type-lab/);
    assert.equal(fs.existsSync(new URL('../js/fics-analysis-typography-lab.js', import.meta.url)), false);
});

test('approved typography does not distort glyphs or load an external font', () => {
    assert.doesNotMatch(css, /font-stretch|scaleX/);
    assert.doesNotMatch(css, /@import\s+url|@font-face/);
});
